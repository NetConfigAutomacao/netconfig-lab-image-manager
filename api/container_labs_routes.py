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

import json
import re
import shlex

from flask import Blueprint, jsonify, request
import yaml

from i18n import get_request_lang, translate
from utils import run_ssh_command


container_labs_bp = Blueprint("container_labs_bp", __name__, url_prefix="/container-labs")

# Nomes de container do ContainerLab: clab-<lab>-<node>. Restringe a um conjunto
# seguro para evitar injeção de comando ao passar para docker/podman.
_CONTAINER_NAME_RE = re.compile(r"^[A-Za-z0-9_.-]+$")


def _is_safe_relpath(name: str) -> bool:
    cleaned = (name or "").strip()
    if not cleaned:
        return False
    if cleaned.startswith("/"):
        return False
    if ".." in cleaned.split("/"):
        return False
    return True


def _is_safe_container_name(name: str) -> bool:
    cleaned = (name or "").strip()
    return bool(cleaned) and bool(_CONTAINER_NAME_RE.match(cleaned))


def _runtime_logs_cmd(container: str, tail: int = 200) -> str:
    quoted = shlex.quote(container)
    return (
        f"if command -v docker >/dev/null 2>&1; then docker logs --tail {int(tail)} {quoted} 2>&1; "
        f"elif command -v podman >/dev/null 2>&1; then podman logs --tail {int(tail)} {quoted} 2>&1; "
        "else echo '__NO_RUNTIME__'; exit 45; fi"
    )


def _runtime_exec_cmd(container: str, command: str) -> str:
    quoted = shlex.quote(container)
    inner = shlex.quote(command)
    return (
        f"if command -v docker >/dev/null 2>&1; then docker exec {quoted} sh -c {inner} 2>&1; "
        f"elif command -v podman >/dev/null 2>&1; then podman exec {quoted} sh -c {inner} 2>&1; "
        "else echo '__NO_RUNTIME__'; exit 45; fi"
    )


def _normalize_nodes(topology: dict) -> dict:
    nodes = topology.get("nodes") if isinstance(topology, dict) else None
    if isinstance(nodes, list):
        mapped = {}
        for idx, item in enumerate(nodes):
            if not isinstance(item, dict):
                continue
            name = (item.get("name") or f"node-{idx + 1}").strip()
            if not name:
                name = f"node-{idx + 1}"
            mapped[name] = item
        return mapped
    if isinstance(nodes, dict):
        return nodes
    return {}


def _parse_endpoint(endpoint):
    if isinstance(endpoint, str):
        if ":" in endpoint:
            node, iface = endpoint.split(":", 1)
            return node.strip(), iface.strip()
        return endpoint.strip(), ""
    if isinstance(endpoint, dict):
        node = str(endpoint.get("node") or "").strip()
        iface = str(endpoint.get("interface") or "").strip()
        return node, iface
    return "", ""


def _format_endpoint(node, iface):
    if node and iface:
        return f"{node}:{iface}"
    return node or ""


def _guess_role(kind_value: str, labels: dict) -> str:
    role = str(labels.get("topoViewer-role") or labels.get("graph-icon") or "").strip()
    if role:
        return role
    kind = (kind_value or "").lower()
    if "bridge" in kind:
        return "bridge"
    if kind in ("linux", "host"):
        return "host"
    return "router"


