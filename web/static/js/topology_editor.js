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
  const H = 460;

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
        nodes.push({
          name: data.name || data.id,
          kind: ed.kind || '',
          image: ed.image || '',
          type: ed.type || '',
          x: typeof pos.x === 'number' && pos.x ? pos.x : 0,
          y: typeof pos.y === 'number' && pos.y ? pos.y : 0,
          labels: ed.labels || {}
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

  function autoLayout(nodes) {
    const n = nodes.length;
    const cx = W / 2, cy = H / 2;
    const R = Math.max(120, Math.min(W, H) / 2 - 110);
    nodes.forEach(function (node, i) {
      if (node.x && node.y) return;
      if (n === 1) { node.x = cx; node.y = cy; }
      else if (n === 2) { node.x = cx + (i === 0 ? -R : R); node.y = cy; }
      else {
        const a = (2 * Math.PI * i) / n - Math.PI / 2;
        node.x = cx + R * Math.cos(a);
        node.y = cy + R * Math.sin(a);
      }
    });
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
  }

  TopologyEditor.prototype.load = function () {
    const self = this;
    self.target.innerHTML = '<div class="loading-state"><span class="spinner"></span><span>' + t('ui.topo.loading') + '</span></div>';
    const fields = { lab_name: self.lab, path: self.path };
    if (self.labsDir) fields.labs_dir = self.labsDir;
    postForm('/api/container-labs/topoviewer/cyto', fields).then(function (resp) {
      if (!resp || resp.success === false) {
        self.target.innerHTML = '<div class="empty-state">' + (resp && resp.message ? resp.message : t('ui.topo.loadFail')) + '</div>';
        return;
      }
      self.state = cytoToState(resp.elements || []);
      autoLayout(self.state.nodes);
      self.render();
    }).catch(function () {
      self.target.innerHTML = '<div class="empty-state">' + t('ui.topo.loadFail') + '</div>';
    });
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
    const linkBtn = document.createElement('button');
    linkBtn.type = 'button'; linkBtn.className = 'btn-ghost'; linkBtn.style.cssText = 'padding:5px 12px;font-size:12px';
    linkBtn.textContent = t('ui.topo.linkMode');
    linkBtn.addEventListener('click', function () {
      self.linkMode = !self.linkMode; self.linkSource = null;
      linkBtn.classList.toggle('active', self.linkMode);
      linkBtn.style.background = self.linkMode ? 'var(--surface-hover)' : '';
    });
    const counter = document.createElement('span');
    counter.className = 'topo-counter';
    counter.textContent = t('ui.topo.counter', { nodes: self.state.nodes.length, links: self.state.links.length });
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button'; saveBtn.className = 'btn-primary'; saveBtn.style.cssText = 'padding:6px 14px;font-size:12px';
    saveBtn.textContent = t('ui.topo.saveBtn');
    saveBtn.addEventListener('click', function () { self.save(saveBtn); });

    bar.appendChild(addBtn);
    bar.appendChild(linkBtn);
    bar.appendChild(counter);
    const spacer = document.createElement('span'); spacer.style.flex = '1'; bar.appendChild(spacer);
    bar.appendChild(saveBtn);
    self.target.appendChild(bar);
    self.counterEl = counter;

    // Canvas
    const canvas = document.createElement('div');
    canvas.className = 'topo-canvas';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    canvas.appendChild(svg);
    self.canvas = canvas;
    self.svg = svg;
    self.nodeEls = {};

    self.state.nodes.forEach(function (node) { self.renderNode(node); });
    self.target.appendChild(canvas);
    self.redrawEdges();

    // Prop panel
    const panel = document.createElement('div');
    panel.className = 'topo-panel';
    panel.id = 'topoPanel';
    self.panel = panel;
    self.target.appendChild(panel);
    self.renderPanel();
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

    self.attachNodeHandlers(card, node);
    self.canvas.appendChild(card);
    self.nodeEls[node.name] = card;
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
        self.state.links.push({ source: self.linkSource, target: node.name, sourceEp: '', targetEp: '', extra: null });
        self.highlight(self.linkSource, false);
        self.linkSource = null;
        self.redrawEdges();
        self.updateCounter();
      }
      return;
    }
    self.selected = node.name;
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
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
      line.setAttribute('stroke', 'rgba(56,189,248,0.6)');
      line.setAttribute('stroke-width', '2');
      line.style.cursor = 'pointer';
      line.addEventListener('click', function () {
        if (window.confirm(t('ui.topo.delLinkConfirm', { a: l.source, b: l.target }))) {
          self.state.links.splice(idx, 1);
          self.redrawEdges();
          self.updateCounter();
        }
      });
      self.svg.appendChild(line);
    });
  };

  TopologyEditor.prototype.updateCounter = function () {
    if (this.counterEl) this.counterEl.textContent = t('ui.topo.counter', { nodes: this.state.nodes.length, links: this.state.links.length });
  };

  TopologyEditor.prototype.addNode = function () {
    const name = (window.prompt(t('ui.topo.nodeNamePrompt'), 'node' + (this.state.nodes.length + 1)) || '').trim();
    if (!name) return;
    if (this.nodeByName(name)) { toast('error', t('ui.topo.nodeExists', { name: name })); return; }
    const kind = (window.prompt(t('ui.topo.nodeKindPrompt'), 'linux') || '').trim();
    const image = (window.prompt(t('ui.topo.nodeImagePrompt'), '') || '').trim();
    const node = { name: name, kind: kind, image: image, type: '', x: W / 2, y: H / 2, labels: {} };
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

  TopologyEditor.prototype.renderPanel = function () {
    const self = this;
    const panel = self.panel;
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
      inp.addEventListener('change', function () { onChange(inp.value.trim()); });
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
    panel.appendChild(grid);

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
    if (btn) { btn.disabled = true; btn.classList.add('btn-disabled'); }
    const fields = { lab_name: self.lab, path: self.path, elements: JSON.stringify(stateToElements(self.state)) };
    if (self.labsDir) fields.labs_dir = self.labsDir;
    postForm('/api/container-labs/topoviewer/save', fields).then(function (resp) {
      if (resp && resp.success) toast('success', resp.message || t('ui.topo.saved'));
      else toast('error', (resp && resp.message) || t('ui.topo.saveFail'));
    }).catch(function () {
      toast('error', t('ui.topo.saveFail'));
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
