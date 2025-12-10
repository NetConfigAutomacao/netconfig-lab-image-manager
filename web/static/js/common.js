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
});