def _build_cyto_elements(doc: dict) -> list:
    elements = []
    topology = doc.get("topology") if isinstance(doc, dict) else {}
    topology = topology if isinstance(topology, dict) else {}
    nodes = _normalize_nodes(topology)
    parent_map = {}

    for idx, (node_name, node_obj) in enumerate(nodes.items()):
        node_obj = node_obj if isinstance(node_obj, dict) else {}
        labels = node_obj.get("labels") if isinstance(node_obj.get("labels"), dict) else {}
        group_name = str(labels.get("topoViewer-group") or labels.get("graph-group") or node_obj.get("group") or "").strip()
        group_level = str(labels.get("topoViewer-groupLevel") or labels.get("graph-level") or "").strip()
        parent_id = ""
        if group_name and group_level:
            parent_id = f"{group_name}:{group_level}"
            parent_map[parent_id] = str(labels.get("graph-groupLabelPos") or "").strip()

        role = _guess_role(str(node_obj.get("kind") or ""), labels)
        lat = str(labels.get("graph-geoCoordinateLat") or "")
        lng = str(labels.get("graph-geoCoordinateLng") or "")

        extra_data = {
            "id": node_name,
            "name": node_name,
            "kind": node_obj.get("kind") or "",
            "image": node_obj.get("image") or "",
            "type": node_obj.get("type") or "",
            "group": node_obj.get("group") or "",
            "labels": labels,
            "mgmtIpv4Address": node_obj.get("mgmt-ipv4") or "",
            "mgmtIpv6Address": node_obj.get("mgmt-ipv6") or "",
        }

        position = {"x": 0, "y": 0}
        if "graph-posX" in labels and "graph-posY" in labels:
            try:
                position = {"x": float(labels.get("graph-posX")), "y": float(labels.get("graph-posY"))}
            except (TypeError, ValueError):
                position = {"x": 0, "y": 0}

        node_data = {
            "id": node_name,
            "name": node_name,
            "topoViewerRole": role,
            "lat": lat,
            "lng": lng,
            "weight": "30",
            "extraData": extra_data,
        }
        if parent_id:
            node_data["parent"] = parent_id

        elements.append(
            {
                "group": "nodes",
                "data": node_data,
                "position": position,
                "classes": "",
            }
        )

    for parent_id, group_label_pos in parent_map.items():
        group_name, group_level = (parent_id.split(":", 1) + [""])[:2]
        elements.append(
            {
                "group": "nodes",
                "data": {
                    "id": parent_id,
                    "name": group_name or "UnnamedGroup",
                    "topoViewerRole": "group",
                    "lat": "",
                    "lng": "",
                    "weight": "1000",
                    "extraData": {
                        "topoViewerGroup": group_name or "",
                        "topoViewerGroupLevel": group_level or "",
                    },
                },
                "classes": group_label_pos or "",
            }
        )

    links = topology.get("links") if isinstance(topology, dict) else []
    if isinstance(links, list):
        for idx, link in enumerate(links):
            if not isinstance(link, dict):
                continue
            endpoints = link.get("endpoints")
            if not isinstance(endpoints, list) or len(endpoints) < 2:
                continue
            src_node, src_iface = _parse_endpoint(endpoints[0])
            dst_node, dst_iface = _parse_endpoint(endpoints[1])
            if not src_node or not dst_node:
                continue
            edge_id = f"link-{idx + 1}-{src_node}-{dst_node}"
            elements.append(
                {
                    "group": "edges",
                    "data": {
                        "id": edge_id,
                        "source": src_node,
                        "target": dst_node,
                        "sourceEndpoint": src_iface,
                        "targetEndpoint": dst_iface,
                        "endpoints": [
                            _format_endpoint(src_node, src_iface),
                            _format_endpoint(dst_node, dst_iface),
                        ],
                        "extraData": link,
                    },
                    "classes": "",
                }
            )

    return elements


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


@container_labs_bp.route("/topoviewer/cyto", methods=["POST"])
def container_labs_topoviewer_cyto():
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
    if not rel_path.lower().endswith((".yml", ".yaml")):
        return jsonify(success=False, message=translate("container_labs.only_yaml", lang)), 400

    cmd = (
        f"base='{labs_dir}'; lab='{lab_name}'; file='{rel_path}'; "
        "target=\"$base/$lab/$file\"; "
        "if [ ! -f \"$target\" ]; then echo '__FILE_NOT_FOUND__'; exit 44; fi; "
        "cat \"$target\""
    )

    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd)
    cleaned_out = out or ""
    if "__FILE_NOT_FOUND__" in cleaned_out or rc == 44:
        return (
            jsonify(
                success=False,
                message=translate("container_labs.file_missing", lang, path=rel_path),
                stderr=(err or "").strip(),
            ),
            404,
        )

    try:
        doc = yaml.safe_load(cleaned_out) or {}
    except Exception as exc:
        return (
            jsonify(success=False, message=f"Failed to parse YAML: {exc}"),
            400,
        )

    if not isinstance(doc, dict):
        doc = {}

    elements = _build_cyto_elements(doc)
    return jsonify(success=True, elements=elements), 200


@container_labs_bp.route("/topoviewer/env", methods=["POST"])
def container_labs_topoviewer_env():
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

    cmd = (
        f"base='{labs_dir}'; lab='{lab_name}'; file='{rel_path}'; "
        "target=\"$base/$lab/$file\"; "
        "if [ ! -f \"$target\" ]; then echo '__FILE_NOT_FOUND__'; exit 44; fi; "
        "cat \"$target\""
    )

    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd)
    cleaned_out = out or ""
    if "__FILE_NOT_FOUND__" in cleaned_out or rc == 44:
        return (
            jsonify(
                success=False,
                message=translate("container_labs.file_missing", lang, path=rel_path),
                stderr=(err or "").strip(),
            ),
            404,
        )

    try:
        doc = yaml.safe_load(cleaned_out) or {}
    except Exception:
        doc = {}

    if not isinstance(doc, dict):
        doc = {}

    clab_name = doc.get("name") or lab_name
    clab_prefix = doc.get("prefix") or ""

    environment = {
        "working-directory": f"{labs_dir}/{lab_name}",
        "clab-name": str(clab_name),
        "clab-prefix": str(clab_prefix),
        "clab-server-address": eve_ip,
        "clab-server-port": "22",
        "deployment-type": "containerlab",
        "topoviewer-version": "embedded",
    }

    return jsonify(success=True, environment=environment), 200


