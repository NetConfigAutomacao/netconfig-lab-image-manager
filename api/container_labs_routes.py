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


container_labs_bp = Blueprint("container_labs_bp", __name__, url_prefix="/container-labs")


def _is_safe_relpath(name: str) -> bool:
    cleaned = (name or "").strip()
    if not cleaned:
        return False
    if cleaned.startswith("/"):
        return False
    if ".." in cleaned.split("/"):
        return False
    return True


@container_labs_bp.route("/list", methods=["POST"])
def list_container_labs():
    """
    Lista diretórios de labs em /opt/containerlab/labs no host ContainerLab.
    """
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()

    if not (eve_ip and eve_user and eve_pass):
        return (
            jsonify(success=False, message=translate("container_labs.missing_creds", lang)),
            400,
        )

    target_dir = (request.form.get("labs_dir") or "/opt/containerlab/labs").strip() or "/opt/containerlab/labs"
    cmd = (
        f"target='{target_dir}'; "
        "if [ ! -d \"$target\" ]; then echo '__MISSING_LABS_DIR__'; exit 44; fi; "
        "cd \"$target\"; "
        "for d in *; do "
        "  [ -d \"$d\" ] || continue; "
        "  if find \"$d\" -maxdepth 2 -type f -name '*clab*.yml' 2>/dev/null | grep -q .; then "
        "    echo \"$d\"; "
        "  fi; "
        "done"
    )

    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd)
    cleaned_out = (out or "").strip()
    labs = []

    for line in cleaned_out.splitlines():
        line = line.strip()
        if not line or line.startswith("__MISSING_LABS_DIR__"):
            continue
        labs.append(line)

    if "__MISSING_LABS_DIR__" in cleaned_out or rc == 44:
        return (
            jsonify(
                success=False,
                missing_dir=True,
                message=translate("container_labs.missing_dir", lang),
                labs=[],
                ssh_rc=rc,
                stderr=(err or "").strip(),
            ),
            200,
        )

    success = True
    message = translate("container_labs.success", lang)
    # Mesmo que o comando retorne código diferente de zero, se não houve erro
    # relevante e a pasta existe, consideramos sucesso para exibir a lista (possivelmente vazia).
    if rc != 0 and not labs:
        message = translate("container_labs.empty", lang)

    return (
        jsonify(
            success=success,
            message=message,
            labs=labs,
            ssh_rc=rc,
            stderr=(err or "").strip(),
            raw=cleaned_out,
        ),
        200,
    )


@container_labs_bp.route("/create", methods=["POST"])
def create_container_labs_dir():
    """
    Cria o diretório /opt/containerlab/labs no host remoto.
    """
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()

    if not (eve_ip and eve_user and eve_pass):
        return (
            jsonify(success=False, message=translate("container_labs.missing_creds", lang)),
            400,
        )

    target_dir = (request.form.get("labs_dir") or "/opt/containerlab/labs").strip() or "/opt/containerlab/labs"
    cmd = f"mkdir -p '{target_dir}'"
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd)

    if rc != 0:
        return (
            jsonify(
                success=False,
                message=translate("container_labs.create_fail", lang, rc=rc),
                stderr=(err or "").strip(),
            ),
            500,
        )

    return jsonify(success=True, message=translate("container_labs.create_success", lang)), 200


@container_labs_bp.route("/files", methods=["POST"])
def list_lab_files():
    """
    Lista arquivos dentro de um lab específico, retornando tipo (dir/file) e caminho relativo.
    """
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    labs_dir = (request.form.get("labs_dir") or "/opt/containerlab/labs").strip() or "/opt/containerlab/labs"
    lab_name = (request.form.get("lab_name") or "").strip()

    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _is_safe_relpath(lab_name):
        return jsonify(success=False, message=translate("container_labs.invalid_lab", lang)), 400

    cmd = (
        f"base='{labs_dir}'; lab='{lab_name}'; target=\"$base/$lab\"; "
        "if [ ! -d \"$target\" ]; then echo '__MISSING_LAB_DIR__'; exit 44; fi; "
        "cd \"$target\"; "
        "find . -maxdepth 5 -mindepth 1 \\( -type d -printf 'DIR|%P\\n' \\) -o \\( -type f -printf 'FILE|%P\\n' \\)"
    )

    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd)
    cleaned_out = (out or "").strip()
    files = []
    for line in cleaned_out.splitlines():
        line = line.strip()
        if not line or line.startswith("__MISSING_LAB_DIR__"):
            continue
        if "|" not in line:
            continue
        kind, rel = line.split("|", 1)
        rel = rel.strip().lstrip("./")
        if not rel:
            continue
        files.append({"type": "dir" if kind == "DIR" else "file", "path": rel})

    if "__MISSING_LAB_DIR__" in cleaned_out or rc == 44:
        return (
            jsonify(
                success=False,
                missing_lab=True,
                message=translate("container_labs.lab_missing", lang, name=lab_name),
                files=[],
                ssh_rc=rc,
                stderr=(err or "").strip(),
            ),
            200,
        )

    return (
        jsonify(
            success=True,
            message=translate("container_labs.files_success", lang),
            files=files,
            ssh_rc=rc,
            stderr=(err or "").strip(),
            raw=cleaned_out,
        ),
        200,
    )


