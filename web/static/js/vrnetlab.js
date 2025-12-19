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
    loadVrnetlabStatus({ skipMessage: false })
      .catch(function () {
        // Mensagem já exibida em requestStatus
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

  statusBtn.addEventListener('click', handleStatusClick);
  if (installBtn) {
    installBtn.addEventListener('click', handleInstallClick);
  }

  window.NetConfigApp = window.NetConfigApp || {};
  window.NetConfigApp.loadVrnetlabStatus = loadVrnetlabStatus;
});
