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
          topoBtn.textContent = t('ui.topo.viewBtn');
          topoBtn.addEventListener('click', function () {
            toggleInlineTopology(lab, entry.path, row, topoBtn);
          });
          actions.appendChild(topoBtn);

          const deployBtn = document.createElement('button');
          deployBtn.type = 'button';
          deployBtn.className = 'btn-secondary';
          deployBtn.style.padding = '3px 8px';
          deployBtn.style.fontSize = '11px';
          deployBtn.textContent = t('ui.labs.deployBtn');
          deployBtn.addEventListener('click', function () {
            runLabAction('deploy', lab, entry.path, deployBtn);
          });
          actions.appendChild(deployBtn);

          const destroyBtn = document.createElement('button');
          destroyBtn.type = 'button';
          destroyBtn.className = 'pill-action';
          destroyBtn.style.padding = '3px 8px';
          destroyBtn.style.fontSize = '11px';
          destroyBtn.textContent = t('ui.labs.destroyBtn');
          destroyBtn.addEventListener('click', function () {
            runLabAction('destroy', lab, entry.path, destroyBtn);
          });
          actions.appendChild(destroyBtn);

          const statusBtn = document.createElement('button');
          statusBtn.type = 'button';
          statusBtn.className = 'btn-secondary';
          statusBtn.style.padding = '3px 8px';
          statusBtn.style.fontSize = '11px';
          statusBtn.textContent = t('ui.labs.statusBtn');
          statusBtn.addEventListener('click', function () {
            openLabStatus(lab, entry.path, statusBtn);
          });
          actions.appendChild(statusBtn);
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

    // Toolbar com contadores (estilo TopoViewer do handoff).
    const toolbar = document.createElement('div');
    toolbar.style.display = 'flex';
    toolbar.style.alignItems = 'center';
    toolbar.style.justifyContent = 'space-between';
    toolbar.style.gap = '10px';
    toolbar.style.marginBottom = '10px';

    const toolbarTitle = document.createElement('div');
    toolbarTitle.style.fontWeight = '700';
    toolbarTitle.style.color = '#e5e7eb';
    toolbarTitle.style.fontSize = '13px';
    toolbarTitle.textContent = t('ui.topo.canvasTitle');

    const counter = document.createElement('div');
    counter.style.fontSize = '12px';
    counter.style.color = '#9fb2cf';
    counter.style.fontFamily = "'IBM Plex Mono', ui-monospace, monospace";
    counter.textContent = t('ui.topo.counter', {
      nodes: topology.nodes.length || 0,
      links: topology.links.length || 0
    });

    toolbar.appendChild(toolbarTitle);
    toolbar.appendChild(counter);

    // Canvas de grafo: grade pontilhada + arestas SVG + nós posicionados.
    const canvasWrap = document.createElement('div');
    canvasWrap.style.position = 'relative';
    canvasWrap.style.height = '460px';
    canvasWrap.style.marginBottom = '12px';
    canvasWrap.style.borderRadius = '12px';
    canvasWrap.style.border = '1px solid rgba(56,189,248,0.15)';
    canvasWrap.style.overflow = 'hidden';
    canvasWrap.style.background =
      'radial-gradient(circle at 1px 1px, rgba(42,60,94,0.7) 1px, transparent 0)';
    canvasWrap.style.backgroundSize = '22px 22px';
    canvasWrap.style.backgroundColor = 'rgba(7,11,21,0.6)';

    (function renderGraph() {
      const W = 1000, H = 460;
      const nodes = topology.nodes || [];
      const links = topology.links || [];
      const n = nodes.length;

      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.style.position = 'absolute';
      svg.style.inset = '0';
      svg.style.width = '100%';
      svg.style.height = '100%';

      // Posições: 1 nó = centro; 2 = lado a lado; senão círculo.
      const pos = {};
      const cx = W / 2, cy = H / 2;
      const R = Math.max(120, Math.min(W, H) / 2 - 120);
      nodes.forEach(function (node, i) {
        var x, y;
        if (n === 1) { x = cx; y = cy; }
        else if (n === 2) { x = cx + (i === 0 ? -R : R); y = cy; }
        else {
          const ang = (2 * Math.PI * i) / n - Math.PI / 2;
          x = cx + R * Math.cos(ang);
          y = cy + R * Math.sin(ang);
        }
        pos[node.name] = { x: x, y: y };
      });

      function endpointNode(ep) {
        return String(ep || '').split(':')[0].trim();
      }

      links.forEach(function (l) {
        const eps = l.endpoints || [];
        if (eps.length < 2) return;
        const a = pos[endpointNode(eps[0])];
        const b = pos[endpointNode(eps[1])];
        if (!a || !b) return;
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
        line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
        line.setAttribute('stroke', 'rgba(56,189,248,0.55)');
        line.setAttribute('stroke-width', '2');
        svg.appendChild(line);
      });
      canvasWrap.appendChild(svg);

      nodes.forEach(function (node) {
        const p = pos[node.name] || { x: cx, y: cy };
        const card = document.createElement('div');
        card.style.position = 'absolute';
        card.style.left = (p.x / W * 100) + '%';
        card.style.top = (p.y / H * 100) + '%';
        card.style.transform = 'translate(-50%, -50%)';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'center';
        card.style.gap = '4px';
        card.style.minWidth = '92px';
        card.style.padding = '10px 12px';
        card.style.borderRadius = '12px';
        card.style.background = 'linear-gradient(180deg, rgba(17,29,51,0.97), rgba(13,22,38,0.97))';
        card.style.border = '1px solid rgba(56,189,248,0.4)';
        card.style.boxShadow = '0 10px 26px -12px rgba(0,0,0,0.8)';

        const ico = document.createElementNS(NS, 'svg');
        ico.setAttribute('width', '20'); ico.setAttribute('height', '20');
        ico.setAttribute('viewBox', '0 0 24 24'); ico.setAttribute('fill', 'none');
        ico.setAttribute('stroke', '#38bdf8'); ico.setAttribute('stroke-width', '2');
        const r1 = document.createElementNS(NS, 'rect');
        r1.setAttribute('x', '3'); r1.setAttribute('y', '7'); r1.setAttribute('width', '18'); r1.setAttribute('height', '10'); r1.setAttribute('rx', '2');
        const l1 = document.createElementNS(NS, 'path');
        l1.setAttribute('d', 'M7 12h.01M11 12h.01M15 12h.01');
        ico.appendChild(r1); ico.appendChild(l1);

        const nm = document.createElement('div');
        nm.style.fontFamily = "'IBM Plex Mono', ui-monospace, monospace";
        nm.style.fontSize = '12px'; nm.style.fontWeight = '600'; nm.style.color = '#e7eef9';
        nm.textContent = node.name || '(node)';

        const kd = document.createElement('div');
        kd.style.fontSize = '10px'; kd.style.color = '#9fb2cf';
        kd.textContent = node.kind || '';

        card.appendChild(ico);
        card.appendChild(nm);
        if (node.kind) card.appendChild(kd);
        canvasWrap.appendChild(card);
      });

      if (!n) {
        const empty = document.createElement('div');
        empty.style.position = 'absolute'; empty.style.inset = '0';
        empty.style.display = 'flex'; empty.style.alignItems = 'center'; empty.style.justifyContent = 'center';
        empty.style.color = '#697f9f'; empty.style.fontSize = '13px';
        empty.textContent = t('ui.topo.empty');
        canvasWrap.appendChild(empty);
      }
    })();

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

    body.appendChild(toolbar);
    body.appendChild(canvasWrap);
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

  function showOutputModal(title, opts) {
    opts = opts || {};
    const subtitle = opts.subtitle || '';

    const overlay = document.createElement('div');
    overlay.className = 'lab-editor-modal io-overlay';

    const modal = document.createElement('div');
    modal.className = 'io-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'io-head';
    const htext = document.createElement('div');
    htext.style.minWidth = '0';
    const h = document.createElement('div');
    h.className = 'io-title';
    h.textContent = title;
    htext.appendChild(h);
    if (subtitle) {
      const sub = document.createElement('div');
      sub.className = 'io-sub mono';
      sub.textContent = subtitle;
      htext.appendChild(sub);
    }
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn-ghost';
    closeBtn.style.cssText = 'padding:4px 12px';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', function () { overlay.remove(); });
    header.appendChild(htext);
    header.appendChild(closeBtn);

    // Status row
    const status = document.createElement('div');
    status.className = 'io-status is-running';
    const spin = document.createElement('span');
    spin.className = 'io-status-ico';
    const statusText = document.createElement('span');
    statusText.className = 'io-status-text';
    statusText.textContent = opts.statusText || t('ui.labs.actionRunning');
    status.appendChild(spin);
    status.appendChild(statusText);

    // Log
    const pre = document.createElement('pre');
    pre.className = 'io-log';
    pre.textContent = opts.initialText || '';

    // Footer
    const foot = document.createElement('div');
    foot.className = 'io-foot';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn-ghost';
    copyBtn.style.cssText = 'padding:6px 14px;font-size:12px';
    copyBtn.textContent = t('ui.labs.copyLog');
    copyBtn.addEventListener('click', function () {
      const text = pre.textContent || '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { showMessage('success', t('ui.labs.copied')); }, function () {});
      }
    });
    const extraWrap = document.createElement('div');
    extraWrap.style.cssText = 'display:flex;gap:8px';
    foot.appendChild(copyBtn);
    foot.appendChild(extraWrap);

    modal.appendChild(header);
    modal.appendChild(status);
    modal.appendChild(pre);
    modal.appendChild(foot);
    overlay.appendChild(modal);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    function setState(state, msg) {
      status.classList.remove('is-running', 'is-ok', 'is-error');
      status.classList.add(state === 'ok' ? 'is-ok' : state === 'error' ? 'is-error' : 'is-running');
      if (msg) statusText.textContent = msg;
      else statusText.textContent = state === 'ok' ? t('ui.labs.actionDone') : state === 'error' ? t('ui.labs.actionFail') : t('ui.labs.actionRunning');
    }
    function addAction(label, onClick, primary) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = primary ? 'btn-primary' : 'btn-ghost';
      b.style.cssText = 'padding:6px 14px;font-size:12px';
      b.textContent = label;
      b.addEventListener('click', onClick);
      extraWrap.appendChild(b);
      return b;
    }

    return {
      setText: function (txt) { pre.textContent = txt; pre.scrollTop = pre.scrollHeight; },
      setState: setState,
      addAction: addAction,
      close: function () { overlay.remove(); }
    };
  }

  function runLabAction(action, labName, relPath, btn) {
    const creds = getCommonCreds();
    if (!creds.eve_ip || !creds.eve_user || !creds.eve_pass) {
      showMessage('error', t('container_labs.missing_creds'));
      return;
    }
    const confirmKey = action === 'destroy' ? 'ui.labs.destroyConfirm' : 'ui.labs.deployConfirm';
    if (!window.confirm(t(confirmKey, { lab: labName }))) return;

    const titleKey = action === 'destroy' ? 'ui.labs.destroyTitle' : 'ui.labs.deployTitle';
    const runningKey = action === 'destroy' ? 'ui.labs.destroyRunning' : 'ui.labs.deployRunning';
    const out = showOutputModal(t(titleKey, { lab: labName }), {
      subtitle: labName + ' / ' + relPath,
      statusText: t(runningKey),
      initialText: '$ containerlab ' + action + ' -t ' + relPath + '\n\n' + t('ui.labs.actionRunning')
    });

    if (btn instanceof HTMLButtonElement) { btn.disabled = true; btn.classList.add('btn-disabled'); }
    setBodyLoading(true);

    const fd = new FormData();
    fd.append('eve_ip', creds.eve_ip);
    fd.append('eve_user', creds.eve_user);
    fd.append('eve_pass', creds.eve_pass);
    fd.append('lab_name', labName);
    fd.append('path', relPath);
    if (dirInput && dirInput.value) fd.append('labs_dir', dirInput.value.trim());

    function finishBtn() {
      setBodyLoading(false);
      if (btn instanceof HTMLButtonElement) { btn.disabled = false; btn.classList.remove('btn-disabled'); }
    }

    // Inicia o job assíncrono e faz polling do log ao vivo.
    const startXhr = new XMLHttpRequest();
    startXhr.open('POST', '/api/container-labs/' + action + '_async', true);
    startXhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    setLangHeader(startXhr);
    startXhr.onreadystatechange = function () {
      if (startXhr.readyState !== 4) return;
      let resp = null;
      try { resp = JSON.parse(startXhr.responseText || '{}'); } catch (e) {
        finishBtn(); out.setState('error'); out.setText(t('msg.parseError')); return;
      }
      if (!resp.success || !resp.job_id) {
        finishBtn(); out.setState('error', resp.message || t('ui.labs.actionFail'));
        showMessage('error', resp.message || t('ui.labs.actionFail')); return;
      }
      pollJob(resp.job_id);
    };
    startXhr.onerror = function () { finishBtn(); out.setState('error'); out.setText(t('msg.networkError')); };
    startXhr.send(fd);

    function pollJob(jobId) {
      const px = new XMLHttpRequest();
      px.open('GET', '/api/container-labs/job?job_id=' + encodeURIComponent(jobId), true);
      px.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      setLangHeader(px);
      px.onreadystatechange = function () {
        if (px.readyState !== 4) return;
        let j = null;
        try { j = JSON.parse(px.responseText || '{}'); } catch (e) { setTimeout(function () { pollJob(jobId); }, 1500); return; }
        if (j.log != null) out.setText(j.log || t('ui.labs.actionRunning'));
        if (!j.done) { setTimeout(function () { pollJob(jobId); }, 1500); return; }
        finishBtn();
        if (j.status === 'success') {
          out.setState('ok', t('ui.labs.actionDone'));
          if (action === 'deploy') out.addAction(t('ui.labs.viewStatusBtn'), function () { out.close(); openLabStatus(labName, relPath, null); }, true);
          showMessage('success', t('ui.labs.actionDone'));
        } else {
          out.setState('error', t('ui.labs.actionFail'));
          showMessage('error', t('ui.labs.actionFail'));
        }
      };
      px.onerror = function () { setTimeout(function () { pollJob(jobId); }, 2000); };
      px.send(null);
    }
  }

  function toggleInlineTopology(lab, path, row, btn) {
    // Painel inline logo após a linha do arquivo.
    const existing = row.nextSibling;
    if (existing && existing.classList && existing.classList.contains('topo-inline')) {
      existing.remove();
      if (btn) btn.classList.remove('active');
      return;
    }
    const panel = document.createElement('div');
    panel.className = 'topo-inline';
    if (row.parentNode) {
      row.parentNode.insertBefore(panel, row.nextSibling);
    }
    if (btn) btn.classList.add('active');
    const labsDir = (dirInput && dirInput.value) ? dirInput.value.trim() : '';
    if (window.NetConfigTopology) {
      window.NetConfigTopology.mount(panel, { lab: lab, path: path, labsDir: labsDir });
    } else {
      panel.textContent = 'Topology editor unavailable.';
    }
  }

  function nodeRequest(endpoint, container, extra) {
    const creds = getCommonCreds();
    const fd = new FormData();
    fd.append('eve_ip', creds.eve_ip);
    fd.append('eve_user', creds.eve_user);
    fd.append('eve_pass', creds.eve_pass);
    fd.append('container', container);
    if (extra) Object.keys(extra).forEach(function (k) { fd.append(k, extra[k]); });
    return new Promise(function (resolve, reject) {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/container-labs/' + endpoint, true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      setLangHeader(xhr);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        try { resolve(JSON.parse(xhr.responseText || '{}')); }
        catch (e) { reject(e); }
      };
      xhr.onerror = function () { reject(new Error('network')); };
      xhr.send(fd);
    });
  }

  function viewNodeLogs(container) {
    const out = showOutputModal(t('ui.labs.logsTitle', { node: container }), { subtitle: container });
    nodeRequest('node/logs', container).then(function (resp) {
      out.setState(resp.success === false ? 'error' : 'ok');
      out.setText(resp.logs || resp.message || '(vazio)');
    }).catch(function () { out.setState('error'); out.setText(t('msg.networkError')); });
  }

  function execNodeCommand(container) {
    const command = window.prompt(t('ui.labs.execPrompt', { node: container }), 'ip -br addr');
    if (command === null) return;
    const cmd = (command || '').trim();
    if (!cmd) return;
    const out = showOutputModal(t('ui.labs.execTitle', { node: container }), { subtitle: container, initialText: '$ ' + cmd + '\n\n' + t('ui.labs.actionRunning') });
    nodeRequest('node/exec', container, { command: cmd }).then(function (resp) {
      out.setState(resp.success === false ? 'error' : 'ok');
      out.setText('$ ' + cmd + '\n\n' + (resp.output || resp.message || ''));
    }).catch(function () { out.setState('error'); out.setText('$ ' + cmd + '\n\n' + t('msg.networkError')); });
  }

  function openLabStatus(labName, relPath, btn) {
    const creds = getCommonCreds();
    if (!creds.eve_ip || !creds.eve_user || !creds.eve_pass) {
      showMessage('error', t('container_labs.missing_creds'));
      return;
    }
    if (btn instanceof HTMLButtonElement) { btn.disabled = true; btn.classList.add('btn-disabled'); }
    setBodyLoading(true);

    const fd = new FormData();
    fd.append('eve_ip', creds.eve_ip);
    fd.append('eve_user', creds.eve_user);
    fd.append('eve_pass', creds.eve_pass);
    fd.append('lab_name', labName);
    fd.append('path', relPath);
    if (dirInput && dirInput.value) fd.append('labs_dir', dirInput.value.trim());

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/container-labs/inspect', true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    setLangHeader(xhr);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      setBodyLoading(false);
      if (btn instanceof HTMLButtonElement) { btn.disabled = false; btn.classList.remove('btn-disabled'); }
      let resp = null;
      try { resp = JSON.parse(xhr.responseText || '{}'); } catch (e) { showMessage('error', t('msg.parseError')); return; }
      if (!resp.success && (!resp.containers || !resp.containers.length)) {
        showMessage('error', resp.message || t('ui.labs.statusFail'));
        return;
      }
      renderStatusModal(labName, resp.containers || []);
    };
    xhr.onerror = function () {
      setBodyLoading(false);
      if (btn instanceof HTMLButtonElement) { btn.disabled = false; btn.classList.remove('btn-disabled'); }
      showMessage('error', t('msg.networkError'));
    };
    xhr.send(fd);
  }

  function renderStatusModal(labName, containers) {
    const overlay = document.createElement('div');
    overlay.className = 'lab-editor-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(7,11,21,0.72);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:18px';
    const modal = document.createElement('div');
    modal.style.cssText = 'width:94%;max-width:900px;max-height:88vh;background:linear-gradient(180deg,#111d33,#0d1626);border:1px solid #2a3c5e;border-radius:16px;display:flex;flex-direction:column;box-shadow:0 24px 60px -28px rgba(0,0,0,.8)';
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #1e2c49';
    const h = document.createElement('div');
    h.style.cssText = 'font-weight:700;font-size:14px;color:#e7eef9';
    h.textContent = t('ui.labs.statusTitle', { lab: labName });
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button'; closeBtn.className = 'btn-ghost'; closeBtn.style.cssText = 'padding:4px 12px'; closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', function () { overlay.remove(); });
    header.appendChild(h); header.appendChild(closeBtn);

    const bodyEl = document.createElement('div');
    bodyEl.style.cssText = 'flex:1;overflow:auto;padding:14px 16px';

    if (!containers.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = t('ui.labs.statusEmpty');
      bodyEl.appendChild(empty);
    } else {
      containers.forEach(function (c) {
        const row = document.createElement('div');
        row.className = 'vrnetlab-image-row';
        row.style.cssText += ';flex-wrap:wrap;gap:8px';
        const info = document.createElement('div');
        info.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0;flex:1';
        const name = document.createElement('span');
        name.className = 'vrnetlab-image-name';
        name.textContent = c.name || '(node)';
        const meta = document.createElement('span');
        meta.className = 'vrnetlab-image-size';
        meta.textContent = [c.kind, c.state, c.ipv4].filter(Boolean).join(' · ');
        info.appendChild(name); info.appendChild(meta);

        const acts = document.createElement('div');
        acts.style.cssText = 'display:flex;gap:6px';
        const logsBtn = document.createElement('button');
        logsBtn.type = 'button'; logsBtn.className = 'btn-ghost'; logsBtn.style.cssText = 'padding:4px 10px;font-size:11px';
        logsBtn.textContent = t('ui.labs.logsBtn');
        logsBtn.addEventListener('click', function () { viewNodeLogs(c.name); });
        const execBtn = document.createElement('button');
        execBtn.type = 'button'; execBtn.className = 'btn-ghost'; execBtn.style.cssText = 'padding:4px 10px;font-size:11px';
        execBtn.textContent = t('ui.labs.execBtn');
        execBtn.addEventListener('click', function () { execNodeCommand(c.name); });
        if (c.name) { acts.appendChild(logsBtn); acts.appendChild(execBtn); }

        row.appendChild(info); row.appendChild(acts);
        bodyEl.appendChild(row);
      });
    }

    modal.appendChild(header); modal.appendChild(bodyEl);
    overlay.appendChild(modal);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
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

        const nameWrap = document.createElement('span');
        nameWrap.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0';
        const name = document.createElement('span');
        name.className = 'vrnetlab-image-name';
        name.textContent = lab || t('ui.labs.unnamed');
        const runBadge = document.createElement('span');
        runBadge.className = 'lab-run-badge';
        runBadge.dataset.lab = lab;
        runBadge.textContent = t('ui.labs.badgeUnknown');
        nameWrap.appendChild(name);
        nameWrap.appendChild(runBadge);

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

        header.appendChild(nameWrap);
        header.appendChild(toggleBtn);

        const topoWrap = document.createElement('div');
        topoWrap.className = 'lab-auto-topo';

        const filesWrap = document.createElement('div');
        filesWrap.style.marginTop = '6px';
        filesWrap.style.display = 'none';
        filesWrap.dataset.lab = lab;

        // Abre a topologia automaticamente ao expandir o laboratório.
        function autoOpenTopology() {
          if (topoWrap.dataset.loaded === '1') return;
          requestLabFiles(lab).then(function (files) {
            const clab = (files || []).filter(function (f) {
              return f.type === 'file' && /clab\.ya?ml$/i.test(f.path || '');
            })[0];
            if (!clab) return;
            topoWrap.dataset.loaded = '1';
            const labsDir = (dirInput && dirInput.value) ? dirInput.value.trim() : '';
            if (window.NetConfigTopology) {
              window.NetConfigTopology.mount(topoWrap, { lab: lab, path: clab.path, labsDir: labsDir });
            }
          }).catch(function () {});
        }

        toggleBtn.addEventListener('click', function () {
          const isVisible = filesWrap.style.display !== 'none';
          if (isVisible) {
            filesWrap.style.display = 'none';
            topoWrap.style.display = 'none';
            toggleBtn.textContent = '+';
          } else {
            filesWrap.style.display = 'block';
            topoWrap.style.display = 'block';
            toggleBtn.textContent = '−';
            autoOpenTopology();
            loadLabFiles(lab, filesWrap, toggleBtn, false);
          }
        });

        row.appendChild(header);
        row.appendChild(topoWrap);
        row.appendChild(filesWrap);
        listEl.appendChild(row);

      });
    }

    countEl.textContent = t('ui.labs.count', { count: arr.length });
    markRunningLabs();
  }

  // Marca cada lab como rodando/parado via containerlab inspect --all.
  function markRunningLabs() {
    const badges = listEl.querySelectorAll('.lab-run-badge');
    if (!badges.length) return;
    const creds = getCommonCreds();
    if (!creds.eve_ip || !creds.eve_user || !creds.eve_pass) return;
    const fd = new FormData();
    fd.append('eve_ip', creds.eve_ip);
    fd.append('eve_user', creds.eve_user);
    fd.append('eve_pass', creds.eve_pass);
    if (dirInput && dirInput.value) fd.append('labs_dir', dirInput.value.trim());
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/container-labs/inspect', true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    setLangHeader(xhr);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      let resp = null;
      try { resp = JSON.parse(xhr.responseText || '{}'); } catch (e) { return; }
      const running = {};
      ((resp && resp.containers) || []).forEach(function (c) {
        if (!/run/i.test(c.state || '')) return;
        if (c.lab) running[String(c.lab).toLowerCase()] = true;
        const p = c.labPath || '';
        if (p) {
          const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
          if (parts.length >= 2) running[parts[parts.length - 2].toLowerCase()] = true;
        }
      });
      badges.forEach(function (b) {
        const lab = (b.dataset.lab || '').toLowerCase();
        const isUp = !!running[lab];
        b.classList.remove('is-up', 'is-down');
        b.classList.add(isUp ? 'is-up' : 'is-down');
        b.textContent = isUp ? t('ui.labs.badgeRunning') : t('ui.labs.badgeStopped');
      });
    };
    xhr.onerror = function () {};
    xhr.send(fd);
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
    if (listEl) listEl.innerHTML = '<div class="loading-state"><span class="spinner"></span><span>' + t('ui.labs.loading') + '</span></div>';
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
        // mensagem já exibida; limpa o spinner
        renderList([]);
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

  // Exposto para o editor de topologia nativo (P4: runtime no canvas).
  window.NetConfigLabs = {
    viewNodeLogs: viewNodeLogs,
    execNodeCommand: execNodeCommand,
    inspect: function (labName, relPath) {
      const creds = getCommonCreds();
      const fd = new FormData();
      fd.append('eve_ip', creds.eve_ip);
      fd.append('eve_user', creds.eve_user);
      fd.append('eve_pass', creds.eve_pass);
      fd.append('lab_name', labName);
      fd.append('path', relPath);
      if (dirInput && dirInput.value) fd.append('labs_dir', dirInput.value.trim());
      return new Promise(function (resolve, reject) {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/container-labs/inspect', true);
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        setLangHeader(xhr);
        xhr.onreadystatechange = function () { if (xhr.readyState === 4) { try { resolve(JSON.parse(xhr.responseText || '{}')); } catch (e) { reject(e); } } };
        xhr.onerror = function () { reject(new Error('network')); };
        xhr.send(fd);
      });
    }
  };
});
