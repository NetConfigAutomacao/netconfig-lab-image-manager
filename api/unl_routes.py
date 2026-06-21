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

import xml.etree.ElementTree as ET

from flask import Blueprint, jsonify, request

from i18n import get_request_lang, translate
from utils import run_ssh_command

unl_bp = Blueprint("unl_bp", __name__, url_prefix="/unl")

UNL_BASE = "/opt/unetlab/labs"


def _is_safe_unl_path(rel: str) -> bool:
    cleaned = (rel or "").strip()
    if not cleaned or cleaned.startswith("/"):
        return False
    if ".." in cleaned.split("/"):
        return False
    if not cleaned.lower().endswith(".unl"):
        return False
    return True


def _creds():
    return (
        (request.form.get("eve_ip") or "").strip(),
        (request.form.get("eve_user") or "").strip(),
        (request.form.get("eve_pass") or "").strip(),
    )


@unl_bp.route("/labs", methods=["POST"])
def unl_labs():
    """Lista os labs UNL (.unl) sob /opt/unetlab/labs (descoberta via UNL)."""
    lang = get_request_lang()
    eve_ip, eve_user, eve_pass = _creds()
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("unl.missing_creds", lang)), 400
    base = (request.form.get("base_dir") or UNL_BASE).strip() or UNL_BASE
    cmd = (
        f"base='{base}'; if [ ! -d \"$base\" ]; then echo '__NO_BASE__'; exit 44; fi; "
        "find \"$base\" -maxdepth 6 -type f -name '*.unl' 2>/dev/null | sed \"s#^$base/##\""
    )
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=45)
    if "__NO_BASE__" in (out or "") or rc == 44:
        return jsonify(success=False, missing_dir=True, message=translate("unl.no_base", lang), labs=[]), 200
    labs = []
    for line in (out or "").splitlines():
        rel = line.strip()
        if rel:
            labs.append({"path": rel, "name": rel.rsplit("/", 1)[-1][:-4]})
    return jsonify(success=True, labs=labs, base_dir=base), 200


def _unl_to_elements(xml_text: str) -> list:
    """Converte um .unl (XML EVE-NG/UNetLab) em elementos cytoscape."""
    elements = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return elements

    topo = root.find("topology")
    if topo is None:
        topo = root

    def pos(el):
        try:
            return {"x": float(el.get("left") or 0), "y": float(el.get("top") or 0)}
        except (TypeError, ValueError):
            return {"x": 0, "y": 0}

    # Nós
    nodes_el = topo.find("nodes")
    node_ifaces = {}
    if nodes_el is not None:
        for node in nodes_el.findall("node"):
            nid = node.get("id") or ""
            name = node.get("name") or ("node" + nid)
            kind = node.get("template") or node.get("type") or ""
            image = node.get("image") or ""
            p = pos(node)
            elements.append({
                "group": "nodes",
                "data": {
                    "id": "node-" + nid, "name": name, "topoViewerRole": "router",
                    "extraData": {
                        "kind": kind, "image": image, "type": node.get("type") or "",
                        "labels": {"graph-posX": str(int(p["x"])), "graph-posY": str(int(p["y"]))},
                    },
                },
                "position": p,
            })
            ifaces = []
            for itf in node.findall("interface"):
                ifaces.append({
                    "id": itf.get("id") or "", "name": itf.get("name") or "",
                    "network_id": itf.get("network_id") or "",
                })
            node_ifaces["node-" + nid] = (name, ifaces)

    # Redes (bridges/clouds)
    nets_el = topo.find("networks")
    net_names = {}
    if nets_el is not None:
        for net in nets_el.findall("network"):
            nid = net.get("id") or ""
            name = net.get("name") or ("net" + nid)
            p = pos(net)
            net_names["net-" + nid] = name
            elements.append({
                "group": "nodes",
                "data": {
                    "id": "net-" + nid, "name": name, "topoViewerRole": "bridge",
                    "extraData": {"kind": "bridge", "image": "", "type": net.get("type") or "",
                                  "labels": {"graph-posX": str(int(p["x"])), "graph-posY": str(int(p["y"]))}},
                },
                "position": p,
            })

    # Arestas: interface do nó -> rede
    idx = 0
    for node_id, (nname, ifaces) in node_ifaces.items():
        for itf in ifaces:
            net = itf.get("network_id")
            if not net:
                continue
            net_id = "net-" + net
            idx += 1
            elements.append({
                "group": "edges",
                "data": {
                    "id": "edge-" + str(idx),
                    "source": nname,
                    "target": net_names.get(net_id, net_id),
                    "sourceEndpoint": itf.get("name") or "",
                    "targetEndpoint": "",
                    "endpoints": [nname + ":" + (itf.get("name") or ""), net_names.get(net_id, net_id)],
                },
            })
    return elements


@unl_bp.route("/topology", methods=["POST"])
def unl_topology():
    """Lê um .unl e devolve a topologia como elementos cytoscape (read-only)."""
    lang = get_request_lang()
    eve_ip, eve_user, eve_pass = _creds()
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("unl.missing_creds", lang)), 400
    base = (request.form.get("base_dir") or UNL_BASE).strip() or UNL_BASE
    rel = (request.form.get("path") or "").strip()
    if not _is_safe_unl_path(rel):
        return jsonify(success=False, message=translate("unl.invalid_path", lang)), 400
    cmd = (
        f"target='{base}/{rel}'; if [ ! -f \"$target\" ]; then echo '__NOT_FOUND__'; exit 44; fi; cat \"$target\""
    )
    rc, out, err = run_ssh_command(eve_ip, eve_user, eve_pass, cmd, timeout=45)
    if "__NOT_FOUND__" in (out or "") or rc == 44:
        return jsonify(success=False, message=translate("unl.not_found", lang, path=rel)), 404
    elements = _unl_to_elements(out or "")
    return jsonify(success=True, elements=elements), 200
