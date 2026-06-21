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

from __future__ import annotations

import re
import shlex
import threading
import uuid

from flask import Blueprint, jsonify, request

from i18n import get_request_lang, translate
from utils import run_ssh_command, run_ssh_stream


vrnetlab_bp = Blueprint("vrnetlab_bp", __name__, url_prefix="/vrnetlab")

VRNETLAB_DIR = "/opt/containerlab/vrnetlab"
_VENDOR_RE = re.compile(r"^[A-Za-z0-9_.-]+$")

# Jobs de build (log ao vivo) em memória.
_VRL_JOBS = {}
_VRL_LOCK = threading.Lock()


def _vrl_job_new():
    jid = uuid.uuid4().hex
    with _VRL_LOCK:
        _VRL_JOBS[jid] = {"status": "running", "lines": [], "rc": None}
    return jid


def _vrl_job_append(jid, line):
    with _VRL_LOCK:
        j = _VRL_JOBS.get(jid)
        if j:
            j["lines"].append(line)
            if len(j["lines"]) > 5000:
                j["lines"] = j["lines"][-5000:]


def _vrl_job_finish(jid, rc):
    with _VRL_LOCK:
        j = _VRL_JOBS.get(jid)
        if j:
            j["rc"] = rc
            j["status"] = "success" if rc == 0 else "error"


@vrnetlab_bp.route("/status", methods=["POST"])
def vrnetlab_status():
    """
    Coleta informações básicas sobre o ambiente VRNETLAB em um host ContainerLab.
    Retorna runtime (docker/podman), caminho do repositório local e imagens
    que contenham "vrnetlab" no nome.
    """
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()

    if not (eve_ip and eve_user and eve_pass):
        return (
            jsonify(success=False, message=translate("vrnetlab.missing_creds", lang)),
            400,
        )

    cmd = (
        "runtime=''; "
        "if command -v docker >/dev/null 2>&1; then runtime='docker'; fi; "
        "if [ -z \"$runtime\" ] && command -v podman >/dev/null 2>&1; then runtime='podman'; fi; "
        "repo=''; "
        "if [ -d '/opt/containerlab/vrnetlab' ]; then repo='/opt/containerlab/vrnetlab'; fi; "
        "echo \"RUNTIME=$runtime\"; "
        "echo \"REPO=$repo\"; "
        "if [ -n \"$runtime\" ]; then "
        "  $runtime images --format '{{.Repository}}|{{.Tag}}|{{.Size}}' 2>/dev/null | grep -i 'vrnetlab' || true; "
        "fi"
    )

    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd)

    runtime = ""
    repo_path = ""
    images = []
    extra_lines = []

    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("RUNTIME="):
            runtime = line.split("=", 1)[1].strip()
            continue
        if line.startswith("REPO="):
            repo_path = line.split("=", 1)[1].strip()
            continue

        parts = line.split("|")
        if len(parts) >= 3:
            images.append(
                {
                    "repository": parts[0].strip(),
                    "tag": parts[1].strip(),
                    "size": "|".join(parts[2:]).strip(),
                }
            )
        else:
            extra_lines.append(line)

    success = True
    message = translate("vrnetlab.status.ok", lang)

    if not runtime:
        message = translate("vrnetlab.status.no_runtime", lang)
    elif not repo_path:
        message = translate("vrnetlab.status.no_repo", lang)

    if rc != 0 and not runtime and not images:
        success = False
        message = translate("vrnetlab.status.fail", lang, rc=rc)

    response = {
        "success": success,
        "message": message,
        "runtime": runtime,
        "repo_path": repo_path,
        "repo_present": bool(repo_path),
        "images": images,
        "extra": extra_lines,
        "ssh_rc": rc,
        "stderr": (err or "").strip(),
        "raw": (out or "").strip(),
    }

    return jsonify(response), 200 if success else 500


