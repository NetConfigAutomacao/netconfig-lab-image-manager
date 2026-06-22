# This file is part of NetConfig Lab Image Manager.
#
# NetConfig Lab Image Manager is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# NetConfig Lab Image Manager is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with NetConfig Lab Image Manager.  If not, see <https://www.gnu.org/licenses/>.

"""WebSocket: streaming de log de jobs em tempo real e terminal (PTY) por nó.

Usa flask-sock. Os endpoints respeitam a mesma autenticação por sessão da API
(quando ativada via APP_PASSWORD).
"""

from __future__ import annotations

import json
import os
import re
import signal
import time

from flask import session
from flask_sock import Sock

from auth import auth_enabled

sock = Sock()

_CONTAINER_RE = re.compile(r"^[A-Za-z0-9_.-]+$")
_HOST_RE = re.compile(r"^[A-Za-z0-9_.:-]+$")


def register_ws(app) -> None:
    sock.init_app(app)


def _authed() -> bool:
    try:
        if not auth_enabled():
            return True
        return bool(session.get("authed"))
    except Exception:
        return False


def _stream_job(ws, store, lock, job_id):
    """Envia as linhas do job (e novas conforme surgem) até terminar."""
    sent = 0
    while True:
        with lock:
            j = store.get(job_id)
            lines = list(j["lines"]) if j else None
            status = j["status"] if j else "unknown"
        if lines is None:
            try:
                ws.send(json.dumps({"error": "unknown"}))
            except Exception:
                pass
            return
        if len(lines) > sent:
            for ln in lines[sent:]:
                try:
                    ws.send(json.dumps({"line": ln}))
                except Exception:
                    return
            sent = len(lines)
        if status != "running":
            try:
                ws.send(json.dumps({"done": True, "status": status}))
            except Exception:
                pass
            return
        time.sleep(0.4)


@sock.route("/ws/job/<job_id>")
def ws_job(ws, job_id):
    """Log ao vivo de um job de deploy/destroy/bulk (ContainerLab)."""
    if not _authed():
        return
    from container_labs_routes import _CLAB_JOBS, _CLAB_JOBS_LOCK
    _stream_job(ws, _CLAB_JOBS, _CLAB_JOBS_LOCK, job_id)


@sock.route("/ws/vrljob/<job_id>")
def ws_vrljob(ws, job_id):
    """Log ao vivo de um build vrnetlab."""
    if not _authed():
        return
    from vrnetlab_routes import _VRL_JOBS, _VRL_LOCK
    _stream_job(ws, _VRL_JOBS, _VRL_LOCK, job_id)


@sock.route("/ws/terminal")
def ws_terminal(ws):
    """Terminal interativo (PTY) para um nó via SSH + docker exec.

    Protocolo: a primeira mensagem é um JSON com {eve_ip,eve_user,eve_pass,container};
    depois, bytes em ambos os sentidos (teclado -> nó, saída -> tela)."""
    if not _authed():
        return
    import pty
    import subprocess
    import threading

    try:
        raw = ws.receive(timeout=20)
    except Exception:
        return
    if not raw:
        return
    try:
        cfg = json.loads(raw)
    except (ValueError, TypeError):
        try:
            ws.send("\r\n[erro] init inválido\r\n")
        except Exception:
            pass
        return

    host = (cfg.get("eve_ip") or "").strip()
    user = (cfg.get("eve_user") or "").strip()
    pw = cfg.get("eve_pass") or ""
    container = (cfg.get("container") or "").strip()
    if not (host and user and pw) or not _HOST_RE.match(host) or not _CONTAINER_RE.match(container):
        try:
            ws.send("\r\n[erro] parâmetros inválidos\r\n")
        except Exception:
            pass
        return

    argv = [
        "sshpass", "-p", pw, "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "PreferredAuthentications=password",
        "-o", "PubkeyAuthentication=no",
        "-o", "ConnectTimeout=15",
        "-tt", f"{user}@{host}",
        f"docker exec -it {container} sh",
    ]
    master, slave = pty.openpty()
    try:
        proc = subprocess.Popen(
            argv, stdin=slave, stdout=slave, stderr=slave,
            preexec_fn=os.setsid, close_fds=True,
        )
    except Exception as exc:  # pragma: no cover
        os.close(master)
        os.close(slave)
        try:
            ws.send("\r\n[erro] " + str(exc) + "\r\n")
        except Exception:
            pass
        return
    os.close(slave)

    def reader():
        while True:
            try:
                data = os.read(master, 4096)
            except OSError:
                break
            if not data:
                break
            try:
                ws.send(data.decode("utf-8", "replace"))
            except Exception:
                break
        try:
            ws.close()
        except Exception:
            pass

    th = threading.Thread(target=reader, daemon=True)
    th.start()

    try:
        while True:
            msg = ws.receive()
            if msg is None:
                break
            if isinstance(msg, bytes):
                os.write(master, msg)
            else:
                os.write(master, msg.encode("utf-8"))
    except Exception:
        pass
    finally:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except Exception:
            pass
        try:
            os.close(master)
        except Exception:
            pass
