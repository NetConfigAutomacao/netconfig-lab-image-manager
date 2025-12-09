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
      div.textContent = 'Nenhum ícone encontrado.';
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

  if (listIconsBtn) {
    listIconsBtn.addEventListener('click', function () {
      const messages = document.getElementById('messages');
      if (messages) {
        messages.innerHTML = '';
      }
      if (iconsListDiv) {
        iconsListDiv.innerHTML = '';
      }

      const creds = getCommonCreds();
      const eve_ip = creds.eve_ip;
      const eve_user = creds.eve_user;
      const eve_pass = creds.eve_pass;

      if (!eve_ip || !eve_user || !eve_pass) {
        showMessage('error', 'Preencha IP, usuário e senha para listar ícones.');
        return;
      }

      const fd = new FormData();
      fd.append('eve_ip', eve_ip);
      fd.append('eve_user', eve_user);
      fd.append('eve_pass', eve_pass);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/icons/list', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          let resp = null;
          try {
            resp = JSON.parse(xhr.responseText || '{}');
          } catch (err) {
            showMessage('error', 'Erro ao interpretar resposta da API de ícones.<br><pre>' +
              (xhr.responseText || String(err)) + '</pre>');
            return;
          }

          if (!resp) {
            showMessage('error', 'Resposta vazia da API de ícones.');
            return;
          }

          if (!resp.success) {
            showMessage('error', resp.message || 'Falha ao listar ícones.');
          } else {
            showMessage('success', resp.message || 'Ícones listados com sucesso.');
          }

          const icons = resp.icons || [];
          renderIconsList(icons, eve_ip);
        }
      };

      xhr.onerror = function () {
        showMessage('error', 'Falha na comunicação com o servidor ao listar ícones.');
      };

      xhr.send(fd);
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
        showMessage('error', 'Preencha IP, usuário e senha para enviar o ícone.');
        return;
      }

      if (!file) {
        showMessage('error', 'Selecione um arquivo PNG para enviar.');
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

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          let resp = null;
          try {
            resp = JSON.parse(xhr.responseText || '{}');
          } catch (err) {
            showMessage('error', 'Erro ao interpretar resposta do upload de ícone.<br><pre>' +
              (xhr.responseText || String(err)) + '</pre>');
            return;
          }

          if (resp.success) {
            showMessage('success', resp.message || 'Ícone enviado com sucesso.');
          } else {
            showMessage('error', resp.message || 'Falha ao enviar ícone.');
          }
        }
      };

      xhr.onerror = function () {
        showMessage('error', 'Falha na comunicação com o servidor ao enviar ícone.');
      };

      xhr.send(fd);
    });
  }
});
