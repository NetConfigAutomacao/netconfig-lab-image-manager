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

  function baseDir() { return (dirInput && dirInput.value) ? dirInput.value.trim() : '/opt/unetlab/labs'; }

  function render() {
    var q = (filterInput && filterInput.value || '').trim().toLowerCase();
    var arr = q ? allLabs.filter(function (l) { return (l.path || '').toLowerCase().indexOf(q) !== -1; }) : allLabs;
    listEl.innerHTML = '';
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
        var statusBtn = document.createElement('button'); statusBtn.type = 'button'; statusBtn.className = 'btn-secondary';
        statusBtn.style.cssText = 'padding:2px 10px;font-size:11px'; statusBtn.textContent = t('ui.eveLabs.statusBtn');
        statusBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          var creds = getCommonCreds();
          var fd = new FormData();
          fd.append('eve_ip', creds.eve_ip); fd.append('eve_user', creds.eve_user); fd.append('eve_pass', creds.eve_pass);
          fd.append('path', lab.path);
          statusBtn.disabled = true;
          var xs = new XMLHttpRequest(); xs.open('POST', '/api/unl/running', true);
          xs.setRequestHeader('X-Requested-With', 'XMLHttpRequest'); setLangHeader(xs);
          xs.onreadystatechange = function () {
            if (xs.readyState !== 4) return; statusBtn.disabled = false;
            var r = null; try { r = JSON.parse(xs.responseText || '{}'); } catch (e2) { showMessage('error', t('msg.parseError')); return; }
            if (!r || r.success === false) { showMessage('error', (r && r.message) || t('ui.eveLabs.statusFail')); return; }
            statusBadge.style.display = '';
            statusBadge.classList.remove('is-up', 'is-down');
            statusBadge.classList.add(r.running_count > 0 ? 'is-up' : 'is-down');
            statusBadge.textContent = t('ui.eveLabs.statusResult', { running: r.running_count, total: r.total });
            showMessage('success', t('ui.eveLabs.statusResult', { running: r.running_count, total: r.total }));
          };
          xs.onerror = function () { statusBtn.disabled = false; showMessage('error', t('msg.networkError')); };
          xs.send(fd);
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
    countEl.textContent = t('ui.eveLabs.count', { count: allLabs.length });
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
      render();
    };
    x.onerror = function () { listEl.innerHTML = ''; showMessage('error', t('msg.networkError')); };
    x.send(fd);
  }

  listBtn.addEventListener('click', loadLabs);
  if (filterInput) filterInput.addEventListener('input', render);
  window.addEventListener('netconfig:language-changed', function () { if (allLabs.length) render(); });
});
