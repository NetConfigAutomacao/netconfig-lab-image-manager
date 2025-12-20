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

  function renderFileTree(lab, files, target) {
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
      row.style.display = depth === 0 ? 'flex' : 'none';
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
      row.dataset.expanded = 'false';

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
        dirBtn.textContent = '+';
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
      }

      row.appendChild(actions);
      target.appendChild(row);
      rows.push(row);
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

  function loadLabFiles(labName, container, toggleBtn) {
    if (!labName) return;
    container.innerHTML = t('ui.labs.loading');
    requestLabFiles(labName)
      .then(function (files) {
        renderFileTree(labName, files || [], container);
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
    const editor = document.createElement('div');
    editor.style.marginTop = '8px';
    editor.style.width = '100%';
    editor.className = 'lab-editor';

    const textarea = document.createElement('textarea');
    textarea.style.width = '100%';
    textarea.style.minHeight = '160px';
    textarea.value = content || '';

    const buttons = document.createElement('div');
    buttons.style.display = 'flex';
    buttons.style.gap = '8px';
    buttons.style.marginTop = '6px';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn-primary';
    saveBtn.textContent = t('ui.labs.saveBtn') || 'Salvar';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = t('ui.labs.cancelBtn') || 'Cancelar';

    buttons.appendChild(saveBtn);
    buttons.appendChild(cancelBtn);
    editor.appendChild(textarea);
    editor.appendChild(buttons);

    const existing = rowEl.querySelector('.lab-editor');
    if (existing) existing.remove();
    rowEl.appendChild(editor);

    cancelBtn.addEventListener('click', function () {
      editor.remove();
    });

    saveBtn.addEventListener('click', function () {
      saveLabFile(labName, path, textarea.value, editor);
    });
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

  function renderList(items) {
    listEl.innerHTML = '';
    currentLabs = Array.isArray(items) ? items.slice() : [];
    const query = (filterInput && filterInput.value || '').trim().toLowerCase();
    const arr = query
      ? currentLabs.filter(function (lab) {
        const nameMatch = (lab || '').toLowerCase().indexOf(query) !== -1;
        const files = labFilesCache[lab] || [];
        const fileMatch = files.some(function (f) { return (f.path || '').toLowerCase().indexOf(query) !== -1; });
        return nameMatch || fileMatch;
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
            loadLabFiles(lab, filesWrap, toggleBtn);
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

  loadBtn.addEventListener('click', handleLoad);
  if (createBtn) createBtn.addEventListener('click', handleCreate);
  if (filterInput) {
    filterInput.addEventListener('input', function () {
      renderList(currentLabs);
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
