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

from flask import Blueprint, jsonify, request

from i18n import get_request_lang, translate
from utils import run_ssh_command


container_images_bp = Blueprint("container_images_bp", __name__, url_prefix="/container-images")

# Referência de imagem docker/podman: repo[:tag][@sha], ou ID hex.
_IMAGE_REF_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_./:@-]*$")


def _runtime_prefix() -> str:
    return (
        "runtime=''; "
        "if command -v docker >/dev/null 2>&1; then runtime='docker'; "
        "elif command -v podman >/dev/null 2>&1; then runtime='podman'; fi; "
        "if [ -z \"$runtime\" ]; then echo '__NO_RUNTIME__'; exit 45; fi; "
    )


@container_images_bp.route("/list", methods=["POST"])
def list_container_images():
    """
    Lista imagens do runtime de containers (docker/podman) no host ContainerLab.
    """
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()

    if not (eve_ip and eve_user and eve_pass):
        return (
            jsonify(success=False, message=translate("container_images.missing_creds", lang)),
            400,
        )

    cmd = (
        "runtime=''; "
        "if command -v docker >/dev/null 2>&1; then runtime='docker'; fi; "
        "if [ -z \"$runtime\" ] && command -v podman >/dev/null 2>&1; then runtime='podman'; fi; "
        "echo \"RUNTIME=$runtime\"; "
        "if [ -n \"$runtime\" ]; then "
        "  $runtime images --format '{{.Repository}}|{{.Tag}}|{{.ID}}|{{.CreatedSince}}|{{.Size}}' 2>/dev/null; "
        "fi"
    )

    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd)

    runtime = ""
    images = []

    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("RUNTIME="):
            runtime = line.split("=", 1)[1].strip()
            continue

        parts = line.split("|")
        if len(parts) >= 5:
            images.append(
                {
                    "repository": parts[0].strip(),
                    "tag": parts[1].strip(),
                    "id": parts[2].strip(),
                    "created": parts[3].strip(),
                    "size": "|".join(parts[4:]).strip(),
                }
            )
        else:
            # Inclui linhas inesperadas para depuração.
            images.append({"repository": line, "tag": "", "id": "", "created": "", "size": ""})

    success = True
    message = translate("container_images.success", lang)
    if not runtime:
        success = False
        message = translate("container_images.no_runtime", lang)
    elif rc != 0 and not images:
        success = False
        message = translate("container_images.fail", lang, rc=rc)

    return (
        jsonify(
            success=success,
            message=message,
            runtime=runtime,
            images=images,
            ssh_rc=rc,
            stderr=(err or "").strip(),
            raw=(out or "").strip(),
        ),
        200 if success else 500,
    )


@container_images_bp.route("/pull", methods=["POST"])
def pull_container_image():
    """`docker/podman pull <image>` no host ContainerLab."""
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    image = (request.form.get("image") or "").strip()
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_images.missing_creds", lang)), 400
    if not _IMAGE_REF_RE.match(image):
        return jsonify(success=False, message=translate("container_images.invalid_ref", lang)), 400
    cmd = _runtime_prefix() + f"$runtime pull {shlex.quote(image)} 2>&1"
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=600)
    combined = (out or "")
    if "__NO_RUNTIME__" in combined or rc == 45:
        return jsonify(success=False, message=translate("container_images.no_runtime", lang), output=combined), 500
    if rc != 0:
        return jsonify(success=False, message=translate("container_images.pull_fail", lang, rc=rc), output=combined), 200
    return jsonify(success=True, message=translate("container_images.pull_ok", lang, image=image), output=combined), 200


@container_images_bp.route("/remove", methods=["POST"])
def remove_container_image():
    """`docker/podman rmi <image|id>` no host ContainerLab."""
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    image = (request.form.get("image") or "").strip()
    force = (request.form.get("force") or "").strip() in ("1", "true", "yes")
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_images.missing_creds", lang)), 400
    if not _IMAGE_REF_RE.match(image):
        return jsonify(success=False, message=translate("container_images.invalid_ref", lang)), 400
    flag = "-f " if force else ""
    cmd = _runtime_prefix() + f"$runtime rmi {flag}{shlex.quote(image)} 2>&1"
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=120)
    combined = (out or "")
    if "__NO_RUNTIME__" in combined or rc == 45:
        return jsonify(success=False, message=translate("container_images.no_runtime", lang), output=combined), 500
    if rc != 0:
        return jsonify(success=False, message=translate("container_images.remove_fail", lang, rc=rc), output=combined), 200
    return jsonify(success=True, message=translate("container_images.remove_ok", lang, image=image), output=combined), 200
