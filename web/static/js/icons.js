/*
 * This file is part of NetConfig Lab Image Manager.
 *
 * NetConfig Lab Image Manager is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

document.addEventListener('DOMContentLoaded', function () {
  const listIconsBtn = document.getElementById('listIconsBtn');
  const iconsListDiv = document.getElementById('iconsList');
  const uploadIconBtn = document.getElementById('uploadIconBtn');
  const iconFileInput = document.getElementById('icon_file');

  const app = window.NetConfigApp || {};
  const showMessage = app.showMessage || function () {};
  const getCommonCreds = app.getCommonCreds || function () {
    return { eve_ip: '', eve_user: '', eve_pass: '' };
  };
  const t = app.t || function (key) { return key; };
  const setLangHeader = app.setLanguageHeader || function () {};

  let lastIcons = null;
  let lastIconsEveIp = '';

  function buildIconUrl(eve_ip, name) {
    if (!eve_ip) return '';
    const hasScheme = /^https?:\/\//i.test(eve_ip);
    const rawHost = hasScheme ? eve_ip.replace(/^https?:\/\//i, '') : eve_ip;
    const isIpv6 = rawHost.includes(':') && !rawHost.startsWith('[');
    const host = isIpv6 ? `[${rawHost}]` : rawHost;
    const scheme = hasScheme ? eve_ip.match(/^https?:\/\//i)[0] : 'http://';
    return scheme + host + '/images/icons/' + encodeURIComponent(name);
  }

  function renderIconsList(icons, eve_ip) {
    if (!iconsListDiv) return;

    iconsListDiv.innerHTML = '';

    if (!icons || !icons.length) {
      const div = document.createElement('div');
      div.className = 'icons-empty';
      div.textContent = t('icons.none');
      iconsListDiv.appendChild(div);
      return;
    }

    icons.forEach(function (name) {
      const pill = document.createElement('div');
      pill.className = 'icon-pill';
      pill.title = name;

      const img = document.createElement('img');
      img.src = buildIconUrl(eve_ip, name);
      img.alt = name;

      const span = document.createElement('span');
      span.textContent = name;

      pill.appendChild(img);
      pill.appendChild(span);

      iconsListDiv.appendChild(pill);
    });
  }

  function loadIconsList(options) {
    options = options || {};
    if (!iconsListDiv) {
      return Promise.resolve({ success: false, reason: 'no-target' });
    }

    if (!options.skipClearMessages) {
      const messages = document.getElementById('messages');
      if (messages) {
        messages.innerHTML = '';
      }
    }
    iconsListDiv.innerHTML = '';

    const creds = getCommonCreds();
    const eve_ip = creds.eve_ip;
    const eve_user = creds.eve_user;
    const eve_pass = creds.eve_pass;

    if (!eve_ip || !eve_user || !eve_pass) {
      if (!options.silent) {
        showMessage('error', t('icons.missingCreds'));
      }
      return Promise.resolve({ success: false, reason: 'missing-creds' });
    }

    const fd = new FormData();
    fd.append('eve_ip', eve_ip);
    fd.append('eve_user', eve_user);
    fd.append('eve_pass', eve_pass);

    return new Promise(function (resolve) {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/icons/list', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      setLangHeader(xhr);

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          let resp = null;
          try {
            resp = JSON.parse(xhr.responseText || '{}');
          } catch (err) {
            if (!options.silent) {
              showMessage('error', t('icons.parseError') + '<br><pre>' +
                (xhr.responseText || String(err)) + '</pre>');
            }
            return resolve({ success: false, reason: 'parse' });
          }

          if (!resp) {
            if (!options.silent) {
              showMessage('error', t('icons.emptyResponse'));
            }
            return resolve({ success: false, reason: 'empty' });
          }

          if (!resp.success) {
            if (!options.silent) {
              showMessage('error', resp.message || t('icons.requestFail'));
            }
          } else if (!options.silent) {
            showMessage('success', resp.message || t('icons.successList'));
          }

          const icons = resp.icons || [];
          lastIcons = icons;
          lastIconsEveIp = eve_ip;
          renderIconsList(icons, eve_ip);
          return resolve({ success: !!resp.success, icons: icons });
        }
      };

      xhr.onerror = function () {
        if (!options.silent) {
          showMessage('error', t('msg.networkError'));
        }
        return resolve({ success: false, reason: 'network' });
      };

      xhr.send(fd);
    });
  }

  if (listIconsBtn) {
    listIconsBtn.addEventListener('click', function () {
      loadIconsList();
    });
  }

  if (uploadIconBtn) {
    uploadIconBtn.addEventListener('click', function () {
      const messages = document.getElementById('messages');
      if (messages) {
        messages.innerHTML = '';
      }

      const creds = getCommonCreds();
      const eve_ip = creds.eve_ip;
      const eve_user = creds.eve_user;
      const eve_pass = creds.eve_pass;
      const file = iconFileInput && iconFileInput.files ? iconFileInput.files[0] : null;

      if (!eve_ip || !eve_user || !eve_pass) {
        showMessage('error', t('icons.uploadMissingCreds'));
        return;
      }

      if (!file) {
        showMessage('error', t('icons.uploadSelectFile'));
        return;
      }

      const fd = new FormData();
      fd.append('eve_ip', eve_ip);
      fd.append('eve_user', eve_user);
      fd.append('eve_pass', eve_pass);
      fd.append('icon_file', file, file.name);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/icons/upload', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      setLangHeader(xhr);

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          let resp = null;
          try {
            resp = JSON.parse(xhr.responseText || '{}');
          } catch (err) {
            showMessage('error', t('icons.uploadParseError') + '<br><pre>' +
              (xhr.responseText || String(err)) + '</pre>');
            return;
          }

          if (resp.success) {
            showMessage('success', resp.message || t('icons.uploadSuccess'));
          } else {
            showMessage('error', resp.message || t('icons.uploadFail'));
          }
        }
      };

      xhr.onerror = function () {
        showMessage('error', t('msg.networkError'));
      };

      xhr.send(fd);
    });
  }

  window.addEventListener('netconfig:language-changed', function () {
    if (lastIcons !== null) {
      renderIconsList(lastIcons, lastIconsEveIp);
    }
  });

  window.NetConfigApp = window.NetConfigApp || {};
  window.NetConfigApp.loadIcons = loadIconsList;
});
