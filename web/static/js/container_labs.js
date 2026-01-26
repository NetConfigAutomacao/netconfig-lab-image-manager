/*
 * This file is part of NetConfig Lab Image Manager.
 *
 * NetConfig Lab Image Manager is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

document.addEventListener('DOMContentLoaded', function () {
  const loadBtn = document.getElementById('labsListBtn');
  const createBtn = document.getElementById('labsCreateBtn');
  const createHint = document.getElementById('labsCreateHint');
  const listEl = document.getElementById('labsList');
  const countEl = document.getElementById('labsCount');
  const dirInput = document.getElementById('labsDirInput');
  const filterInput = document.getElementById('labsFilter');

  const app = window.NetConfigApp || {};
  const showMessage = app.showMessage || function () {};
  const getCommonCreds = app.getCommonCreds || function () {
    return { eve_ip: '', eve_user: '', eve_pass: '' };
  };
  const t = app.t || function (key) { return key; };
  const setLangHeader = app.setLanguageHeader || function () {};

  let loadingOps = 0;
  let currentLabs = [];
  let labFilesCache = {};
  let labFetching = {};

  if (!loadBtn || !listEl || !countEl) return;

  function resetLabCache() {
    labFilesCache = {};
    labFetching = {};
  }

  function setBodyLoading(active) {
    if (active) {
      loadingOps += 1;
      document.body.classList.add('is-loading');
    } else {
      loadingOps = Math.max(0, loadingOps - 1);
      if (loadingOps === 0) document.body.classList.remove('is-loading');
    }
  }

  function setLoading(isLoading) {
    if (!(loadBtn instanceof HTMLButtonElement)) return;
    loadBtn.disabled = !!isLoading;
    loadBtn.classList.toggle('btn-disabled', !!isLoading);
    const label = loadBtn.querySelector('[data-i18n="ui.labs.loadBtn"]') || loadBtn;
    label.textContent = isLoading ? t('ui.labs.loading') : t('ui.labs.loadBtn');
    setBodyLoading(!!isLoading);
  }

  function setCreateVisible(visible) {
    if (createBtn) {
      createBtn.style.display = visible ? '' : 'none';
      createBtn.disabled = !visible;
      createBtn.classList.toggle('btn-disabled', !visible);
    }
    if (createHint) createHint.style.display = visible ? '' : 'none';
  }

  function sortFiles(files) {
    return (files || []).slice().sort(function (a, b) {
      const aDir = a.type === 'dir';
      const bDir = b.type === 'dir';
      if (aDir !== bDir) return aDir ? -1 : 1;
      return (a.path || '').localeCompare(b.path || '');
    });
  }

  function b64Encode(str) {
    try {
      return btoa(unescape(encodeURIComponent(str)));
    } catch (e) {
      return btoa(str || '');
    }
  }

  function renderFileTree(lab, files, target, expandAll) {
    target.innerHTML = '';
    const arr = sortFiles(files);
    if (!arr.length) {
      const empty = document.createElement('div');
      empty.className = 'images-empty';
      empty.textContent = t('ui.labs.none');
      target.appendChild(empty);
      return;
    }

    const rows = [];

    function collapseDescendants(dirPath) {
      rows.forEach(function (r) {
        const p = r.dataset.path || '';
        if (p.startsWith(dirPath + '/')) {
          r.style.display = 'none';
          r.dataset.expanded = 'false';
          const btn = r.querySelector('.lab-dir-toggle');
          if (btn) btn.textContent = '+';
        }
      });
    }

    function expandChildren(dirPath, depth) {
      rows.forEach(function (r) {
        const p = r.dataset.path || '';
        const d = Number(r.dataset.depth || 0);
        if (p.startsWith(dirPath + '/') && d === depth + 1) {
          r.style.display = 'flex';
        }
      });
    }

    arr.forEach(function (entry) {
      const depth = (entry.path || '').split('/').length - 1;
      const row = document.createElement('div');
      const shouldShow = expandAll || depth === 0;
      row.style.display = shouldShow ? 'flex' : 'none';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'flex-start';
      row.style.padding = '4px 6px';
      row.style.border = '1px solid rgba(51,65,85,0.6)';
      row.style.borderRadius = '6px';
      row.style.marginBottom = '4px';
      row.style.backgroundColor = 'rgba(15,23,42,0.8)';
      row.style.marginLeft = (depth * 12) + 'px';
      row.dataset.path = entry.path || '';
      row.dataset.depth = depth.toString();
      row.dataset.expanded = expandAll ? 'true' : 'false';

      const info = document.createElement('div');
      info.style.display = 'flex';
      info.style.alignItems = 'center';
      info.style.gap = '8px';

      const badge = document.createElement('span');
      badge.style.fontSize = '11px';
      badge.style.padding = '2px 6px';
      badge.style.borderRadius = '6px';
      badge.style.border = '1px solid rgba(56,189,248,0.3)';
      badge.textContent = entry.type === 'dir' ? 'DIR' : 'FILE';

      const name = document.createElement('span');
      name.textContent = entry.path || '';
      name.style.fontWeight = entry.type === 'dir' ? '600' : '500';

      info.appendChild(badge);
      info.appendChild(name);
      row.appendChild(info);

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '8px';
      actions.style.marginLeft = 'auto';

      if (entry.type === 'dir') {
        const dirBtn = document.createElement('button');
        dirBtn.type = 'button';
        dirBtn.className = 'btn-secondary lab-dir-toggle';
        dirBtn.textContent = expandAll ? '−' : '+';
        dirBtn.addEventListener('click', function () {
          const expanded = row.dataset.expanded === 'true';
          if (expanded) {
            collapseDescendants(entry.path);
            row.dataset.expanded = 'false';
            dirBtn.textContent = '+';
          } else {
            expandChildren(entry.path, depth);
            row.dataset.expanded = 'true';
            dirBtn.textContent = '−';
          }
        });
        actions.appendChild(dirBtn);
      } else if ((entry.path || '').toLowerCase().match(/\.(ya?ml|txt|py)$/)) {
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = '';
        editBtn.style.padding = '3px 8px';
        editBtn.style.fontSize = '11px';
        editBtn.style.minWidth = '56px';
        editBtn.style.border = '1px solid rgba(56,189,248,0.5)';
        editBtn.style.borderRadius = '8px';
        editBtn.style.backgroundColor = 'rgba(56,189,248,0.12)';
        editBtn.style.color = '#e5e7eb';
        editBtn.style.cursor = 'pointer';
        editBtn.textContent = t('ui.labs.editBtn') || 'Editar';
        editBtn.addEventListener('click', function () {
          loadFileContent(lab, entry.path, row, actions);
        });
        actions.appendChild(editBtn);

        if ((entry.path || '').toLowerCase().match(/clab\.ya?ml$/)) {
          const topoBtn = document.createElement('button');
          topoBtn.type = 'button';
          topoBtn.className = 'btn-secondary';
          topoBtn.style.padding = '3px 8px';
          topoBtn.style.fontSize = '11px';
          topoBtn.textContent = 'Topology';
          topoBtn.addEventListener('click', function () {
            openTopologyFromFile(lab, entry.path);
          });
          actions.appendChild(topoBtn);
        }
      }

      row.appendChild(actions);
      target.appendChild(row);
      rows.push(row);

      if (expandAll && entry.type === 'dir') {
        // Ensure first-level children are visible when fully expanded
        expandChildren(entry.path, depth);
      }
    });
  }

  function requestLabFiles(labName) {
    if (!labName) return Promise.reject(new Error('missing_lab'));
    if (labFilesCache[labName]) return Promise.resolve(labFilesCache[labName]);
    if (labFetching[labName]) return labFetching[labName];
    const creds = getCommonCreds();
    if (!creds.eve_ip || !creds.eve_user || !creds.eve_pass) {
      showMessage('error', t('container_labs.missing_creds'));
      return Promise.reject(new Error('missing_creds'));
    }

    const fd = new FormData();
    fd.append('eve_ip', creds.eve_ip);
    fd.append('eve_user', creds.eve_user);
    fd.append('eve_pass', creds.eve_pass);
    fd.append('lab_name', labName);
    if (dirInput && dirInput.value) {
      fd.append('labs_dir', dirInput.value.trim());
    }

    labFetching[labName] = new Promise(function (resolve, reject) {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/container-labs/files', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      setLangHeader(xhr);

      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        setBodyLoading(false);

        let resp = null;
        try {
          resp = JSON.parse(xhr.responseText || '{}');
        } catch (err) {
          showMessage('error', t('msg.parseError'));
          reject(err);
          return;
        }

        if (!resp || resp.success === false) {
          if (resp && resp.message) showMessage('error', resp.message);
          reject(new Error('list_files_failed'));
          return;
        }

        labFilesCache[labName] = resp.files || [];
        resolve(labFilesCache[labName]);
      };

      xhr.onerror = function () {
        setBodyLoading(false);
        showMessage('error', t('msg.networkError'));
        reject(new Error('network_error'));
      };

      setBodyLoading(true);
      xhr.send(fd);
    }).finally(function () {
      delete labFetching[labName];
    });

    return labFetching[labName];
  }

  function loadLabFiles(labName, container, toggleBtn, expandAll) {
    if (!labName) return;
    container.innerHTML = t('ui.labs.loading');
    requestLabFiles(labName)
      .then(function (files) {
        renderFileTree(labName, files || [], container, !!expandAll);
        container.dataset.loaded = 'true';
        if (toggleBtn) toggleBtn.textContent = '−';
      })
      .catch(function () {
        container.innerHTML = '';
        if (toggleBtn) toggleBtn.textContent = '+';
      });
  }

  function loadFileContent(labName, path, rowEl, actionsEl) {
    const creds = getCommonCreds();
    if (!creds.eve_ip || !creds.eve_user || !creds.eve_pass) {
      showMessage('error', t('container_labs.missing_creds'));
      return;
    }
    const fd = new FormData();
    fd.append('eve_ip', creds.eve_ip);
    fd.append('eve_user', creds.eve_user);
    fd.append('eve_pass', creds.eve_pass);
    fd.append('lab_name', labName);
    fd.append('path', path);
    if (dirInput && dirInput.value) {
      fd.append('labs_dir', dirInput.value.trim());
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/container-labs/file', true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    setLangHeader(xhr);
    setBodyLoading(true);

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      setBodyLoading(false);

      let resp = null;
      try {
        resp = JSON.parse(xhr.responseText || '{}');
      } catch (err) {
        showMessage('error', t('msg.parseError'));
        return;
      }

      if (!resp || resp.success === false) {
        if (resp && resp.message) showMessage('error', resp.message);
        return;
      }

      showEditor(labName, path, rowEl, resp.content || '', actionsEl);
    };

    xhr.onerror = function () {
      setBodyLoading(false);
      showMessage('error', t('msg.networkError'));
    };

    xhr.send(fd);
  }

  function showEditor(labName, path, rowEl, content, actionsEl) {
    // remove any existing modal
    const oldModal = document.querySelector('.lab-editor-modal');
    if (oldModal) oldModal.remove();

    const overlay = document.createElement('div');
    overlay.className = 'lab-editor-modal';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(15,23,42,0.55)';
    overlay.style.backdropFilter = 'blur(3px)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';
    overlay.style.padding = '18px';

    const modal = document.createElement('div');
    modal.style.width = '90%';
    modal.style.maxWidth = '980px';
    modal.style.maxHeight = '90vh';
    modal.style.background = 'rgba(10,14,26,0.95)';
    modal.style.border = '1px solid rgba(56,189,248,0.3)';
    modal.style.borderRadius = '12px';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    modal.style.boxShadow = '0 25px 60px rgba(0,0,0,0.45)';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '12px 14px';
    header.style.borderBottom = '1px solid rgba(56,189,248,0.18)';

    const title = document.createElement('div');
    title.style.display = 'flex';
    title.style.flexDirection = 'column';
    title.style.gap = '3px';

    const titleMain = document.createElement('div');
    titleMain.style.fontSize = '15px';
    titleMain.style.fontWeight = '600';
    titleMain.style.color = '#e5e7eb';
    titleMain.textContent = t('ui.labs.editBtn') || 'Editar arquivo';

    const titlePath = document.createElement('div');
    titlePath.style.fontSize = '12px';
    titlePath.style.color = '#cbd5e1';
    titlePath.textContent = (labName ? labName + ' / ' : '') + (path || '');

    title.appendChild(titleMain);
    title.appendChild(titlePath);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.style.background = 'transparent';
    closeBtn.style.color = '#cbd5e1';
    closeBtn.style.border = '1px solid rgba(248,113,113,0.4)';
    closeBtn.style.borderRadius = '8px';
    closeBtn.style.padding = '4px 10px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.addEventListener('click', function () { overlay.remove(); });

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.style.flex = '1';
    body.style.padding = '12px';
    body.style.overflow = 'auto';

    const editorHost = document.createElement('div');
    const codeEditor = window.NetConfigApp && window.NetConfigApp.createCodeEditor
      ? window.NetConfigApp.createCodeEditor({
        container: editorHost,
        value: content || '',
        path: path || '',
        language: window.NetConfigApp.detectLanguageFromPath ? window.NetConfigApp.detectLanguageFromPath(path, content) : null,
        onSave: function (val) { saveLabFile(labName, path, val, overlay); },
        onCancel: function () { overlay.remove(); }
      })
      : null;

    const footer = document.createElement('div');
    footer.style.display = 'flex';
    footer.style.justifyContent = 'flex-end';
    footer.style.gap = '10px';
    footer.style.padding = '12px';
    footer.style.borderTop = '1px solid rgba(56,189,248,0.18)';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn-primary';
    saveBtn.textContent = t('ui.labs.saveBtn') || 'Salvar';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = t('ui.labs.cancelBtn') || 'Cancelar';

    footer.appendChild(saveBtn);
    footer.appendChild(cancelBtn);

    body.appendChild(editorHost);
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const escListener = function (ev) {
      if (ev.key === 'Escape') {
        closeModal();
      }
    };

    function closeModal() {
      overlay.remove();
      document.removeEventListener('keydown', escListener);
    }

    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', escListener);

    saveBtn.addEventListener('click', function () {
      const val = codeEditor && codeEditor.getValue ? codeEditor.getValue() : content || '';
      saveLabFile(labName, path, val, overlay);
    });

    if (codeEditor && codeEditor.focus) codeEditor.focus();
  }

  function saveLabFile(labName, path, content, editorEl) {
    const creds = getCommonCreds();
    if (!creds.eve_ip || !creds.eve_user || !creds.eve_pass) {
      showMessage('error', t('container_labs.missing_creds'));
      return;
    }

    const fd = new FormData();
    fd.append('eve_ip', creds.eve_ip);
    fd.append('eve_user', creds.eve_user);
    fd.append('eve_pass', creds.eve_pass);
    fd.append('lab_name', labName);
    fd.append('path', path);
    fd.append('content_b64', b64Encode(content || ''));
    if (dirInput && dirInput.value) {
      fd.append('labs_dir', dirInput.value.trim());
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/container-labs/file/save', true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    setLangHeader(xhr);
    setBodyLoading(true);

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      setBodyLoading(false);

      let resp = null;
      try {
        resp = JSON.parse(xhr.responseText || '{}');
      } catch (err) {
        showMessage('error', t('msg.parseError'));
        return;
      }

      if (resp && resp.message) {
        showMessage(resp.success === false ? 'error' : 'success', resp.message);
      }

      if (resp && resp.success && editorEl) {
        editorEl.remove();
      }
    };

    xhr.onerror = function () {
      setBodyLoading(false);
      showMessage('error', t('msg.networkError'));
    };

    xhr.send(fd);
  }

  function fetchLabFileContent(labName, path) {
    return new Promise(function (resolve, reject) {
      const creds = getCommonCreds();
      if (!creds.eve_ip || !creds.eve_user || !creds.eve_pass) {
        showMessage('error', t('container_labs.missing_creds'));
        return reject(new Error('missing_creds'));
      }
      const fd = new FormData();
      fd.append('eve_ip', creds.eve_ip);
      fd.append('eve_user', creds.eve_user);
      fd.append('eve_pass', creds.eve_pass);
      fd.append('lab_name', labName);
      fd.append('path', path);
      if (dirInput && dirInput.value) {
        fd.append('labs_dir', dirInput.value.trim());
      }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/container-labs/file', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      setLangHeader(xhr);
      setBodyLoading(true);

      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        setBodyLoading(false);
        let resp = null;
        try {
          resp = JSON.parse(xhr.responseText || '{}');
        } catch (err) {
          showMessage('error', t('msg.parseError'));
          return reject(err);
        }
        if (!resp || resp.success === false) {
          if (resp && resp.message) showMessage('error', resp.message);
          return reject(new Error('fetch_file_failed'));
        }
        resolve(resp.content || '');
      };

      xhr.onerror = function () {
        setBodyLoading(false);
        showMessage('error', t('msg.networkError'));
        reject(new Error('network_error'));
      };

      xhr.send(fd);
    });
  }

  function parseTopologyFallback(text) {
    const nodes = [];
    const links = [];
    const lines = (text || '').split(/\r?\n/);
    let inNodes = false;
    let inLinks = false;
    let currentNode = null;
    let nodesBlockIndent = 0;

    function pushNode() {
      if (currentNode) nodes.push(currentNode);
      currentNode = null;
    }

    lines.forEach(function (raw) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return;
      const indent = (raw.match(/^\s*/) || [''])[0].length;
      if (/^topology\s*:/.test(line)) {
        inNodes = false; inLinks = false; pushNode(); return;
      }
      if (/^nodes\s*:/.test(line)) {
        inNodes = true; inLinks = false; pushNode(); nodesBlockIndent = indent; return;
      }
      if (/^links\s*:/.test(line)) {
        inNodes = false; inLinks = true; pushNode(); return;
      }

      if (inNodes) {
        const nodeMatch = line.match(/^([A-Za-z0-9._-]+)\s*:\s*$/);
        if (nodeMatch && indent > nodesBlockIndent) {
          pushNode();
          currentNode = { name: nodeMatch[1], kind: '', image: '', mgmt: '' };
          return;
        }
        if (currentNode && indent > nodesBlockIndent) {
          const kindM = line.match(/^kind\s*:\s*(.+)$/);
          if (kindM) { currentNode.kind = kindM[1]; return; }
          const imgM = line.match(/^image\s*:\s*(.+)$/);
          if (imgM) { currentNode.image = imgM[1]; return; }
          const mgmtM = line.match(/^(mgmt-ipv4|mgmt)\s*:\s*(.+)$/);
          if (mgmtM) { currentNode.mgmt = mgmtM[2]; return; }
        }
        return;
      }

      if (inLinks) {
        const epMatch = line.match(/endpoints\s*:\s*\[(.+)\]/);
        if (epMatch) {
          const parts = epMatch[1].split(',').map(function (p) {
            return p.replace(/['"\s]/g, '');
          }).filter(Boolean);
          links.push({ endpoints: parts, name: 'link-' + (links.length + 1) });
        }
      }
    });
    pushNode();
    return { nodes: nodes, links: links, fallback: true };
  }

  function parseTopologyYaml(text) {
    let parsed = { nodes: [], links: [], error: null, meta: {} };
    const meta = {
      lib: null,
      usedFallback: false,
      hasTopology: false,
      nodesType: null,
      linksType: null,
      nodesDetected: 0,
      linksDetected: 0
    };
    try {
      const yamlLib = (typeof jsyaml !== 'undefined' ? jsyaml : (window.jsyaml || null));
      if (yamlLib && yamlLib.load) {
        meta.lib = 'jsyaml';
        const doc = yamlLib.load(text || '');
        if (doc && doc.topology) {
          meta.hasTopology = true;
          const topo = doc.topology || {};
          const rawNodes = topo.nodes || {};
          const rawLinks = topo.links || [];
          meta.nodesType = Array.isArray(rawNodes) ? 'array' : typeof rawNodes;
          meta.linksType = Array.isArray(rawLinks) ? 'array' : typeof rawLinks;

          if (Array.isArray(rawNodes)) {
            parsed.nodes = rawNodes.map(function (n, idx) {
              const item = n || {};
              return {
                name: item.name || 'node-' + (idx + 1),
                kind: item.kind || '',
                image: item.image || '',
                mgmt: item['mgmt-ipv4'] || item.mgmt || ''
              };
            });
          } else if (rawNodes && typeof rawNodes === 'object') {
            parsed.nodes = Object.keys(rawNodes).map(function (k) {
              const n = rawNodes[k] || {};
              return { name: k, kind: n.kind || '', image: n.image || '', mgmt: n['mgmt-ipv4'] || n.mgmt || '' };
            });
          }

          parsed.links = Array.isArray(rawLinks) ? rawLinks.map(function (l, idx) {
            const link = l || {};
            return { endpoints: Array.isArray(link.endpoints) ? link.endpoints : [], name: link.name || 'link-' + (idx + 1) };
          }) : [];
        } else {
          parsed.error = 'no_topology_section';
        }
      } else {
        parsed.error = 'missing_yaml_lib';
      }
    } catch (err) {
      parsed.error = err && err.message ? err.message : 'yaml_parse_error';
    }

    if ((!parsed.nodes.length && !parsed.links.length) && (!parsed.error || parsed.error === 'no_topology_section')) {
      const fb = parseTopologyFallback(text);
      parsed.nodes = fb.nodes;
      parsed.links = fb.links;
      meta.usedFallback = true;
      if (!parsed.error) parsed.error = fb.fallback ? 'parsed_with_fallback' : parsed.error;
    }

    meta.nodesDetected = parsed.nodes.length;
    meta.linksDetected = parsed.links.length;
    parsed.meta = meta;
    return parsed;
  }

  function showTopologyModal(labName, path, topology) {
    const overlay = document.createElement('div');
    overlay.className = 'lab-editor-modal';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(15,23,42,0.55)';
    overlay.style.backdropFilter = 'blur(3px)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';
    overlay.style.padding = '18px';

    const modal = document.createElement('div');
    modal.style.width = '90%';
    modal.style.maxWidth = '1080px';
    modal.style.maxHeight = '90vh';
    modal.style.background = 'rgba(10,14,26,0.95)';
    modal.style.border = '1px solid rgba(56,189,248,0.3)';
    modal.style.borderRadius = '12px';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    modal.style.boxShadow = '0 25px 60px rgba(0,0,0,0.45)';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '12px 14px';
    header.style.borderBottom = '1px solid rgba(56,189,248,0.18)';

    const title = document.createElement('div');
    title.style.display = 'flex';
    title.style.flexDirection = 'column';
    title.style.gap = '3px';

    const titleMain = document.createElement('div');
    titleMain.style.fontSize = '15px';
    titleMain.style.fontWeight = '600';
    titleMain.style.color = '#e5e7eb';
    titleMain.textContent = 'Topology';

    const titlePath = document.createElement('div');
    titlePath.style.fontSize = '12px';
    titlePath.style.color = '#cbd5e1';
    titlePath.textContent = (labName ? labName + ' / ' : '') + (path || '');

    title.appendChild(titleMain);
    title.appendChild(titlePath);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.style.background = 'transparent';
    closeBtn.style.color = '#cbd5e1';
    closeBtn.style.border = '1px solid rgba(248,113,113,0.4)';
    closeBtn.style.borderRadius = '8px';
    closeBtn.style.padding = '4px 10px';
    closeBtn.style.cursor = 'pointer';

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.style.flex = '1';
    body.style.padding = '12px';
    body.style.overflow = 'auto';

    const debugCard = document.createElement('div');
    debugCard.style.background = 'rgba(15,23,42,0.85)';
    debugCard.style.border = '1px solid rgba(56,189,248,0.15)';
    debugCard.style.borderRadius = '10px';
    debugCard.style.padding = '10px';
    debugCard.style.marginBottom = '10px';

    const debugTitle = document.createElement('div');
    debugTitle.style.fontWeight = '600';
    debugTitle.style.color = '#e5e7eb';
    debugTitle.style.marginBottom = '6px';
    debugTitle.textContent = 'Debug';

    const debugPre = document.createElement('pre');
    debugPre.style.margin = '0';
    debugPre.style.fontSize = '11px';
    debugPre.style.color = '#94a3b8';
    debugPre.style.whiteSpace = 'pre-wrap';
    debugPre.textContent = JSON.stringify((topology && topology.meta) || {}, null, 2);

    debugCard.appendChild(debugTitle);
    debugCard.appendChild(debugPre);

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr';
    grid.style.gap = '12px';

    const nodesCard = document.createElement('div');
    nodesCard.style.background = 'rgba(15,23,42,0.85)';
    nodesCard.style.border = '1px solid rgba(56,189,248,0.15)';
    nodesCard.style.borderRadius = '10px';
    nodesCard.style.padding = '10px';

    const nodesTitle = document.createElement('div');
    nodesTitle.style.fontWeight = '600';
    nodesTitle.style.color = '#e5e7eb';
    nodesTitle.style.marginBottom = '6px';
    nodesTitle.textContent = 'Nodes (' + (topology.nodes.length || 0) + ')';

    const nodesList = document.createElement('div');
    nodesList.style.display = 'grid';
    nodesList.style.gridTemplateColumns = '1fr';
    nodesList.style.gap = '6px';

    topology.nodes.forEach(function (n) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.flexDirection = 'column';
      row.style.border = '1px solid rgba(56,189,248,0.12)';
      row.style.borderRadius = '8px';
      row.style.padding = '8px';
      row.style.background = 'rgba(12,18,32,0.9)';

      const name = document.createElement('div');
      name.style.fontWeight = '600';
      name.style.color = '#e2e8f0';
      name.textContent = n.name || '(node)';

      const meta = document.createElement('div');
      meta.style.fontSize = '12px';
      meta.style.color = '#cbd5e1';
      meta.textContent = [n.kind || '', n.image || '', n.mgmt || ''].filter(Boolean).join(' · ');

      row.appendChild(name);
      row.appendChild(meta);
      nodesList.appendChild(row);
    });

    nodesCard.appendChild(nodesTitle);
    nodesCard.appendChild(nodesList);

    const linksCard = document.createElement('div');
    linksCard.style.background = 'rgba(15,23,42,0.85)';
    linksCard.style.border = '1px solid rgba(56,189,248,0.15)';
    linksCard.style.borderRadius = '10px';
    linksCard.style.padding = '10px';

    const linksTitle = document.createElement('div');
    linksTitle.style.fontWeight = '600';
    linksTitle.style.color = '#e5e7eb';
    linksTitle.style.marginBottom = '6px';
    linksTitle.textContent = 'Links (' + (topology.links.length || 0) + ')';

    const linksList = document.createElement('div');
    linksList.style.display = 'grid';
    linksList.style.gridTemplateColumns = '1fr';
    linksList.style.gap = '6px';

    topology.links.forEach(function (l) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.flexDirection = 'column';
      row.style.border = '1px solid rgba(56,189,248,0.12)';
      row.style.borderRadius = '8px';
      row.style.padding = '8px';
      row.style.background = 'rgba(12,18,32,0.9)';

      const ep = document.createElement('div');
      ep.style.fontWeight = '600';
      ep.style.color = '#e2e8f0';
      ep.textContent = (l.endpoints && l.endpoints.join('  ⟷  ')) || 'link';

      row.appendChild(ep);
      linksList.appendChild(row);
    });

    linksCard.appendChild(linksTitle);
    linksCard.appendChild(linksList);

    grid.appendChild(nodesCard);
    grid.appendChild(linksCard);

    body.appendChild(debugCard);
    body.appendChild(grid);

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function close() {
      overlay.remove();
    }

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', function esc(ev) {
      if (ev.key === 'Escape') {
        close();
        document.removeEventListener('keydown', esc);
      }
    });
  }

  function openTopologyFromFile(labName, path) {
    const creds = getCommonCreds();
    if (!creds.eve_ip || !creds.eve_user || !creds.eve_pass) {
      showMessage('error', t('container_labs.missing_creds'));
      return;
    }

    try {
      sessionStorage.setItem('clabCreds', JSON.stringify(creds));
      if (dirInput && dirInput.value) {
        sessionStorage.setItem('clabLabsDir', dirInput.value.trim());
      } else {
        sessionStorage.removeItem('clabLabsDir');
      }
    } catch (e) {
      // ignore storage failures
    }

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(15,23,42,0.6)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';
    overlay.style.padding = '18px';

    const modal = document.createElement('div');
    modal.style.width = '96%';
    modal.style.maxWidth = '1400px';
    modal.style.height = '90vh';
    modal.style.background = 'rgba(10,14,26,0.98)';
    modal.style.border = '1px solid rgba(56,189,248,0.3)';
    modal.style.borderRadius = '12px';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    modal.style.boxShadow = '0 25px 60px rgba(0,0,0,0.45)';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '10px 14px';
    header.style.borderBottom = '1px solid rgba(56,189,248,0.18)';

    const title = document.createElement('div');
    title.style.display = 'flex';
    title.style.flexDirection = 'column';
    title.style.gap = '2px';

    const titleMain = document.createElement('div');
    titleMain.style.fontSize = '15px';
    titleMain.style.fontWeight = '600';
    titleMain.style.color = '#e5e7eb';
    titleMain.textContent = 'Topology';

    const titlePath = document.createElement('div');
    titlePath.style.fontSize = '12px';
    titlePath.style.color = '#cbd5e1';
    titlePath.textContent = (labName ? labName + ' / ' : '') + (path || '');

    title.appendChild(titleMain);
    title.appendChild(titlePath);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.style.background = 'transparent';
    closeBtn.style.color = '#cbd5e1';
    closeBtn.style.border = '1px solid rgba(248,113,113,0.4)';
    closeBtn.style.borderRadius = '8px';
    closeBtn.style.padding = '4px 10px';
    closeBtn.style.cursor = 'pointer';

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.style.flex = '1';
    body.style.padding = '8px';
    body.style.overflow = 'hidden';

    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0';
    iframe.style.borderRadius = '10px';
    iframe.src = '/topoviewer.html?lab=' + encodeURIComponent(labName || '') + '&file=' + encodeURIComponent(path || '');

    body.appendChild(iframe);
    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function close() {
      overlay.remove();
    }

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', function esc(ev) {
      if (ev.key === 'Escape') {
        close();
        document.removeEventListener('keydown', esc);
      }
    });
  }

  function renderList(items) {
    listEl.innerHTML = '';
    currentLabs = Array.isArray(items) ? items.slice() : [];
    const query = (filterInput && filterInput.value || '').trim().toLowerCase();
    const searching = false; // search only by lab name now
    const arr = query
      ? currentLabs.filter(function (lab) {
        return (lab || '').toLowerCase().indexOf(query) !== -1;
      })
      : currentLabs;

    if (!arr.length) {
      const empty = document.createElement('div');
      empty.className = 'images-empty';
      empty.textContent = t('ui.labs.none');
      listEl.appendChild(empty);
    } else {
      arr.forEach(function (lab) {
        const row = document.createElement('div');
        row.className = 'vrnetlab-image-row';
        row.style.flexDirection = 'column';
        row.style.alignItems = 'flex-start';

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.width = '100%';

        const name = document.createElement('span');
        name.className = 'vrnetlab-image-name';
        name.textContent = lab || t('ui.labs.unnamed');

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.textContent = '+';
        toggleBtn.style.background = 'transparent';
        toggleBtn.style.border = '1px solid rgba(56,189,248,0.3)';
        toggleBtn.style.color = '#e5e7eb';
        toggleBtn.style.cursor = 'pointer';
        toggleBtn.style.borderRadius = '6px';
        toggleBtn.style.padding = '2px 8px';
        toggleBtn.title = t('ui.labs.expand');

        header.appendChild(name);
        header.appendChild(toggleBtn);

        const filesWrap = document.createElement('div');
        filesWrap.style.marginTop = '6px';
        filesWrap.style.display = 'none';
        filesWrap.dataset.lab = lab;

        toggleBtn.addEventListener('click', function () {
          const isVisible = filesWrap.style.display !== 'none';
          if (isVisible) {
            filesWrap.style.display = 'none';
            toggleBtn.textContent = '+';
          } else {
            filesWrap.style.display = 'block';
            toggleBtn.textContent = '−';
            loadLabFiles(lab, filesWrap, toggleBtn, false);
          }
        });

        row.appendChild(header);
        row.appendChild(filesWrap);
        listEl.appendChild(row);

      });
    }

    countEl.textContent = t('ui.labs.count', { count: arr.length });
  }

  function requestLabs(options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      const creds = getCommonCreds();
      if (!creds.eve_ip || !creds.eve_user || !creds.eve_pass) {
        if (!options.skipMessage) {
          showMessage('error', t('container_labs.missing_creds'));
        }
        return reject(new Error('missing_credentials'));
      }

      const formData = new FormData();
      formData.append('eve_ip', creds.eve_ip);
      formData.append('eve_user', creds.eve_user);
      formData.append('eve_pass', creds.eve_pass);
      if (dirInput && dirInput.value) {
        formData.append('labs_dir', dirInput.value.trim());
      }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/container-labs/list', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      setLangHeader(xhr);

      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;

        if (xhr.status === 0) {
          if (!options.skipMessage) showMessage('error', t('msg.networkError'));
          return reject(new Error('network_error'));
        }

        let resp = null;
        try {
          resp = JSON.parse(xhr.responseText || '{}');
        } catch (err) {
          if (!options.skipMessage) showMessage('error', t('msg.parseError'));
          return reject(err);
        }

        if (!resp || typeof resp !== 'object') {
          if (!options.skipMessage) showMessage('error', t('msg.parseError'));
          return reject(new Error('invalid_response'));
        }

        const missingDir = resp && resp.missing_dir;
        if (resp.message && (!options.skipMessage || missingDir)) {
          showMessage(resp.success === false ? 'error' : 'success', resp.message);
        }

        if (missingDir) {
          setCreateVisible(true);
          resolve(resp);
          return;
        }

        if (resp.success === false) {
          return reject(new Error('list_failed'));
        }

        resolve(resp);
      };

      xhr.onerror = function () {
        if (!options.skipMessage) showMessage('error', t('msg.networkError'));
        reject(new Error('network_error'));
      };

      xhr.send(formData);
    });
  }

  function handleLoad() {
    resetLabCache();
    setLoading(true);
    requestLabs({ skipMessage: false })
      .then(function (resp) {
        if (resp && resp.missing_dir) {
          renderList([]);
          setCreateVisible(true);
          return;
        }
        renderList(resp.labs || []);
        setCreateVisible(false);
        prefetchLabFiles(resp.labs || []);
      })
      .catch(function () {
        // mensagem já exibida
      })
      .finally(function () {
        setLoading(false);
      });
  }

  function handleCreate() {
    if (!(createBtn instanceof HTMLButtonElement)) return;
    createBtn.disabled = true;
    createBtn.classList.add('btn-disabled');
    const label = createBtn.querySelector('[data-i18n="ui.labs.createBtn"]') || createBtn;
    label.textContent = t('ui.labs.createLoading');
    setBodyLoading(true);

    const creds = getCommonCreds();
    if (!creds.eve_ip || !creds.eve_user || !creds.eve_pass) {
      showMessage('error', t('container_labs.missing_creds'));
      setBodyLoading(false);
      setCreateVisible(true);
      if (label) label.textContent = t('ui.labs.createBtn');
      return;
    }

    const formData = new FormData();
    formData.append('eve_ip', creds.eve_ip);
    formData.append('eve_user', creds.eve_user);
    formData.append('eve_pass', creds.eve_pass);
    if (dirInput && dirInput.value) {
      formData.append('labs_dir', dirInput.value.trim());
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/container-labs/create', true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    setLangHeader(xhr);

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;

      let resp = null;
      try {
        resp = JSON.parse(xhr.responseText || '{}');
      } catch (err) {
        showMessage('error', t('msg.parseError'));
        finishCreate();
        return;
      }

      if (resp && resp.message) {
        showMessage(resp.success === false ? 'error' : 'success', resp.message);
      }

      if (resp && resp.success === false) {
        finishCreate();
        return;
      }

      requestLabs({ skipMessage: true, auto: true })
        .then(function (r) {
          renderList((r && r.labs) || []);
          prefetchLabFiles((r && r.labs) || []);
        })
        .finally(finishCreate);
    };

    xhr.onerror = function () {
      showMessage('error', t('msg.networkError'));
      finishCreate();
    };

    xhr.send(formData);

    function finishCreate() {
      setBodyLoading(false);
      if (createBtn) {
        createBtn.disabled = false;
        createBtn.classList.remove('btn-disabled');
      }
      if (label) label.textContent = t('ui.labs.createBtn');
    }
  }

  function prefetchLabFiles(labs) {
    if (!Array.isArray(labs)) return;
    labs.forEach(function (lab) {
      requestLabFiles(lab)
        .then(function () {
          renderList(currentLabs);
        })
        .catch(function () {});
    });
  }

  function prefetchMissingLabs() {
    const missing = currentLabs.filter(function (lab) {
      return !labFilesCache[lab] && !labFetching[lab];
    });
    if (!missing.length) return Promise.resolve();
    setBodyLoading(true);
    return Promise.all(missing.map(function (lab) {
      return requestLabFiles(lab).catch(function () {});
    })).finally(function () {
      setBodyLoading(false);
      renderList(currentLabs);
    });
  }

  loadBtn.addEventListener('click', handleLoad);
  if (createBtn) createBtn.addEventListener('click', handleCreate);
  if (filterInput) {
    filterInput.addEventListener('input', function () {
      const query = (filterInput.value || '').trim();
      if (query) {
        prefetchMissingLabs().finally(function () {
          renderList(currentLabs);
        });
      } else {
        renderList(currentLabs);
      }
    });
  }

  window.NetConfigApp = window.NetConfigApp || {};
  window.NetConfigApp.loadContainerLabs = function (options) {
    const opts = options || {};
    if (opts.auto !== true) {
      return requestLabs(opts);
    }
    resetLabCache();
    setLoading(true);
    return requestLabs(opts)
      .then(function (resp) {
        if (resp && resp.missing_dir) {
          renderList([]);
          setCreateVisible(true);
          return resp;
        }
        renderList((resp && resp.labs) || []);
        setCreateVisible(false);
        prefetchLabFiles((resp && resp.labs) || []);
        return resp;
      })
      .catch(function (err) {
        return Promise.reject(err);
      })
      .finally(function () {
        setLoading(false);
      });
  };
});
