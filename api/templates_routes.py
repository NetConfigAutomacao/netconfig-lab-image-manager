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

import os
from typing import Dict, Any, List

from flask import Blueprint, request, jsonify
import paramiko

from config import TEMPLATES_AMD_DIR, TEMPLATES_INTEL_DIR, TEMPLATE_ALLOWED_EXT
from i18n import translate, get_request_lang

templates_bp = Blueprint("templates_bp", __name__, url_prefix="/templates")


def _ssh_connect(eve_ip: str, eve_user: str, eve_pass: str) -> paramiko.SSHClient:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(eve_ip, username=eve_user, password=eve_pass, timeout=30)
    return ssh


def _run_fixpermissions(ssh: paramiko.SSHClient, errors: List[Dict[str, Any]]) -> bool:
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


def _normalize_template_name(name: str) -> str:
    name = name.strip()
    if not name:
        return name

    if "." not in name:
        # se não tiver extensão, força .yml
        return name + ".yml"

    base, ext = os.path.splitext(name)
    ext = ext.lstrip(".").lower()

    if ext not in TEMPLATE_ALLOWED_EXT:
        # força .yml se extensão não for aceita
        return base + ".yml"

    return base + "." + ext


@templates_bp.route("/list", methods=["POST"])
def list_templates():
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()

    if not eve_ip or not eve_user or not eve_pass:
        return (
            jsonify(
                success=False,
                message=translate("templates.missing_creds", lang),
                templates={"amd": [], "intel": [], "all": []},
            ),
            400,
        )

    ssh = None
    try:
        ssh = _ssh_connect(eve_ip, eve_user, eve_pass)
        sftp = ssh.open_sftp()

        def list_dir(path: str) -> List[str]:
            try:
                files = sftp.listdir(path)
                return sorted(f for f in files if f.endswith((".yml", ".yaml")))
            except IOError:
                return []

        amd_list = list_dir(TEMPLATES_AMD_DIR)
        intel_list = list_dir(TEMPLATES_INTEL_DIR)

        all_set = sorted(set(amd_list) | set(intel_list))

        sftp.close()

        return (
            jsonify(
                success=True,
                message=translate("templates.list_success", lang),
                templates={
                    "amd": amd_list,
                    "intel": intel_list,
                    "all": all_set,
                },
            ),
            200,
        )
    except Exception as e:
        return (
            jsonify(
                success=False,
                message=translate("templates.list_error", lang, error=e),
                templates={"amd": [], "intel": [], "all": []},
            ),
            500,
        )
    finally:
        if ssh is not None:
            ssh.close()


@templates_bp.route("/get", methods=["POST"])
def get_template():
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    template_name = (request.form.get("template_name") or "").strip()

    if not eve_ip or not eve_user or not eve_pass:
        return (
            jsonify(
                success=False,
                message=translate("templates.missing_creds", lang),
                content="",
            ),
            400,
        )

    if not template_name:
        return (
            jsonify(
                success=False,
                message=translate("templates.missing_name", lang),
                content="",
            ),
            400,
        )

    template_name = _normalize_template_name(template_name)

    ssh = None
    try:
        ssh = _ssh_connect(eve_ip, eve_user, eve_pass)
        sftp = ssh.open_sftp()

        # tenta primeiro em amd, depois em intel
        paths = [
            f"{TEMPLATES_AMD_DIR}/{template_name}",
            f"{TEMPLATES_INTEL_DIR}/{template_name}",
        ]

        content = None
        last_error = None

        for p in paths:
            try:
                with sftp.open(p, "r") as f:
                    content = f.read().decode("utf-8", errors="ignore")
                break
            except Exception as e:
                last_error = e

        sftp.close()

        if content is None:
            return (
                jsonify(
                    success=False,
                    message=translate("templates.not_found", lang, name=template_name, error=last_error),
                    content="",
                ),
                404,
            )

        return (
            jsonify(
                success=True,
                message=translate("templates.load_success", lang, name=template_name),
                content=content,
            ),
            200,
        )
    except Exception as e:
        return (
            jsonify(
                success=False,
                message=translate("templates.load_error", lang, error=e),
                content="",
            ),
            500,
        )
    finally:
        if ssh is not None:
            ssh.close()


@templates_bp.route("/upload", methods=["POST"])
def upload_template():
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    template_name = (request.form.get("template_name") or "").strip()
    template_content = request.form.get("template_content") or ""

    errors: List[Dict[str, Any]] = []

    if not eve_ip or not eve_user or not eve_pass:
        return (
            jsonify(
                success=False,
                message=translate("templates.missing_creds", lang),
                errors=[],
            ),
            400,
        )

    if not template_name:
        return (
            jsonify(
                success=False,
                message=translate("templates.missing_name", lang),
                errors=[],
            ),
            400,
        )

    if not template_content.strip():
        return (
            jsonify(
                success=False,
                message=translate("templates.empty_content", lang),
                errors=[],
            ),
            400,
        )

    template_name = _normalize_template_name(template_name)

    ssh = None
    try:
        ssh = _ssh_connect(eve_ip, eve_user, eve_pass)
        sftp = ssh.open_sftp()

        for base_dir in (TEMPLATES_AMD_DIR, TEMPLATES_INTEL_DIR):
            try:
                # garante diretório (normalmente já existe, mas não custa)
                try:
                    sftp.listdir(base_dir)
                except IOError:
                    ssh.exec_command(f"mkdir -p '{base_dir}'")

                remote_path = f"{base_dir}/{template_name}"

                with sftp.open(remote_path, "w") as f:
                    f.write(template_content)
            except Exception as e:
                errors.append(
                    {
                        "target": base_dir,
                        "step": "write_template",
                        "stderr": str(e),
                    }
                )

        sftp.close()

        fix_ok = _run_fixpermissions(ssh, errors)

        success = fix_ok and not errors
        if success:
            msg = translate("templates.upload_success", lang, name=template_name)
        elif fix_ok:
            msg = translate("templates.upload_warn", lang, name=template_name)
        else:
            msg = translate("templates.upload_fix_error", lang, name=template_name)

        return (
            jsonify(
                success=success,
                message=msg,
                errors=errors,
            ),
            200 if fix_ok else 500,
        )

    except Exception as e:
        errors.append(
            {
                "step": "upload_template_exception",
                "stderr": str(e),
            }
        )
        return (
            jsonify(
                success=False,
                message=translate("templates.upload_error", lang, error=e),
                errors=errors,
            ),
            500,
        )
    finally:
        if ssh is not None:
            ssh.close()
