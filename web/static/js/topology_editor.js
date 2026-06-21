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
          labels: labels
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

  function autoLayout(nodes, force) {
    if (!nodes.length) return;
    // Mantém posições salvas (graph-posX/Y) a menos que seja re-layout forçado.
    const hasSaved = nodes.some(function (nd) { return nd.x || nd.y; });
    if (hasSaved && !force) return;
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
    this.state = { nodes: [], links: [] };
    this.selected = null;       // node name
    this.linkMode = false;
    this.linkSource = null;
    this.nodeEls = {};
    this.statusMap = {};        // nodeName -> { state, ipv4, container }
  }

  TopologyEditor.prototype.load = function () {
    const self = this;
    self.target.innerHTML = '<div class="loading-state"><span class="spinner"></span><span>' + t('ui.topo.loading') + '</span></div>';
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
      autoLayout(self.state.nodes);
      self.render();
    }).catch(function () {
      self.target.innerHTML = '<div class="empty-state">' + t('ui.topo.loadFail') + '</div>';
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
      const labels = (base.labels && typeof base.labels === 'object') ? base.labels : {};
      if (nd.labels) Object.keys(nd.labels).forEach(function (k) { labels[k] = nd.labels[k]; });
      labels['graph-posX'] = String(Math.round(nd.x));
      labels['graph-posY'] = String(Math.round(nd.y));
      base.labels = labels;
      nodes[nd.name] = base;
    });
    const links = this.state.links.map(function (l) {
      return { endpoints: [l.source + ':' + (l.sourceEp || 'eth1'), l.target + ':' + (l.targetEp || 'eth1')] };
    });
    topo.nodes = nodes;
    topo.links = links;
    doc.topology = topo;
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
        level: isNaN(lvl) ? null : lvl, labels: labels
      });
    });
    const links = [];
    const rawLinks = Array.isArray(topo.links) ? topo.links : [];
    rawLinks.forEach(function (l) {
      const eps = (l && Array.isArray(l.endpoints)) ? l.endpoints : [];
      if (eps.length < 2) return;
      const a = String(eps[0]).split(':'); const b = String(eps[1]).split(':');
      links.push({ source: a[0], target: b[0], sourceEp: a[1] || '', targetEp: b[1] || '', extra: l });
    });
    this.state = { nodes: nodes, links: links };
    autoLayout(this.state.nodes);
  };

  TopologyEditor.prototype.currentYaml = function () {
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
    const tidyBtn = document.createElement('button');
    tidyBtn.type = 'button'; tidyBtn.className = 'btn-ghost'; tidyBtn.style.cssText = 'padding:5px 12px;font-size:12px';
    tidyBtn.textContent = t('ui.topo.tidyBtn');
    tidyBtn.addEventListener('click', function () {
      autoLayout(self.state.nodes, true);
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
    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button'; restoreBtn.className = 'btn-ghost'; restoreBtn.style.cssText = 'padding:6px 12px;font-size:12px';
    restoreBtn.textContent = t('ui.topo.restoreBtn');
    restoreBtn.addEventListener('click', function () { self.restore(restoreBtn); });
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button'; saveBtn.className = 'btn-primary'; saveBtn.style.cssText = 'padding:6px 14px;font-size:12px';
    saveBtn.textContent = t('ui.topo.saveBtn');
    saveBtn.addEventListener('click', function () { self.save(saveBtn); });

    bar.appendChild(addBtn);
    bar.appendChild(palette);
    bar.appendChild(linkBtn);
    bar.appendChild(tidyBtn);
    bar.appendChild(statusBtn);
    bar.appendChild(yamlBtn);
    bar.appendChild(counter);
    const spacer = document.createElement('span'); spacer.style.flex = '1'; bar.appendChild(spacer);
    bar.appendChild(restoreBtn);
    bar.appendChild(saveBtn);
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

    // YAML split panel (toggle)
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

    // Prop panel
    const panel = document.createElement('div');
    panel.className = 'topo-panel';
    panel.id = 'topoPanel';
    self.panel = panel;
    self.target.appendChild(panel);
    self.renderPanel();
  };

  TopologyEditor.prototype.applyYaml = function () {
    const self = this;
    if (!window.jsyaml) { toast('error', 'js-yaml indisponível'); return; }
    let doc;
    try { doc = window.jsyaml.load(self.yamlTa.value); }
    catch (e) { toast('error', t('ui.topo.yamlInvalid', { err: e.message })); return; }
    if (!doc || typeof doc !== 'object') { toast('error', t('ui.topo.yamlInvalid', { err: 'empty' })); return; }
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
    let kind = presetKind;
    if (!kind) kind = (window.prompt(t('ui.topo.nodeKindPrompt'), 'linux') || '').trim();
    const image = (window.prompt(t('ui.topo.nodeImagePrompt'), '') || '').trim();
    const node = { name: name, kind: kind, image: image, type: '', mgmtIpv4: '', group: '', startupConfig: '', x: W / 2, y: H / 2, labels: {} };
    this.state.nodes.push(node);
    this.renderNode(node);
    this.updateCounter();
    this.onNodeClick(node);
  };

  TopologyEditor.prototype.deleteNode = function (name) {
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

    const del = document.createElement('button');
    del.type = 'button'; del.className = 'pill-action'; del.style.cssText = 'margin-top:4px';
    del.textContent = t('ui.topo.delLink');
    del.addEventListener('click', function () {
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
      acts.appendChild(info); acts.appendChild(logsB); acts.appendChild(execB);
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
    }
  };
})();
