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

import traceback
from flask import Blueprint, request, jsonify

from utils import run_ssh_command
from i18n import translate, get_request_lang

images_bp = Blueprint("images_bp", __name__)


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

        base_dirs = {
            "qemu": "/opt/unetlab/addons/qemu",
            "iol": "/opt/unetlab/addons/iol/bin",
            "dynamips": "/opt/unetlab/addons/dynamips",
        }

        images = {}
        errors = []

        for kind, base_dir in base_dirs.items():
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
        return jsonify(success=(len(errors) == 0), message=msg_ok, images=images, errors=errors), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify(
            success=False,
            message=translate("images.internal_error", lang, error=str(e)),
        ), 500
