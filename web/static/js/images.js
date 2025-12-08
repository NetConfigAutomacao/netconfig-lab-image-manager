/*
 * This file is part of NetConfig Lab Image Manager.
 *
 * NetConfig Lab Image Manager is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

document.addEventListener('DOMContentLoaded', function () {
  const checkBtn = document.getElementById('checkImagesBtn');
  const imagesResult = document.getElementById('imagesResult');

  if (!checkBtn || !imagesResult) {
    return;
  }

  const app = window.NetConfigApp || {};
  const showMessage = app.showMessage || function () {};
  const getCommonCreds = app.getCommonCreds || function () {
    return { eve_ip: '', eve_user: '', eve_pass: '' };
  };

  function groupByVendor(list) {
    const groups = {};
    list.forEach(function (name) {
      let vendor = name;
      let version = '';

      const idx = name.indexOf('-');
      if (idx > 0) {
        vendor = name.slice(0, idx);
        version = name.slice(idx + 1);
      } else {
        vendor = name;
        version = '';
      }

      const key = vendor.toLowerCase();
      if (!groups[key]) {
        groups[key] = {
          vendor: vendor,
          items: []
        };
      }

      groups[key].items.push({
        full: name,
        version: version || name
      });
    });

    return Object.values(groups).sort(function (a, b) {
      return a.vendor.toLowerCase().localeCompare(b.vendor.toLowerCase());
    });
  }

  checkBtn.addEventListener('click', function () {
    const messages = document.getElementById('messages');
    if (messages) {
      messages.innerHTML = '';
    }

    imagesResult.style.display = 'none';
    imagesResult.innerHTML = '';

    const creds = getCommonCreds();
    const eve_ip = creds.eve_ip;
    const eve_user = creds.eve_user;
    const eve_pass = creds.eve_pass;

    if (!eve_ip || !eve_user || !eve_pass) {
      showMessage('error', 'Preencha IP do EVE, usuário e senha para listar as imagens.');
      return;
    }

    const fd = new FormData();
    fd.append('eve_ip', eve_ip);
    fd.append('eve_user', eve_user);
    fd.append('eve_pass', eve_pass);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/images', true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        let resp = null;
        try {
          resp = JSON.parse(xhr.responseText || '{}');
        } catch (err) {
          showMessage('error', 'Erro ao interpretar resposta do servidor.<br><pre>' +
            (xhr.responseText || String(err)) + '</pre>');
          return;
        }

        if (!resp) {
          showMessage('error', 'Resposta vazia da API.');
          return;
        }

        if (!resp.success) {
          showMessage('error', resp.message || 'Falha ao listar imagens.');
        } else {
          showMessage('success', resp.message || 'Imagens listadas com sucesso.');
        }

        const images = resp.images || {};
        const sections = [
          ['qemu', 'QEMU', '/opt/unetlab/addons/qemu'],
          ['iol', 'IOL', '/opt/unetlab/addons/iol/bin'],
          ['dynamips', 'Dynamips', '/opt/unetlab/addons/dynamips']
        ];

        let html = ''
          + '<div class="images-title-row">'
          + '<span><strong>Imagens existentes no EVE-NG</strong></span>'
          + '<span>Atualizado agora</span>'
          + '</div>'
          + '<div class="images-sections">';

        sections.forEach(function (section) {
          const key = section[0];
          const label = section[1];
          const path = section[2];

          const list = images[key] || [];
          const totalCount = list.length;

          html += ''
            + '<div class="images-section">'
            + '  <div class="images-section-header">'
            + '    <div class="images-section-main">'
            + '      <span class="images-section-title">' + label + '</span>'
            + '      <span class="images-section-path">' + path + '</span>'
            + '    </div>'
            + '    <span class="images-section-count">' + totalCount + ' template' + (totalCount === 1 ? '' : 's') + '</span>'
            + '  </div>';

          if (totalCount === 0) {
            html += '<div class="images-empty">Nenhum template encontrado.</div>';
          } else {
            const groups = groupByVendor(list);
            groups.forEach(function (group) {
              const count = group.items.length;
              html += ''
                + '<div class="vendor-group">'
                + '  <div class="vendor-header">'
                + '    <span class="vendor-name">' + group.vendor + '</span>'
                + '    <span class="vendor-count">' + count + ' versão' + (count === 1 ? '' : 'es') + '</span>'
                + '  </div>'
                + '  <div class="vendor-tags">';

              group.items.forEach(function (entry) {
                html += '<span class="tag-pill" title="' + entry.full + '">' + entry.version + '</span>';
              });

              html += '</div></div>';
            });
          }

          html += '</div>';
        });

        html += '</div>';
        imagesResult.innerHTML = html;
        imagesResult.style.display = 'block';
      }
    };

    xhr.onerror = function () {
      showMessage('error', 'Falha na comunicação com o servidor.');
    };

    xhr.send(fd);
  });
});

