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
import threading
import uuid

from flask import Blueprint, Response, jsonify, request
import yaml

from i18n import get_request_lang, translate
from utils import run_ssh_command, run_ssh_stream, run_ssh_binary


# Jobs assíncronos de deploy/destroy (log ao vivo). Em memória.
_CLAB_JOBS = {}
_CLAB_JOBS_LOCK = threading.Lock()


def _job_new():
    job_id = uuid.uuid4().hex
    with _CLAB_JOBS_LOCK:
        _CLAB_JOBS[job_id] = {"status": "running", "lines": [], "rc": None}
    return job_id


def _job_append(job_id, line):
    with _CLAB_JOBS_LOCK:
        j = _CLAB_JOBS.get(job_id)
        if j:
            j["lines"].append(line)
            if len(j["lines"]) > 5000:
                j["lines"] = j["lines"][-5000:]


def _job_finish(job_id, rc):
    with _CLAB_JOBS_LOCK:
        j = _CLAB_JOBS.get(job_id)
        if j:
            j["rc"] = rc
            j["status"] = "success" if rc == 0 else "error"


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

    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=45)
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
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=45)

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

    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=45)
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

    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=45)
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
        "if [ -f \"$target\" ]; then cp -f \"$target\" \"$target.bak\" 2>/dev/null || true; cp -f \"$target\" \"$target.bak.$(date +%s)\" 2>/dev/null || true; fi; "
        f"echo '{b64_content}' | base64 -d > \"$target\""
    )

    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=45)
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

    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=45)
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

    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=45)
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


def _cyto_to_doc(existing_doc, elements):
    """
    Converte elementos cytoscape (do editor TopoViewer) de volta para um doc
    ContainerLab, **preservando** campos existentes de cada node e as chaves de
    topo-nível (name, mgmt, prefix, etc.). Retorna None se nenhum node válido
    for encontrado (recusa-se a gravar um arquivo destrutivo/vazio).
    """
    doc = dict(existing_doc) if isinstance(existing_doc, dict) else {}
    topo = dict(doc.get("topology")) if isinstance(doc.get("topology"), dict) else {}

    existing_nodes = topo.get("nodes")
    if isinstance(existing_nodes, list):
        existing_nodes = _normalize_nodes({"nodes": existing_nodes})
    if not isinstance(existing_nodes, dict):
        existing_nodes = {}

    if not isinstance(elements, list):
        return None

    new_nodes = {}
    new_links = []

    for el in elements:
        if not isinstance(el, dict):
            continue
        group = el.get("group")
        data = el.get("data") if isinstance(el.get("data"), dict) else {}

        if group == "nodes":
            if data.get("topoViewerRole") == "group":
                continue
            name = (data.get("name") or data.get("id") or "").strip()
            if not name:
                continue
            base = dict(existing_nodes.get(name) or {})
            extra = data.get("extraData") if isinstance(data.get("extraData"), dict) else {}
            for key in ("kind", "image", "type"):
                if extra.get(key):
                    base[key] = extra[key]
            pos = el.get("position") if isinstance(el.get("position"), dict) else {}
            labels = dict(base.get("labels")) if isinstance(base.get("labels"), dict) else {}
            if isinstance(extra.get("labels"), dict):
                labels.update(extra["labels"])
            if "x" in pos:
                labels["graph-posX"] = str(pos.get("x"))
            if "y" in pos:
                labels["graph-posY"] = str(pos.get("y"))
            if labels:
                base["labels"] = labels
            new_nodes[name] = base

        elif group == "edges":
            extra = data.get("extraData")
            if isinstance(extra, dict) and isinstance(extra.get("endpoints"), list) and len(extra["endpoints"]) >= 2:
                new_links.append(extra)
                continue
            eps = data.get("endpoints")
            if isinstance(eps, list) and len(eps) >= 2:
                new_links.append({"endpoints": [eps[0], eps[1]]})

    if not new_nodes:
        return None

    topo["nodes"] = new_nodes
    topo["links"] = new_links
    doc["topology"] = topo
    return doc


@container_labs_bp.route("/topoviewer/save", methods=["POST"])
def container_labs_topoviewer_save():
    """
    Persiste edições do TopoViewer: recebe elementos cytoscape, faz merge no
    YAML existente (preservando campos) e grava de volta no host.
    """
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    labs_dir = (request.form.get("labs_dir") or "/opt/containerlab/labs").strip() or "/opt/containerlab/labs"
    lab_name = (request.form.get("lab_name") or "").strip()
    rel_path = (request.form.get("path") or "").strip()
    elements_raw = request.form.get("elements") or ""

    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _is_safe_relpath(lab_name) or not _is_safe_relpath(rel_path):
        return jsonify(success=False, message=translate("container_labs.invalid_path", lang)), 400
    if not rel_path.lower().endswith((".yml", ".yaml")):
        return jsonify(success=False, message=translate("container_labs.only_yaml", lang)), 400

    try:
        elements = json.loads(elements_raw)
    except (ValueError, TypeError):
        return jsonify(success=False, message=translate("container_labs.save_invalid_payload", lang)), 400

    read_cmd = (
        f"base='{labs_dir}'; lab='{lab_name}'; file='{rel_path}'; target=\"$base/$lab/$file\"; "
        "if [ ! -f \"$target\" ]; then echo '__FILE_NOT_FOUND__'; exit 44; fi; cat \"$target\""
    )
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, read_cmd, timeout=45)
    if "__FILE_NOT_FOUND__" in (out or "") or rc == 44:
        return jsonify(success=False, message=translate("container_labs.file_missing", lang, path=rel_path)), 404

    try:
        existing_doc = yaml.safe_load(out or "") or {}
    except Exception:
        existing_doc = {}
    if not isinstance(existing_doc, dict):
        existing_doc = {}

    merged = _cyto_to_doc(existing_doc, elements)
    if merged is None:
        # Payload não reconhecível / sem nós: não grava nada (não destrói o arquivo).
        return jsonify(success=False, message=translate("container_labs.save_invalid_payload", lang)), 400

    try:
        new_yaml = yaml.safe_dump(merged, sort_keys=False, default_flow_style=False, allow_unicode=True)
    except Exception as exc:
        return jsonify(success=False, message=f"{translate('container_labs.save_fail', lang, rc=1)} ({exc})"), 500

    import base64 as _b64
    b64 = _b64.b64encode(new_yaml.encode("utf-8")).decode("ascii")
    # Faz backup do arquivo atual (.bak) antes de sobrescrever, para rollback.
    write_cmd = (
        f"base='{labs_dir}'; lab='{lab_name}'; file='{rel_path}'; target=\"$base/$lab/$file\"; "
        "if [ ! -d \"$base/$lab\" ]; then echo '__MISSING_LAB_DIR__'; exit 44; fi; "
        "if [ -f \"$target\" ]; then cp -f \"$target\" \"$target.bak\" 2>/dev/null || true; cp -f \"$target\" \"$target.bak.$(date +%s)\" 2>/dev/null || true; fi; "
        f"echo '{b64}' | base64 -d > \"$target\""
    )
    rc2, out2, err2 = run_ssh_command(eve_ip, eve_user, eve_pass, write_cmd, timeout=45)
    if "__MISSING_LAB_DIR__" in (out2 or "") or rc2 == 44:
        return jsonify(success=False, message=translate("container_labs.lab_missing", lang, name=lab_name)), 400
    if rc2 != 0:
        return jsonify(success=False, message=translate("container_labs.save_fail", lang, rc=rc2), stderr=(err2 or "").strip()), 500

    return jsonify(success=True, message=translate("container_labs.save_success", lang)), 200


