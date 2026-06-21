/*
 * This file is part of NetConfig Lab Image Manager.
 *
 * NetConfig Lab Image Manager is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * NetConfig Lab Image Manager is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with NetConfig Lab Image Manager.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Editor de topologia nativo (SVG, sem dependência vendored): renderiza o lab
 * inline na aba Laboratórios, permite arrastar nós, adicionar/remover nós e
 * links, editar kind/image e salvar de volta para o YAML via
 * /api/container-labs/topoviewer/save (merge no backend).
 */
(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const W = 1000;
  const H = 520;

  function t(key, vars) {
    const app = window.NetConfigApp || {};
    return app.t ? app.t(key, vars) : key;
  }
  function creds() {
    const app = window.NetConfigApp || {};
    return app.getCommonCreds ? app.getCommonCreds() : { eve_ip: '', eve_user: '', eve_pass: '' };
  }
  function setLangHeader(xhr) {
    const app = window.NetConfigApp || {};
    if (app.setLanguageHeader) app.setLanguageHeader(xhr);
  }
  function toast(type, msg) {
    const app = window.NetConfigApp || {};
    if (app.showMessage) app.showMessage(type, msg);
  }

  // P1 (#68): campos extras de nó ContainerLab editáveis no painel, além dos
  // básicos (name/kind/image/type/mgmt/group/startup-config já tratados à parte).
  // type: 'scalar' (texto), 'bool' (checkbox), 'list' (1 por linha), 'kv' (CHAVE=VALOR por linha).
  const EXTRA_NODE_FIELDS = [
    { id: 'mgmt-ipv6', path: ['mgmt-ipv6'], type: 'scalar', t: 'ui.topo.fMgmt6' },
    { id: 'license', path: ['license'], type: 'scalar', t: 'ui.topo.fLicense' },
    { id: 'enforce-startup-config', path: ['enforce-startup-config'], type: 'bool', t: 'ui.topo.fEnforceStartup' },
    { id: 'image-pull-policy', path: ['image-pull-policy'], type: 'scalar', t: 'ui.topo.fPullPolicy' },
    { id: 'restart-policy', path: ['restart-policy'], type: 'scalar', t: 'ui.topo.fRestart' },
    { id: 'startup-delay', path: ['startup-delay'], type: 'scalar', t: 'ui.topo.fStartupDelay' },
    { id: 'runtime', path: ['runtime'], type: 'scalar', t: 'ui.topo.fRuntime' },
    { id: 'network-mode', path: ['network-mode'], type: 'scalar', t: 'ui.topo.fNetMode' },
    { id: 'user', path: ['user'], type: 'scalar', t: 'ui.topo.fUser' },
    { id: 'entrypoint', path: ['entrypoint'], type: 'scalar', t: 'ui.topo.fEntrypoint' },
    { id: 'cmd', path: ['cmd'], type: 'scalar', t: 'ui.topo.fCmd' },
    { id: 'memory', path: ['memory'], type: 'scalar', t: 'ui.topo.fMemory' },
    { id: 'cpu', path: ['cpu'], type: 'scalar', t: 'ui.topo.fCpu' },
    { id: 'cpu-set', path: ['cpu-set'], type: 'scalar', t: 'ui.topo.fCpuSet' },
    { id: 'shm-size', path: ['shm-size'], type: 'scalar', t: 'ui.topo.fShmSize' },
    { id: 'binds', path: ['binds'], type: 'list', t: 'ui.topo.fBinds' },
    { id: 'ports', path: ['ports'], type: 'list', t: 'ui.topo.fPorts' },
    { id: 'exec', path: ['exec'], type: 'list', t: 'ui.topo.fExecList' },
    { id: 'env-files', path: ['env-files'], type: 'list', t: 'ui.topo.fEnvFiles' },
    { id: 'cap-add', path: ['cap-add'], type: 'list', t: 'ui.topo.fCapAdd' },
    { id: 'aliases', path: ['aliases'], type: 'list', t: 'ui.topo.fAliases' },
    { id: 'dns-servers', path: ['dns', 'servers'], type: 'list', t: 'ui.topo.fDnsServers' },
    { id: 'dns-search', path: ['dns', 'search'], type: 'list', t: 'ui.topo.fDnsSearch' },
    { id: 'env', path: ['env'], type: 'kv', t: 'ui.topo.fEnv' },
    { id: 'sysctls', path: ['sysctls'], type: 'kv', t: 'ui.topo.fSysctls' },
    { id: 'cert-issue', path: ['certificate', 'issue'], type: 'bool', t: 'ui.topo.fCertIssue' },
    { id: 'cert-sans', path: ['certificate', 'sans'], type: 'list', t: 'ui.topo.fCertSans' }
  ];

  function getInPath(obj, path) {
    let cur = obj;
    for (let i = 0; i < path.length; i++) {
      if (!cur || typeof cur !== 'object') return undefined;
      cur = cur[path[i]];
    }
    return cur;
  }
  // Lê os campos extras de um objeto de nó (YAML) -> props {id:value}.
  function readExtraProps(o) {
    const props = {};
    EXTRA_NODE_FIELDS.forEach(function (f) {
      const v = getInPath(o, f.path);
      if (v === undefined || v === null) return;
      if (f.type === 'bool') props[f.id] = v === true || v === 'true';
      else if (f.type === 'list') props[f.id] = Array.isArray(v) ? v.map(String) : [String(v)];
      else if (f.type === 'kv') {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          const m = {}; Object.keys(v).forEach(function (k) { m[k] = String(v[k]); }); props[f.id] = m;
        }
      } else props[f.id] = String(v);
    });
    return props;
  }
  // Aplica props nos caminhos de um objeto JS simples (fallback js-yaml).
  function writeExtraPropsPlain(base, props) {
    EXTRA_NODE_FIELDS.forEach(function (f) {
      const v = props ? props[f.id] : undefined;
      const empty = v === undefined || v === '' ||
        (f.type === 'bool' && !v) ||
        (f.type === 'list' && (!v || !v.length)) ||
        (f.type === 'kv' && (!v || !Object.keys(v).length));
      if (empty) return;
      let cur = base;
      for (let i = 0; i < f.path.length - 1; i++) {
        if (!cur[f.path[i]] || typeof cur[f.path[i]] !== 'object') cur[f.path[i]] = {};
        cur = cur[f.path[i]];
      }
      cur[f.path[f.path.length - 1]] = v;
    });
  }
  // Aplica props num Document eemeli (preserva comentários); apaga quando vazio.
  function writeExtraPropsDoc(doc, YAML, baseArr, props) {
    EXTRA_NODE_FIELDS.forEach(function (f) {
      const full = baseArr.concat(f.path);
      const v = props ? props[f.id] : undefined;
      const empty = v === undefined || v === '' ||
        (f.type === 'bool' && !v) ||
        (f.type === 'list' && (!v || !v.length)) ||
        (f.type === 'kv' && (!v || !Object.keys(v).length));
      if (empty) { if (doc.hasIn(full)) doc.deleteIn(full); return; }
      if (f.type === 'list' || f.type === 'kv') doc.setIn(full, doc.createNode(v));
      else doc.setIn(full, v);
    });
  }

  // P2 (#69): rede de gerência (doc-level `mgmt:`).
  const MGMT_FIELDS = [
    { id: 'network', path: ['network'], type: 'scalar', t: 'ui.topo.mgmtNetwork' },
    { id: 'ipv4-subnet', path: ['ipv4-subnet'], type: 'scalar', t: 'ui.topo.mgmtV4' },
    { id: 'ipv6-subnet', path: ['ipv6-subnet'], type: 'scalar', t: 'ui.topo.mgmtV6' },
    { id: 'bridge', path: ['bridge'], type: 'scalar', t: 'ui.topo.mgmtBridge' },
    { id: 'mtu', path: ['mtu'], type: 'scalar', t: 'ui.topo.mgmtMtu' }
  ];
  // Tipos de link single-endpoint (nó <-> host/cloud).
  const SPECIAL_LINK_TYPES = ['mgmt-net', 'macvlan', 'host', 'vxlan', 'vxlan-stitch', 'dummy'];

  function readMgmt(doc) {
    const m = {};
    const src = (doc && typeof doc.mgmt === 'object' && doc.mgmt) ? doc.mgmt : {};
    MGMT_FIELDS.forEach(function (f) { if (src[f.id] !== undefined && src[f.id] !== null) m[f.id] = String(src[f.id]); });
    return m;
  }
  function kvObj(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const m = {}; Object.keys(v).forEach(function (k) { m[k] = String(v[k]); }); return m;
  }
  // Divide topology.links em arestas nó-a-nó (grafo) e links especiais.
  function parseClabLinks(topo) {
    const edges = [];   // {source,target,sourceEp,targetEp,linkType,mtu,vars,labels,extra}
    const special = []; // {type,node,iface,hostInterface,mode,remote,vni,udpPort,mtu,vars,labels}
    const rawLinks = (topo && Array.isArray(topo.links)) ? topo.links : [];
    function epParts(ep) {
      if (typeof ep === 'string') { const s = ep.split(':'); return { node: s[0], iface: s[1] || '' }; }
      if (ep && typeof ep === 'object') return { node: ep.node || '', iface: ep.interface || ep.iface || '' };
      return { node: '', iface: '' };
    }
    rawLinks.forEach(function (l) {
      if (!l || typeof l !== 'object') return;
      const type = l.type || '';
      const single = l.endpoint && !Array.isArray(l.endpoints);
      const eps = Array.isArray(l.endpoints) ? l.endpoints : [];
      if (single || (type && SPECIAL_LINK_TYPES.indexOf(type) !== -1 && eps.length < 2)) {
        const e = epParts(l.endpoint || eps[0] || {});
        special.push({
          type: type || 'host', node: e.node, iface: e.iface,
          hostInterface: l['host-interface'] || '', mode: l.mode || '',
          remote: l.remote || '', vni: (l.vni != null ? String(l.vni) : ''),
          udpPort: (l['udp-port'] != null ? String(l['udp-port']) : ''),
          mtu: (l.mtu != null ? String(l.mtu) : ''), vars: kvObj(l.vars), labels: kvObj(l.labels)
        });
      } else if (eps.length >= 2) {
        const a = epParts(eps[0]); const b = epParts(eps[1]);
        edges.push({
          source: a.node, target: b.node, sourceEp: a.iface, targetEp: b.iface,
          linkType: type || '', mtu: (l.mtu != null ? String(l.mtu) : ''),
          vars: kvObj(l.vars), labels: kvObj(l.labels), extra: null
        });
      }
    });
    return { edges: edges, special: special };
  }
  // Serializa uma aresta nó-a-nó: forma curta se sem atributos; estendida c/ atributos.
  function vethToYaml(l) {
    const sEp = l.sourceEp || 'eth1'; const tEp = l.targetEp || 'eth1';
    const hasVars = l.vars && Object.keys(l.vars).length;
    const hasLabels = l.labels && Object.keys(l.labels).length;
    const extended = (l.linkType && l.linkType !== 'veth') || l.mtu || hasVars || hasLabels;
    if (!extended) return { endpoints: [l.source + ':' + sEp, l.target + ':' + tEp] };
    const o = { type: l.linkType || 'veth', endpoints: [{ node: l.source, interface: sEp }, { node: l.target, interface: tEp }] };
    if (l.mtu) o.mtu = isNaN(Number(l.mtu)) ? l.mtu : Number(l.mtu);
    if (hasVars) o.vars = l.vars;
    if (hasLabels) o.labels = l.labels;
    return o;
  }
  function specialToYaml(s) {
    const o = { type: s.type || 'host', endpoint: { node: s.node, interface: s.iface || 'eth1' } };
    if (s.hostInterface) o['host-interface'] = s.hostInterface;
    if (s.type === 'macvlan' && s.mode) o.mode = s.mode;
    if ((s.type === 'vxlan' || s.type === 'vxlan-stitch')) {
      if (s.remote) o.remote = s.remote;
      if (s.vni) o.vni = isNaN(Number(s.vni)) ? s.vni : Number(s.vni);
      if (s.udpPort) o['udp-port'] = isNaN(Number(s.udpPort)) ? s.udpPort : Number(s.udpPort);
    }
    if (s.mtu) o.mtu = isNaN(Number(s.mtu)) ? s.mtu : Number(s.mtu);
    if (s.vars && Object.keys(s.vars).length) o.vars = s.vars;
    if (s.labels && Object.keys(s.labels).length) o.labels = s.labels;
    return o;
  }

  function postForm(url, fields) {
    return new Promise(function (resolve, reject) {
      const c = creds();
      const fd = new FormData();
      fd.append('eve_ip', c.eve_ip);
      fd.append('eve_user', c.eve_user);
      fd.append('eve_pass', c.eve_pass);
      Object.keys(fields || {}).forEach(function (k) { fd.append(k, fields[k]); });
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      setLangHeader(xhr);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        try { resolve(JSON.parse(xhr.responseText || '{}')); } catch (e) { reject(e); }
      };
      xhr.onerror = function () { reject(new Error('network')); };
      xhr.send(fd);
    });
  }

  function cytoToState(elements) {
    const nodes = [];
    const links = [];
    (elements || []).forEach(function (el) {
      const data = (el && el.data) || {};
      if (el.group === 'nodes') {
        if (data.topoViewerRole === 'group') return;
        const ed = data.extraData || {};
        const pos = el.position || {};
        const labels = ed.labels || {};
        const grp = (ed.group || labels['graph-group'] || labels['topoViewer-group'] || '').toString().trim();
        let lvlRaw = labels['graph-level'];
        if (lvlRaw === undefined) lvlRaw = labels['topoViewer-groupLevel'];
        if (lvlRaw === undefined) lvlRaw = labels['graph-groupLevel'];
        let lvl = parseInt(lvlRaw, 10);
        nodes.push({
          name: data.name || data.id,
          kind: ed.kind || '',
          image: ed.image || '',
          type: ed.type || '',
          mgmtIpv4: ed.mgmtIpv4Address || '',
          group: grp,
          startupConfig: '',
          x: typeof pos.x === 'number' && pos.x ? pos.x : 0,
          y: typeof pos.y === 'number' && pos.y ? pos.y : 0,
          level: isNaN(lvl) ? null : lvl,
          labels: labels,
          props: {}
        });
      } else if (el.group === 'edges') {
        links.push({
          source: data.source,
          target: data.target,
          sourceEp: data.sourceEndpoint || '',
          targetEp: data.targetEndpoint || '',
          extra: data.extraData || null
        });
      }
    });
    return { nodes: nodes, links: links };
  }

  function gridLayout(nodes) {
    const n = nodes.length;
    const cols = Math.max(1, Math.round(Math.sqrt(n * (W / H))));
    const rows = Math.ceil(n / cols);
    const cellW = W / cols;
    const cellH = H / rows;
    nodes.forEach(function (node, i) {
      node.x = cellW * (i % cols + 0.5);
      node.y = cellH * (Math.floor(i / cols) + 0.5);
    });
  }

  // Layout em camadas a partir de group/level do YAML. Cada tier vira uma linha
  // (ordenada por level numérico, ou pela ordem de aparição do grupo); dentro do
  // tier os nós se espalham na horizontal. Retorna false se não houver grupos.
  function layeredLayout(nodes) {
    function keyOf(nd) { return nd.level != null ? ('L' + nd.level) : (nd.group || ''); }
    if (!nodes.some(function (nd) { return nd.level != null || nd.group; })) return false;

    const tiers = {};
    const order = [];
    nodes.forEach(function (nd) {
      const k = keyOf(nd) || '__misc';
      if (!tiers[k]) { tiers[k] = []; order.push(k); }
      tiers[k].push(nd);
    });
    if (order.every(function (k) { return /^L\d+$/.test(k); })) {
      order.sort(function (a, b) { return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10); });
    }
    const rows = order.length;
    const cellH = H / rows;
    order.forEach(function (k, ri) {
      const arr = tiers[k];
      const cellW = W / arr.length;
      arr.forEach(function (nd, ci) {
        nd.x = cellW * (ci + 0.5);
        nd.y = cellH * (ri + 0.5);
      });
    });
    return true;
  }

  // Reescala/centraliza posições para caberem no canvas (UNL pode ter left/top
  // fora do viewBox).
  function fitPositions(nodes) {
    if (!nodes.length) return;
    const pad = 70;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(function (n) {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y);
    });
    // Já cabe tudo dentro do canvas? não mexe.
    if (minX >= 0 && minY >= 0 && maxX <= W && maxY <= H) return;
    const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
    const s = Math.min((W - 2 * pad) / bw, (H - 2 * pad) / bh, 1.5);
    const offX = (W - bw * s) / 2, offY = (H - bh * s) / 2;
    nodes.forEach(function (n) {
      n.x = offX + (n.x - minX) * s;
      n.y = offY + (n.y - minY) * s;
    });
  }

  // Layout force-directed (Fruchterman–Reingold simplificado) com repulsão
  // de curto alcance pra evitar sobreposição de cards.
  function forceLayout(nodes, links) {
    const n = nodes.length;
    if (!n) return;
    const pad = 60;
    const k = Math.sqrt(((W - 2 * pad) * (H - 2 * pad)) / n);
    const minDist = 132;
    const byName = {};
    nodes.forEach(function (nd, i) {
      // espalha inicial em grade pra evitar mínimos locais ruins
      const cols = Math.ceil(Math.sqrt(n));
      nd.x = pad + (i % cols + 0.5) * ((W - 2 * pad) / cols);
      nd.y = pad + (Math.floor(i / cols) + 0.5) * ((H - 2 * pad) / Math.ceil(n / cols));
      byName[nd.name] = nd;
    });
    const edges = (links || []).map(function (l) { return [byName[l.source], byName[l.target]]; })
      .filter(function (e) { return e[0] && e[1]; });
    let temp = W / 8;
    for (let it = 0; it < 300; it++) {
      const disp = nodes.map(function () { return { x: 0, y: 0 }; });
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          let d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          let rep = (k * k) / d;
          if (d < minDist) rep += (minDist - d) * 6;
          const ux = dx / d, uy = dy / d;
          disp[i].x += ux * rep; disp[i].y += uy * rep;
          disp[j].x -= ux * rep; disp[j].y -= uy * rep;
        }
      }
      edges.forEach(function (e) {
        const a = nodes.indexOf(e[0]), b = nodes.indexOf(e[1]);
        let dx = nodes[a].x - nodes[b].x, dy = nodes[a].y - nodes[b].y;
        let d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const att = (d * d) / k;
        const ux = dx / d, uy = dy / d;
        disp[a].x -= ux * att; disp[a].y -= uy * att;
        disp[b].x += ux * att; disp[b].y += uy * att;
      });
      for (let i = 0; i < n; i++) {
        let dl = Math.sqrt(disp[i].x * disp[i].x + disp[i].y * disp[i].y) || 0.01;
        nodes[i].x += (disp[i].x / dl) * Math.min(dl, temp);
        nodes[i].y += (disp[i].y / dl) * Math.min(dl, temp);
        // mantém dentro do canvas (sem reescalar depois, pra não reencostar os nós)
        nodes[i].x = Math.max(pad, Math.min(W - pad, nodes[i].x));
        nodes[i].y = Math.max(pad, Math.min(H - pad, nodes[i].y));
      }
      temp *= 0.97;
    }
  }

  function autoLayout(nodes, force, links) {
    if (!nodes.length) return;
    // Mantém posições salvas (graph-posX/Y) a menos que seja re-layout forçado.
    const hasSaved = nodes.some(function (nd) { return nd.x || nd.y; });
    if (hasSaved && !force) { fitPositions(nodes); return; }
    // Preferência: organizar por grupos do YAML; senão, grade.
    if (!layeredLayout(nodes)) gridLayout(nodes);
  }

  function stateToElements(state) {
    const elements = [];
    state.nodes.forEach(function (node) {
      elements.push({
        group: 'nodes',
        data: {
          id: node.name,
          name: node.name,
          topoViewerRole: 'router',
          extraData: { kind: node.kind || '', image: node.image || '', type: node.type || '', labels: node.labels || {} }
        },
        position: { x: Math.round(node.x), y: Math.round(node.y) }
      });
    });
    state.links.forEach(function (l) {
      const sEp = l.sourceEp || 'eth1';
      const tEp = l.targetEp || 'eth1';
      elements.push({
        group: 'edges',
        data: {
          source: l.source,
          target: l.target,
          endpoints: [l.source + ':' + sEp, l.target + ':' + tEp],
          extraData: l.extra || { endpoints: [l.source + ':' + sEp, l.target + ':' + tEp] }
        }
      });
    });
    return elements;
  }

  function TopologyEditor(target, opts) {
    this.target = target;
    this.lab = opts.lab;
    this.path = opts.path;
    this.labsDir = opts.labsDir || '';
    this.mode = opts.mode || 'clab';     // 'clab' | 'unl'
    this.readOnly = !!opts.readOnly;
    this.baseDir = opts.baseDir || '';
    this.state = { nodes: [], links: [] };
    this.selected = null;       // node name
    this.linkMode = false;
    this.linkSource = null;
    this.nodeEls = {};
    this.statusMap = {};        // nodeName -> { state, ipv4, container }
    this.specialLinks = [];     // links single-endpoint (host/macvlan/vxlan/...)
    this.mgmt = {};             // rede de gerência (doc-level)
  }

  // Modal genérico (overlay + caixa), seguindo o padrão io-overlay/io-modal.
  function buildModal(titleText) {
    const overlay = document.createElement('div');
    overlay.className = 'io-overlay';
    const modal = document.createElement('div');
    modal.className = 'io-modal'; modal.style.maxWidth = '640px';
    const head = document.createElement('div'); head.className = 'io-head';
    const h = document.createElement('div'); h.className = 'io-title'; h.textContent = titleText; head.appendChild(h);
    const x = document.createElement('button'); x.type = 'button'; x.className = 'btn-ghost'; x.style.cssText = 'padding:4px 12px'; x.textContent = '✕';
    head.appendChild(x);
    const body = document.createElement('div'); body.className = 'io-body'; body.style.cssText = 'padding:14px;overflow:auto';
    modal.appendChild(head); modal.appendChild(body); overlay.appendChild(modal);
    function close() { overlay.remove(); }
    x.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    return { box: modal, body: body, close: close };
  }

  // Rede de gerência (`mgmt:`).
  TopologyEditor.prototype.openMgmtModal = function () {
    const self = this;
    if (!self.mgmt || typeof self.mgmt !== 'object') self.mgmt = {};
    const m = buildModal(t('ui.topo.mgmtBtn'));
    MGMT_FIELDS.forEach(function (f) {
      const w = document.createElement('div'); w.className = 'field'; w.style.marginBottom = '8px';
      const lab = document.createElement('label'); lab.textContent = t(f.t); w.appendChild(lab);
      const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'mono'; inp.value = self.mgmt[f.id] || '';
      inp.addEventListener('change', function () {
        const v = inp.value.trim();
        if (v) self.mgmt[f.id] = v; else delete self.mgmt[f.id];
        self.refreshYaml();
      });
      w.appendChild(inp); m.body.appendChild(w);
    });
    const hint = document.createElement('div'); hint.className = 'hint'; hint.style.marginTop = '4px';
    hint.textContent = t('ui.topo.mgmtHint'); m.body.appendChild(hint);
  };

  // Links especiais (single-endpoint): host/macvlan/vxlan/mgmt-net/dummy.
  TopologyEditor.prototype.openHostLinksModal = function () {
    const self = this;
    if (!Array.isArray(self.specialLinks)) self.specialLinks = [];
    const m = buildModal(t('ui.topo.hostLinksBtn'));
    const list = document.createElement('div'); m.body.appendChild(list);

    function fieldRow(parent, labelKey, value, onChange, opts) {
      const w = document.createElement('div'); w.className = 'field'; w.style.marginBottom = '6px';
      const lab = document.createElement('label'); lab.textContent = t(labelKey); w.appendChild(lab);
      let inp;
      if (opts && opts.options) {
        inp = document.createElement('select'); inp.className = 'mono';
        opts.options.forEach(function (o) { const op = document.createElement('option'); op.value = o; op.textContent = o; inp.appendChild(op); });
        inp.value = value || opts.options[0];
        inp.addEventListener('change', function () { onChange(inp.value); });
      } else {
        inp = document.createElement('input'); inp.type = 'text'; inp.className = 'mono'; inp.value = value || '';
        inp.addEventListener('change', function () { onChange(inp.value.trim()); });
      }
      w.appendChild(inp); parent.appendChild(w); return inp;
    }
    function nodeOptions() { return self.state.nodes.filter(function (n) { return !n.isHost; }).map(function (n) { return n.name; }); }

    function renderList() {
      list.innerHTML = '';
      if (!self.specialLinks.length) {
        const e = document.createElement('div'); e.className = 'hint'; e.textContent = t('ui.topo.hostLinksEmpty'); list.appendChild(e);
      }
      self.specialLinks.forEach(function (s, idx) {
        const card = document.createElement('div');
        card.style.cssText = 'border:1px solid var(--border-2);border-radius:8px;padding:10px;margin-bottom:10px';
        const grid = document.createElement('div'); grid.className = 'topo-panel-grid';
        fieldRow(grid, 'ui.topo.fLinkType', s.type, function (v) { s.type = v; self.refreshYaml(); renderList(); }, { options: SPECIAL_LINK_TYPES });
        const nopts = nodeOptions();
        fieldRow(grid, 'ui.topo.hlNode', s.node, function (v) { s.node = v; self.refreshYaml(); }, nopts.length ? { options: nopts } : null);
        fieldRow(grid, 'ui.topo.hlIface', s.iface, function (v) { s.iface = v; self.refreshYaml(); });
        if (s.type !== 'dummy') fieldRow(grid, 'ui.topo.hlHostIface', s.hostInterface, function (v) { s.hostInterface = v; self.refreshYaml(); });
        if (s.type === 'macvlan') fieldRow(grid, 'ui.topo.hlMode', s.mode, function (v) { s.mode = v; self.refreshYaml(); }, { options: ['bridge', 'vepa', 'private', 'passthru'] });
        if (s.type === 'vxlan' || s.type === 'vxlan-stitch') {
          fieldRow(grid, 'ui.topo.hlRemote', s.remote, function (v) { s.remote = v; self.refreshYaml(); });
          fieldRow(grid, 'ui.topo.hlVni', s.vni, function (v) { s.vni = v; self.refreshYaml(); });
          fieldRow(grid, 'ui.topo.hlUdp', s.udpPort, function (v) { s.udpPort = v; self.refreshYaml(); });
        }
        fieldRow(grid, 'ui.topo.fMtu', s.mtu, function (v) { s.mtu = v; self.refreshYaml(); });
        card.appendChild(grid);
        const del = document.createElement('button'); del.type = 'button'; del.className = 'pill-action'; del.style.marginTop = '4px';
        del.textContent = t('ui.topo.delLink');
        del.addEventListener('click', function () { self.specialLinks.splice(idx, 1); self.refreshYaml(); renderList(); });
        card.appendChild(del); list.appendChild(card);
      });
    }
    renderList();
    const add = document.createElement('button'); add.type = 'button'; add.className = 'btn-ghost'; add.style.cssText = 'padding:5px 12px;font-size:12px';
    add.textContent = t('ui.topo.hlAdd');
    add.addEventListener('click', function () {
      const first = nodeOptions()[0] || '';
      self.specialLinks.push({ type: 'host', node: first, iface: 'eth1', hostInterface: '', mode: '', remote: '', vni: '', udpPort: '', mtu: '', vars: {}, labels: {} });
      self.refreshYaml(); renderList();
    });
    m.body.appendChild(add);
  };

  // P3 (#70): wrappers de `containerlab tools` (cert, veth, vxlan, sharing).
  TopologyEditor.prototype.openToolsModal = function () {
    const self = this;
    const m = buildModal(t('ui.topo.toolsBtn'));

    function section(titleKey) {
      const d = document.createElement('details'); d.className = 'topo-adv'; d.style.marginTop = '6px';
      const s = document.createElement('summary'); s.textContent = t(titleKey); d.appendChild(s);
      m.body.appendChild(d); return d;
    }
    function inp(parent, labelKey, ph, opts) {
      const w = document.createElement('div'); w.className = 'field'; w.style.marginBottom = '6px';
      const lab = document.createElement('label'); lab.textContent = t(labelKey); w.appendChild(lab);
      let el;
      if (opts && opts.options) {
        el = document.createElement('select'); el.className = 'mono';
        opts.options.forEach(function (o) { const op = document.createElement('option'); op.value = o; op.textContent = o; el.appendChild(op); });
      } else { el = document.createElement('input'); el.type = 'text'; el.className = 'mono'; if (ph) el.placeholder = ph; }
      w.appendChild(el); parent.appendChild(w); return el;
    }
    function runBlock(parent, url, collect) {
      const out = document.createElement('pre'); out.className = 'io-log'; out.style.cssText = 'margin-top:6px;max-height:180px;overflow:auto;font-size:11px;display:none';
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn-primary'; btn.style.cssText = 'padding:5px 14px;font-size:12px;margin-top:4px';
      btn.textContent = t('ui.topo.toolsRun');
      btn.addEventListener('click', function () {
        const fields = collect(); if (fields === false) { toast('error', t('ui.topo.toolsBadInput')); return; }
        btn.disabled = true; out.style.display = 'block'; out.textContent = t('ui.topo.toolsRunning');
        postForm(url, fields).then(function (r) {
          btn.disabled = false;
          out.textContent = (r && r.output) || (r && r.message) || '';
          if (r && r.success) toast('success', r.message || t('ui.topo.toolsOk'));
          else toast('error', (r && r.message) || t('ui.topo.toolsFail'));
        }).catch(function () { btn.disabled = false; toast('error', t('ui.topo.toolsFail')); });
      });
      parent.appendChild(btn); parent.appendChild(out);
    }
    const labFields = function () { return { labs_dir: self.labsDir || '', lab_name: self.lab || '' }; };

    // Certificados (CA + assinar)
    const ca = section('ui.topo.toolsCertCa');
    const caName = inp(ca, 'ui.topo.toolsName', 'ca'); caName.value = 'ca';
    const caExp = inp(ca, 'ui.topo.toolsExpiry', '87600h');
    runBlock(ca, '/api/container-labs/tools/cert-ca', function () {
      const f = labFields(); f.name = caName.value.trim() || 'ca'; if (caExp.value.trim()) f.expiry = caExp.value.trim(); return f;
    });
    const sign = section('ui.topo.toolsCertSign');
    const sName = inp(sign, 'ui.topo.toolsName', 'r1');
    const sHosts = inp(sign, 'ui.topo.toolsHosts', 'r1,172.20.20.2');
    const sCaCert = inp(sign, 'ui.topo.toolsCaCert', 'ca/ca.pem');
    const sCaKey = inp(sign, 'ui.topo.toolsCaKey', 'ca/ca-key.pem');
    runBlock(sign, '/api/container-labs/tools/cert-sign', function () {
      if (!sName.value.trim() || !sHosts.value.trim()) return false;
      const f = labFields(); f.name = sName.value.trim(); f.hosts = sHosts.value.trim();
      if (sCaCert.value.trim()) f.ca_cert = sCaCert.value.trim();
      if (sCaKey.value.trim()) f.ca_key = sCaKey.value.trim(); return f;
    });

    // veth
    const veth = section('ui.topo.toolsVeth');
    const va = inp(veth, 'ui.topo.toolsVethA', 'clab-lab-r1:eth5');
    const vb = inp(veth, 'ui.topo.toolsVethB', 'clab-lab-r2:eth5');
    const vmtu = inp(veth, 'ui.topo.fMtu', '1500');
    runBlock(veth, '/api/container-labs/tools/veth', function () {
      if (!va.value.trim() || !vb.value.trim()) return false;
      const f = { a: va.value.trim(), b: vb.value.trim() }; if (vmtu.value.trim()) f.mtu = vmtu.value.trim(); return f;
    });

    // vxlan
    const vx = section('ui.topo.toolsVxlan');
    const vxAct = inp(vx, 'ui.topo.toolsAction', null, { options: ['create', 'delete'] });
    const vxRemote = inp(vx, 'ui.topo.hlRemote', '10.0.0.20');
    const vxVni = inp(vx, 'ui.topo.hlVni', '100');
    const vxLink = inp(vx, 'ui.topo.toolsLink', 'eth1');
    const vxPort = inp(vx, 'ui.topo.hlUdp', '4789');
    const vxPrefix = inp(vx, 'ui.topo.toolsPrefix', 'vx-');
    runBlock(vx, '/api/container-labs/tools/vxlan', function () {
      const f = { action: vxAct.value };
      if (vxAct.value === 'delete') { f.prefix = vxPrefix.value.trim() || 'vx-'; return f; }
      if (!vxRemote.value.trim() || !vxVni.value.trim() || !vxLink.value.trim()) return false;
      f.remote = vxRemote.value.trim(); f.vni = vxVni.value.trim(); f.link = vxLink.value.trim();
      if (vxPort.value.trim()) f.port = vxPort.value.trim(); return f;
    });

    // Sharing
    const sh = section('ui.topo.toolsShare');
    const shTool = inp(sh, 'ui.topo.toolsShareTool', null, { options: ['gotty', 'sshx', 'api-server'] });
    const shAct = inp(sh, 'ui.topo.toolsAction', 'start');
    const shPort = inp(sh, 'ui.topo.toolsPort', '8080');
    runBlock(sh, '/api/container-labs/tools/share', function () {
      const f = { tool: shTool.value, action: shAct.value.trim(), lab_name: self.lab || '' };
      if (shTool.value === 'gotty' && shPort.value.trim()) f.port = shPort.value.trim();
      return f;
    });
    const hint = document.createElement('div'); hint.className = 'hint'; hint.style.marginTop = '8px';
    hint.textContent = t('ui.topo.toolsHint'); m.body.appendChild(hint);
  };

  // Templates de nó por fabricante (P4 #71).
  var VENDOR_TEMPLATES = [
    { label: 'Nokia SR Linux', kind: 'nokia_srlinux', image: 'ghcr.io/nokia/srlinux:latest' },
    { label: 'Arista cEOS', kind: 'arista_ceos', image: 'ceos:4.32.0F' },
    { label: 'Juniper cRPD', kind: 'juniper_crpd', image: 'crpd:23.4R1' },
    { label: 'Cisco IOL', kind: 'cisco_iol', image: 'vrnetlab/cisco_iol:latest' },
    { label: 'Nokia SROS (vr)', kind: 'nokia_sros', image: 'vrnetlab/nokia_sros:23.10' },
    { label: 'Juniper vMX (vr)', kind: 'juniper_vmx', image: 'vrnetlab/juniper_vmx:23.4' },
    { label: 'Arista vEOS (vr)', kind: 'arista_veos', image: 'vrnetlab/arista_veos:4.32' },
    { label: 'Cisco vSRX/csr (vr)', kind: 'cisco_csr1000v', image: 'vrnetlab/cisco_csr1000v:17.03' },
    { label: 'FRR', kind: 'linux', image: 'frrouting/frr:latest' },
    { label: 'Linux (alpine)', kind: 'linux', image: 'alpine:latest' }
  ];

  // P4 (#71): inspect --all, export Mermaid, generate, inventário, templates.
  TopologyEditor.prototype.openGenExportModal = function () {
    const self = this;
    const m = buildModal(t('ui.topo.genBtn'));
    function section(titleKey) {
      const d = document.createElement('details'); d.className = 'topo-adv'; d.style.marginTop = '6px';
      const s = document.createElement('summary'); s.textContent = t(titleKey); d.appendChild(s);
      m.body.appendChild(d); return d;
    }
    function download(name, text) {
      try {
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      } catch (e) { toast('error', t('ui.topo.genFail')); }
    }
    function outArea(parent) {
      const o = document.createElement('textarea'); o.className = 'mono'; o.rows = 8; o.readOnly = true;
      o.style.cssText = 'width:100%;display:none;margin-top:6px'; parent.appendChild(o); return o;
    }
    function btn(parent, labelKey, primary) {
      const b = document.createElement('button'); b.type = 'button';
      b.className = primary ? 'btn-primary' : 'btn-ghost'; b.style.cssText = 'padding:5px 12px;font-size:12px;margin-top:4px;margin-right:6px';
      b.textContent = t(labelKey); parent.appendChild(b); return b;
    }
    var labF = function () { return { labs_dir: self.labsDir || '', lab_name: self.lab || '', path: self.path || '' }; };

    // Inspect --all
    const insp = section('ui.topo.genInspect');
    const inspOut = outArea(insp);
    btn(insp, 'ui.topo.genRun', true).addEventListener('click', function () {
      inspOut.style.display = 'block'; inspOut.value = t('ui.topo.toolsRunning');
      postForm('/api/container-labs/inspect', {}).then(function (r) {
        if (!r || r.success === false) { inspOut.value = (r && r.message) || t('ui.topo.genFail'); return; }
        const rows = (r.containers || []).map(function (c) { return [c.name, c.kind || '', c.state || '', c.ipv4 || ''].join('\t'); });
        inspOut.value = rows.length ? ('name\tkind\tstate\tipv4\n' + rows.join('\n')) : t('ui.topo.genNone');
      }).catch(function () { inspOut.value = t('ui.topo.genFail'); });
    });

    // Mermaid
    const mer = section('ui.topo.genMermaid');
    const merOut = outArea(mer);
    const merRun = btn(mer, 'ui.topo.genRun', true);
    const merDl = btn(mer, 'ui.topo.genDownload', false);
    merRun.addEventListener('click', function () {
      merOut.style.display = 'block'; merOut.value = t('ui.topo.toolsRunning');
      postForm('/api/container-labs/graph', labF()).then(function (r) {
        merOut.value = (r && r.success) ? (r.mermaid || '') : ((r && r.message) || t('ui.topo.genFail'));
      }).catch(function () { merOut.value = t('ui.topo.genFail'); });
    });
    merDl.addEventListener('click', function () { if (merOut.value.trim()) download((self.lab || 'lab') + '.mmd', merOut.value); });

    // Generate
    const gen = section('ui.topo.genGenerate');
    function gi(labelKey, ph, val) {
      const w = document.createElement('div'); w.className = 'field'; w.style.marginBottom = '6px';
      const l = document.createElement('label'); l.textContent = t(labelKey); w.appendChild(l);
      const i = document.createElement('input'); i.type = 'text'; i.className = 'mono'; if (ph) i.placeholder = ph; if (val) i.value = val;
      w.appendChild(i); gen.appendChild(w); return i;
    }
    const gName = gi('ui.topo.toolsName', 'clos01');
    const gKind = gi('ui.topo.fKind', 'nokia_srlinux');
    const gImage = gi('ui.topo.fImage', 'ghcr.io/nokia/srlinux:latest');
    const gNodes = gi('ui.topo.genNodes', '4,2,1');
    const gSave = document.createElement('label'); gSave.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;margin:4px 0';
    const gSaveCb = document.createElement('input'); gSaveCb.type = 'checkbox'; gSaveCb.style.width = 'auto';
    gSave.appendChild(gSaveCb); gSave.appendChild(document.createTextNode(t('ui.topo.genSave'))); gen.appendChild(gSave);
    const genOut = outArea(gen);
    const genRun = btn(gen, 'ui.topo.genRun', true);
    const genDl = btn(gen, 'ui.topo.genDownload', false);
    genRun.addEventListener('click', function () {
      if (!gName.value.trim() || !gKind.value.trim() || !gNodes.value.trim()) { toast('error', t('ui.topo.toolsBadInput')); return; }
      genOut.style.display = 'block'; genOut.value = t('ui.topo.toolsRunning');
      const f = { name: gName.value.trim(), kind: gKind.value.trim(), nodes: gNodes.value.trim(), labs_dir: self.labsDir || '' };
      if (gImage.value.trim()) f.image = gImage.value.trim();
      if (gSaveCb.checked) { f.save = '1'; f.lab_name = gName.value.trim(); }
      postForm('/api/container-labs/generate', f).then(function (r) {
        genOut.value = (r && r.success) ? (r.yaml || '') : ((r && r.message) || t('ui.topo.genFail'));
        if (r && r.success && r.saved) toast('success', t('ui.topo.genSaved', { path: r.path }));
      }).catch(function () { genOut.value = t('ui.topo.genFail'); });
    });
    genDl.addEventListener('click', function () { if (genOut.value.trim()) download((gName.value.trim() || 'topology') + '.clab.yml', genOut.value); });

    // Inventory
    const inv = section('ui.topo.genInventory');
    const invFmt = document.createElement('select'); invFmt.className = 'mono'; invFmt.style.marginBottom = '6px';
    ['ansible', 'nornir'].forEach(function (k) { const o = document.createElement('option'); o.value = k; o.textContent = k; invFmt.appendChild(o); });
    inv.appendChild(invFmt);
    const invOut = outArea(inv);
    const invRun = btn(inv, 'ui.topo.genRun', true);
    const invDl = btn(inv, 'ui.topo.genDownload', false);
    invRun.addEventListener('click', function () {
      invOut.style.display = 'block'; invOut.value = t('ui.topo.toolsRunning');
      const f = labF(); f.format = invFmt.value;
      postForm('/api/container-labs/inventory', f).then(function (r) {
        invOut.value = (r && r.success) ? (r.inventory || '') : ((r && r.message) || t('ui.topo.genFail'));
      }).catch(function () { invOut.value = t('ui.topo.genFail'); });
    });
    invDl.addEventListener('click', function () { if (invOut.value.trim()) download((self.lab || 'lab') + '-' + invFmt.value + '.yml', invOut.value); });

    // Vendor templates → adiciona nó
    const tpl = section('ui.topo.genTemplates');
    const tgrid = document.createElement('div'); tgrid.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px';
    VENDOR_TEMPLATES.forEach(function (v) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn-ghost'; b.style.cssText = 'padding:4px 10px;font-size:11px';
      b.textContent = v.label;
      b.addEventListener('click', function () { self.addVendorNode(v.kind, v.image); toast('success', t('ui.topo.genAdded', { kind: v.kind })); });
      tgrid.appendChild(b);
    });
    tpl.appendChild(tgrid);
  };

  // Adiciona um nó já com kind+image (templates de fabricante).
  TopologyEditor.prototype.addVendorNode = function (kind, image) {
    const self = this;
    self.snapshot && self.snapshot();
    let i = 1; const baseName = (kind || 'node').replace(/[^A-Za-z0-9]/g, '').slice(0, 6) || 'node';
    while (self.nodeByName(baseName + i)) i++;
    const node = { name: baseName + i, kind: kind || 'linux', image: image || '', type: '', mgmtIpv4: '',
      group: '', startupConfig: '', x: W / 2 + (i * 8 % 120), y: H / 2 + (i * 12 % 80), labels: {}, props: {} };
    self.state.nodes.push(node);
    self.renderNode(node);
    self.redrawEdges();
    self.updateCounter && self.updateCounter();
    self.refreshYaml();
  };

  TopologyEditor.prototype.load = function () {
    const self = this;
    self.target.innerHTML = '<div class="loading-state"><span class="spinner"></span><span>' + t('ui.topo.loading') + '</span></div>';

    // Modo UNL (EVE-NG/PNETLab): topologia read-only a partir do .unl.
    if (self.mode === 'unl') {
      const uf = { path: self.path };
      if (self.baseDir) uf.base_dir = self.baseDir;
      postForm('/api/unl/topology', uf).then(function (resp) {
        if (!resp || resp.success === false) {
          self.target.innerHTML = '<div class="empty-state">' + ((resp && resp.message) || t('ui.topo.loadFail')) + '</div>';
          return;
        }
        self.baseYaml = '';
        self.baseDoc = {};
        self.state = cytoToState(resp.elements || []);
        forceLayout(self.state.nodes, self.state.links);
        self.render();
      }).catch(function (e) {
        try { console.error('[topology] unl load failed:', e && (e.stack || e.message || e)); } catch (_) {}
        self.target.innerHTML = '<div class="empty-state">' + t('ui.topo.loadFail') + '</div>';
      });
      return;
    }

    const fields = { lab_name: self.lab, path: self.path };
    if (self.labsDir) fields.labs_dir = self.labsDir;
    Promise.all([
      postForm('/api/container-labs/topoviewer/cyto', fields),
      postForm('/api/container-labs/file', fields).catch(function () { return null; })
    ]).then(function (res) {
      const resp = res[0];
      const fileResp = res[1];
      if (!resp || resp.success === false) {
        self.target.innerHTML = '<div class="empty-state">' + (resp && resp.message ? resp.message : t('ui.topo.loadFail')) + '</div>';
        return;
      }
      // YAML cru para preservar campos fora do grafo no save.
      self.baseYaml = (fileResp && fileResp.content) || '';
      try { self.baseDoc = (window.jsyaml ? window.jsyaml.load(self.baseYaml) : null) || {}; } catch (e) { self.baseDoc = {}; }
      if (typeof self.baseDoc !== 'object' || !self.baseDoc) self.baseDoc = {};
      self.state = cytoToState(resp.elements || []);
      self.mergePropsFromDoc();
      self.mergeLinkData();
      autoLayout(self.state.nodes);
      self.render();
    }).catch(function (e) {
      try { console.error('[topology] load failed:', e && (e.stack || e.message || e)); } catch (_) {}
      self.target.innerHTML = '<div class="empty-state">' + t('ui.topo.loadFail') + '</div>';
    });
  };

  // Enriquece o estado (vindo do endpoint cyto) com os campos extras do nó
  // lidos do YAML cru (baseDoc), que o grafo cyto não carrega. P1 (#68).
  TopologyEditor.prototype.mergePropsFromDoc = function () {
    const topo = (this.baseDoc && typeof this.baseDoc.topology === 'object') ? this.baseDoc.topology : null;
    if (!topo) return;
    let raw = topo.nodes;
    if (Array.isArray(raw)) {
      const m = {}; raw.forEach(function (it, i) { if (it && typeof it === 'object') m[it.name || ('node-' + (i + 1))] = it; }); raw = m;
    }
    if (!raw || typeof raw !== 'object') return;
    this.state.nodes.forEach(function (nd) {
      const o = raw[nd.name];
      if (!o || typeof o !== 'object') return;
      nd.props = readExtraProps(o);
      if (!nd.startupConfig && o['startup-config']) nd.startupConfig = String(o['startup-config']);
      if (!nd.mgmtIpv4 && o['mgmt-ipv4']) nd.mgmtIpv4 = String(o['mgmt-ipv4']);
    });
  };

  // Enriquece arestas com atributos (type/mtu/vars/labels) e extrai os links
  // especiais (single-endpoint) + a rede de gerência a partir do YAML cru. P2 (#69).
  TopologyEditor.prototype.mergeLinkData = function () {
    const topo = (this.baseDoc && typeof this.baseDoc.topology === 'object') ? this.baseDoc.topology : null;
    const parsed = parseClabLinks(topo || {});
    this.specialLinks = parsed.special;
    this.mgmt = readMgmt(this.baseDoc || {});
    // casa atributos de aresta por assinatura de endpoints (sem ordem).
    const sig = function (s, se, t, te) { return [s + ':' + (se || ''), t + ':' + (te || '')].sort().join('|'); };
    const byKey = {};
    parsed.edges.forEach(function (e) { byKey[sig(e.source, e.sourceEp, e.target, e.targetEp)] = e; });
    this.state.links.forEach(function (l) {
      const m = byKey[sig(l.source, l.sourceEp, l.target, l.targetEp)];
      if (m) { l.linkType = m.linkType || ''; l.mtu = m.mtu || ''; l.vars = m.vars || {}; l.labels = m.labels || {}; }
      else { l.linkType = l.linkType || ''; l.mtu = l.mtu || ''; l.vars = l.vars || {}; l.labels = l.labels || {}; }
    });
  };

  // Constrói o doc ContainerLab a partir do baseDoc (preservado) + grafo atual.
  TopologyEditor.prototype.buildDoc = function () {
    const doc = JSON.parse(JSON.stringify(this.baseDoc || {}));
    const topo = (doc.topology && typeof doc.topology === 'object') ? doc.topology : {};
    let existing = topo.nodes;
    if (Array.isArray(existing)) {
      const m = {};
      existing.forEach(function (it, i) { if (it && typeof it === 'object') m[it.name || ('node-' + (i + 1))] = it; });
      existing = m;
    }
    if (!existing || typeof existing !== 'object') existing = {};
    const nodes = {};
    this.state.nodes.forEach(function (nd) {
      const base = JSON.parse(JSON.stringify(existing[nd.name] || {}));
      if (nd.kind) base.kind = nd.kind;
      if (nd.image) base.image = nd.image;
      if (nd.type) base.type = nd.type;
      if (nd.mgmtIpv4) base['mgmt-ipv4'] = nd.mgmtIpv4;
      if (nd.group) base.group = nd.group;
      if (nd.startupConfig) base['startup-config'] = nd.startupConfig;
      writeExtraPropsPlain(base, nd.props);
      const labels = (base.labels && typeof base.labels === 'object') ? base.labels : {};
      if (nd.labels) Object.keys(nd.labels).forEach(function (k) { labels[k] = nd.labels[k]; });
      labels['graph-posX'] = String(Math.round(nd.x));
      labels['graph-posY'] = String(Math.round(nd.y));
      base.labels = labels;
      nodes[nd.name] = base;
    });
    const links = this.state.links.map(vethToYaml)
      .concat((this.specialLinks || []).map(specialToYaml));
    topo.nodes = nodes;
    topo.links = links;
    doc.topology = topo;
    const mgmt = this.mgmt || {};
    const mObj = {};
    MGMT_FIELDS.forEach(function (f) { if (mgmt[f.id]) mObj[f.id] = mgmt[f.id]; });
    if (Object.keys(mObj).length) doc.mgmt = Object.assign({}, doc.mgmt || {}, mObj);
    return doc;
  };

  // Reconstrói o grafo a partir de um doc ContainerLab (YAML aplicado).
  TopologyEditor.prototype.applyDoc = function (doc) {
    this.baseDoc = (doc && typeof doc === 'object') ? doc : {};
    const topo = (this.baseDoc.topology && typeof this.baseDoc.topology === 'object') ? this.baseDoc.topology : {};
    let rawNodes = topo.nodes;
    if (Array.isArray(rawNodes)) {
      const m = {}; rawNodes.forEach(function (it, i) { if (it && typeof it === 'object') m[it.name || ('node-' + (i + 1))] = it; }); rawNodes = m;
    }
    if (!rawNodes || typeof rawNodes !== 'object') rawNodes = {};
    const nodes = [];
    Object.keys(rawNodes).forEach(function (name) {
      const o = rawNodes[name] || {};
      const labels = (o.labels && typeof o.labels === 'object') ? o.labels : {};
      let x = parseFloat(labels['graph-posX']); let y = parseFloat(labels['graph-posY']);
      let lvl = parseInt(labels['graph-level'], 10);
      nodes.push({
        name: name, kind: o.kind || '', image: o.image || '', type: o.type || '',
        mgmtIpv4: o['mgmt-ipv4'] || '', startupConfig: o['startup-config'] || '',
        x: isNaN(x) ? 0 : x, y: isNaN(y) ? 0 : y,
        group: (o.group || labels['graph-group'] || '').toString().trim(),
        level: isNaN(lvl) ? null : lvl, labels: labels,
        props: readExtraProps(o)
      });
    });
    const parsed = parseClabLinks(topo);
    const links = parsed.edges.map(function (e) {
      return { source: e.source, target: e.target, sourceEp: e.sourceEp, targetEp: e.targetEp,
        linkType: e.linkType || '', mtu: e.mtu || '', vars: e.vars || {}, labels: e.labels || {}, extra: null };
    });
    this.specialLinks = parsed.special;
    this.mgmt = readMgmt(this.baseDoc || {});
    this.state = { nodes: nodes, links: links };
    autoLayout(this.state.nodes);
  };

  // Aplica o estado do grafo sobre o YAML original PRESERVANDO comentários,
  // ordem e estilo (via eemeli yaml Document). Retorna null se indisponível.
  TopologyEditor.prototype.buildYamlComments = function () {
    const YAML = window.YAMLLib;
    if (!YAML || typeof YAML.parseDocument !== 'function' || !this.baseYaml) return null;
    let doc;
    try { doc = YAML.parseDocument(this.baseYaml); } catch (e) { return null; }
    if (doc.errors && doc.errors.length) return null;
    // Garante que topology e topology.nodes sejam mapas YAML válidos.
    if (!YAML.isMap(doc.getIn(['topology']))) doc.setIn(['topology'], doc.createNode({}));
    if (!YAML.isMap(doc.getIn(['topology', 'nodes']))) doc.setIn(['topology', 'nodes'], doc.createNode({}));

    const stateNames = {};
    this.state.nodes.forEach(function (n) { stateNames[n.name] = true; });
    // remove nós que saíram
    const nodesNode = doc.getIn(['topology', 'nodes']);
    if (nodesNode && nodesNode.items) {
      nodesNode.items.map(function (it) { return String(it.key); }).forEach(function (k) {
        if (!stateNames[k]) doc.deleteIn(['topology', 'nodes', k]);
      });
    }
    // upsert nós preservando campos existentes
    this.state.nodes.forEach(function (n) {
      const base = ['topology', 'nodes', n.name];
      if (!YAML.isMap(doc.getIn(base))) doc.setIn(base, doc.createNode({}));
      if (n.kind) doc.setIn(base.concat('kind'), n.kind);
      if (n.image) doc.setIn(base.concat('image'), n.image);
      if (n.type) doc.setIn(base.concat('type'), n.type);
      if (n.mgmtIpv4) doc.setIn(base.concat('mgmt-ipv4'), n.mgmtIpv4);
      if (n.group) doc.setIn(base.concat('group'), n.group);
      if (n.startupConfig) doc.setIn(base.concat('startup-config'), n.startupConfig);
      writeExtraPropsDoc(doc, YAML, base, n.props);
      if (!YAML.isMap(doc.getIn(base.concat('labels')))) doc.setIn(base.concat('labels'), doc.createNode({}));
      doc.setIn(base.concat(['labels', 'graph-posX']), String(Math.round(n.x)));
      doc.setIn(base.concat(['labels', 'graph-posY']), String(Math.round(n.y)));
    });
    // links: regenerados (comentários de link não são preservados).
    // Arestas nó-a-nó + links especiais (single-endpoint) preservados.
    const links = this.state.links.map(vethToYaml)
      .concat((this.specialLinks || []).map(specialToYaml));
    doc.setIn(['topology', 'links'], doc.createNode(links));
    // rede de gerência (doc-level `mgmt:`)
    const mgmt = this.mgmt || {};
    MGMT_FIELDS.forEach(function (f) {
      const v = mgmt[f.id];
      if (v === undefined || v === '') { if (doc.hasIn(['mgmt'].concat(f.path))) doc.deleteIn(['mgmt'].concat(f.path)); }
      else doc.setIn(['mgmt'].concat(f.path), v);
    });
    try { return doc.toString(); } catch (e) { return null; }
  };

  TopologyEditor.prototype.currentYaml = function () {
    const preserved = this.buildYamlComments();
    if (preserved != null) return preserved;
    try { return window.jsyaml ? window.jsyaml.dump(this.buildDoc(), { lineWidth: -1, noRefs: true }) : ''; }
    catch (e) { return '# ' + (e.message || 'dump error'); }
  };

  TopologyEditor.prototype.refreshYaml = function () {
    if (this.yamlTa && !this.yamlDirty) this.yamlTa.value = this.currentYaml();
  };

  TopologyEditor.prototype.render = function () {
    const self = this;
    self.target.innerHTML = '';

    // Toolbar
    const bar = document.createElement('div');
    bar.className = 'topo-toolbar';
    const addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.className = 'btn-ghost'; addBtn.style.cssText = 'padding:5px 12px;font-size:12px';
    addBtn.textContent = t('ui.topo.addNode');
    addBtn.addEventListener('click', function () { self.addNode(); });
    // Paleta de kinds comuns: adiciona um nó já com o kind escolhido.
    const palette = document.createElement('select');
    palette.className = 'topo-palette mono';
    const KINDS = ['', 'nokia_srlinux', 'arista_ceos', 'linux', 'juniper_crpd', 'cisco_xrd', 'cisco_iol', 'sonic-vs', 'cisco_n9kv'];
    KINDS.forEach(function (k, i) {
      const o = document.createElement('option');
      o.value = k; o.textContent = i === 0 ? t('ui.topo.palettePlaceholder') : k;
      palette.appendChild(o);
    });
    palette.addEventListener('change', function () {
      const k = palette.value;
      palette.value = '';
      if (k) self.addNode(k);
    });

    const linkBtn = document.createElement('button');
    linkBtn.type = 'button'; linkBtn.className = 'btn-ghost'; linkBtn.style.cssText = 'padding:5px 12px;font-size:12px';
    linkBtn.textContent = t('ui.topo.linkMode');
    linkBtn.addEventListener('click', function () {
      self.linkMode = !self.linkMode; self.linkSource = null;
      linkBtn.classList.toggle('active', self.linkMode);
      linkBtn.style.background = self.linkMode ? 'var(--surface-hover)' : '';
    });
    const undoBtn = document.createElement('button');
    undoBtn.type = 'button'; undoBtn.className = 'btn-ghost'; undoBtn.style.cssText = 'padding:5px 11px;font-size:13px';
    undoBtn.title = t('ui.topo.undo'); undoBtn.textContent = '↶';
    undoBtn.addEventListener('click', function () { self.undo(); });
    const redoBtn = document.createElement('button');
    redoBtn.type = 'button'; redoBtn.className = 'btn-ghost'; redoBtn.style.cssText = 'padding:5px 11px;font-size:13px';
    redoBtn.title = t('ui.topo.redo'); redoBtn.textContent = '↷';
    redoBtn.addEventListener('click', function () { self.redo(); });
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button'; exportBtn.className = 'btn-ghost'; exportBtn.style.cssText = 'padding:5px 12px;font-size:12px';
    exportBtn.textContent = t('ui.topo.exportSvg');
    exportBtn.addEventListener('click', function () { self.exportSvg(); });

    const expandBtn = document.createElement('button');
    expandBtn.type = 'button'; expandBtn.className = 'btn-ghost'; expandBtn.style.cssText = 'padding:5px 11px;font-size:13px';
    expandBtn.title = t('ui.topo.expand'); expandBtn.textContent = '⛶';
    self.expandBtn = expandBtn;
    expandBtn.addEventListener('click', function () { self.setFullscreen(!self.isFullscreen); });

    const mgmtBtn = document.createElement('button');
    mgmtBtn.type = 'button'; mgmtBtn.className = 'btn-ghost'; mgmtBtn.style.cssText = 'padding:5px 12px;font-size:12px';
    mgmtBtn.textContent = t('ui.topo.mgmtBtn');
    mgmtBtn.addEventListener('click', function () { self.openMgmtModal(); });
    const toolsBtn = document.createElement('button');
    toolsBtn.type = 'button'; toolsBtn.className = 'btn-ghost'; toolsBtn.style.cssText = 'padding:5px 12px;font-size:12px';
    toolsBtn.textContent = t('ui.topo.toolsBtn');
    toolsBtn.addEventListener('click', function () { self.openToolsModal(); });
    const genBtn = document.createElement('button');
    genBtn.type = 'button'; genBtn.className = 'btn-ghost'; genBtn.style.cssText = 'padding:5px 12px;font-size:12px';
    genBtn.textContent = t('ui.topo.genBtn');
    genBtn.addEventListener('click', function () { self.openGenExportModal(); });
    const hostLinksBtn = document.createElement('button');
    hostLinksBtn.type = 'button'; hostLinksBtn.className = 'btn-ghost'; hostLinksBtn.style.cssText = 'padding:5px 12px;font-size:12px';
    hostLinksBtn.textContent = t('ui.topo.hostLinksBtn');
    hostLinksBtn.addEventListener('click', function () { self.openHostLinksModal(); });

    const tidyBtn = document.createElement('button');
    tidyBtn.type = 'button'; tidyBtn.className = 'btn-ghost'; tidyBtn.style.cssText = 'padding:5px 12px;font-size:12px';
    tidyBtn.textContent = t('ui.topo.tidyBtn');
    tidyBtn.addEventListener('click', function () {
      // UNL não tem grupos úteis → force-directed; clab usa grupos/grade.
      if (self.mode === 'unl') forceLayout(self.state.nodes, self.state.links);
      else autoLayout(self.state.nodes, true);
      self.state.nodes.forEach(function (node) {
        const el = self.nodeEls[node.name];
        if (el) { el.style.left = self.pctX(node.x); el.style.top = self.pctY(node.y); }
      });
      self.redrawEdges();
    });
    const counter = document.createElement('span');
    counter.className = 'topo-counter';
    counter.textContent = t('ui.topo.counter', { nodes: self.state.nodes.length, links: self.state.links.length });
    const statusBtn = document.createElement('button');
    statusBtn.type = 'button'; statusBtn.className = 'btn-ghost'; statusBtn.style.cssText = 'padding:5px 12px;font-size:12px';
    statusBtn.textContent = t('ui.topo.statusBtn');
    statusBtn.addEventListener('click', function () { self.loadStatus(statusBtn); });

    const validateBtn = document.createElement('button');
    validateBtn.type = 'button'; validateBtn.className = 'btn-ghost'; validateBtn.style.cssText = 'padding:5px 12px;font-size:12px';
    validateBtn.textContent = t('ui.topo.validateBtn');
    validateBtn.addEventListener('click', function () { self.validateRemote(validateBtn); });

    const yamlBtn = document.createElement('button');
    yamlBtn.type = 'button'; yamlBtn.className = 'btn-ghost'; yamlBtn.style.cssText = 'padding:5px 12px;font-size:12px';
    yamlBtn.textContent = t('ui.topo.yamlBtn');
    yamlBtn.addEventListener('click', function () {
      self.yamlOpen = !self.yamlOpen;
      yamlBtn.classList.toggle('active', self.yamlOpen);
      yamlBtn.style.background = self.yamlOpen ? 'var(--surface-hover)' : '';
      if (self.yamlPanel) self.yamlPanel.style.display = self.yamlOpen ? 'flex' : 'none';
      self.yamlDirty = false;
      self.refreshYaml();
    });
    const saveCfgBtn = document.createElement('button');
    saveCfgBtn.type = 'button'; saveCfgBtn.className = 'btn-ghost'; saveCfgBtn.style.cssText = 'padding:6px 12px;font-size:12px';
    saveCfgBtn.textContent = t('ui.topo.saveConfigs');
    saveCfgBtn.addEventListener('click', function () { self.saveConfigs(saveCfgBtn); });
    const backupsBtn = document.createElement('button');
    backupsBtn.type = 'button'; backupsBtn.className = 'btn-ghost'; backupsBtn.style.cssText = 'padding:6px 12px;font-size:12px';
    backupsBtn.textContent = t('ui.topo.backupsBtn');
    backupsBtn.addEventListener('click', function () { self.showBackups(); });
    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button'; restoreBtn.className = 'btn-ghost'; restoreBtn.style.cssText = 'padding:6px 12px;font-size:12px';
    restoreBtn.textContent = t('ui.topo.restoreBtn');
    restoreBtn.addEventListener('click', function () { self.restore(restoreBtn); });
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button'; saveBtn.className = 'btn-primary'; saveBtn.style.cssText = 'padding:6px 14px;font-size:12px';
    saveBtn.textContent = t('ui.topo.saveBtn');
    saveBtn.addEventListener('click', function () { self.save(saveBtn); });

    if (self.readOnly) {
      // EVE/PNETLab (UNL): só visualização.
      const ro = document.createElement('span');
      ro.className = 'topo-counter'; ro.style.color = 'var(--warn)';
      ro.textContent = t('ui.topo.readonly');
      bar.appendChild(tidyBtn);
      bar.appendChild(exportBtn);
      bar.appendChild(expandBtn);
      bar.appendChild(counter);
      const sp = document.createElement('span'); sp.style.flex = '1'; bar.appendChild(sp);
      bar.appendChild(ro);
    } else {
      bar.appendChild(addBtn);
      bar.appendChild(palette);
      bar.appendChild(linkBtn);
      bar.appendChild(undoBtn);
      bar.appendChild(redoBtn);
      bar.appendChild(mgmtBtn);
      bar.appendChild(hostLinksBtn);
      bar.appendChild(toolsBtn);
      bar.appendChild(genBtn);
      bar.appendChild(tidyBtn);
      bar.appendChild(statusBtn);
      bar.appendChild(validateBtn);
      bar.appendChild(yamlBtn);
      bar.appendChild(exportBtn);
      bar.appendChild(expandBtn);
      bar.appendChild(counter);
      const spacer = document.createElement('span'); spacer.style.flex = '1'; bar.appendChild(spacer);
      bar.appendChild(saveCfgBtn);
      bar.appendChild(backupsBtn);
      bar.appendChild(restoreBtn);
      bar.appendChild(saveBtn);
    }
    self.target.appendChild(bar);
    self.counterEl = counter;

    // Canvas
    const canvas = document.createElement('div');
    canvas.className = 'topo-canvas';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    canvas.appendChild(svg);
    self.canvas = canvas;
    self.svg = svg;
    self.nodeEls = {};

    self.state.nodes.forEach(function (node) { self.renderNode(node); });
    self.target.appendChild(canvas);
    self.redrawEdges();

    // YAML split panel (toggle) — apenas em modo editável.
    if (!self.readOnly) {
      const yamlPanel = document.createElement('div');
      yamlPanel.className = 'topo-yaml';
      yamlPanel.style.display = self.yamlOpen ? 'flex' : 'none';
      const yamlHead = document.createElement('div');
      yamlHead.className = 'topo-yaml-head';
      const yamlTitle = document.createElement('span');
      yamlTitle.textContent = t('ui.topo.yamlTitle');
      const applyBtn = document.createElement('button');
      applyBtn.type = 'button'; applyBtn.className = 'btn-ghost'; applyBtn.style.cssText = 'padding:4px 12px;font-size:12px';
      applyBtn.textContent = t('ui.topo.yamlApply');
      applyBtn.addEventListener('click', function () { self.applyYaml(); });
      yamlHead.appendChild(yamlTitle);
      yamlHead.appendChild(applyBtn);
      const yamlTa = document.createElement('textarea');
      yamlTa.className = 'topo-yaml-ta mono';
      yamlTa.spellcheck = false;
      yamlTa.addEventListener('input', function () { self.yamlDirty = true; });
      yamlPanel.appendChild(yamlHead);
      yamlPanel.appendChild(yamlTa);
      self.target.appendChild(yamlPanel);
      self.yamlPanel = yamlPanel;
      self.yamlTa = yamlTa;
      self.yamlDirty = false;
      self.refreshYaml();
    }

    // Prop panel
    const panel = document.createElement('div');
    panel.className = 'topo-panel';
    panel.id = 'topoPanel';
    self.panel = panel;
    self.target.appendChild(panel);
    self.renderPanel();
    if (self.isFullscreen) self.setFullscreen(true);
  };

  TopologyEditor.prototype.applyYaml = function () {
    const self = this;
    if (!window.jsyaml) { toast('error', 'js-yaml indisponível'); return; }
    let doc;
    try { doc = window.jsyaml.load(self.yamlTa.value); }
    catch (e) { toast('error', t('ui.topo.yamlInvalid', { err: e.message })); return; }
    if (!doc || typeof doc !== 'object') { toast('error', t('ui.topo.yamlInvalid', { err: 'empty' })); return; }
    self.snapshot();
    self.applyDoc(doc);
    self.yamlDirty = false;
    self.selected = null; self.selectedLink = null;
    self.render();
    self.yamlOpen = true;
    if (self.yamlPanel) self.yamlPanel.style.display = 'flex';
    toast('success', t('ui.topo.yamlApplied'));
  };

  TopologyEditor.prototype.pctX = function (x) { return (x / W * 100) + '%'; };
  TopologyEditor.prototype.pctY = function (y) { return (y / H * 100) + '%'; };

  TopologyEditor.prototype.renderNode = function (node) {
    const self = this;
    const card = document.createElement('div');
    card.className = 'topo-node';
    card.style.left = self.pctX(node.x);
    card.style.top = self.pctY(node.y);
    card.dataset.name = node.name;
    card.innerHTML =
      '<span class="topo-node-ico">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 12h.01M11 12h.01M15 12h.01"/></svg>' +
      '</span>' +
      '<span class="topo-node-name"></span>' +
      '<span class="topo-node-kind"></span>';
    card.querySelector('.topo-node-name').textContent = node.name;
    card.querySelector('.topo-node-kind').textContent = node.kind || '';

    // Handle de porta: arrastar daqui cria um cabo até outro nó.
    const port = document.createElement('span');
    port.className = 'topo-port';
    port.title = t('ui.topo.dragCable');
    port.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
      self.startCable(node, e);
    });
    card.appendChild(port);

    const dot = document.createElement('span');
    dot.className = 'topo-node-status';
    card.appendChild(dot);

    self.attachNodeHandlers(card, node);
    self.canvas.appendChild(card);
    self.nodeEls[node.name] = card;
    self.applyNodeStatus(node.name);
  };

  TopologyEditor.prototype.applyNodeStatus = function (name) {
    const card = this.nodeEls[name];
    if (!card) return;
    const dot = card.querySelector('.topo-node-status');
    if (!dot) return;
    const st = this.statusMap[name];
    card.classList.remove('is-running', 'is-stopped');
    if (!st) { dot.style.display = 'none'; card.title = ''; return; }
    dot.style.display = 'block';
    const running = /run/i.test(st.state || '');
    card.classList.add(running ? 'is-running' : 'is-stopped');
    card.title = (st.state || '') + (st.ipv4 ? ' · ' + st.ipv4 : '');
  };

  TopologyEditor.prototype.nodeContainer = function (name) {
    const st = this.statusMap[name];
    return st ? st.container : '';
  };

  TopologyEditor.prototype.loadStatus = function (btn) {
    const self = this;
    if (!window.NetConfigLabs || !window.NetConfigLabs.inspect) { toast('error', t('ui.topo.statusFail')); return; }
    if (btn) { btn.disabled = true; btn.classList.add('btn-disabled'); }
    window.NetConfigLabs.inspect(self.lab, self.path).then(function (resp) {
      const rows = (resp && resp.containers) || [];
      const map = {};
      self.state.nodes.forEach(function (nd) {
        // casa pelo sufixo do nome do container (clab-<lab>-<node>) ou nome exato.
        let match = null;
        rows.forEach(function (r) {
          const cn = (r.name || '').toString();
          if (cn === nd.name || cn.endsWith('-' + nd.name) || cn.indexOf('-' + nd.name + '-') !== -1) match = r;
        });
        if (match) map[nd.name] = { state: match.state, ipv4: match.ipv4, container: match.name };
      });
      self.statusMap = map;
      Object.keys(self.nodeEls).forEach(function (nm) { self.applyNodeStatus(nm); });
      self.renderPanel();
      const n = Object.keys(map).length;
      if (n) toast('success', t('ui.topo.statusOk', { n: n }));
      else toast('info', t('ui.topo.statusEmpty'));
    }).catch(function () {
      toast('error', t('ui.topo.statusFail'));
    }).finally(function () {
      if (btn) { btn.disabled = false; btn.classList.remove('btn-disabled'); }
    });
  };

  // ---- Cabo: arrastar de um nó para outro ----
  TopologyEditor.prototype.clientToCoords = function (clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(W, (clientX - rect.left) / rect.width * W)),
      y: Math.max(0, Math.min(H, (clientY - rect.top) / rect.height * H))
    };
  };

  TopologyEditor.prototype.startCable = function (node, e) {
    const self = this;
    self.cableFrom = node;
    const temp = document.createElementNS(SVG_NS, 'line');
    temp.setAttribute('x1', node.x); temp.setAttribute('y1', node.y);
    temp.setAttribute('x2', node.x); temp.setAttribute('y2', node.y);
    temp.setAttribute('stroke', 'var(--green)');
    temp.setAttribute('stroke-width', '2');
    temp.setAttribute('stroke-dasharray', '6 4');
    self.svg.appendChild(temp);
    self.cableTemp = temp;

    function move(ev) {
      const p = self.clientToCoords(ev.clientX, ev.clientY);
      temp.setAttribute('x2', p.x); temp.setAttribute('y2', p.y);
    }
    function up(ev) {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      if (self.cableTemp) { self.cableTemp.remove(); self.cableTemp = null; }
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const targetCard = el && el.closest ? el.closest('.topo-node') : null;
      const targetName = targetCard ? targetCard.dataset.name : '';
      self.cableFrom = null;
      if (targetName) self.createLink(node.name, targetName);
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };

  // Próxima interface livre num nó, reaproveitando o prefixo já usado.
  TopologyEditor.prototype.nextIface = function (nodeName) {
    const eps = [];
    this.state.links.forEach(function (l) {
      if (l.source === nodeName && l.sourceEp) eps.push(l.sourceEp);
      if (l.target === nodeName && l.targetEp) eps.push(l.targetEp);
    });
    let prefix = 'eth';
    const node = this.nodeByName(nodeName);
    if (node && node.kind && /sr|nokia|arista|ceos|crpd|vr|xrv|nxos/i.test(node.kind)) prefix = 'e1-';
    if (eps.length) {
      const m = /^([A-Za-z0-9-]*?)(\d+)$/.exec(eps[eps.length - 1]);
      if (m) prefix = m[1];
    }
    let n = eps.length + 1;
    const used = {};
    eps.forEach(function (e) { used[e] = true; });
    while (used[prefix + n]) n++;
    return prefix + n;
  };

  TopologyEditor.prototype.createLink = function (source, target) {
    if (!source || !target) return;
    if (source === target) { toast('error', t('ui.topo.noSelfLink')); return; }
    this.snapshot();
    const sEp = this.nextIface(source);
    const tEp = this.nextIface(target);
    const dup = this.state.links.some(function (l) {
      return (l.source === source && l.target === target) || (l.source === target && l.target === source);
    });
    this.state.links.push({ source: source, target: target, sourceEp: sEp, targetEp: tEp, extra: null });
    this.redrawEdges();
    this.updateCounter();
    this.selectLink(this.state.links.length - 1);
    if (dup) toast('info', t('ui.topo.dupLinkInfo', { a: source, b: target }));
  };

  TopologyEditor.prototype.attachNodeHandlers = function (card, node) {
    const self = this;
    let dragging = false, moved = false, startX = 0, startY = 0, origX = 0, origY = 0;

    card.addEventListener('pointerdown', function (e) {
      if (self.linkMode) return;
      self.snapshot();
      dragging = true; moved = false;
      startX = e.clientX; startY = e.clientY; origX = node.x; origY = node.y;
      card.setPointerCapture(e.pointerId);
      card.classList.add('dragging');
    });
    card.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      const rect = self.canvas.getBoundingClientRect();
      const dx = (e.clientX - startX) / rect.width * W;
      const dy = (e.clientY - startY) / rect.height * H;
      if (Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3) moved = true;
      node.x = Math.max(40, Math.min(W - 40, origX + dx));
      node.y = Math.max(30, Math.min(H - 30, origY + dy));
      card.style.left = self.pctX(node.x);
      card.style.top = self.pctY(node.y);
      self.redrawEdges();
    });
    card.addEventListener('pointerup', function (e) {
      dragging = false;
      card.classList.remove('dragging');
      try { card.releasePointerCapture(e.pointerId); } catch (err) {}
      if (!moved) self.onNodeClick(node);
      else self.refreshYaml();
    });
  };

  TopologyEditor.prototype.onNodeClick = function (node) {
    const self = this;
    if (self.linkMode) {
      if (!self.linkSource) {
        self.linkSource = node.name;
        self.highlight(node.name, true);
      } else if (self.linkSource === node.name) {
        self.highlight(node.name, false);
        self.linkSource = null;
      } else {
        const src = self.linkSource;
        self.highlight(src, false);
        self.linkSource = null;
        self.createLink(src, node.name);
      }
      return;
    }
    self.selected = node.name;
    self.selectedLink = null;
    self.renderPanel();
    Object.keys(self.nodeEls).forEach(function (nm) {
      self.nodeEls[nm].classList.toggle('selected', nm === node.name);
    });
  };

  TopologyEditor.prototype.highlight = function (name, on) {
    if (this.nodeEls[name]) this.nodeEls[name].classList.toggle('link-src', on);
  };

  TopologyEditor.prototype.nodeByName = function (name) {
    return this.state.nodes.filter(function (n) { return n.name === name; })[0];
  };

  TopologyEditor.prototype.redrawEdges = function () {
    const self = this;
    // remove existing lines
    Array.prototype.slice.call(self.svg.querySelectorAll('line')).forEach(function (l) { l.remove(); });
    self.state.links.forEach(function (l, idx) {
      const a = self.nodeByName(l.source);
      const b = self.nodeByName(l.target);
      if (!a || !b) return;
      const sel = self.selectedLink === idx;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
      line.setAttribute('stroke', sel ? 'var(--green)' : 'rgba(56,189,248,0.6)');
      line.setAttribute('stroke-width', sel ? '3' : '2');
      line.style.cursor = 'pointer';
      // Área de clique mais larga (transparente) por cima da linha fina.
      const hit = document.createElementNS(SVG_NS, 'line');
      hit.setAttribute('x1', a.x); hit.setAttribute('y1', a.y);
      hit.setAttribute('x2', b.x); hit.setAttribute('y2', b.y);
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', '14');
      hit.style.cursor = 'pointer';
      hit.addEventListener('click', function () { self.selectLink(idx); });
      self.svg.appendChild(line);
      self.svg.appendChild(hit);
    });
  };

  TopologyEditor.prototype.updateCounter = function () {
    if (this.counterEl) this.counterEl.textContent = t('ui.topo.counter', { nodes: this.state.nodes.length, links: this.state.links.length });
    this.refreshYaml();
  };

  TopologyEditor.prototype.addNode = function (presetKind) {
    const name = (window.prompt(t('ui.topo.nodeNamePrompt'), 'node' + (this.state.nodes.length + 1)) || '').trim();
    if (!name) return;
    if (this.nodeByName(name)) { toast('error', t('ui.topo.nodeExists', { name: name })); return; }
    this.snapshot();
    let kind = presetKind;
    if (!kind) kind = (window.prompt(t('ui.topo.nodeKindPrompt'), 'linux') || '').trim();
    const image = (window.prompt(t('ui.topo.nodeImagePrompt'), '') || '').trim();
    const node = { name: name, kind: kind, image: image, type: '', mgmtIpv4: '', group: '', startupConfig: '', x: W / 2, y: H / 2, labels: {}, props: {} };
    this.state.nodes.push(node);
    this.renderNode(node);
    this.updateCounter();
    this.onNodeClick(node);
  };

  TopologyEditor.prototype.deleteNode = function (name) {
    this.snapshot();
    this.state.nodes = this.state.nodes.filter(function (n) { return n.name !== name; });
    this.state.links = this.state.links.filter(function (l) { return l.source !== name && l.target !== name; });
    if (this.nodeEls[name]) { this.nodeEls[name].remove(); delete this.nodeEls[name]; }
    this.selected = null;
    this.redrawEdges();
    this.updateCounter();
    this.renderPanel();
  };

  TopologyEditor.prototype.selectLink = function (idx) {
    this.selectedLink = idx;
    this.selected = null;
    const self = this;
    Object.keys(self.nodeEls).forEach(function (nm) { self.nodeEls[nm].classList.remove('selected'); });
    this.redrawEdges();
    this.renderPanel();
  };

  TopologyEditor.prototype.renderLinkPanel = function () {
    const self = this;
    const panel = self.panel;
    panel.innerHTML = '';
    const l = self.state.links[self.selectedLink];
    if (!l) { self.selectedLink = null; panel.innerHTML = '<div class="hint">' + t('ui.topo.panelHint') + '</div>'; return; }

    const title = document.createElement('div');
    title.className = 'topo-panel-title';
    title.textContent = t('ui.topo.editLink', { a: l.source, b: l.target });
    panel.appendChild(title);

    function epField(labelKey, node, value, onChange) {
      const wrap = document.createElement('div');
      wrap.className = 'field'; wrap.style.marginBottom = '8px';
      const lbl = document.createElement('label');
      lbl.textContent = t(labelKey, { node: node });
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'mono'; inp.value = value || '';
      inp.addEventListener('change', function () { onChange(inp.value.trim()); self.refreshYaml(); });
      wrap.appendChild(lbl); wrap.appendChild(inp);
      return wrap;
    }

    const grid = document.createElement('div');
    grid.className = 'topo-panel-grid';
    grid.appendChild(epField('ui.topo.fEndpointA', l.source, l.sourceEp, function (v) { l.sourceEp = v; l.extra = null; }));
    grid.appendChild(epField('ui.topo.fEndpointB', l.target, l.targetEp, function (v) { l.targetEp = v; l.extra = null; }));
    panel.appendChild(grid);

    // P2 (#69): atributos da aresta (veth) — tipo/mtu/vars/labels.
    if (!l.vars || typeof l.vars !== 'object') l.vars = {};
    if (!l.labels || typeof l.labels !== 'object') l.labels = {};
    const lgrid = document.createElement('div'); lgrid.className = 'topo-panel-grid'; lgrid.style.marginTop = '6px';
    const tw = document.createElement('div'); tw.className = 'field'; tw.style.marginBottom = '8px';
    const tl = document.createElement('label'); tl.textContent = t('ui.topo.fLinkType'); tw.appendChild(tl);
    const tsel = document.createElement('select'); tsel.className = 'mono';
    ['veth'].forEach(function (k) { const o = document.createElement('option'); o.value = k; o.textContent = k; tsel.appendChild(o); });
    tsel.value = l.linkType || 'veth';
    tsel.addEventListener('change', function () { l.linkType = tsel.value; self.refreshYaml(); });
    tw.appendChild(tsel); lgrid.appendChild(tw);
    const mw = document.createElement('div'); mw.className = 'field'; mw.style.marginBottom = '8px';
    const ml = document.createElement('label'); ml.textContent = t('ui.topo.fMtu'); mw.appendChild(ml);
    const minp = document.createElement('input'); minp.type = 'text'; minp.className = 'mono'; minp.value = l.mtu || '';
    minp.addEventListener('change', function () { l.mtu = minp.value.trim(); self.refreshYaml(); });
    mw.appendChild(minp); lgrid.appendChild(mw);
    function kvBox(labelKey, obj) {
      const w = document.createElement('div'); w.className = 'field'; w.style.marginBottom = '8px';
      const lab = document.createElement('label'); lab.textContent = t(labelKey); w.appendChild(lab);
      const ta = document.createElement('textarea'); ta.className = 'mono'; ta.rows = 2; ta.placeholder = 'KEY=value';
      ta.value = Object.keys(obj).map(function (k) { return k + '=' + obj[k]; }).join('\n');
      ta.addEventListener('change', function () {
        Object.keys(obj).forEach(function (k) { delete obj[k]; });
        ta.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (ln) {
          const i = ln.indexOf('='); if (i > 0) obj[ln.slice(0, i).trim()] = ln.slice(i + 1).trim();
        });
        self.refreshYaml();
      });
      w.appendChild(ta); return w;
    }
    lgrid.appendChild(kvBox('ui.topo.fLinkVars', l.vars));
    lgrid.appendChild(kvBox('ui.topo.fLinkLabels', l.labels));
    panel.appendChild(lgrid);

    // Impairments (netem) por endpoint.
    const netem = document.createElement('div');
    netem.style.cssText = 'margin-top:6px;padding:10px;border:1px solid var(--border-2);border-radius:8px';
    const ntitle = document.createElement('div');
    ntitle.style.cssText = 'font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text-2)';
    ntitle.textContent = t('ui.topo.netemTitle');
    netem.appendChild(ntitle);
    const nrow = document.createElement('div');
    nrow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end';
    const sideSel = document.createElement('select'); sideSel.className = 'topo-palette mono';
    [['A', l.source, l.sourceEp], ['B', l.target, l.targetEp]].forEach(function (s) {
      const o = document.createElement('option'); o.value = s[0]; o.textContent = s[1] + ':' + (s[2] || '?'); nrow.dataset; sideSel.appendChild(o);
    });
    function nin(ph, w) { const i = document.createElement('input'); i.type = 'text'; i.className = 'mono'; i.placeholder = ph; i.style.cssText = 'width:' + w + ';padding:6px 8px'; return i; }
    const dIn = nin(t('ui.topo.netemDelay'), '80px');
    const lIn = nin(t('ui.topo.netemLoss'), '70px');
    const rIn = nin(t('ui.topo.netemRate'), '90px');
    const applyN = document.createElement('button'); applyN.type = 'button'; applyN.className = 'btn-ghost'; applyN.style.cssText = 'padding:6px 12px;font-size:12px';
    applyN.textContent = t('ui.topo.netemApply');
    applyN.addEventListener('click', function () {
      const side = sideSel.value === 'B' ? { node: l.target, iface: l.targetEp } : { node: l.source, iface: l.sourceEp };
      const container = self.nodeContainer(side.node);
      if (!container) { toast('error', t('ui.topo.netemNeedStatus')); return; }
      if (!side.iface) { toast('error', t('ui.topo.netemNoIface')); return; }
      const fields = { container: container, iface: side.iface, delay: dIn.value.trim(), loss: lIn.value.trim(), rate: rIn.value.trim() };
      postForm('/api/container-labs/netem', fields).then(function (r) {
        if (r && r.success) toast('success', r.message || t('ui.topo.netemOk'));
        else toast('error', (r && r.message) || t('ui.topo.netemFail'));
      }).catch(function () { toast('error', t('ui.topo.netemFail')); });
    });
    nrow.appendChild(sideSel); nrow.appendChild(dIn); nrow.appendChild(lIn); nrow.appendChild(rIn); nrow.appendChild(applyN);
    netem.appendChild(nrow);
    const nhint = document.createElement('div'); nhint.className = 'hint'; nhint.style.marginTop = '6px'; nhint.textContent = t('ui.topo.netemHint');
    netem.appendChild(nhint);
    panel.appendChild(netem);

    const del = document.createElement('button');
    del.type = 'button'; del.className = 'pill-action'; del.style.cssText = 'margin-top:4px';
    del.textContent = t('ui.topo.delLink');
    del.addEventListener('click', function () {
      self.snapshot();
      self.state.links.splice(self.selectedLink, 1);
      self.selectedLink = null;
      self.redrawEdges();
      self.updateCounter();
      self.renderPanel();
    });
    panel.appendChild(del);
  };

  TopologyEditor.prototype.renderPanel = function () {
    const self = this;
    const panel = self.panel;
    // Read-only (UNL): apenas info do nó selecionado.
    if (self.readOnly) {
      panel.innerHTML = '';
      if (!self.selected) { panel.innerHTML = '<div class="hint">' + t('ui.topo.panelHintRo') + '</div>'; return; }
      const n = self.nodeByName(self.selected);
      if (!n) return;
      const tt = document.createElement('div'); tt.className = 'topo-panel-title'; tt.textContent = n.name;
      const meta = document.createElement('div'); meta.className = 'mono'; meta.style.cssText = 'font-size:12px;color:var(--text-2)';
      meta.textContent = [n.kind, n.image].filter(Boolean).join(' · ') || '—';
      panel.appendChild(tt); panel.appendChild(meta);
      return;
    }
    if (self.selectedLink != null) { self.renderLinkPanel(); return; }
    panel.innerHTML = '';
    if (!self.selected) {
      panel.innerHTML = '<div class="hint">' + t('ui.topo.panelHint') + '</div>';
      return;
    }
    const node = self.nodeByName(self.selected);
    if (!node) { panel.innerHTML = ''; return; }

    function field(labelKey, value, onChange) {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      wrap.style.marginBottom = '8px';
      const lbl = document.createElement('label');
      lbl.textContent = t(labelKey);
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'mono'; inp.value = value || '';
      inp.addEventListener('change', function () { onChange(inp.value.trim()); self.refreshYaml(); });
      wrap.appendChild(lbl); wrap.appendChild(inp);
      return wrap;
    }

    const title = document.createElement('div');
    title.className = 'topo-panel-title';
    title.textContent = t('ui.topo.editNode', { name: node.name });
    panel.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'topo-panel-grid';
    grid.appendChild(field('ui.topo.fName', node.name, function (v) {
      if (!v || (v !== node.name && self.nodeByName(v))) { toast('error', t('ui.topo.nodeExists', { name: v })); self.renderPanel(); return; }
      const old = node.name;
      node.name = v;
      self.state.links.forEach(function (l) {
        if (l.source === old) l.source = v;
        if (l.target === old) l.target = v;
      });
      if (self.nodeEls[old]) { self.nodeEls[v] = self.nodeEls[old]; delete self.nodeEls[old]; self.nodeEls[v].dataset.name = v; self.nodeEls[v].querySelector('.topo-node-name').textContent = v; }
      self.selected = v;
      self.redrawEdges();
    }));
    grid.appendChild(field('ui.topo.fKind', node.kind, function (v) {
      node.kind = v;
      if (self.nodeEls[node.name]) self.nodeEls[node.name].querySelector('.topo-node-kind').textContent = v;
    }));
    grid.appendChild(field('ui.topo.fImage', node.image, function (v) { node.image = v; }));
    grid.appendChild(field('ui.topo.fType', node.type, function (v) { node.type = v; }));
    grid.appendChild(field('ui.topo.fMgmt', node.mgmtIpv4, function (v) { node.mgmtIpv4 = v; }));
    grid.appendChild(field('ui.topo.fGroup', node.group, function (v) {
      node.group = v;
      const lbl = (node.labels && typeof node.labels === 'object') ? node.labels : {};
      if (v) lbl['graph-group'] = v; else delete lbl['graph-group'];
      node.labels = lbl;
    }));
    grid.appendChild(field('ui.topo.fStartup', node.startupConfig, function (v) { node.startupConfig = v; }));
    panel.appendChild(grid);

    // P1 (#68): campos avançados do nó ContainerLab (colapsável).
    if (!node.props || typeof node.props !== 'object') node.props = {};
    const adv = document.createElement('details');
    adv.className = 'topo-adv';
    const sum = document.createElement('summary');
    sum.textContent = t('ui.topo.advNode');
    adv.appendChild(sum);
    const advGrid = document.createElement('div');
    advGrid.className = 'topo-panel-grid';
    advGrid.style.marginTop = '8px';

    function advField(spec) {
      const wrap = document.createElement('div'); wrap.className = 'field'; wrap.style.marginBottom = '8px';
      const lbl = document.createElement('label'); lbl.textContent = t(spec.t); wrap.appendChild(lbl);
      const cur = node.props[spec.id];
      if (spec.type === 'bool') {
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = cur === true;
        cb.style.cssText = 'width:auto;margin-left:4px';
        cb.addEventListener('change', function () { node.props[spec.id] = cb.checked; self.refreshYaml(); });
        lbl.style.cssText = 'display:flex;align-items:center;gap:6px'; lbl.appendChild(cb);
        return wrap;
      }
      if (spec.type === 'list' || spec.type === 'kv') {
        const ta = document.createElement('textarea'); ta.className = 'mono'; ta.rows = 3;
        ta.placeholder = spec.type === 'kv' ? 'KEY=value' : t('ui.topo.onePerLine');
        if (spec.type === 'kv' && cur && typeof cur === 'object') {
          ta.value = Object.keys(cur).map(function (k) { return k + '=' + cur[k]; }).join('\n');
        } else if (spec.type === 'list' && Array.isArray(cur)) {
          ta.value = cur.join('\n');
        }
        ta.addEventListener('change', function () {
          const lines = ta.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
          if (spec.type === 'kv') {
            const m = {}; lines.forEach(function (ln) { const i = ln.indexOf('='); if (i > 0) m[ln.slice(0, i).trim()] = ln.slice(i + 1).trim(); });
            node.props[spec.id] = m;
          } else { node.props[spec.id] = lines; }
          self.refreshYaml();
        });
        wrap.appendChild(ta); return wrap;
      }
      const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'mono'; inp.value = (cur != null ? cur : '');
      inp.addEventListener('change', function () { node.props[spec.id] = inp.value.trim(); self.refreshYaml(); });
      wrap.appendChild(inp); return wrap;
    }
    EXTRA_NODE_FIELDS.forEach(function (spec) { advGrid.appendChild(advField(spec)); });
    adv.appendChild(advGrid);
    panel.appendChild(adv);

    // Ações de runtime (se houver status do nó via inspect).
    const st = self.statusMap[node.name];
    if (st && st.container) {
      const acts = document.createElement('div');
      acts.style.cssText = 'display:flex;gap:8px;align-items:center;margin:8px 0';
      const info = document.createElement('span');
      info.className = 'mono'; info.style.cssText = 'font-size:11px;color:var(--text-3)';
      info.textContent = (st.state || '') + (st.ipv4 ? ' · ' + st.ipv4 : '');
      const logsB = document.createElement('button');
      logsB.type = 'button'; logsB.className = 'btn-ghost'; logsB.style.cssText = 'padding:4px 10px;font-size:11px';
      logsB.textContent = t('ui.labs.logsBtn');
      logsB.addEventListener('click', function () { if (window.NetConfigLabs) window.NetConfigLabs.viewNodeLogs(st.container); });
      const execB = document.createElement('button');
      execB.type = 'button'; execB.className = 'btn-ghost'; execB.style.cssText = 'padding:4px 10px;font-size:11px';
      execB.textContent = t('ui.labs.execBtn');
      execB.addEventListener('click', function () { if (window.NetConfigLabs) window.NetConfigLabs.execNodeCommand(st.container); });
      const statsB = document.createElement('button');
      statsB.type = 'button'; statsB.className = 'btn-ghost'; statsB.style.cssText = 'padding:4px 10px;font-size:11px';
      statsB.textContent = t('ui.topo.statsBtn');
      statsB.addEventListener('click', function () {
        statsB.disabled = true;
        postForm('/api/container-labs/node/stats', { container: st.container }).then(function (r) {
          statsB.disabled = false;
          if (r && r.success) info.textContent = 'CPU ' + (r.cpu || '?') + ' · ' + (r.mem || '?');
          else toast('error', (r && r.message) || t('ui.topo.statsFail'));
        }).catch(function () { statsB.disabled = false; toast('error', t('ui.topo.statsFail')); });
      });
      const capB = document.createElement('button');
      capB.type = 'button'; capB.className = 'btn-ghost'; capB.style.cssText = 'padding:4px 10px;font-size:11px';
      capB.textContent = t('ui.topo.captureBtn');
      capB.addEventListener('click', function () {
        const iface = (window.prompt(t('ui.topo.captureIface'), 'eth1') || '').trim();
        if (!iface) return;
        const count = (window.prompt(t('ui.topo.captureCount'), '200') || '200').trim();
        const c = creds();
        const fd = new FormData();
        fd.append('eve_ip', c.eve_ip); fd.append('eve_user', c.eve_user); fd.append('eve_pass', c.eve_pass);
        fd.append('container', st.container); fd.append('iface', iface); fd.append('count', count);
        toast('info', t('ui.topo.captureRunning'));
        fetch('/api/container-labs/node/capture', { method: 'POST', body: fd }).then(function (r) {
          const ct = r.headers.get('content-type') || '';
          if (ct.indexOf('pcap') === -1) { return r.json().then(function (j) { toast('error', (j && j.message) || t('ui.topo.captureFail')); }); }
          return r.blob().then(function (blob) {
            const url = URL.createObjectURL(blob); const a = document.createElement('a');
            a.href = url; a.download = st.container + '_' + iface + '.pcap'; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            toast('success', t('ui.topo.captureOk'));
          });
        }).catch(function () { toast('error', t('ui.topo.captureFail')); });
      });
      const termB = document.createElement('button');
      termB.type = 'button'; termB.className = 'btn-ghost'; termB.style.cssText = 'padding:4px 10px;font-size:11px';
      termB.textContent = t('ui.topo.termBtn');
      termB.addEventListener('click', function () {
        const c = creds();
        const cmd = 'ssh ' + (c.eve_user || 'root') + '@' + (c.eve_ip || '<host>') + ' -t docker exec -it ' + st.container + ' sh';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(cmd).then(function () { toast('success', t('ui.topo.termCopied')); }, function () { window.prompt(t('ui.topo.termCopy'), cmd); });
        } else { window.prompt(t('ui.topo.termCopy'), cmd); }
      });
      acts.appendChild(info); acts.appendChild(logsB); acts.appendChild(execB); acts.appendChild(statsB); acts.appendChild(capB); acts.appendChild(termB);
      panel.appendChild(acts);
    }

    const del = document.createElement('button');
    del.type = 'button'; del.className = 'pill-action'; del.style.cssText = 'margin-top:4px';
    del.textContent = t('ui.topo.delNode');
    del.addEventListener('click', function () {
      if (window.confirm(t('ui.topo.delNodeConfirm', { name: node.name }))) self.deleteNode(node.name);
    });
    panel.appendChild(del);
  };

  TopologyEditor.prototype.save = function (btn) {
    const self = this;
    if (!self.state.nodes.length) { toast('error', t('ui.topo.saveEmpty')); return; }
    // Se o YAML foi editado à mão, aplica antes de salvar.
    if (self.yamlOpen && self.yamlDirty) {
      if (!window.confirm(t('ui.topo.yamlDirtyApply'))) return;
      self.applyYaml();
    }
    const issues = self.validate();
    if (issues.length) {
      if (!window.confirm(t('ui.topo.validateFail') + '\n\n- ' + issues.join('\n- ') + '\n\n' + t('ui.topo.validateSaveAnyway'))) return;
    }
    const newYaml = self.currentYaml();
    self.showDiffAndSave(newYaml, btn);
  };

  // Diff simples por linha (marcador +/-) entre o YAML original e o novo.
  function simpleDiff(oldText, newText) {
    const oldLines = (oldText || '').split('\n');
    const newLines = (newText || '').split('\n');
    const oldSet = {}; oldLines.forEach(function (l) { oldSet[l] = (oldSet[l] || 0) + 1; });
    const newSet = {}; newLines.forEach(function (l) { newSet[l] = (newSet[l] || 0) + 1; });
    const out = [];
    newLines.forEach(function (l) { if (!oldSet[l]) out.push({ t: '+', l: l }); });
    oldLines.forEach(function (l) { if (!newSet[l]) out.push({ t: '-', l: l }); });
    return out;
  }

  TopologyEditor.prototype.showDiffAndSave = function (newYaml, btn) {
    const self = this;
    const diff = simpleDiff(self.baseYaml || '', newYaml);

    const overlay = document.createElement('div');
    overlay.className = 'io-overlay';
    const modal = document.createElement('div');
    modal.className = 'io-modal';
    const head = document.createElement('div');
    head.className = 'io-head';
    const h = document.createElement('div'); h.className = 'io-title'; h.textContent = t('ui.topo.diffTitle');
    const x = document.createElement('button'); x.type = 'button'; x.className = 'btn-ghost'; x.style.cssText = 'padding:4px 12px'; x.textContent = '✕';
    x.addEventListener('click', function () { overlay.remove(); });
    head.appendChild(h); head.appendChild(x);

    const pre = document.createElement('pre');
    pre.className = 'io-log';
    if (!diff.length) {
      pre.textContent = t('ui.topo.diffNone');
    } else {
      pre.innerHTML = diff.map(function (d) {
        const cls = d.t === '+' ? 'diff-add' : 'diff-del';
        const esc = d.l.replace(/[&<>]/g, function (c) { return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'; });
        return '<span class="' + cls + '">' + d.t + ' ' + esc + '</span>';
      }).join('\n');
    }

    const foot = document.createElement('div'); foot.className = 'io-foot';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn-ghost'; cancel.style.cssText = 'padding:6px 14px;font-size:12px'; cancel.textContent = t('ui.topo.diffCancel');
    cancel.addEventListener('click', function () { overlay.remove(); });
    const confirm = document.createElement('button'); confirm.type = 'button'; confirm.className = 'btn-primary'; confirm.style.cssText = 'padding:6px 14px;font-size:12px'; confirm.textContent = t('ui.topo.diffConfirm');
    confirm.addEventListener('click', function () {
      overlay.remove();
      self.writeYaml(newYaml, btn);
    });
    foot.appendChild(cancel); foot.appendChild(confirm);

    modal.appendChild(head); modal.appendChild(pre); modal.appendChild(foot);
    overlay.appendChild(modal);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  };

  TopologyEditor.prototype.writeYaml = function (newYaml, btn) {
    const self = this;
    if (btn) { btn.disabled = true; btn.classList.add('btn-disabled'); }
    let b64;
    try { b64 = btoa(unescape(encodeURIComponent(newYaml))); } catch (e) { b64 = btoa(newYaml); }
    const fields = { lab_name: self.lab, path: self.path, content_b64: b64 };
    if (self.labsDir) fields.labs_dir = self.labsDir;
    postForm('/api/container-labs/file/save', fields).then(function (resp) {
      if (resp && resp.success) {
        self.baseYaml = newYaml;
        try { self.baseDoc = window.jsyaml ? (window.jsyaml.load(newYaml) || {}) : self.baseDoc; } catch (e) {}
        toast('success', resp.message || t('ui.topo.saved'));
      } else {
        toast('error', (resp && resp.message) || t('ui.topo.saveFail'));
      }
    }).catch(function () {
      toast('error', t('ui.topo.saveFail'));
    }).finally(function () {
      if (btn) { btn.disabled = false; btn.classList.remove('btn-disabled'); }
    });
  };

  TopologyEditor.prototype.setFullscreen = function (on) {
    const self = this;
    const host = self.target;
    self.isFullscreen = !!on;
    host.classList.toggle('topo-fullscreen', self.isFullscreen);
    document.body.classList.toggle('topo-fullscreen-lock', self.isFullscreen);
    // Sempre remove handler/btn antigos para não duplicar em re-renders.
    if (self.escHandler) { document.removeEventListener('keydown', self.escHandler); self.escHandler = null; }
    if (self.exitBtn && self.exitBtn.parentNode) self.exitBtn.parentNode.removeChild(self.exitBtn);
    if (self.expandBtn) {
      self.expandBtn.textContent = self.isFullscreen ? '🗗' : '⛶';
      self.expandBtn.title = self.isFullscreen ? t('ui.topo.collapse') : t('ui.topo.expand');
    }

    if (self.isFullscreen) {
      // Botão flutuante de sair (visível só em tela cheia).
      if (!self.exitBtn) {
        const x = document.createElement('button');
        x.type = 'button'; x.className = 'topo-exit-fs';
        x.title = t('ui.topo.collapse');
        x.textContent = '✕';
        x.addEventListener('click', function () { self.setFullscreen(false); });
        self.exitBtn = x;
      }
      host.appendChild(self.exitBtn);
      // Esc cancela a expansão.
      self.escHandler = function (ev) { if (ev.key === 'Escape') { ev.preventDefault(); self.setFullscreen(false); } };
      document.addEventListener('keydown', self.escHandler);
    }
  };

  // ---- Undo/redo ----
  TopologyEditor.prototype.snapshot = function () {
    if (!this.history) this.history = [];
    this.history.push(JSON.stringify(this.state));
    if (this.history.length > 50) this.history.shift();
    this.future = [];
  };
  TopologyEditor.prototype.applyHistoryState = function (json) {
    try { this.state = JSON.parse(json); } catch (e) { return; }
    this.selected = null; this.selectedLink = null;
    this.render();
  };
  TopologyEditor.prototype.undo = function () {
    if (!this.history || !this.history.length) { toast('info', t('ui.topo.nothingUndo')); return; }
    if (!this.future) this.future = [];
    this.future.push(JSON.stringify(this.state));
    this.applyHistoryState(this.history.pop());
  };
  TopologyEditor.prototype.redo = function () {
    if (!this.future || !this.future.length) return;
    this.history.push(JSON.stringify(this.state));
    this.applyHistoryState(this.future.pop());
  };

  // ---- Validação client-side ----
  TopologyEditor.prototype.validate = function () {
    const issues = [];
    const names = {};
    this.state.nodes.forEach(function (n) {
      if (!n.name) issues.push(t('ui.topo.vNoName'));
      else if (names[n.name]) issues.push(t('ui.topo.vDupName', { name: n.name }));
      names[n.name] = true;
    });
    this.state.links.forEach(function (l) {
      if (!names[l.source] || !names[l.target]) issues.push(t('ui.topo.vBadLink', { a: l.source, b: l.target }));
      if (l.source === l.target) issues.push(t('ui.topo.vSelfLink', { a: l.source }));
    });
    return issues;
  };

  // ---- Export SVG ----
  TopologyEditor.prototype.exportSvg = function () {
    const W2 = W, H2 = H;
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W2 + ' ' + H2 + '" width="' + W2 + '" height="' + H2 + '">';
    svg += '<rect width="' + W2 + '" height="' + H2 + '" fill="#070b15"/>';
    const self = this;
    this.state.links.forEach(function (l) {
      const a = self.nodeByName(l.source), b = self.nodeByName(l.target);
      if (!a || !b) return;
      svg += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="#38bdf8" stroke-width="2"/>';
    });
    this.state.nodes.forEach(function (n) {
      const w = 96, h = 48, x = n.x - w / 2, y = n.y - h / 2;
      svg += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="10" fill="#111d33" stroke="#2a3c5e"/>';
      svg += '<text x="' + n.x + '" y="' + (n.y - 2) + '" fill="#e7eef9" font-family="monospace" font-size="13" text-anchor="middle">' + (n.name || '').replace(/[&<>]/g, '') + '</text>';
      svg += '<text x="' + n.x + '" y="' + (n.y + 14) + '" fill="#9fb2cf" font-family="monospace" font-size="10" text-anchor="middle">' + (n.kind || '').replace(/[&<>]/g, '') + '</text>';
    });
    svg += '</svg>';
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (this.lab || 'topology') + '.svg';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  TopologyEditor.prototype.validateRemote = function (btn) {
    const self = this;
    // Junta validação local (rápida) + estrutural no backend.
    const local = self.validate();
    if (btn) { btn.disabled = true; btn.classList.add('btn-disabled'); }
    const fields = { lab_name: self.lab, path: self.path };
    if (self.labsDir) fields.labs_dir = self.labsDir;
    postForm('/api/container-labs/validate', fields).then(function (r) {
      const issues = local.concat((r && r.issues) || []);
      const uniq = issues.filter(function (v, i) { return issues.indexOf(v) === i; });
      if (!uniq.length) { toast('success', t('ui.topo.validateOk')); return; }
      toast('error', t('ui.topo.validateFail') + '\n- ' + uniq.join('\n- '));
    }).catch(function () {
      if (!local.length) toast('success', t('ui.topo.validateOk'));
      else toast('error', t('ui.topo.validateFail') + '\n- ' + local.join('\n- '));
    }).finally(function () { if (btn) { btn.disabled = false; btn.classList.remove('btn-disabled'); } });
  };

  TopologyEditor.prototype.saveConfigs = function (btn) {
    const self = this;
    if (!window.confirm(t('ui.topo.saveConfigsConfirm'))) return;
    if (btn) { btn.disabled = true; btn.classList.add('btn-disabled'); }
    const fields = { lab_name: self.lab, path: self.path };
    if (self.labsDir) fields.labs_dir = self.labsDir;
    postForm('/api/container-labs/save-configs', fields).then(function (resp) {
      if (resp && resp.success) toast('success', resp.message || t('ui.topo.saveConfigsOk'));
      else toast('error', (resp && resp.message) || t('ui.topo.saveConfigsFail'));
    }).catch(function () { toast('error', t('ui.topo.saveConfigsFail')); })
      .finally(function () { if (btn) { btn.disabled = false; btn.classList.remove('btn-disabled'); } });
  };

  TopologyEditor.prototype.showBackups = function () {
    const self = this;
    const fields = { lab_name: self.lab, path: self.path };
    if (self.labsDir) fields.labs_dir = self.labsDir;
    postForm('/api/container-labs/backups', fields).then(function (resp) {
      const list = (resp && resp.backups) || [];
      const overlay = document.createElement('div'); overlay.className = 'io-overlay';
      const modal = document.createElement('div'); modal.className = 'io-modal'; modal.style.maxWidth = '560px';
      const head = document.createElement('div'); head.className = 'io-head';
      const h = document.createElement('div'); h.className = 'io-title'; h.textContent = t('ui.topo.backupsTitle');
      const x = document.createElement('button'); x.type = 'button'; x.className = 'btn-ghost'; x.style.cssText = 'padding:4px 12px'; x.textContent = '✕';
      x.addEventListener('click', function () { overlay.remove(); });
      head.appendChild(h); head.appendChild(x);
      const body = document.createElement('div'); body.style.cssText = 'padding:14px 16px;overflow:auto;max-height:60vh';
      if (!list.length) {
        body.innerHTML = '<div class="empty-state">' + t('ui.topo.backupsEmpty') + '</div>';
      } else {
        list.forEach(function (name) {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border:1px solid var(--border-2);border-radius:8px;margin-bottom:6px';
          const nm = document.createElement('span'); nm.className = 'mono'; nm.style.fontSize = '12px'; nm.textContent = name;
          const rb = document.createElement('button'); rb.type = 'button'; rb.className = 'btn-ghost'; rb.style.cssText = 'padding:4px 12px;font-size:12px'; rb.textContent = t('ui.topo.restoreBtn');
          rb.addEventListener('click', function () {
            if (!window.confirm(t('ui.topo.restoreConfirm'))) return;
            const f2 = { lab_name: self.lab, path: self.path, backup: name };
            if (self.labsDir) f2.labs_dir = self.labsDir;
            postForm('/api/container-labs/restore-backup', f2).then(function (r2) {
              if (r2 && r2.success) { toast('success', r2.message || t('ui.topo.restored')); overlay.remove(); self.load(); }
              else toast('error', (r2 && r2.message) || t('ui.topo.restoreFail'));
            }).catch(function () { toast('error', t('ui.topo.restoreFail')); });
          });
          row.appendChild(nm); row.appendChild(rb); body.appendChild(row);
        });
      }
      modal.appendChild(head); modal.appendChild(body); overlay.appendChild(modal);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
      document.body.appendChild(overlay);
    }).catch(function () { toast('error', t('ui.topo.backupsFail')); });
  };

  TopologyEditor.prototype.restore = function (btn) {
    const self = this;
    if (!window.confirm(t('ui.topo.restoreConfirm'))) return;
    if (btn) { btn.disabled = true; btn.classList.add('btn-disabled'); }
    const fields = { lab_name: self.lab, path: self.path };
    if (self.labsDir) fields.labs_dir = self.labsDir;
    postForm('/api/container-labs/topoviewer/restore', fields).then(function (resp) {
      if (resp && resp.success) { toast('success', resp.message || t('ui.topo.restored')); self.load(); }
      else toast('error', (resp && resp.message) || t('ui.topo.restoreFail'));
    }).catch(function () {
      toast('error', t('ui.topo.restoreFail'));
    }).finally(function () {
      if (btn) { btn.disabled = false; btn.classList.remove('btn-disabled'); }
    });
  };

  window.NetConfigTopology = {
    mount: function (target, opts) {
      const ed = new TopologyEditor(target, opts || {});
      ed.load();
      return ed;
    },
    // Seam para testes headless (não usar em produção).
    Editor: TopologyEditor
  };
})();
