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

  const app = window.NetConfigApp || {};
  const showMessage = app.showMessage || function () {};
  const getCommonCreds = app.getCommonCreds || function () {
    return { eve_ip: '', eve_user: '', eve_pass: '' };
  };
  const t = app.t || function (key) { return key; };
  const setLangHeader = app.setLanguageHeader || function () {};

  let lastImages = null;

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

  function loadImagesList(options) {
    options = options || {};
    if (!imagesResult) {
      return Promise.resolve({ success: false, reason: 'no-target' });
    }

    if (!options.skipClearMessages) {
      const messages = document.getElementById('messages');
      if (messages) {
        messages.innerHTML = '';
      }
    }

    imagesResult.style.display = 'none';
    imagesResult.innerHTML = '';

    const creds = getCommonCreds();
    const eve_ip = creds.eve_ip;
    const eve_user = creds.eve_user;
    const eve_pass = creds.eve_pass;

    if (!eve_ip || !eve_user || !eve_pass) {
      if (!options.silent) {
        showMessage('error', t('images.missingCreds'));
      }
      return Promise.resolve({ success: false, reason: 'missing-creds' });
    }

    const fd = new FormData();
    fd.append('eve_ip', eve_ip);
    fd.append('eve_user', eve_user);
    fd.append('eve_pass', eve_pass);

    return new Promise(function (resolve) {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/images', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      setLangHeader(xhr);

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          let resp = null;
          try {
            resp = JSON.parse(xhr.responseText || '{}');
          } catch (err) {
            if (!options.silent) {
              showMessage('error', t('images.parseError') + '<br><pre>' +
                (xhr.responseText || String(err)) + '</pre>');
            }
            return resolve({ success: false, reason: 'parse' });
          }

          if (!resp) {
            if (!options.silent) {
              showMessage('error', t('images.emptyResponse'));
            }
            return resolve({ success: false, reason: 'empty' });
          }

          if (!resp.success) {
            if (!options.silent) {
              showMessage('error', resp.message || t('images.requestFail'));
            }
          } else if (!options.silent) {
            showMessage('success', resp.message || t('images.success'));
          }

          const images = resp.images || {};
          lastImages = images;
          renderImages(images);
          return resolve({ success: !!resp.success, images: images });
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

  function renderImages(images) {
    if (!imagesResult) return;

    if (!images) {
      imagesResult.style.display = 'none';
      imagesResult.innerHTML = '';
      return;
    }

    const sections = [
      ['qemu', 'QEMU', '/opt/unetlab/addons/qemu'],
      ['iol', 'IOL', '/opt/unetlab/addons/iol/bin'],
      ['dynamips', 'Dynamips', '/opt/unetlab/addons/dynamips']
    ];

    let html = ''
      + '<div class="images-title-row">'
      + '<span><strong>' + t('images.title') + '</strong></span>'
      + '<span>' + t('images.updated') + '</span>'
      + '</div>'
      + '<div class="images-sections">';

    sections.forEach(function (section) {
      const key = section[0];
      const label = section[1];
      const path = section[2];

      const list = images[key] || [];
      const totalCount = list.length;

      const templateCountText = t('images.templateCount', { count: totalCount });

      html += ''
        + '<div class="images-section">'
        + '  <div class="images-section-header">'
        + '    <div class="images-section-main">'
        + '      <span class="images-section-title">' + label + '</span>'
        + '      <span class="images-section-path">' + path + '</span>'
        + '    </div>'
        + '    <span class="images-section-count">' + templateCountText + '</span>'
        + '  </div>';

      if (totalCount === 0) {
        html += '<div class="images-empty">' + t('images.none') + '</div>';
      } else {
        const groups = groupByVendor(list);
        groups.forEach(function (group) {
          const count = group.items.length;
          html += ''
            + '<div class="vendor-group">'
            + '  <div class="vendor-header">'
            + '    <span class="vendor-name">' + group.vendor + '</span>'
            + '    <span class="vendor-count">' + t('images.vendorCount', { count: count }) + '</span>'
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

  if (checkBtn) {
    checkBtn.addEventListener('click', function () {
      loadImagesList();
    });
  }

  window.addEventListener('netconfig:language-changed', function () {
    if (lastImages) {
      renderImages(lastImages);
    }
  });

  window.NetConfigApp = window.NetConfigApp || {};
  window.NetConfigApp.loadImages = loadImagesList;
});