def _topology_target_cmd(labs_dir: str, lab_name: str, rel_path: str, action: str) -> str:
    """
    Monta o comando containerlab para deploy/destroy. labs_dir/lab_name/rel_path
    são interpolados como variáveis shell entre aspas simples (já validados a montante).
    """
    return (
        f"base='{labs_dir}'; lab='{lab_name}'; file='{rel_path}'; "
        "target=\"$base/$lab/$file\"; "
        "if [ ! -f \"$target\" ]; then echo '__FILE_NOT_FOUND__'; exit 44; fi; "
        "if ! command -v containerlab >/dev/null 2>&1; then echo '__NO_CONTAINERLAB__'; exit 46; fi; "
        f"containerlab {action} -t \"$target\" 2>&1"
    )


@container_labs_bp.route("/deploy", methods=["POST"])
def deploy_lab():
    """Executa `containerlab deploy -t <topo>` no host remoto."""
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    labs_dir = (request.form.get("labs_dir") or "/opt/containerlab/labs").strip() or "/opt/containerlab/labs"
    lab_name = (request.form.get("lab_name") or "").strip()
    rel_path = (request.form.get("path") or "").strip()
    reconfigure = str(request.form.get("reconfigure") or "").strip().lower() in {"1", "true", "yes", "on"}

    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _is_safe_relpath(lab_name) or not _is_safe_relpath(rel_path):
        return jsonify(success=False, message=translate("container_labs.invalid_path", lang)), 400
    if not rel_path.lower().endswith((".yml", ".yaml")):
        return jsonify(success=False, message=translate("container_labs.only_yaml", lang)), 400

    action = "deploy --reconfigure" if reconfigure else "deploy"
    cmd = _topology_target_cmd(labs_dir, lab_name, rel_path, action)
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd)
    combined = (out or "")

    if "__FILE_NOT_FOUND__" in combined or rc == 44:
        return jsonify(success=False, message=translate("container_labs.file_missing", lang, path=rel_path)), 404
    if "__NO_CONTAINERLAB__" in combined or rc == 46:
        return jsonify(success=False, message=translate("container_labs.deploy_fail", lang, rc=rc), stdout=combined, stderr=(err or "").strip()), 500
    if rc != 0:
        return jsonify(success=False, message=translate("container_labs.deploy_fail", lang, rc=rc), stdout=combined, stderr=(err or "").strip()), 500

    return jsonify(success=True, message=translate("container_labs.deploy_success", lang), stdout=combined, stderr=(err or "").strip()), 200


@container_labs_bp.route("/destroy", methods=["POST"])
def destroy_lab():
    """Executa `containerlab destroy -t <topo>` no host remoto."""
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    labs_dir = (request.form.get("labs_dir") or "/opt/containerlab/labs").strip() or "/opt/containerlab/labs"
    lab_name = (request.form.get("lab_name") or "").strip()
    rel_path = (request.form.get("path") or "").strip()
    cleanup = str(request.form.get("cleanup") or "").strip().lower() in {"1", "true", "yes", "on"}

    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _is_safe_relpath(lab_name) or not _is_safe_relpath(rel_path):
        return jsonify(success=False, message=translate("container_labs.invalid_path", lang)), 400
    if not rel_path.lower().endswith((".yml", ".yaml")):
        return jsonify(success=False, message=translate("container_labs.only_yaml", lang)), 400

    action = "destroy --cleanup" if cleanup else "destroy"
    cmd = _topology_target_cmd(labs_dir, lab_name, rel_path, action)
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd)
    combined = (out or "")

    if "__FILE_NOT_FOUND__" in combined or rc == 44:
        return jsonify(success=False, message=translate("container_labs.file_missing", lang, path=rel_path)), 404
    if rc != 0:
        return jsonify(success=False, message=translate("container_labs.destroy_fail", lang, rc=rc), stdout=combined, stderr=(err or "").strip()), 500

    return jsonify(success=True, message=translate("container_labs.destroy_success", lang), stdout=combined, stderr=(err or "").strip()), 200