@container_labs_bp.route("/topoviewer/restore", methods=["POST"])
def container_labs_topoviewer_restore():
    """Restaura o último backup (.bak) do arquivo de topologia, se existir."""
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
        f"base='{labs_dir}'; lab='{lab_name}'; file='{rel_path}'; target=\"$base/$lab/$file\"; "
        "if [ ! -f \"$target.bak\" ]; then echo '__NO_BACKUP__'; exit 44; fi; "
        "cp -f \"$target.bak\" \"$target\" && cat \"$target\""
    )
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=45)
    if "__NO_BACKUP__" in (out or "") or rc == 44:
        return jsonify(success=False, message=translate("container_labs.no_backup", lang)), 404
    if rc != 0:
        return jsonify(success=False, message=translate("container_labs.restore_fail", lang, rc=rc), stderr=(err or "").strip()), 500

    return jsonify(success=True, message=translate("container_labs.restore_success", lang), content=out or ""), 200


@container_labs_bp.route("/create-lab", methods=["POST"])
def create_lab():
    """Cria um novo lab (diretório + .clab.yml inicial) em labs_dir."""
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    labs_dir = (request.form.get("labs_dir") or "/opt/containerlab/labs").strip() or "/opt/containerlab/labs"
    lab_name = (request.form.get("lab_name") or "").strip()
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _is_safe_relpath(lab_name) or "/" in lab_name:
        return jsonify(success=False, message=translate("container_labs.invalid_lab", lang)), 400
    file_name = lab_name + ".clab.yml"
    starter = f"name: {lab_name}\ntopology:\n  nodes: {{}}\n  links: []\n"
    import base64 as _b64
    b64 = _b64.b64encode(starter.encode("utf-8")).decode("ascii")
    cmd = (
        f"dir='{labs_dir}/{lab_name}'; "
        "if [ -e \"$dir\" ]; then echo '__EXISTS__'; exit 44; fi; "
        "mkdir -p \"$dir\"; "
        f"echo '{b64}' | base64 -d > \"$dir/{file_name}\""
    )
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=30)
    if "__EXISTS__" in (out or "") or rc == 44:
        return jsonify(success=False, message=translate("container_labs.lab_exists", lang, name=lab_name)), 409
    if rc != 0:
        return jsonify(success=False, message=translate("container_labs.create_fail", lang, rc=rc), stderr=(err or "").strip()), 500
    return jsonify(success=True, message=translate("container_labs.lab_created", lang, name=lab_name), lab_name=lab_name, path=file_name), 200


@container_labs_bp.route("/clone-lab", methods=["POST"])
def clone_lab():
    """Clona um lab existente para um novo nome."""
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    labs_dir = (request.form.get("labs_dir") or "/opt/containerlab/labs").strip() or "/opt/containerlab/labs"
    src = (request.form.get("src_lab") or "").strip()
    dst = (request.form.get("new_lab") or "").strip()
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _is_safe_relpath(src) or "/" in src or not _is_safe_relpath(dst) or "/" in dst:
        return jsonify(success=False, message=translate("container_labs.invalid_lab", lang)), 400
    cmd = (
        f"src='{labs_dir}/{src}'; dst='{labs_dir}/{dst}'; "
        "if [ ! -d \"$src\" ]; then echo '__NO_SRC__'; exit 45; fi; "
        "if [ -e \"$dst\" ]; then echo '__EXISTS__'; exit 44; fi; "
        "cp -r \"$src\" \"$dst\""
    )
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=60)
    if "__NO_SRC__" in (out or "") or rc == 45:
        return jsonify(success=False, message=translate("container_labs.lab_missing", lang, name=src)), 404
    if "__EXISTS__" in (out or "") or rc == 44:
        return jsonify(success=False, message=translate("container_labs.lab_exists", lang, name=dst)), 409
    if rc != 0:
        return jsonify(success=False, message=translate("container_labs.clone_fail", lang, rc=rc), stderr=(err or "").strip()), 500
    return jsonify(success=True, message=translate("container_labs.lab_cloned", lang, src=src, dst=dst)), 200


@container_labs_bp.route("/save-configs", methods=["POST"])
def save_configs():
    """Executa `containerlab save -t <topo>` (persiste configs dos nós)."""
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
        f"target='{labs_dir}/{lab_name}/{rel_path}'; "
        "if [ ! -f \"$target\" ]; then echo '__FILE_NOT_FOUND__'; exit 44; fi; "
        "containerlab save -t \"$target\" 2>&1"
    )
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=180)
    combined = out or ""
    if "__FILE_NOT_FOUND__" in combined or rc == 44:
        return jsonify(success=False, message=translate("container_labs.file_missing", lang, path=rel_path)), 404
    if rc != 0:
        return jsonify(success=False, message=translate("container_labs.saveconfigs_fail", lang, rc=rc), output=combined), 500
    return jsonify(success=True, message=translate("container_labs.saveconfigs_ok", lang), output=combined), 200


