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

/* Aba EVE-NG/PNETLab: lista labs UNL (.unl) e abre a topologia (read-only). */
document.addEventListener('DOMContentLoaded', function () {
  var listBtn = document.getElementById('eveLabsListBtn');
  var listEl = document.getElementById('eveLabsList');
  var countEl = document.getElementById('eveLabsCount');
  var dirInput = document.getElementById('eveLabsDir');
  var filterInput = document.getElementById('eveLabsFilter');
  if (!listBtn || !listEl || !countEl) return;

  var app = window.NetConfigApp || {};
  var t = app.t || function (k) { return k; };
  var showMessage = app.showMessage || function () {};
  var getCommonCreds = app.getCommonCreds || function () { return { eve_ip: '', eve_user: '', eve_pass: '' }; };
  var setLangHeader = app.setLanguageHeader || function () {};

  var allLabs = [];
  // Cache de status por caminho do lab: { running, total } ou { error: true }.
  var statusCache = {};

  function baseDir() { return (dirInput && dirInput.value) ? dirInput.value.trim() : '/opt/unetlab/labs'; }

  // Aplica o resultado de status (do cache) ao selo do lab.
  function applyBadge(badge, st) {
    badge.style.display = '';
    badge.classList.remove('is-up', 'is-down');
    if (!st) { badge.textContent = t('ui.eveLabs.statusChecking'); badge.title = ''; return; }
    if (st.error) {
      badge.classList.add('is-down');
      badge.textContent = t('ui.eveLabs.statusUnknown');
      badge.title = t('ui.eveLabs.statusFail');
      return;
    }
    var running = st.running > 0;
    badge.classList.add(running ? 'is-up' : 'is-down');
    badge.textContent = t(running ? 'ui.eveLabs.statusRunning' : 'ui.eveLabs.statusStopped');
    badge.title = t('ui.eveLabs.statusResult', { running: st.running, total: st.total });
  }

  // Consulta o status de um lab e atualiza cache + selo. cb(err) opcional.
  function fetchLabStatus(lab, badge, cb) {
    var creds = getCommonCreds();
    var fd = new FormData();
    fd.append('eve_ip', creds.eve_ip); fd.append('eve_user', creds.eve_user); fd.append('eve_pass', creds.eve_pass);
    fd.append('path', lab.path);
    applyBadge(badge, null); // estado "verificando…"
    var xs = new XMLHttpRequest(); xs.open('POST', '/api/unl/running', true);
    xs.setRequestHeader('X-Requested-With', 'XMLHttpRequest'); setLangHeader(xs);
    xs.onreadystatechange = function () {
      if (xs.readyState !== 4) return;
      var r = null; try { r = JSON.parse(xs.responseText || '{}'); } catch (e2) { r = null; }
      if (!r || r.success === false) { statusCache[lab.path] = { error: true }; }
      else { statusCache[lab.path] = { running: r.running_count || 0, total: r.total || 0 }; }
      applyBadge(badge, statusCache[lab.path]);
      updateCount();
      if (cb) cb();
    };
    xs.onerror = function () { statusCache[lab.path] = { error: true }; applyBadge(badge, statusCache[lab.path]); updateCount(); if (cb) cb(); };
    xs.send(fd);
  }

  // Dispara a busca de status para os labs ainda sem resultado, com concorrência limitada.
  function autoStatus(pending) {
    var queue = pending.slice();
    var MAX = 4;
    function next() {
      var item = queue.shift();
      if (!item) return;
      fetchLabStatus(item.lab, item.badge, next);
    }
    for (var i = 0; i < MAX; i++) next();
  }

  // Atualiza o contador com o total de labs e quantos estão rodando (quando conhecido).
  function updateCount() {
    var runningLabs = 0, known = 0;
    allLabs.forEach(function (l) {
      var st = statusCache[l.path];
      if (st && !st.error) { known++; if (st.running > 0) runningLabs++; }
    });
    if (known > 0) countEl.textContent = t('ui.eveLabs.countRunning', { count: allLabs.length, running: runningLabs });
    else countEl.textContent = t('ui.eveLabs.count', { count: allLabs.length });
  }

  function render() {
    var q = (filterInput && filterInput.value || '').trim().toLowerCase();
    var arr = q ? allLabs.filter(function (l) { return (l.path || '').toLowerCase().indexOf(q) !== -1; }) : allLabs;
    listEl.innerHTML = '';
    var pending = [];
    if (!arr.length) {
      var e = document.createElement('div'); e.className = 'images-empty'; e.textContent = t('ui.eveLabs.none'); listEl.appendChild(e);
    } else {
      arr.forEach(function (lab) {
        var row = document.createElement('div');
        row.className = 'vrnetlab-image-row';
        row.style.cssText += ';flex-direction:column;align-items:stretch';
        var header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%';
        var name = document.createElement('span'); name.className = 'vrnetlab-image-name'; name.textContent = lab.name || lab.path;
        var sub = document.createElement('span'); sub.className = 'vrnetlab-image-size'; sub.textContent = lab.path;
        var statusBadge = document.createElement('span'); statusBadge.className = 'lab-run-badge'; statusBadge.style.display = 'none';
        var nameRow = document.createElement('div'); nameRow.style.cssText = 'display:flex;align-items:center;gap:8px'; nameRow.appendChild(name); nameRow.appendChild(statusBadge);
        var left = document.createElement('div'); left.style.cssText = 'display:flex;flex-direction:column;min-width:0'; left.appendChild(nameRow); left.appendChild(sub);
        // Selo inicial: usa o cache se já conhecido; senão entra na fila de auto-status.
        if (statusCache[lab.path]) { applyBadge(statusBadge, statusCache[lab.path]); }
        else { pending.push({ lab: lab, badge: statusBadge }); }
        var statusBtn = document.createElement('button'); statusBtn.type = 'button'; statusBtn.className = 'btn-secondary';
        statusBtn.style.cssText = 'padding:2px 10px;font-size:11px'; statusBtn.textContent = t('ui.eveLabs.statusBtn');
        statusBtn.title = t('ui.eveLabs.statusBtn');
        statusBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          statusBtn.disabled = true;
          fetchLabStatus(lab, statusBadge, function () { statusBtn.disabled = false; });
        });
        var toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'btn-secondary';
        toggle.style.cssText = 'padding:2px 10px;font-size:11px'; toggle.textContent = '+';
        var topoWrap = document.createElement('div'); topoWrap.className = 'topo-inline'; topoWrap.style.display = 'none'; topoWrap.style.marginTop = '8px';
        toggle.addEventListener('click', function () {
          var vis = topoWrap.style.display !== 'none';
          if (vis) { topoWrap.style.display = 'none'; toggle.textContent = '+'; return; }
          topoWrap.style.display = 'block'; toggle.textContent = '−';
          if (topoWrap.dataset.loaded !== '1' && window.NetConfigTopology) {
            topoWrap.dataset.loaded = '1';
            window.NetConfigTopology.mount(topoWrap, { mode: 'unl', readOnly: true, path: lab.path, baseDir: baseDir() });
          }
        });
        var hActions = document.createElement('span'); hActions.style.cssText = 'display:flex;align-items:center;gap:6px';
        hActions.appendChild(statusBtn); hActions.appendChild(toggle);
        header.appendChild(left); header.appendChild(hActions);
        row.appendChild(header); row.appendChild(topoWrap);
        listEl.appendChild(row);
      });
    }
    updateCount();
    if (pending.length) autoStatus(pending);
  }

  function loadLabs() {
    var creds = getCommonCreds();
    if (!creds.eve_ip || !creds.eve_user || !creds.eve_pass) { showMessage('error', t('container_labs.missing_creds')); return; }
    listEl.innerHTML = '<div class="loading-state"><span class="spinner"></span><span>' + t('ui.eveLabs.loading') + '</span></div>';
    var fd = new FormData();
    fd.append('eve_ip', creds.eve_ip); fd.append('eve_user', creds.eve_user); fd.append('eve_pass', creds.eve_pass);
    fd.append('base_dir', baseDir());
    var x = new XMLHttpRequest();
    x.open('POST', '/api/unl/labs', true);
    x.setRequestHeader('X-Requested-With', 'XMLHttpRequest'); setLangHeader(x);
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      var r = null; try { r = JSON.parse(x.responseText || '{}'); } catch (e) { listEl.innerHTML = ''; showMessage('error', t('msg.parseError')); return; }
      if (!r || (r.success === false && !r.missing_dir)) { listEl.innerHTML = ''; showMessage('error', (r && r.message) || t('ui.eveLabs.fail')); return; }
      if (r.missing_dir) { listEl.innerHTML = ''; showMessage('error', r.message || t('ui.eveLabs.fail')); allLabs = []; render(); return; }
      allLabs = r.labs || [];
      statusCache = {}; // lista nova → status fresco (auto-buscado no render)
      render();
    };
    x.onerror = function () { listEl.innerHTML = ''; showMessage('error', t('msg.networkError')); };
    x.send(fd);
  }

  listBtn.addEventListener('click', loadLabs);
  if (filterInput) filterInput.addEventListener('input', render);
  window.addEventListener('netconfig:language-changed', function () { if (allLabs.length) render(); });
});
