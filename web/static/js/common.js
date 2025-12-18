/*
 * This file is part of NetConfig Lab Image Manager.
 *
 * NetConfig Lab Image Manager is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

document.addEventListener('DOMContentLoaded', function () {
  const app = window.NetConfigApp || {};
  const t = app.t || function (key) { return key; };
  var currentAppVersion = '';

  function setAppVersionBadge(version) {
    const pill = document.getElementById('appVersionPill');
    const value = document.getElementById('appVersionValue');
    if (!pill || !value) return;

    if (!version) {
      pill.style.display = 'none';
      value.textContent = '--';
      pill.title = '';
      return;
    }

    value.textContent = version;
    pill.style.display = 'inline-flex';
    pill.title = t('ui.version.tooltip', { version: version });
  }

  function loadAppVersionFromApi() {
    return new Promise(function (resolve, reject) {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/version', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      if (window.NetConfigApp && window.NetConfigApp.setLanguageHeader) {
        window.NetConfigApp.setLanguageHeader(xhr);
      }
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error('HTTP ' + xhr.status));
          return;
        }
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          resolve((data && data.version) ? String(data.version) : '');
        } catch (e) {
          reject(e);
        }
      };
      xhr.onerror = function () { reject(new Error('network error')); };
      xhr.send();
    });
  }

  function loadAppVersionFromStaticFile() {
    return new Promise(function (resolve, reject) {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/VERSION', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error('HTTP ' + xhr.status));
          return;
        }
        resolve((xhr.responseText || '').trim());
      };
      xhr.onerror = function () { reject(new Error('network error')); };
      xhr.send();
    });
  }

  function showMessage(type, text) {
    const messages = document.getElementById('messages');
    if (!messages) {
      return;
    }

    const div = document.createElement('div');
    div.className = 'alert ' + (type === 'error' ? 'alert-error' : 'alert-success');
    div.innerHTML = text;
    messages.appendChild(div);
  }

  function getCommonCreds() {
    const form = document.getElementById('uploadForm');
    if (!form || !form.elements) {
      return { eve_ip: '', eve_user: '', eve_pass: '' };
    }

    const eve_ip = (form.elements['eve_ip'] && form.elements['eve_ip'].value || '').trim();
    const eve_user = (form.elements['eve_user'] && form.elements['eve_user'].value || '').trim();
    const eve_pass = (form.elements['eve_pass'] && form.elements['eve_pass'].value || '').trim();
    return { eve_ip, eve_user, eve_pass };
  }

  window.NetConfigApp = window.NetConfigApp || {};
  window.NetConfigApp.showMessage = showMessage;
  window.NetConfigApp.getCommonCreds = getCommonCreds;
  window.NetConfigApp.t = window.NetConfigApp.t || t;
  window.NetConfigApp.getLanguage = window.NetConfigApp.getLanguage || function () { return 'en'; };
  window.NetConfigApp.setLanguageHeader = function (xhr) {
    if (xhr && xhr.setRequestHeader) {
      xhr.setRequestHeader('X-Language', (window.NetConfigApp.getLanguage && window.NetConfigApp.getLanguage()) || 'en');
    }
  };

  window.addEventListener('netconfig:language-changed', function () {
    if (currentAppVersion) setAppVersionBadge(currentAppVersion);
  });

  loadAppVersionFromApi()
    .catch(function () {
      return loadAppVersionFromStaticFile();
    })
    .then(function (version) {
      currentAppVersion = version || '';
      setAppVersionBadge(version);
    })
    .catch(function () {
      setAppVersionBadge('');
    });
});
