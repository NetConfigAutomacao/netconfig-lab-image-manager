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

import re
import traceback
from flask import Blueprint, request, jsonify

from utils import run_ssh_command, detect_platform, get_resource_usage
from i18n import translate, get_request_lang

images_bp = Blueprint("images_bp", __name__)

BASE_DIRS = {
    "qemu": "/opt/unetlab/addons/qemu",
    "iol": "/opt/unetlab/addons/iol/bin",
    "dynamips": "/opt/unetlab/addons/dynamips",
}

SAFE_TEMPLATE_RE = re.compile(r"^[A-Za-z0-9._+-]+$")


def _sanitize_template_name(name: str) -> str:
    """
    Restrict template/image directory names to a safe set of characters to
    avoid path traversal or command injection on the remote host.
    """
    cleaned = (name or "").strip()
    if not cleaned:
        return ""
    if "/" in cleaned or "\\" in cleaned or ".." in cleaned:
        return ""
    if not SAFE_TEMPLATE_RE.match(cleaned):
        return ""
    return cleaned


@images_bp.route("/images", methods=["POST"])
def list_images():
    lang = get_request_lang()
    try:
        print("[API] Requisição /images recebida", flush=True)

        eve_ip = request.form.get("eve_ip", "").strip()
        eve_user = request.form.get("eve_user", "").strip()
        eve_pass = request.form.get("eve_pass", "").strip()

        print(f"[API] Dados recebidos para /images: eve_ip={eve_ip}, eve_user={eve_user}", flush=True)

        if not (eve_ip and eve_user and eve_pass):
            return jsonify(success=False, message=translate("images.missing_creds", lang)), 400

        images = {}
        errors = []

        platform_name, platform_raw, platform_source = detect_platform(eve_ip, eve_user, eve_pass)
        resources = get_resource_usage(eve_ip, eve_user, eve_pass)

        for kind, base_dir in BASE_DIRS.items():
            cmd = (
                f"if [ -d '{base_dir}' ]; then "
                f"cd '{base_dir}' && for d in *; do [ -d \"$d\" ] && echo \"$d\"; done; "
                f"fi"
            )
            print(f"[API] Listando {kind} em {base_dir}", flush=True)
            rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd)

            entries = [line.strip() for line in out.splitlines() if line.strip()]
            images[kind] = entries

            cleaned_err = (err or "").strip()
            if cleaned_err:
                warning_phrase = "Permanently added"
                only_warning = (
                    warning_phrase in cleaned_err
                    and all(
                        (not line.strip()) or (warning_phrase in line)
                        for line in cleaned_err.splitlines()
                    )
                )
                if not only_warning:
                    errors.append(
                        {
                            "context": kind,
                            "stderr": cleaned_err,
                        }
                    )

        msg_ok = translate("images.success", lang)
        if errors:
            msg_ok += translate("images.partial_warning", lang)

        print(f"[API] Resultado /images: {images}", flush=True)
        return jsonify(
            success=(len(errors) == 0),
            message=msg_ok,
            images=images,
            errors=errors,
            platform={
                "name": platform_name,
                "raw": platform_raw,
                "source": platform_source,
            },
            resources=resources,
        ), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify(
            success=False,
            message=translate("images.internal_error", lang, error=str(e)),
        ), 500


@images_bp.route("/images/delete", methods=["POST"])
def delete_image():
    lang = get_request_lang()
    try:
        eve_ip = request.form.get("eve_ip", "").strip()
        eve_user = request.form.get("eve_user", "").strip()
        eve_pass = request.form.get("eve_pass", "").strip()
        image_type = (request.form.get("image_type") or "").strip().lower()
        template_name = request.form.get("template_name", "")

        if not (eve_ip and eve_user and eve_pass):
            return (
                jsonify(success=False, message=translate("images.missing_creds", lang)),
                400,
            )

        base_dir = BASE_DIRS.get(image_type)
        if not base_dir:
            return (
                jsonify(success=False, message=translate("images.invalid_type", lang)),
                400,
            )

        safe_template = _sanitize_template_name(template_name)
        if not safe_template:
            return (
                jsonify(
                    success=False, message=translate("images.invalid_template", lang)
                ),
                400,
            )

        target_path = f"{base_dir.rstrip('/')}/{safe_template}"
        delete_cmd = (
            f"target='{target_path}'; "
            "if [ ! -e \"$target\" ]; then echo '__NOT_FOUND__'; exit 44; fi; "
            "rm -rf -- \"$target\""
        )

        rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, delete_cmd)
        cleaned_out = (out or "").strip()
        cleaned_err = (err or "").strip()

        if rc != 0:
            if "__NOT_FOUND__" in cleaned_out:
                return (
                    jsonify(
                        success=False,
                        message=translate(
                            "images.delete_not_found",
                            lang,
                            name=safe_template,
                            path=base_dir,
                        ),
                        errors=[
                            {
                                "context": "remove",
                                "stdout": cleaned_out,
                                "stderr": cleaned_err,
                                "rc": rc,
                            }
                        ],
                    ),
                    404,
                )

            return (
                jsonify(
                    success=False,
                    message=translate("images.delete_fail", lang),
                    errors=[
                        {
                            "context": "remove",
                            "stdout": cleaned_out,
                            "stderr": cleaned_err,
                            "rc": rc,
                        }
                    ],
                ),
                500,
            )

        fix_rc, fix_out, fix_err = run_ssh_command(
            eve_ip,
            eve_user,
            eve_pass,
            "/opt/unetlab/wrappers/unl_wrapper -a fixpermissions",
        )

        warnings = []
        if fix_rc != 0:
            warnings.append(
                {
                    "context": "fixpermissions",
                    "stdout": (fix_out or "").strip(),
                    "stderr": (fix_err or "").strip(),
                    "rc": fix_rc,
                }
            )

        msg = translate("images.delete_success", lang, name=safe_template)
        if warnings:
            msg += translate("images.delete_fix_warning", lang)

        return (
            jsonify(
                success=True,
                message=msg,
                deleted={"type": image_type, "name": safe_template},
                warnings=warnings,
            ),
            200,
        )
    except Exception as e:
        traceback.print_exc()
        return (
            jsonify(
                success=False,
                message=translate("images.delete_internal_error", lang, error=str(e)),
            ),
            500,
        )
