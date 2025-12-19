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

from flask import Blueprint, jsonify, request

from i18n import get_request_lang, translate
from utils import run_ssh_command


vrnetlab_bp = Blueprint("vrnetlab_bp", __name__, url_prefix="/vrnetlab")


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
        "if [ -d '/opt/vrnetlab' ]; then repo='/opt/vrnetlab'; fi; "
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
    if rc != 0 and not runtime and not images:
        success = False
        message = translate("vrnetlab.status.fail", lang, rc=rc)

    response = {
        "success": success,
        "message": message,
        "runtime": runtime,
        "repo_path": repo_path,
        "images": images,
        "extra": extra_lines,
        "ssh_rc": rc,
        "stderr": (err or "").strip(),
        "raw": (out or "").strip(),
    }

    return jsonify(response), 200 if success else 500
