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

from typing import List, Dict, Any

from flask import Blueprint, request, jsonify
import paramiko

from i18n import translate, get_request_lang

fix_bp = Blueprint("fix_bp", __name__)


def _ssh_connect(eve_ip: str, eve_user: str, eve_pass: str) -> paramiko.SSHClient:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(eve_ip, username=eve_user, password=eve_pass, timeout=30)
    return ssh


def _run_fixpermissions(ssh: paramiko.SSHClient, errors: List[Dict[str, Any]]) -> bool:
    """
    Executa o comando fixpermissions no host EVE-NG.
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

        # Se quiser ver stdout como informação adicional:
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


@fix_bp.route("/fixpermissions", methods=["POST"])
@fix_bp.route("/fix-permissions", methods=["POST"])
def fix_permissions():
    """
    Endpoint manual para executar o comando fixpermissions no EVE-NG.
    Via Nginx: /api/fixpermissions (principal) e /api/fix-permissions (alias legada)
    """
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()

    errors: List[Dict[str, Any]] = []

    if not eve_ip or not eve_user or not eve_pass:
        return (
            jsonify(
                success=False,
                message=translate("errors.missing_credentials", lang),
                errors=[],
            ),
            400,
        )

    ssh = None
    try:
        ssh = _ssh_connect(eve_ip, eve_user, eve_pass)
        ok = _run_fixpermissions(ssh, errors)

        if ok:
            msg = translate("fix.success", lang)
            status_code = 200
        else:
            msg = translate("fix.fail", lang)
            status_code = 500

        return (
            jsonify(
                success=ok,
                message=msg,
                errors=errors,
            ),
            status_code,
        )

    except Exception as e:
        errors.append(
            {
                "step": "fixpermissions_exception",
                "stderr": str(e),
            }
        )
        return (
            jsonify(
                success=False,
                message=translate("fix.unexpected", lang),
                errors=errors,
            ),
            500,
        )
    finally:
        if ssh is not None:
            ssh.close()