def _normalize_inspect(parsed) -> list:
    """
    Normaliza a saída JSON do `containerlab inspect --format json` para uma lista
    de containers. O formato variou entre versões: ora {"containers":[...]},
    ora {"<lab>":[...]}, ora uma lista direta.
    """
    rows = []
    if isinstance(parsed, dict) and isinstance(parsed.get("containers"), list):
        candidates = parsed["containers"]
    elif isinstance(parsed, list):
        candidates = parsed
    elif isinstance(parsed, dict):
        candidates = []
        for value in parsed.values():
            if isinstance(value, list):
                candidates.extend(value)
    else:
        candidates = []

    for item in candidates:
        if not isinstance(item, dict):
            continue
        rows.append(
            {
                "name": item.get("name") or item.get("Names") or "",
                "lab": item.get("lab_name") or item.get("labName") or item.get("Labels", {}).get("clab-topo-file", "") if isinstance(item.get("Labels"), dict) else item.get("lab_name") or "",
                "kind": item.get("kind") or item.get("Kind") or "",
                "image": item.get("image") or item.get("Image") or "",
                "state": item.get("state") or item.get("State") or item.get("status") or "",
                "ipv4": item.get("ipv4_address") or item.get("ipv4") or item.get("IPv4Address") or "",
                "ipv6": item.get("ipv6_address") or item.get("ipv6") or item.get("IPv6Address") or "",
            }
        )
    return rows


@container_labs_bp.route("/inspect", methods=["POST"])
def inspect_labs():
    """Executa `containerlab inspect [--all|-t file] --format json` e normaliza."""
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    labs_dir = (request.form.get("labs_dir") or "/opt/containerlab/labs").strip() or "/opt/containerlab/labs"
    lab_name = (request.form.get("lab_name") or "").strip()
    rel_path = (request.form.get("path") or "").strip()

    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400

    if lab_name and rel_path:
        if not _is_safe_relpath(lab_name) or not _is_safe_relpath(rel_path):
            return jsonify(success=False, message=translate("container_labs.invalid_path", lang)), 400
        selector = (
            f"base='{labs_dir}'; lab='{lab_name}'; file='{rel_path}'; target=\"$base/$lab/$file\"; "
            "if [ ! -f \"$target\" ]; then echo '__FILE_NOT_FOUND__'; exit 44; fi; "
            "containerlab inspect -t \"$target\" --format json 2>/dev/null"
        )
    else:
        selector = "containerlab inspect --all --format json 2>/dev/null"

    cmd = (
        "if ! command -v containerlab >/dev/null 2>&1; then echo '__NO_CONTAINERLAB__'; exit 46; fi; "
        + selector
    )
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd)
    combined = (out or "").strip()

    if "__FILE_NOT_FOUND__" in combined or rc == 44:
        return jsonify(success=False, message=translate("container_labs.file_missing", lang, path=rel_path)), 404
    if "__NO_CONTAINERLAB__" in combined or rc == 46:
        return jsonify(success=False, message=translate("container_labs.inspect_fail", lang, rc=rc), containers=[], raw=combined), 200

    if not combined:
        # Sem labs rodando: inspect pode não emitir JSON.
        return jsonify(success=True, containers=[], raw="", ssh_rc=rc), 200

    try:
        parsed = json.loads(combined)
    except (ValueError, TypeError):
        return jsonify(success=False, message=translate("container_labs.inspect_parse_fail", lang), containers=[], raw=combined), 200

    return jsonify(success=True, containers=_normalize_inspect(parsed), raw=combined, ssh_rc=rc), 200


@container_labs_bp.route("/node/logs", methods=["POST"])
def node_logs():
    """Retorna as últimas linhas de log do container de um node."""
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    container = (request.form.get("container") or "").strip()
    try:
        tail = int(request.form.get("tail") or 200)
    except (TypeError, ValueError):
        tail = 200
    tail = max(1, min(tail, 2000))

    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _is_safe_container_name(container):
        return jsonify(success=False, message=translate("container_labs.invalid_container", lang)), 400

    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, _runtime_logs_cmd(container, tail))
    combined = (out or "")
    if "__NO_RUNTIME__" in combined or rc == 45:
        return jsonify(success=False, message=translate("container_labs.logs_fail", lang, rc=rc), logs=combined), 500

    return jsonify(success=True, logs=combined, ssh_rc=rc, stderr=(err or "").strip()), 200


@container_labs_bp.route("/node/exec", methods=["POST"])
def node_exec():
    """Executa um comando único dentro do container de um node (não interativo)."""
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    container = (request.form.get("container") or "").strip()
    command = (request.form.get("command") or "").strip()

    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _is_safe_container_name(container):
        return jsonify(success=False, message=translate("container_labs.invalid_container", lang)), 400
    if not command:
        return jsonify(success=False, message=translate("container_labs.missing_command", lang)), 400

    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, _runtime_exec_cmd(container, command))
    combined = (out or "")
    if "__NO_RUNTIME__" in combined or rc == 45:
        return jsonify(success=False, message=translate("container_labs.exec_fail", lang, rc=rc), output=combined), 500

    return jsonify(success=True, output=combined, rc=rc, stderr=(err or "").strip()), 200
