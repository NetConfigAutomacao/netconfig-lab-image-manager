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

import requests
from flask import Blueprint, jsonify, request

from i18n import get_request_lang, translate
from utils import run_ssh_command

try:
    requests.packages.urllib3.disable_warnings()  # type: ignore
except Exception:
    pass

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


def _unl_login(ip, user, pwd, timeout=8):
    """Loga na API REST do UNetLab/EVE-NG. Tenta http e https.
    Retorna (session, base_url) ou (None, None)."""
    payload = {"username": user, "password": pwd, "html5": "-1"}
    for scheme in ("http", "https"):
        base = f"{scheme}://{ip}"
        s = requests.Session()
        try:
            r = s.post(base + "/api/auth/login", json=payload, timeout=timeout, verify=False)
            data = {}
            try:
                data = r.json() or {}
            except ValueError:
                data = {}
            if r.ok and (data.get("status") == "success" or "unetlab_session" in s.cookies.get_dict()):
                return s, base
        except requests.RequestException:
            continue
    return None, None


@unl_bp.route("/running", methods=["POST"])
def unl_running():
    """Testa a API REST do UNetLab: loga e busca o status dos nós de um lab.
    Retorna logged_in + nodes [{id,name,status,running}] + raw p/ diagnóstico."""
    lang = get_request_lang()
    eve_ip, eve_user, eve_pass = _creds()
    rel = (request.form.get("path") or "").strip()
    if not (eve_ip and eve_user and eve_pass):
        return jsonify(success=False, message=translate("unl.missing_creds", lang)), 400

    sess, base = _unl_login(eve_ip, eve_user, eve_pass)
    if not sess:
        return jsonify(success=False, logged_in=False, message=translate("unl.api_login_fail", lang)), 200

    # caminho do lab para a API: /api/labs/<rel>/nodes
    lab_api = "/api/labs/" + "/".join([p for p in rel.split("/") if p])
    try:
        r = sess.get(base + lab_api + "/nodes", timeout=8, verify=False)
        raw = r.text[:4000]
        data = {}
        try:
            data = r.json() or {}
        except ValueError:
            data = {}
    except requests.RequestException as exc:
        return jsonify(success=False, logged_in=True, message=translate("unl.api_nodes_fail", lang, error=str(exc)), base=base), 200

    nodes = []
    node_map = data.get("data") if isinstance(data.get("data"), dict) else {}
    for nid, n in node_map.items():
        n = n if isinstance(n, dict) else {}
        status = n.get("status")
        # EVE/UNL: status 2 = running (ligado); 0 = parado.
        running = str(status) in ("2", "3") or str(status).lower() == "running"
        nodes.append({"id": nid, "name": n.get("name") or ("node" + str(nid)), "status": status, "running": running})

    return jsonify(success=True, logged_in=True, base=base, nodes=nodes, running_count=sum(1 for x in nodes if x["running"]), total=len(nodes), raw=raw), 200


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

    # Nós (equipamentos)
    nodes_el = topo.find("nodes")
    node_elems = {}   # network_id ausente aqui; só metadados
    net_conns = {}    # net_id -> [(node_name, iface_name)]
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
            for itf in node.findall("interface"):
                net = itf.get("network_id") or ""
                if not net:
                    continue
                net_conns.setdefault(net, []).append((name, itf.get("name") or ""))

    # Redes: ponto-a-ponto (2 pontas) viram enlace direto; bridges/clouds
    # de verdade (3+ pontas, ou 0/1) ficam como nó.
    nets_el = topo.find("networks")
    nets = {}
    if nets_el is not None:
        for net in nets_el.findall("network"):
            nets[net.get("id") or ""] = net

    idx = 0
    for net_id, conns in net_conns.items():
        if len(conns) == 2:
            # enlace direto equipamento <-> equipamento (some com a "iface")
            (na, ia), (nb, ib) = conns[0], conns[1]
            idx += 1
            elements.append({
                "group": "edges",
                "data": {
                    "id": "edge-" + str(idx), "source": na, "target": nb,
                    "sourceEndpoint": ia, "targetEndpoint": ib,
                    "endpoints": [na + ":" + ia, nb + ":" + ib],
                },
            })
            continue
        # rede real (bridge/cloud): cria o nó + arestas até cada equipamento
        net = nets.get(net_id)
        nname = (net.get("name") if net is not None else None) or ("net" + net_id)
        p = pos(net) if net is not None else {"x": 0, "y": 0}
        elements.append({
            "group": "nodes",
            "data": {
                "id": "net-" + net_id, "name": nname, "topoViewerRole": "bridge",
                "extraData": {"kind": "bridge", "image": "",
                              "type": (net.get("type") if net is not None else "") or "",
                              "labels": {"graph-posX": str(int(p["x"])), "graph-posY": str(int(p["y"]))}},
            },
            "position": p,
        })
        for (nn, ii) in conns:
            idx += 1
            elements.append({
                "group": "edges",
                "data": {
                    "id": "edge-" + str(idx), "source": nn, "target": nname,
                    "sourceEndpoint": ii, "targetEndpoint": "",
                    "endpoints": [nn + ":" + ii, nname],
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
