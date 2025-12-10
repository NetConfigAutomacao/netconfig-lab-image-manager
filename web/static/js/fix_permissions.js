/*
 * This file is part of NetConfig Lab Image Manager.
 *
 * NetConfig Lab Image Manager is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

document.addEventListener('DOMContentLoaded', function () {
  const fixPermissionsBtn = document.getElementById('fixPermissionsBtn');
  if (!fixPermissionsBtn) {
    return;
  }

  const app = window.NetConfigApp || {};
  const showMessage = app.showMessage || function () {};
  const getCommonCreds = app.getCommonCreds || function () {
    return { eve_ip: '', eve_user: '', eve_pass: '' };
  };
  const t = app.t || function (key) { return key; };
  const setLangHeader = app.setLanguageHeader || function () {};

  fixPermissionsBtn.addEventListener('click', function () {
    const messages = document.getElementById('messages');
    if (messages) {
      messages.innerHTML = '';
    }

    const creds = getCommonCreds();
    const eve_ip = creds.eve_ip;
    const eve_user = creds.eve_user;
    const eve_pass = creds.eve_pass;

    if (!eve_ip || !eve_user || !eve_pass) {
      showMessage('error', t('fix.missingCreds'));
      return;
    }

    const fd = new FormData();
    fd.append('eve_ip', eve_ip);
    fd.append('eve_user', eve_user);
    fd.append('eve_pass', eve_pass);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/fix-permissions', true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    setLangHeader(xhr);

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        let resp = null;
        try {
          resp = JSON.parse(xhr.responseText || '{}');
        } catch (err) {
          showMessage('error', t('fix.parseError') + '<br><pre>' +
            (xhr.responseText || String(err)) + '</pre>');
          return;
        }

        if (resp.success) {
          showMessage('success', resp.message || t('fix.success'));
        } else {
          showMessage('error', resp.message || t('fix.fail'));
        }
      }
    };

    xhr.onerror = function () {
      showMessage('error', t('msg.networkError'));
    };

    xhr.send(fd);
  });
});