@vrnetlab_bp.route("/install", methods=["POST"])
def vrnetlab_install():
    """
    Efetua git clone do repositório vrnetlab em /opt/vrnetlab, caso não exista.
    """
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()

    if not (eve_ip and eve_user and eve_pass):
        return (
            jsonify(success=False, message=translate("vrnetlab.missing_creds", lang)),
            400,
        )

    cmd = (
        "set -e;"
        "if [ -d '/opt/containerlab/vrnetlab/.git' ] || [ -d '/opt/containerlab/vrnetlab' ]; then "
        " echo '__VRNETLAB_ALREADY_PRESENT__'; exit 0; "
        "fi; "
        "if ! command -v git >/dev/null 2>&1; then "
        " echo '__VRNETLAB_GIT_MISSING__'; exit 45; "
        "fi; "
        "mkdir -p /opt/containerlab && "
        "git clone https://github.com/srl-labs/vrnetlab.git /opt/containerlab/vrnetlab"
    )

    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd)
    cleaned_out = (out or "").strip()
    cleaned_err = (err or "").strip()

    if "__VRNETLAB_ALREADY_PRESENT__" in cleaned_out:
        return jsonify(success=True, message=translate("vrnetlab.install.already", lang)), 200

    if "__VRNETLAB_GIT_MISSING__" in cleaned_out or rc == 45:
        return (
            jsonify(
                success=False,
                message=translate("vrnetlab.install.git_missing", lang),
                stderr=cleaned_err,
            ),
            500,
        )

    if rc != 0:
        return (
            jsonify(
                success=False,
                message=translate("vrnetlab.install.fail", lang, rc=rc),
                stdout=cleaned_out,
                stderr=cleaned_err,
            ),
            500,
        )

    return jsonify(success=True, message=translate("vrnetlab.install.success", lang), stdout=cleaned_out), 200


# ---------------------------------------------------------------------------
# P5 (#72): listar vendors vrnetlab e construir imagem (build com log ao vivo).
# ---------------------------------------------------------------------------

@vrnetlab_bp.route("/vendors", methods=["POST"])
def vrnetlab_vendors():
    """Lista os diretórios de vendor sob /opt/containerlab/vrnetlab e os
    arquivos de imagem (qcow2/vmdk/bin) presentes em cada um."""
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("vrnetlab.missing_creds", lang)), 400
    cmd = (
        f"d={shlex.quote(VRNETLAB_DIR)}; if [ ! -d \"$d\" ]; then echo '__NO_REPO__'; exit 44; fi; "
        "for v in \"$d\"/*/; do "
        "  name=$(basename \"$v\"); "
        "  if [ ! -f \"$v/Makefile\" ]; then continue; fi; "
        "  imgs=$(ls \"$v\" 2>/dev/null | grep -iE '\\.(qcow2|vmdk|bin|tgz|iso|qcow)$' | tr '\\n' ',' ); "
        "  echo \"$name|$imgs\"; "
        "done"
    )
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=45)
    combined = (out or "")
    if "__NO_REPO__" in combined or rc == 44:
        return jsonify(success=False, message=translate("vrnetlab.status.no_repo", lang), vendors=[]), 200
    vendors = []
    for line in combined.splitlines():
        line = line.strip()
        if not line or "|" not in line:
            continue
        name, imgs = line.split("|", 1)
        files = [x for x in imgs.split(",") if x.strip()]
        vendors.append({"name": name.strip(), "images": files, "ready": bool(files)})
    return jsonify(success=True, vendors=vendors), 200


@vrnetlab_bp.route("/build", methods=["POST"])
def vrnetlab_build():
    """Inicia `make docker-image` no diretório do vendor (build assíncrono)."""
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    vendor = (request.form.get("vendor") or "").strip()
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("vrnetlab.missing_creds", lang)), 400
    if not _VENDOR_RE.match(vendor):
        return jsonify(success=False, message=translate("vrnetlab.build.bad_vendor", lang)), 400
    vdir = VRNETLAB_DIR + "/" + vendor
    cmd = (
        f"cd {shlex.quote(vdir)} 2>/dev/null || {{ echo '__NO_VENDOR__'; exit 44; }}; "
        "if ! command -v make >/dev/null 2>&1; then echo '__NO_MAKE__'; exit 45; fi; "
        "make docker-image 2>&1"
    )
    jid = _vrl_job_new()

    def worker():
        rc_box = {"rc": 1}

        def on_line(line):
            _vrl_job_append(jid, line)

        rc = run_ssh_stream(eve_ip, eve_user, eve_pass, cmd, on_line, timeout=3600)
        rc_box["rc"] = rc
        _vrl_job_finish(jid, rc)

    threading.Thread(target=worker, daemon=True).start()
    return jsonify(success=True, job_id=jid), 200


@vrnetlab_bp.route("/build/job", methods=["GET"])
def vrnetlab_build_job():
    """Polling do build: linhas + status."""
    jid = (request.args.get("job_id") or "").strip()
    with _VRL_LOCK:
        j = _VRL_JOBS.get(jid)
        if not j:
            return jsonify(success=False, status="unknown", lines=[], rc=None), 404
        return jsonify(success=True, status=j["status"], lines=list(j["lines"]), rc=j["rc"]), 200
