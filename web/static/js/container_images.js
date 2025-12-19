/*
 * This file is part of NetConfig Lab Image Manager.
 *
 * NetConfig Lab Image Manager is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

document.addEventListener('DOMContentLoaded', function () {
  const loadBtn = document.getElementById('containerImagesBtn');
  const listEl = document.getElementById('containerImagesList');
  const countEl = document.getElementById('containerImagesCount');

  const app = window.NetConfigApp || {};
  const showMessage = app.showMessage || function () {};
  const getCommonCreds = app.getCommonCreds || function () {
    return { eve_ip: '', eve_user: '', eve_pass: '' };
  };
  const t = app.t || function (key) { return key; };
  const setLangHeader = app.setLanguageHeader || function () {};

  let loadingOps = 0;

  if (!loadBtn || !listEl || !countEl) {
    return;
  }

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

  function setLoading(isLoading) {
    if (!(loadBtn instanceof HTMLButtonElement)) return;
    loadBtn.disabled = !!isLoading;
    loadBtn.classList.toggle('btn-disabled', !!isLoading);
    const label = loadBtn.querySelector('[data-i18n="ui.containerImages.loadBtn"]') || loadBtn;
    label.textContent = isLoading ? t('ui.containerImages.loading') : t('ui.containerImages.loadBtn');
    setBodyLoading(!!isLoading);
  }

  function renderList(images) {
    listEl.innerHTML = '';
    const arr = Array.isArray(images) ? images : [];

    if (!arr.length) {
      const empty = document.createElement('div');
      empty.className = 'images-empty';
      empty.textContent = t('ui.containerImages.none');
      listEl.appendChild(empty);
    } else {
      arr.forEach(function (img) {
        const row = document.createElement('div');
        row.className = 'vrnetlab-image-row';

        const left = document.createElement('div');
        left.style.display = 'flex';
        left.style.flexDirection = 'column';
        left.style.gap = '2px';

        const name = document.createElement('span');
        name.className = 'vrnetlab-image-name';
        let label = (img.repository || '').trim();
        const tag = (img.tag || '').trim();
        if (tag) {
          label = label ? label + ':' + tag : tag;
        }
        name.textContent = label || t('ui.containerImages.unnamed');

        const meta = document.createElement('span');
        meta.className = 'vrnetlab-image-size';
        const parts = [];
        if (img.id) parts.push(img.id);
        if (img.created) parts.push(img.created);
        meta.textContent = parts.join(' · ');

        left.appendChild(name);
        left.appendChild(meta);

        const size = document.createElement('span');
        size.className = 'vrnetlab-image-size';
        size.textContent = img.size || '';

        row.appendChild(left);
        row.appendChild(size);
        listEl.appendChild(row);
      });
    }

    countEl.textContent = t('ui.containerImages.count', { count: arr.length });
  }

  function requestImages(options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      const creds = getCommonCreds();
      if (!creds.eve_ip || !creds.eve_user || !creds.eve_pass) {
        if (!options.skipMessage) {
          showMessage('error', t('container_images.missing_creds'));
        }
        return reject(new Error('missing_credentials'));
      }

      const formData = new FormData();
      formData.append('eve_ip', creds.eve_ip);
      formData.append('eve_user', creds.eve_user);
      formData.append('eve_pass', creds.eve_pass);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/container-images/list', true);
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

        if (!options.skipMessage) {
          if (resp.message) {
            showMessage(resp.success === false ? 'error' : 'success', resp.message);
          }
        }

        if (resp.success === false) {
          return reject(new Error('runtime_missing'));
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
    setLoading(true);
    requestImages({ skipMessage: false })
      .then(function (resp) {
        renderList(resp.images || []);
      })
      .catch(function () {
        // mensagem já exibida
      })
      .finally(function () {
        setLoading(false);
      });
  }

  loadBtn.addEventListener('click', handleLoad);

  window.NetConfigApp = window.NetConfigApp || {};
  window.NetConfigApp.loadContainerImages = function (options) {
    const opts = options || {};
    if (opts.auto !== true) {
      return requestImages(opts);
    }
    setLoading(true);
    return requestImages(opts)
      .then(function (resp) {
        renderList(resp.images || []);
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
