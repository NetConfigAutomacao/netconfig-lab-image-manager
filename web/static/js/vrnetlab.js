/*
 * This file is part of NetConfig Lab Image Manager.
 *
 * NetConfig Lab Image Manager is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

document.addEventListener('DOMContentLoaded', function () {
  const statusBtn = document.getElementById('vrnetlabStatusBtn');
  const installBtn = document.getElementById('vrnetlabInstallBtn');
  const installHint = document.getElementById('vrnetlabInstallHint');
  const runtimeEl = document.getElementById('vrnetlabRuntime');
  const repoEl = document.getElementById('vrnetlabRepo');
  const imagesList = document.getElementById('vrnetlabImagesList');
  const imagesCount = document.getElementById('vrnetlabImagesCount');

  const app = window.NetConfigApp || {};
  const showMessage = app.showMessage || function () {};
  const getCommonCreds = app.getCommonCreds || function () {
    return { eve_ip: '', eve_user: '', eve_pass: '' };
  };
  const t = app.t || function (key) { return key; };
  const setLangHeader = app.setLanguageHeader || function () {};
  let loadingOps = 0;

  function setBodyLoading(active) {
    if (!document || !document.body) return;
    if (active) {
      loadingOps += 1;
      document.body.classList.add('is-loading');
    } else {
      loadingOps = Math.max(0, loadingOps - 1);
      if (loadingOps === 0) {
        document.body.classList.remove('is-loading');
      }
    }
  }

  if (!statusBtn) {
    return;
  }

  function setLoading(isLoading) {
    if (!(statusBtn instanceof HTMLButtonElement)) {
      return;
    }
    statusBtn.disabled = !!isLoading;
    statusBtn.classList.toggle('btn-disabled', !!isLoading);
    const label = statusBtn.querySelector('[data-i18n="ui.vrnetlab.statusBtn"]') || statusBtn;
    label.textContent = isLoading ? t('ui.vrnetlab.statusLoading') : t('ui.vrnetlab.statusBtn');
  }

  function renderMeta(runtime, repoPath) {
    if (runtimeEl) runtimeEl.textContent = runtime || t('ui.vrnetlab.runtimeMissing');
    if (repoEl) repoEl.textContent = repoPath || t('ui.vrnetlab.repoMissing');

    const repoAvailable = !!repoPath;
    if (installBtn) {
      installBtn.style.display = repoAvailable ? 'none' : '';
      installBtn.disabled = repoAvailable;
      installBtn.classList.toggle('btn-disabled', repoAvailable);
    }
    if (installHint) {
      installHint.style.display = repoAvailable ? 'none' : '';
    }
  }

  function renderImages(images) {
    if (!imagesList) return;
    imagesList.innerHTML = '';
    const arr = Array.isArray(images) ? images : [];

    if (!arr.length) {
      const empty = document.createElement('div');
      empty.className = 'images-empty';
      empty.textContent = t('ui.vrnetlab.imagesEmpty');
      imagesList.appendChild(empty);
    } else {
      arr.forEach(function (img) {
        const row = document.createElement('div');
        row.className = 'vrnetlab-image-row';

        const name = document.createElement('span');
        name.className = 'vrnetlab-image-name';
        let label = (img.repository || '').trim();
        const tag = (img.tag || '').trim();
        if (tag) {
          label = label ? label + ':' + tag : tag;
        }
        name.textContent = label || t('ui.vrnetlab.imageUnknown');

        const size = document.createElement('span');
        size.className = 'vrnetlab-image-size';
        size.textContent = img.size || '';

        row.appendChild(name);
        row.appendChild(size);
        imagesList.appendChild(row);
      });
    }

    if (imagesCount) {
      imagesCount.textContent = t('ui.vrnetlab.imagesCount', { count: arr.length });
    }
  }

  function requestStatus(options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      const creds = getCommonCreds();
      if (!creds.eve_ip || !creds.eve_user || !creds.eve_pass) {
        if (!options.skipMessage) {
          showMessage('error', t('vrnetlab.missingCreds'));
        }
        reject(new Error('missing_credentials'));
        return;
      }

      const formData = new FormData();
      formData.append('eve_ip', creds.eve_ip);
      formData.append('eve_user', creds.eve_user);
      formData.append('eve_pass', creds.eve_pass);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/vrnetlab/status', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      setLangHeader(xhr);

      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;

        if (xhr.status === 0) {
          if (!options.skipMessage) {
            showMessage('error', t('msg.networkError'));
          }
          reject(new Error('network_error'));
          return;
        }

        let resp = null;
        try {
          resp = JSON.parse(xhr.responseText || '{}');
        } catch (err) {
          if (!options.skipMessage) {
            showMessage('error', t('msg.parseError'));
          }
          reject(err);
          return;
        }

        if (!resp || typeof resp !== 'object') {
          if (!options.skipMessage) {
            showMessage('error', t('msg.parseError'));
          }
          reject(new Error('invalid_response'));
          return;
        }

        if (xhr.status >= 400 && resp.message && !options.skipMessage) {
          showMessage('error', resp.message);
        }

        resolve(resp);
      };

      xhr.onerror = function () {
        if (!options.skipMessage) {
          showMessage('error', t('msg.networkError'));
        }
        reject(new Error('network_error'));
      };

      xhr.send(formData);
    });
  }

  function requestInstall(options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      const creds = getCommonCreds();
      if (!creds.eve_ip || !creds.eve_user || !creds.eve_pass) {
        if (!options.skipMessage) {
          showMessage('error', t('vrnetlab.missingCreds'));
        }
        reject(new Error('missing_credentials'));
        return;
      }

      const formData = new FormData();
      formData.append('eve_ip', creds.eve_ip);
      formData.append('eve_user', creds.eve_user);
      formData.append('eve_pass', creds.eve_pass);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/vrnetlab/install', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      setLangHeader(xhr);

      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;

        if (xhr.status === 0) {
          if (!options.skipMessage) {
            showMessage('error', t('msg.networkError'));
          }
          reject(new Error('network_error'));
          return;
        }

        let resp = null;
        try {
          resp = JSON.parse(xhr.responseText || '{}');
        } catch (err) {
          if (!options.skipMessage) {
            showMessage('error', t('msg.parseError'));
          }
          reject(err);
          return;
        }

        if (!resp || typeof resp !== 'object') {
          if (!options.skipMessage) {
            showMessage('error', t('msg.parseError'));
          }
          reject(new Error('invalid_response'));
          return;
        }

        if (resp.message && !options.skipMessage) {
          showMessage(resp.success === false ? 'error' : 'success', resp.message);
        }

        if (resp.success === false) {
          reject(new Error('install_failed'));
          return;
        }

        resolve(resp);
      };

      xhr.onerror = function () {
        if (!options.skipMessage) {
          showMessage('error', t('msg.networkError'));
        }
        reject(new Error('network_error'));
      };

      xhr.send(formData);
    });
  }

  function handleStatusClick() {
    setLoading(true);
    if (imagesList) imagesList.innerHTML = '<div class="loading-state"><span class="spinner"></span><span>' + t('ui.vrnetlab.statusLoading') + '</span></div>';
    loadVrnetlabStatus({ skipMessage: false })
      .catch(function () {
        // Mensagem já exibida em requestStatus
        renderImages([]);
      })
      .finally(function () {
        setLoading(false);
      });
  }

  function setInstallLoading(isLoading) {
    if (!installBtn) return;
    installBtn.disabled = !!isLoading;
    installBtn.classList.toggle('btn-disabled', !!isLoading);
    const label = installBtn.querySelector('[data-i18n="ui.vrnetlab.installBtn"]') || installBtn;
    label.textContent = isLoading ? t('ui.vrnetlab.installLoading') : t('ui.vrnetlab.installBtn');
    setBodyLoading(!!isLoading);
  }

  function handleInstallClick() {
    setInstallLoading(true);
    requestInstall({ skipMessage: false })
      .then(function () {
        return loadVrnetlabStatus({ skipMessage: true });
      })
      .catch(function () {
        // mensagem já exibida
      })
      .finally(function () {
        setInstallLoading(false);
      });
  }

  function loadVrnetlabStatus(options) {
    return requestStatus(options || {}).then(function (resp) {
      if (!resp) {
        showMessage('error', t('msg.parseError'));
        return resp;
      }

      renderMeta(resp.runtime || '', resp.repo_path || '');
      renderImages(resp.images || []);

      if (!options || options.skipMessage !== true) {
        if (resp.message) {
          showMessage(resp.success === false ? 'error' : 'success', resp.message);
        }
      }

      return resp;
    });
  }

  // P5 (#72): build de imagens vrnetlab (vendors + make docker-image, log ao vivo).
  function vrlPost(url, fields) {
    return new Promise(function (resolve, reject) {
      const creds = getCommonCreds();
      if (!creds.eve_ip || !creds.eve_user || !creds.eve_pass) { showMessage('error', t('vrnetlab.missingCreds')); return reject(new Error('creds')); }
      const fd = new FormData();
      fd.append('eve_ip', creds.eve_ip); fd.append('eve_user', creds.eve_user); fd.append('eve_pass', creds.eve_pass);
      Object.keys(fields || {}).forEach(function (k) { fd.append(k, fields[k]); });
      const xhr = new XMLHttpRequest(); xhr.open('POST', url, true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest'); setLangHeader(xhr);
      xhr.onreadystatechange = function () { if (xhr.readyState !== 4) return; try { resolve(JSON.parse(xhr.responseText || '{}')); } catch (e) { reject(e); } };
      xhr.onerror = function () { reject(new Error('network')); };
      xhr.send(fd);
    });
  }

  (function buildVrlBuilder() {
    if (!imagesCount || !imagesCount.parentNode) return;
    const wrap = document.createElement('div'); wrap.style.cssText = 'margin-top:12px;border-top:1px solid var(--border);padding-top:10px';
    const head = document.createElement('div'); head.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px';
    const title = document.createElement('span'); title.style.cssText = 'font-size:12px;font-weight:700;color:var(--text-2)'; title.textContent = t('ui.vrnetlab.buildTitle');
    const listBtn = document.createElement('button'); listBtn.type = 'button'; listBtn.className = 'btn-secondary'; listBtn.style.cssText = 'padding:5px 12px;font-size:12px';
    listBtn.textContent = t('ui.vrnetlab.vendorsBtn');
    head.appendChild(title); head.appendChild(listBtn);
    const vlist = document.createElement('div'); vlist.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    const log = document.createElement('pre'); log.className = 'io-log'; log.style.cssText = 'margin-top:8px;max-height:240px;overflow:auto;font-size:11px;display:none';
    wrap.appendChild(head); wrap.appendChild(vlist); wrap.appendChild(log);
    imagesCount.parentNode.insertBefore(wrap, imagesCount.nextSibling);

    let polling = null;
    function buildDone(status) {
      showMessage(status === 'success' ? 'success' : 'error', t(status === 'success' ? 'ui.vrnetlab.buildOk' : 'ui.vrnetlab.buildFail'));
      loadVrnetlabStatus({ skipMessage: true });
    }
    // WS-first com fallback para polling (#82).
    function streamBuild(jobId) {
      const buf = [];
      const ws = (window.NetConfigApp && window.NetConfigApp.wsStreamJob) ? window.NetConfigApp.wsStreamJob('/ws/vrljob/' + encodeURIComponent(jobId), {
        onLine: function (ln) { buf.push(ln); log.textContent = buf.join('\n'); log.scrollTop = log.scrollHeight; },
        onDone: function (status) { buildDone(status); },
        onError: function () { if (!buf.length) pollJob(jobId); }
      }) : null;
      if (!ws) pollJob(jobId);
    }
    function pollJob(jobId) {
      if (polling) clearInterval(polling);
      polling = setInterval(function () {
        const creds = getCommonCreds();
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/api/vrnetlab/build/job?job_id=' + encodeURIComponent(jobId), true);
        setLangHeader(xhr);
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) return;
          let r = null; try { r = JSON.parse(xhr.responseText || '{}'); } catch (e) { return; }
          if (!r) return;
          log.textContent = (r.lines || []).join('\n');
          log.scrollTop = log.scrollHeight;
          if (r.status === 'success' || r.status === 'error') {
            clearInterval(polling); polling = null;
            showMessage(r.status === 'success' ? 'success' : 'error', t(r.status === 'success' ? 'ui.vrnetlab.buildOk' : 'ui.vrnetlab.buildFail'));
            loadVrnetlabStatus({ skipMessage: true });
          }
        };
        xhr.send();
      }, 1500);
    }

    function renderVendors(vendors) {
      vlist.innerHTML = '';
      if (!vendors.length) { const e = document.createElement('div'); e.className = 'hint'; e.textContent = t('ui.vrnetlab.vendorsEmpty'); vlist.appendChild(e); return; }
      vendors.forEach(function (v) {
        const row = document.createElement('div'); row.className = 'vrnetlab-image-row';
        const left = document.createElement('div'); left.style.cssText = 'display:flex;flex-direction:column';
        const nm = document.createElement('span'); nm.className = 'vrnetlab-image-name'; nm.textContent = v.name;
        const sub = document.createElement('span'); sub.className = 'vrnetlab-image-size';
        sub.textContent = v.images && v.images.length ? v.images.join(', ') : t('ui.vrnetlab.vendorNoImg');
        left.appendChild(nm); left.appendChild(sub);
        const bld = document.createElement('button'); bld.type = 'button'; bld.className = 'btn-secondary'; bld.style.cssText = 'padding:4px 12px;font-size:11px';
        bld.textContent = t('ui.vrnetlab.buildBtn'); bld.disabled = !v.ready;
        bld.addEventListener('click', function () {
          log.style.display = 'block'; log.textContent = t('ui.vrnetlab.buildStarting');
          vrlPost('/api/vrnetlab/build', { vendor: v.name }).then(function (r) {
            if (r && r.success && r.job_id) { showMessage('info', t('ui.vrnetlab.buildStarted', { vendor: v.name })); streamBuild(r.job_id); }
            else showMessage('error', (r && r.message) || t('ui.vrnetlab.buildFail'));
          }).catch(function () { showMessage('error', t('msg.networkError')); });
        });
        row.appendChild(left); row.appendChild(bld); vlist.appendChild(row);
      });
    }

    listBtn.addEventListener('click', function () {
      listBtn.disabled = true; vlist.innerHTML = '<div class="loading-state"><span class="spinner"></span></div>';
      vrlPost('/api/vrnetlab/vendors', {}).then(function (r) {
        listBtn.disabled = false;
        if (!r || r.success === false) { vlist.innerHTML = ''; showMessage('error', (r && r.message) || t('ui.vrnetlab.vendorsFail')); return; }
        renderVendors(r.vendors || []);
      }).catch(function () { listBtn.disabled = false; vlist.innerHTML = ''; showMessage('error', t('msg.networkError')); });
    });
  })();

  statusBtn.addEventListener('click', handleStatusClick);
  if (installBtn) {
    installBtn.addEventListener('click', handleInstallClick);
  }

  window.NetConfigApp = window.NetConfigApp || {};
  window.NetConfigApp.loadVrnetlabStatus = loadVrnetlabStatus;
});