@container_labs_bp.route("/backups", methods=["POST"])
def list_backups():
    """Lista os backups (.bak.*) de um arquivo de topologia."""
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
    base = rel_path.rsplit("/", 1)[-1]
    cmd = (
        f"dir='{labs_dir}/{lab_name}'; cd \"$dir\" 2>/dev/null || exit 0; "
        f"ls -1t '{base}'.bak '{base}'.bak.* 2>/dev/null"
    )
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=30)
    files = [ln.strip() for ln in (out or "").splitlines() if ln.strip()]
    return jsonify(success=True, backups=files), 200


@container_labs_bp.route("/restore-backup", methods=["POST"])
def restore_backup():
    """Restaura um backup específico (.bak.<ts>) sobre o arquivo de topologia."""
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    labs_dir = (request.form.get("labs_dir") or "/opt/containerlab/labs").strip() or "/opt/containerlab/labs"
    lab_name = (request.form.get("lab_name") or "").strip()
    rel_path = (request.form.get("path") or "").strip()
    backup = (request.form.get("backup") or "").strip()
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _is_safe_relpath(lab_name) or not _is_safe_relpath(rel_path):
        return jsonify(success=False, message=translate("container_labs.invalid_path", lang)), 400
    # backup deve ser <base>.bak ou <base>.bak.<digits>, sem path
    base = rel_path.rsplit("/", 1)[-1]
    if not re.match(r"^" + re.escape(base) + r"\.bak(\.[0-9]+)?$", backup or ""):
        return jsonify(success=False, message=translate("container_labs.invalid_path", lang)), 400
    sub = rel_path.rsplit("/", 1)[0] if "/" in rel_path else ""
    dirpath = f"{labs_dir}/{lab_name}" + (f"/{sub}" if sub else "")
    cmd = (
        f"dir='{dirpath}'; b=\"$dir/{backup}\"; tgt='{labs_dir}/{lab_name}/{rel_path}'; "
        "if [ ! -f \"$b\" ]; then echo '__NO_BACKUP__'; exit 44; fi; cp -f \"$b\" \"$tgt\" && cat \"$tgt\""
    )
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=30)
    if "__NO_BACKUP__" in (out or "") or rc == 44:
        return jsonify(success=False, message=translate("container_labs.no_backup", lang)), 404
    if rc != 0:
        return jsonify(success=False, message=translate("container_labs.restore_fail", lang, rc=rc)), 500
    return jsonify(success=True, message=translate("container_labs.restore_success", lang), content=out or ""), 200


