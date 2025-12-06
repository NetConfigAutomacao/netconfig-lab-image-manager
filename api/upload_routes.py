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

import os
from typing import List, Dict, Any

from flask import Blueprint, request, jsonify
import paramiko

from config import UPLOAD_FOLDER, DEFAULT_EVE_BASE_DIR, ALLOWED_EXTENSIONS

upload_bp = Blueprint("upload_bp", __name__)


def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _ssh_connect(eve_ip: str, eve_user: str, eve_pass: str) -> paramiko.SSHClient:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(eve_ip, username=eve_user, password=eve_pass, timeout=30)
    return ssh


def _run_fixpermissions(ssh: paramiko.SSHClient, errors: List[Dict[str, Any]]) -> bool:
    """
    Executa o comando oficial do EVE-NG para corrigir permissões após o upload.
    /opt/unetlab/wrappers/unl_wrapper -a fixpermissions
    """
    cmd = "/opt/unetlab/wrappers/unl_wrapper -a fixpermissions"

    try:
        stdin, stdout, stderr = ssh.exec_command(cmd)
        exit_status = stdout.channel.recv_exit_status()
        out = stdout.read().decode(errors="ignore")
        err = stderr.read().decode(errors="ignore")

        if exit_status != 0:
            errors.append(
                {
                    "step": "fixpermissions",
                    "stdout": out,
                    "stderr": err or f"Exit status {exit_status}",
                }
            )
            return False

        # Apenas para debug se precisar no futuro:
        if out.strip():
            errors.append(
                {
                    "step": "fixpermissions_stdout",
                    "stdout": out.strip(),
                }
            )

        return True
    except Exception as e:
        errors.append(
            {
                "step": "fixpermissions",
                "stderr": f"Exception: {e}",
            }
        )
        return False


@upload_bp.route("/upload", methods=["POST"])
def upload_images():
    """
    Recebe imagens via HTTP, envia para o EVE-NG via SSH/SFTP e
    ao final executa o fixpermissions no host de destino.
    """
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    eve_base_dir = request.form.get("eve_base_dir") or DEFAULT_EVE_BASE_DIR
    template_name = (request.form.get("template_name") or "").strip()

    errors: List[Dict[str, Any]] = []

    if not eve_ip or not eve_user or not eve_pass:
        return (
            jsonify(
                success=False,
                message="Informe IP, usuário e senha do EVE-NG.",
                errors=[],
            ),
            400,
        )

    if not template_name:
        return (
            jsonify(
                success=False,
                message="Informe o nome do template (diretório).",
                errors=[],
            ),
            400,
        )

    files = request.files.getlist("image")
    if not files or all(not f.filename for f in files):
        return (
            jsonify(
                success=False,
                message="Nenhuma imagem foi enviada.",
                errors=[],
            ),
            400,
        )

    ssh = None
    sftp = None

    try:
        ssh = _ssh_connect(eve_ip, eve_user, eve_pass)
        sftp = ssh.open_sftp()

        # Diretório final no EVE: ex: /opt/unetlab/addons/qemu/mikrotik-6.38.4
        remote_dir = f"{eve_base_dir.rstrip('/')}/{template_name}"
        ssh.exec_command(f"mkdir -p '{remote_dir}'")

        uploaded_any = False

        for f in files:
            if not f or not f.filename:
                continue

            filename = os.path.basename(f.filename)
            if not _allowed_file(filename):
                errors.append(
                    {
                        "filename": filename,
                        "context": "Extensão não permitida",
                    }
                )
                continue

            local_path = os.path.join(UPLOAD_FOLDER, filename)

            try:
                # Salva temporariamente no container
                f.save(local_path)

                # Envia via SFTP para o EVE
                remote_path = f"{remote_dir}/{filename}"
                sftp.put(local_path, remote_path)
                uploaded_any = True
            except Exception as e:
                errors.append(
                    {
                        "filename": filename,
                        "context": "Falha ao enviar via SFTP para o EVE",
                        "stderr": str(e),
                    }
                )
            finally:
                try:
                    if os.path.exists(local_path):
                        os.remove(local_path)
                except OSError:
                    pass

        if sftp is not None:
            sftp.close()

        # Só roda fixpermissions se pelo menos uma imagem foi enviada com sucesso
        fix_ok = False
        if uploaded_any:
            fix_ok = _run_fixpermissions(ssh, errors)
        else:
            errors.append(
                {
                    "step": "upload",
                    "stderr": "Nenhuma imagem foi efetivamente enviada para o EVE.",
                }
            )

        # Decide sucesso geral
        success = uploaded_any and fix_ok
        if success:
            msg = "Upload concluído e fixpermissions executado com sucesso."
        elif uploaded_any and not fix_ok:
            msg = "Imagens enviadas, mas o comando fixpermissions retornou erro. Verifique os detalhes."
        else:
            msg = "Falha ao enviar as imagens para o EVE. Veja os detalhes."

        return (
            jsonify(
                success=success,
                message=msg,
                errors=errors,
            ),
            200 if uploaded_any else 500,
        )

    except Exception as e:
        errors.append(
            {
                "step": "upload_exception",
                "stderr": str(e),
            }
        )
        return (
            jsonify(
                success=False,
                message="Erro inesperado ao enviar as imagens para o EVE.",
                errors=errors,
            ),
            500,
        )
    finally:
        if ssh is not None:
            ssh.close()