@container_labs_bp.route("/file", methods=["POST"])
def get_lab_file():
    """
    Retorna o conteúdo de um arquivo YAML dentro de um lab.
    """
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    labs_dir = (request.form.get("labs_dir") or "/opt/containerlab/labs").strip() or "/opt/containerlab/labs"
    lab_name = (request.form.get("lab_name") or "").strip()
    rel_path = (request.form.get("path") or "").strip()

    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _is_safe_relpath(lab_name) or not _is_safe_relpath(rel_path):
        return jsonify(success=False, message=translate("container_labs.invalid_path", lang)), 400
    if not rel_path.lower().endswith((".yml", ".yaml", ".txt", ".py")):
        return jsonify(success=False, message=translate("container_labs.only_yaml", lang)), 400

    cmd = (
        f"base='{labs_dir}'; lab='{lab_name}'; file='{rel_path}'; "
        "target=\"$base/$lab/$file\"; "
        "if [ ! -f \"$target\" ]; then echo '__FILE_NOT_FOUND__'; exit 44; fi; "
        "cat \"$target\""
    )

    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd)
    cleaned_out = (out or "")
    if "__FILE_NOT_FOUND__" in cleaned_out or rc == 44:
        return (
            jsonify(
                success=False,
                message=translate("container_labs.file_missing", lang, path=rel_path),
                stderr=(err or "").strip(),
            ),
            404,
        )

    return jsonify(success=True, message=translate("container_labs.file_success", lang), content=cleaned_out), 200


@container_labs_bp.route("/file/save", methods=["POST"])
def save_lab_file():
    """
    Salva conteúdo YAML em um arquivo dentro do lab (base64).
    """
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    labs_dir = (request.form.get("labs_dir") or "/opt/containerlab/labs").strip() or "/opt/containerlab/labs"
    lab_name = (request.form.get("lab_name") or "").strip()
    rel_path = (request.form.get("path") or "").strip()
    b64_content = (request.form.get("content_b64") or "").strip()

    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _is_safe_relpath(lab_name) or not _is_safe_relpath(rel_path):
        return jsonify(success=False, message=translate("container_labs.invalid_path", lang)), 400
    if not rel_path.lower().endswith((".yml", ".yaml", ".txt", ".py")):
        return jsonify(success=False, message=translate("container_labs.only_yaml", lang)), 400
    if not b64_content:
        return jsonify(success=False, message=translate("container_labs.empty_content", lang)), 400

    cmd = (
        f"base='{labs_dir}'; lab='{lab_name}'; file='{rel_path}'; "
        "target=\"$base/$lab/$file\"; "
        "if [ ! -d \"$base/$lab\" ]; then echo '__MISSING_LAB_DIR__'; exit 44; fi; "
        f"echo '{b64_content}' | base64 -d > \"$target\""
    )

    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd)
    cleaned_err = (err or "").strip()

    if "__MISSING_LAB_DIR__" in (out or "") or rc == 44:
        return (
            jsonify(
                success=False,
                message=translate("container_labs.lab_missing", lang, name=lab_name),
                stderr=cleaned_err,
            ),
            400,
        )

    if rc != 0:
        return (
            jsonify(
                success=False,
                message=translate("container_labs.save_fail", lang, rc=rc),
                stderr=cleaned_err,
            ),
            500,
        )

    return jsonify(success=True, message=translate("container_labs.save_success", lang)), 200