@container_labs_bp.route("/check-images", methods=["POST"])
def check_images():
    """
    Lê as imagens dos nós no topo YAML e compara com `docker images` no host.
    Retorna {missing:[], present:[]} para avisar antes do deploy.
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

    # 1) lê o YAML
    read_cmd = (
        f"target='{labs_dir}/{lab_name}/{rel_path}'; "
        "if [ ! -f \"$target\" ]; then echo '__FILE_NOT_FOUND__'; exit 44; fi; cat \"$target\""
    )
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, read_cmd, timeout=30)
    if "__FILE_NOT_FOUND__" in (out or "") or rc == 44:
        return jsonify(success=False, message=translate("container_labs.file_missing", lang, path=rel_path)), 404
    try:
        doc = yaml.safe_load(out or "") or {}
    except Exception:
        doc = {}
    topo = doc.get("topology") if isinstance(doc, dict) else {}
    topo = topo if isinstance(topo, dict) else {}
    kinds = topo.get("kinds") if isinstance(topo.get("kinds"), dict) else {}
    nodes = _normalize_nodes(topo)
    images = set()
    for node in nodes.values():
        if not isinstance(node, dict):
            continue
        img = node.get("image")
        if not img:
            kind = node.get("kind")
            kd = kinds.get(kind) if isinstance(kinds.get(kind), dict) else {}
            img = kd.get("image")
        if img:
            images.add(str(img).strip())

    if not images:
        return jsonify(success=True, missing=[], present=[], images=[]), 200

    # 2) lista imagens do runtime
    list_cmd = (
        "if command -v docker >/dev/null 2>&1; then docker images --format '{{.Repository}}:{{.Tag}}'; "
        "elif command -v podman >/dev/null 2>&1; then podman images --format '{{.Repository}}:{{.Tag}}'; "
        "else echo '__NO_RUNTIME__'; fi"
    )
    rc2, out2, err2 = run_ssh_command(eve_ip, eve_user, eve_pass, list_cmd, timeout=45)
    have = set()
    for line in (out2 or "").splitlines():
        line = line.strip()
        if line and line != "__NO_RUNTIME__":
            have.add(line)

    def _present(img):
        if img in have:
            return True
        # docker normaliza :latest implícito
        if ":" not in img and (img + ":latest") in have:
            return True
        return False

    missing = sorted([i for i in images if not _present(i)])
    present = sorted([i for i in images if _present(i)])
    return jsonify(success=True, missing=missing, present=present, images=sorted(images)), 200


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
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=600)
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
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=600)
    combined = (out or "")

    if "__FILE_NOT_FOUND__" in combined or rc == 44:
        return jsonify(success=False, message=translate("container_labs.file_missing", lang, path=rel_path)), 404
    if rc != 0:
        return jsonify(success=False, message=translate("container_labs.destroy_fail", lang, rc=rc), stdout=combined, stderr=(err or "").strip()), 500

    return jsonify(success=True, message=translate("container_labs.destroy_success", lang), stdout=combined, stderr=(err or "").strip()), 200


def _run_clab_job(job_id, eve_ip, eve_user, eve_pass, labs_dir, lab_name, rel_path, action):
    target = f"{labs_dir}/{lab_name}/{rel_path}"
    cmd = (
        f"if [ ! -f '{target}' ]; then echo 'arquivo não encontrado: {target}'; exit 44; fi; "
        "if ! command -v containerlab >/dev/null 2>&1; then echo 'containerlab não encontrado no host'; exit 46; fi; "
        f"containerlab {action} -t '{target}' 2>&1"
    )
    _job_append(job_id, f"$ containerlab {action} -t {rel_path}")
    try:
        rc = run_ssh_stream(eve_ip, eve_user, eve_pass, cmd, lambda ln: _job_append(job_id, ln), timeout=1200)
    except Exception as exc:  # pragma: no cover
        _job_append(job_id, f"erro: {exc}")
        rc = 1
    _job_finish(job_id, rc)


def _start_clab_job(action_label, action_cmd):
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
    job_id = _job_new()
    th = threading.Thread(
        target=_run_clab_job,
        args=(job_id, eve_ip, eve_user, eve_pass, labs_dir, lab_name, rel_path, action_cmd),
        daemon=True,
    )
    th.start()
    return jsonify(success=True, job_id=job_id), 200


@container_labs_bp.route("/deploy_async", methods=["POST"])
def deploy_async():
    reconfigure = str(request.form.get("reconfigure") or "").strip().lower() in {"1", "true", "yes", "on"}
    return _start_clab_job("deploy", "deploy --reconfigure" if reconfigure else "deploy")


@container_labs_bp.route("/destroy_async", methods=["POST"])
def destroy_async():
    cleanup = str(request.form.get("cleanup") or "").strip().lower() in {"1", "true", "yes", "on"}
    return _start_clab_job("destroy", "destroy --cleanup" if cleanup else "destroy")


@container_labs_bp.route("/job", methods=["GET"])
def clab_job():
    job_id = (request.args.get("job_id") or "").strip()
    with _CLAB_JOBS_LOCK:
        j = _CLAB_JOBS.get(job_id)
        if not j:
            return jsonify(success=False, status="unknown", log="", done=True), 404
        return jsonify(success=True, status=j["status"], log="\n".join(j["lines"]), rc=j["rc"], done=j["status"] != "running"), 200


# ---------------------------------------------------------------------------
# P6 (#73): operações em massa (deploy/destroy/save) sobre vários labs.
# ---------------------------------------------------------------------------

def _run_bulk_job(job_id, eve_ip, eve_user, eve_pass, labs_dir, labs, action):
    quoted = " ".join(shlex.quote(l) for l in labs)
    script = (
        "if ! command -v containerlab >/dev/null 2>&1; then echo 'containerlab não encontrado'; exit 46; fi; "
        f"base={shlex.quote(labs_dir)}; rc_all=0; "
        f"for lab in {quoted}; do "
        "  echo \"=== $lab ===\"; "
        "  f=$(find \"$base/$lab\" -maxdepth 2 -type f -name '*clab*.yml' 2>/dev/null | head -1); "
        "  if [ -z \"$f\" ]; then echo \"  (sem .clab.yml, pulando)\"; continue; fi; "
        f"  containerlab {action} -t \"$f\" 2>&1 || rc_all=$?; "
        "done; exit $rc_all"
    )
    _job_append(job_id, f"$ bulk {action}: " + ", ".join(labs))
    try:
        rc = run_ssh_stream(eve_ip, eve_user, eve_pass, script, lambda ln: _job_append(job_id, ln), timeout=3600)
    except Exception as exc:  # pragma: no cover
        _job_append(job_id, f"erro: {exc}")
        rc = 1
    _job_finish(job_id, rc)


@container_labs_bp.route("/bulk", methods=["POST"])
def bulk_action():
    """Executa deploy/destroy/save em vários labs (job assíncrono, log ao vivo)."""
    lang = get_request_lang()
    eve_ip, eve_user, eve_pass = _tool_creds()
    labs_dir = (request.form.get("labs_dir") or "/opt/containerlab/labs").strip() or "/opt/containerlab/labs"
    action = (request.form.get("action") or "").strip()
    raw_labs = (request.form.get("labs") or "").strip()
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    labs = [x.strip() for x in raw_labs.split(",") if x.strip()]
    if not labs or any(not _is_safe_relpath(l) for l in labs):
        return jsonify(success=False, message=translate("container_labs.invalid_path", lang)), 400
    act_map = {"deploy": "deploy", "deploy-reconfigure": "deploy --reconfigure",
               "destroy": "destroy", "destroy-cleanup": "destroy --cleanup", "save": "save"}
    if action not in act_map:
        return jsonify(success=False, message=translate("container_labs.tool_bad_input", lang)), 400
    job_id = _job_new()
    threading.Thread(
        target=_run_bulk_job,
        args=(job_id, eve_ip, eve_user, eve_pass, labs_dir, labs, act_map[action]),
        daemon=True,
    ).start()
    return jsonify(success=True, job_id=job_id), 200


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
        labels = item.get("Labels") if isinstance(item.get("Labels"), dict) else (item.get("labels") if isinstance(item.get("labels"), dict) else {})
        lab_path = item.get("labPath") or item.get("lab_path") or labels.get("clab-topo-file") or ""
        rows.append(
            {
                "name": item.get("name") or item.get("Names") or "",
                "lab": item.get("lab_name") or item.get("labName") or labels.get("containerlab") or "",
                "labPath": lab_path,
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
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=45)
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


_IFACE_RE = re.compile(r"^[A-Za-z0-9._/-]+$")


@container_labs_bp.route("/validate", methods=["POST"])
def validate_topology():
    """Validação estrutural do topo YAML (sem schema completo)."""
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
        f"target='{labs_dir}/{lab_name}/{rel_path}'; "
        "if [ ! -f \"$target\" ]; then echo '__FILE_NOT_FOUND__'; exit 44; fi; cat \"$target\""
    )
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=30)
    if "__FILE_NOT_FOUND__" in (out or "") or rc == 44:
        return jsonify(success=False, message=translate("container_labs.file_missing", lang, path=rel_path)), 404
    issues = []
    try:
        doc = yaml.safe_load(out or "") or {}
    except Exception as exc:
        return jsonify(success=True, ok=False, issues=[f"YAML inválido: {exc}"]), 200
    if not isinstance(doc, dict):
        return jsonify(success=True, ok=False, issues=["YAML raiz não é um mapa."]), 200
    if not doc.get("name"):
        issues.append("Falta 'name' no topo.")
    topo = doc.get("topology") if isinstance(doc.get("topology"), dict) else {}
    kinds = topo.get("kinds") if isinstance(topo.get("kinds"), dict) else {}
    nodes = _normalize_nodes(topo)
    if not nodes:
        issues.append("Nenhum nó em topology.nodes.")
    for name, node in nodes.items():
        node = node if isinstance(node, dict) else {}
        kind = node.get("kind")
        if not kind:
            issues.append(f"Nó '{name}' sem 'kind'.")
        kd = kinds.get(kind) if isinstance(kinds.get(kind), dict) else {}
        img = node.get("image") or kd.get("image")
        if kind and kind not in ("linux", "bridge", "ovs-bridge", "host") and not img:
            issues.append(f"Nó '{name}' (kind {kind}) sem 'image'.")
    links = topo.get("links") if isinstance(topo.get("links"), list) else []
    seen_eps = set()
    for idx, link in enumerate(links):
        eps = link.get("endpoints") if isinstance(link, dict) else None
        if not isinstance(eps, list) or len(eps) < 2:
            issues.append(f"Link #{idx + 1} sem 2 endpoints.")
            continue
        for ep in eps:
            n = str(ep).split(":")[0].strip()
            if n and n not in nodes:
                issues.append(f"Link #{idx + 1} referencia nó inexistente: '{n}'.")
            if str(ep) in seen_eps:
                issues.append(f"Endpoint duplicado: '{ep}'.")
            seen_eps.add(str(ep))
    return jsonify(success=True, ok=len(issues) == 0, issues=issues), 200


@container_labs_bp.route("/node/capture", methods=["POST"])
def node_capture():
    """Captura pacotes numa interface do nó (tcpdump dentro do container) e
    devolve um .pcap para download."""
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    container = (request.form.get("container") or "").strip()
    iface = (request.form.get("iface") or "").strip()
    try:
        count = int(request.form.get("count") or 200)
    except (TypeError, ValueError):
        count = 200
    count = max(1, min(count, 5000))
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _is_safe_container_name(container) or not iface or not _IFACE_RE.match(iface):
        return jsonify(success=False, message=translate("container_labs.invalid_iface", lang)), 400
    q = shlex.quote(container)
    qi = shlex.quote(iface)
    cmd = (
        "if command -v docker >/dev/null 2>&1; then RT=docker; "
        "elif command -v podman >/dev/null 2>&1; then RT=podman; else exit 45; fi; "
        f"$RT exec {q} timeout 60 tcpdump -i {qi} -w - -c {int(count)} 2>/dev/null"
    )
    rc, data, errtxt = run_ssh_binary(eve_ip, eve_user, eve_pass, cmd, timeout=90)
    if not data:
        return jsonify(success=False, message=translate("container_labs.capture_fail", lang)), 200
    fname = (container + "_" + iface + ".pcap").replace("/", "_")
    return Response(
        data,
        mimetype="application/vnd.tcpdump.pcap",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@container_labs_bp.route("/node/stats", methods=["POST"])
def node_stats():
    """docker/podman stats (CPU/mem) de um container (sem stream)."""
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    container = (request.form.get("container") or "").strip()
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _is_safe_container_name(container):
        return jsonify(success=False, message=translate("container_labs.invalid_container", lang)), 400
    q = shlex.quote(container)
    cmd = (
        "if command -v docker >/dev/null 2>&1; then docker stats --no-stream --format '{{.CPUPerc}};{{.MemUsage}};{{.MemPerc}}' " + q + " 2>&1; "
        "elif command -v podman >/dev/null 2>&1; then podman stats --no-stream --format '{{.CPUPerc}};{{.MemUsage}};{{.MemPerc}}' " + q + " 2>&1; "
        "else echo '__NO_RUNTIME__'; exit 45; fi"
    )
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=30)
    combined = (out or "").strip()
    if "__NO_RUNTIME__" in combined or rc == 45 or rc != 0:
        return jsonify(success=False, message=translate("container_labs.stats_fail", lang), raw=combined), 200
    line = combined.splitlines()[-1] if combined else ""
    parts = line.split(";")
    return jsonify(success=True, cpu=(parts[0] if len(parts) > 0 else ""), mem=(parts[1] if len(parts) > 1 else ""), mem_pct=(parts[2] if len(parts) > 2 else ""), raw=combined), 200


@container_labs_bp.route("/netem", methods=["POST"])
def node_netem():
    """Aplica impairments (delay/loss/rate) numa interface de um nó via
    `containerlab tools netem set`."""
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    container = (request.form.get("container") or "").strip()
    iface = (request.form.get("iface") or "").strip()
    delay = (request.form.get("delay") or "").strip()
    loss = (request.form.get("loss") or "").strip()
    rate = (request.form.get("rate") or "").strip()

    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _is_safe_container_name(container):
        return jsonify(success=False, message=translate("container_labs.invalid_container", lang)), 400
    if not iface or not _IFACE_RE.match(iface):
        return jsonify(success=False, message=translate("container_labs.invalid_iface", lang)), 400
    # valores: delay tipo '50ms', loss/rate numéricos
    if delay and not re.match(r"^[0-9]+(\.[0-9]+)?(ms|s|us)?$", delay):
        return jsonify(success=False, message=translate("container_labs.netem_bad_value", lang)), 400
    if loss and not re.match(r"^[0-9]+(\.[0-9]+)?$", loss):
        return jsonify(success=False, message=translate("container_labs.netem_bad_value", lang)), 400
    if rate and not re.match(r"^[0-9]+$", rate):
        return jsonify(success=False, message=translate("container_labs.netem_bad_value", lang)), 400

    parts = [
        "containerlab", "tools", "netem", "set",
        "-n", shlex.quote(container), "-i", shlex.quote(iface),
    ]
    if delay:
        parts += ["--delay", shlex.quote(delay)]
    if loss:
        parts += ["--loss", shlex.quote(loss)]
    if rate:
        parts += ["--rate", shlex.quote(rate)]
    cmd = (
        "if ! command -v containerlab >/dev/null 2>&1; then echo '__NO_CONTAINERLAB__'; exit 46; fi; "
        + " ".join(parts) + " 2>&1"
    )
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=60)
    combined = out or ""
    if "__NO_CONTAINERLAB__" in combined or rc == 46:
        return jsonify(success=False, message=translate("container_labs.netem_fail", lang, rc=rc), output=combined), 500
    if rc != 0:
        return jsonify(success=False, message=translate("container_labs.netem_fail", lang, rc=rc), output=combined), 500
    return jsonify(success=True, message=translate("container_labs.netem_ok", lang), output=combined), 200


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

    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, _runtime_logs_cmd(container, tail), timeout=45)
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

    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, _runtime_exec_cmd(container, command), timeout=60)
    combined = (out or "")
    if "__NO_RUNTIME__" in combined or rc == 45:
        return jsonify(success=False, message=translate("container_labs.exec_fail", lang, rc=rc), output=combined), 500

    return jsonify(success=True, output=combined, rc=rc, stderr=(err or "").strip()), 200


# ---------------------------------------------------------------------------
# P3 (#70): wrappers de `containerlab tools` — cert, veth, vxlan, sharing.
# ---------------------------------------------------------------------------

_TOOL_NAME_RE = re.compile(r"^[A-Za-z0-9_.-]+$")
_ENDPOINT_RE = re.compile(r"^[A-Za-z0-9_.:-]+$")
_HOSTS_RE = re.compile(r"^[A-Za-z0-9_.,:*-]+$")
_IPADDR_RE = re.compile(r"^[A-Za-z0-9_.:-]+$")


def _tool_creds():
    return (
        (request.form.get("eve_ip") or "").strip(),
        (request.form.get("eve_user") or "").strip(),
        (request.form.get("eve_pass") or "").strip(),
    )


def _clab_tool_run(eve_ip, eve_user, eve_pass, parts, lang, cd_dir=None, timeout=120):
    """Roda `containerlab tools ...` (após checar o binário), com cd opcional
    para o diretório do lab. Retorna a tupla (json, status)."""
    body = " ".join(parts) + " 2>&1"
    if cd_dir:
        body = f"cd {shlex.quote(cd_dir)} 2>/dev/null || {{ echo '__NO_DIR__'; exit 47; }}; " + body
    cmd = "if ! command -v containerlab >/dev/null 2>&1; then echo '__NO_CONTAINERLAB__'; exit 46; fi; " + body
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=timeout)
    combined = out or ""
    if "__NO_CONTAINERLAB__" in combined or rc == 46:
        return jsonify(success=False, message=translate("container_labs.no_clab", lang), output=combined), 500
    if "__NO_DIR__" in combined or rc == 47:
        return jsonify(success=False, message=translate("container_labs.tool_no_dir", lang), output=combined), 400
    if rc != 0:
        return jsonify(success=False, message=translate("container_labs.tool_fail", lang, rc=rc), output=combined, rc=rc), 200
    return jsonify(success=True, message=translate("container_labs.tool_ok", lang), output=combined, rc=rc), 200


def _lab_dir(labs_dir, lab_name):
    """Diretório do lab para cd (se labs_dir e lab_name válidos)."""
    labs_dir = (labs_dir or "").strip()
    lab_name = (lab_name or "").strip()
    if labs_dir and lab_name and _is_safe_relpath(lab_name) and not lab_name.startswith("/"):
        return labs_dir.rstrip("/") + "/" + lab_name
    return None


@container_labs_bp.route("/tools/cert-ca", methods=["POST"])
def tools_cert_ca():
    """`containerlab tools cert ca create` — cria a CA do lab."""
    lang = get_request_lang()
    eve_ip, eve_user, eve_pass = _tool_creds()
    name = (request.form.get("name") or "ca").strip()
    expiry = (request.form.get("expiry") or "").strip()
    cd_dir = _lab_dir(request.form.get("labs_dir"), request.form.get("lab_name"))
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _TOOL_NAME_RE.match(name) or (expiry and not re.match(r"^[0-9]+[smhd]?$|^[0-9]+(\.[0-9]+)?h$", expiry)):
        return jsonify(success=False, message=translate("container_labs.tool_bad_input", lang)), 400
    parts = ["containerlab", "tools", "cert", "ca", "create", "--name", shlex.quote(name)]
    if expiry:
        parts += ["--expiry", shlex.quote(expiry)]
    return _clab_tool_run(eve_ip, eve_user, eve_pass, parts, lang, cd_dir=cd_dir)


@container_labs_bp.route("/tools/cert-sign", methods=["POST"])
def tools_cert_sign():
    """`containerlab tools cert sign` — assina um certificado de nó com a CA."""
    lang = get_request_lang()
    eve_ip, eve_user, eve_pass = _tool_creds()
    name = (request.form.get("name") or "").strip()
    hosts = (request.form.get("hosts") or "").strip()
    ca_cert = (request.form.get("ca_cert") or "").strip()
    ca_key = (request.form.get("ca_key") or "").strip()
    cd_dir = _lab_dir(request.form.get("labs_dir"), request.form.get("lab_name"))
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _TOOL_NAME_RE.match(name) or not hosts or not _HOSTS_RE.match(hosts):
        return jsonify(success=False, message=translate("container_labs.tool_bad_input", lang)), 400
    if (ca_cert and not _is_safe_relpath(ca_cert)) or (ca_key and not _is_safe_relpath(ca_key)):
        return jsonify(success=False, message=translate("container_labs.tool_bad_input", lang)), 400
    parts = ["containerlab", "tools", "cert", "sign", "--name", shlex.quote(name), "--hosts", shlex.quote(hosts)]
    if ca_cert:
        parts += ["--ca-cert", shlex.quote(ca_cert)]
    if ca_key:
        parts += ["--ca-key", shlex.quote(ca_key)]
    return _clab_tool_run(eve_ip, eve_user, eve_pass, parts, lang, cd_dir=cd_dir)


@container_labs_bp.route("/tools/veth", methods=["POST"])
def tools_veth():
    """`containerlab tools veth create` — cria um veth entre dois endpoints."""
    lang = get_request_lang()
    eve_ip, eve_user, eve_pass = _tool_creds()
    a = (request.form.get("a") or "").strip()
    b = (request.form.get("b") or "").strip()
    mtu = (request.form.get("mtu") or "").strip()
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _ENDPOINT_RE.match(a) or not _ENDPOINT_RE.match(b) or (mtu and not mtu.isdigit()):
        return jsonify(success=False, message=translate("container_labs.tool_bad_input", lang)), 400
    parts = ["containerlab", "tools", "veth", "create", "-a", shlex.quote(a), "-b", shlex.quote(b)]
    if mtu:
        parts += ["--mtu", shlex.quote(mtu)]
    return _clab_tool_run(eve_ip, eve_user, eve_pass, parts, lang)


@container_labs_bp.route("/tools/vxlan", methods=["POST"])
def tools_vxlan():
    """`containerlab tools vxlan create|delete`."""
    lang = get_request_lang()
    eve_ip, eve_user, eve_pass = _tool_creds()
    action = (request.form.get("action") or "create").strip()
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if action == "delete":
        prefix = (request.form.get("prefix") or "vx-").strip()
        if not _TOOL_NAME_RE.match(prefix):
            return jsonify(success=False, message=translate("container_labs.tool_bad_input", lang)), 400
        parts = ["containerlab", "tools", "vxlan", "delete", "--prefix", shlex.quote(prefix)]
        return _clab_tool_run(eve_ip, eve_user, eve_pass, parts, lang)
    remote = (request.form.get("remote") or "").strip()
    vni = (request.form.get("vni") or "").strip()
    link = (request.form.get("link") or "").strip()
    port = (request.form.get("port") or "").strip()
    dev = (request.form.get("dev") or "").strip()
    if not _IPADDR_RE.match(remote) or not vni.isdigit() or not _ENDPOINT_RE.match(link):
        return jsonify(success=False, message=translate("container_labs.tool_bad_input", lang)), 400
    if (port and not port.isdigit()) or (dev and not _ENDPOINT_RE.match(dev)):
        return jsonify(success=False, message=translate("container_labs.tool_bad_input", lang)), 400
    parts = ["containerlab", "tools", "vxlan", "create", "--remote", shlex.quote(remote),
             "--id", shlex.quote(vni), "--link", shlex.quote(link)]
    if port:
        parts += ["--port", shlex.quote(port)]
    if dev:
        parts += ["--dev", shlex.quote(dev)]
    return _clab_tool_run(eve_ip, eve_user, eve_pass, parts, lang)


@container_labs_bp.route("/tools/share", methods=["POST"])
def tools_share():
    """Compartilhamento do lab: `gotty`, `sshx` e `api-server`.
    tool ∈ {gotty,sshx,api-server}; action ∈ {start/stop/list ou attach/detach/list ou start/stop/status}."""
    lang = get_request_lang()
    eve_ip, eve_user, eve_pass = _tool_creds()
    tool = (request.form.get("tool") or "").strip()
    action = (request.form.get("action") or "").strip()
    lab_name = (request.form.get("lab_name") or "").strip()
    port = (request.form.get("port") or "").strip()
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    allowed = {
        "gotty": {"start", "stop", "list"},
        "sshx": {"attach", "detach", "list", "reattach"},
        "api-server": {"start", "stop", "status"},
    }
    if tool not in allowed or action not in allowed[tool]:
        return jsonify(success=False, message=translate("container_labs.tool_bad_input", lang)), 400
    parts = ["containerlab", "tools", tool, action]
    # ações por lab precisam do nome do lab.
    needs_lab = not (tool == "api-server" or action == "list")
    if needs_lab:
        if not _is_safe_container_name(lab_name):
            return jsonify(success=False, message=translate("container_labs.tool_bad_input", lang)), 400
        parts += ["-l", shlex.quote(lab_name)]
    if tool == "gotty" and action == "start" and port:
        if not port.isdigit():
            return jsonify(success=False, message=translate("container_labs.tool_bad_input", lang)), 400
        parts += ["-p", shlex.quote(port)]
    return _clab_tool_run(eve_ip, eve_user, eve_pass, parts, lang)


# ---------------------------------------------------------------------------
# P4 (#71): graph (mermaid), generate (CLOS/grid) e inventário (ansible/nornir).
# ---------------------------------------------------------------------------

def _target_guard(labs_dir, lab_name, rel_path):
    """Prefixo shell que resolve e valida o caminho do .clab.yml ($target)."""
    return (
        f"base='{labs_dir}'; lab='{lab_name}'; file='{rel_path}'; target=\"$base/$lab/$file\"; "
        "if [ ! -f \"$target\" ]; then echo '__FILE_NOT_FOUND__'; exit 44; fi; "
        "if ! command -v containerlab >/dev/null 2>&1; then echo '__NO_CONTAINERLAB__'; exit 46; fi; "
    )


@container_labs_bp.route("/graph", methods=["POST"])
def graph_mermaid():
    """`containerlab graph --mermaid` — devolve o diagrama Mermaid (texto)."""
    lang = get_request_lang()
    eve_ip, eve_user, eve_pass = _tool_creds()
    labs_dir = (request.form.get("labs_dir") or "/opt/containerlab/labs").strip() or "/opt/containerlab/labs"
    lab_name = (request.form.get("lab_name") or "").strip()
    rel_path = (request.form.get("path") or "").strip()
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _is_safe_relpath(lab_name) or not _is_safe_relpath(rel_path):
        return jsonify(success=False, message=translate("container_labs.invalid_path", lang)), 400
    # --mermaid escreve <name>.mermaid; emitimos para stdout via diretório temporário.
    cmd = (
        _target_guard(labs_dir, lab_name, rel_path)
        + "tmpd=$(mktemp -d); containerlab graph -t \"$target\" --mermaid --output-dir \"$tmpd\" >/dev/null 2>&1; "
        "f=$(ls \"$tmpd\"/*.mermaid 2>/dev/null | head -1); "
        "if [ -n \"$f\" ]; then cat \"$f\"; else containerlab graph -t \"$target\" --mermaid 2>&1; fi; "
        "rm -rf \"$tmpd\""
    )
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=60)
    combined = (out or "")
    if "__FILE_NOT_FOUND__" in combined or rc == 44:
        return jsonify(success=False, message=translate("container_labs.file_missing", lang, path=rel_path)), 404
    if "__NO_CONTAINERLAB__" in combined or rc == 46:
        return jsonify(success=False, message=translate("container_labs.no_clab", lang), output=combined), 500
    return jsonify(success=True, mermaid=combined.strip()), 200


@container_labs_bp.route("/generate", methods=["POST"])
def generate_topology():
    """`containerlab generate` — gera uma topologia CLOS/linear a partir de
    parâmetros. Retorna o YAML; salva no diretório do lab se save=1."""
    lang = get_request_lang()
    eve_ip, eve_user, eve_pass = _tool_creds()
    name = (request.form.get("name") or "").strip()
    kind = (request.form.get("kind") or "").strip()
    image = (request.form.get("image") or "").strip()
    nodes = (request.form.get("nodes") or "").strip()  # ex: "4,2,1"
    save = (request.form.get("save") or "").strip() in ("1", "true", "yes")
    labs_dir = (request.form.get("labs_dir") or "/opt/containerlab/labs").strip() or "/opt/containerlab/labs"
    lab_name = (request.form.get("lab_name") or name).strip()
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _TOOL_NAME_RE.match(name) or not _TOOL_NAME_RE.match(kind):
        return jsonify(success=False, message=translate("container_labs.tool_bad_input", lang)), 400
    if not re.match(r"^[0-9]+(,[0-9]+)*$", nodes):
        return jsonify(success=False, message=translate("container_labs.tool_bad_input", lang)), 400
    if image and not re.match(r"^[A-Za-z0-9_./:@-]+$", image):
        return jsonify(success=False, message=translate("container_labs.tool_bad_input", lang)), 400
    parts = ["containerlab", "generate", "--name", shlex.quote(name),
             "--kind", shlex.quote(kind), "--nodes", shlex.quote(nodes)]
    if image:
        parts += ["--image", shlex.quote(kind + "=" + image)]
    guard = "if ! command -v containerlab >/dev/null 2>&1; then echo '__NO_CONTAINERLAB__'; exit 46; fi; "
    if save:
        if not _is_safe_relpath(lab_name):
            return jsonify(success=False, message=translate("container_labs.tool_bad_input", lang)), 400
        out_dir = labs_dir.rstrip("/") + "/" + lab_name
        out_file = out_dir + "/" + name + ".clab.yml"
        cmd = (guard + f"mkdir -p {shlex.quote(out_dir)}; "
               + " ".join(parts) + f" --file {shlex.quote(out_file)} 2>&1; "
               + f"echo '__FILE__'; cat {shlex.quote(out_file)} 2>/dev/null")
    else:
        cmd = guard + " ".join(parts) + " 2>&1"
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=60)
    combined = (out or "")
    if "__NO_CONTAINERLAB__" in combined or rc == 46:
        return jsonify(success=False, message=translate("container_labs.no_clab", lang), output=combined), 500
    yaml_text = combined
    if "__FILE__" in combined:
        yaml_text = combined.split("__FILE__", 1)[1].strip()
    return jsonify(success=True, yaml=yaml_text.strip(), saved=save,
                   path=(name + ".clab.yml" if save else "")), 200


@container_labs_bp.route("/inventory", methods=["POST"])
def export_inventory():
    """Lê o inventário gerado pelo containerlab no deploy (ansible/nornir)."""
    lang = get_request_lang()
    eve_ip, eve_user, eve_pass = _tool_creds()
    fmt = (request.form.get("format") or "ansible").strip()
    labs_dir = (request.form.get("labs_dir") or "/opt/containerlab/labs").strip() or "/opt/containerlab/labs"
    lab_name = (request.form.get("lab_name") or "").strip()
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _is_safe_relpath(lab_name):
        return jsonify(success=False, message=translate("container_labs.invalid_path", lang)), 400
    fname = "ansible-inventory.yml" if fmt == "ansible" else "nornir-simple-inventory.yml"
    lab_dir = labs_dir.rstrip("/") + "/" + lab_name
    # o clab cria clab-<name>/<inventário>; procuramos sob o diretório do lab.
    cmd = (
        f"d={shlex.quote(lab_dir)}; "
        f"f=$(find \"$d\" -maxdepth 3 -type f -name {shlex.quote(fname)} 2>/dev/null | head -1); "
        "if [ -z \"$f\" ]; then echo '__NO_INV__'; exit 48; fi; cat \"$f\""
    )
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=45)
    combined = (out or "")
    if "__NO_INV__" in combined or rc == 48:
        return jsonify(success=False, message=translate("container_labs.inv_missing", lang)), 404
    return jsonify(success=True, inventory=combined, format=fmt), 200


# ---------------------------------------------------------------------------
# P5 (#72): versão do containerlab + upgrade; inspect de runtime por nó.
# ---------------------------------------------------------------------------

@container_labs_bp.route("/version", methods=["POST"])
def clab_version():
    """`containerlab version` (e `version upgrade` se action=upgrade)."""
    lang = get_request_lang()
    eve_ip, eve_user, eve_pass = _tool_creds()
    action = (request.form.get("action") or "show").strip()
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    guard = "if ! command -v containerlab >/dev/null 2>&1; then echo '__NO_CONTAINERLAB__'; exit 46; fi; "
    sub = "version upgrade" if action == "upgrade" else "version"
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, guard + "containerlab " + sub + " 2>&1", timeout=300)
    combined = (out or "")
    if "__NO_CONTAINERLAB__" in combined or rc == 46:
        return jsonify(success=False, message=translate("container_labs.no_clab", lang), output=combined), 500
    return jsonify(success=(rc == 0), output=combined.strip(), rc=rc), 200


@container_labs_bp.route("/node/inspect", methods=["POST"])
def node_inspect():
    """`docker/podman inspect <container>` — detalhes de runtime de um nó."""
    lang = get_request_lang()
    eve_ip = (request.form.get("eve_ip") or "").strip()
    eve_user = (request.form.get("eve_user") or "").strip()
    eve_pass = (request.form.get("eve_pass") or "").strip()
    container = (request.form.get("container") or "").strip()
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("container_labs.missing_creds", lang)), 400
    if not _is_safe_container_name(container):
        return jsonify(success=False, message=translate("container_labs.invalid_container", lang)), 400
    q = shlex.quote(container)
    cmd = (
        "if command -v docker >/dev/null 2>&1; then docker inspect " + q + " 2>&1; "
        "elif command -v podman >/dev/null 2>&1; then podman inspect " + q + " 2>&1; "
        "else echo '__NO_RUNTIME__'; exit 45; fi"
    )
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=45)
    combined = (out or "")
    if "__NO_RUNTIME__" in combined or rc == 45:
        return jsonify(success=False, message=translate("container_labs.logs_fail", lang, rc=rc), output=combined), 500
    return jsonify(success=(rc == 0), output=combined.strip(), rc=rc), 200
