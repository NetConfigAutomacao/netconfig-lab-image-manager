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
  const IMAGE_LABELS = {
    qemu: 'QEMU',
    iol: 'IOL',
    dynamips: 'Dynamips'
  };

  let lastImages = null;
  let loadingOps = 0;

  function setLoadingCursor(active) {
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

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, function (c) {
      switch (c) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return c;
      }
    });
  }

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
      setLoadingCursor(true);
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
          return resolve({
            success: !!resp.success,
            images: images,
            platform: resp.platform || null,
            resources: resp.resources || null
          });
        }
      };

      xhr.onerror = function () {
        if (!options.silent) {
          showMessage('error', t('msg.networkError'));
        }
        setLoadingCursor(false);
        return resolve({ success: false, reason: 'network' });
      };

      xhr.onloadend = function () {
        setLoadingCursor(false);
      };

      xhr.send(fd);
    });
  }

  function deleteImage(imageType, templateName) {
    const creds = getCommonCreds();
    const eve_ip = creds.eve_ip;
    const eve_user = creds.eve_user;
    const eve_pass = creds.eve_pass;

    if (!eve_ip || !eve_user || !eve_pass) {
      showMessage('error', t('images.missingCreds'));
      return;
    }

    const fd = new FormData();
    fd.append('eve_ip', eve_ip);
    fd.append('eve_user', eve_user);
    fd.append('eve_pass', eve_pass);
    fd.append('image_type', imageType);
    fd.append('template_name', templateName);

    setLoadingCursor(true);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/images/delete', true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    setLangHeader(xhr);

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        let resp = null;
        try {
          resp = JSON.parse(xhr.responseText || '{}');
        } catch (err) {
          showMessage('error', t('images.parseError') + '<br><pre>' +
            (xhr.responseText || String(err)) + '</pre>');
          return;
        }

        if (resp.success) {
          showMessage('success', resp.message || t('images.deleteSuccess'));
        } else {
          showMessage('error', resp.message || t('images.deleteFail'));
        }

        loadImagesList({ skipClearMessages: true, silent: true });
      }
    };

    xhr.onerror = function () {
      showMessage('error', t('msg.networkError'));
      setLoadingCursor(false);
    };

    xhr.onloadend = function () {
      setLoadingCursor(false);
    };

    xhr.send(fd);
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
      const safeLabel = escapeHtml(label);
      const safePath = escapeHtml(path);

      const list = images[key] || [];
      const totalCount = list.length;

      const templateCountText = t('images.templateCount', { count: totalCount });

      html += ''
        + '<div class="images-section">'
        + '  <div class="images-section-header">'
        + '    <div class="images-section-main">'
        + '      <span class="images-section-title">' + safeLabel + '</span>'
        + '      <span class="images-section-path">' + safePath + '</span>'
        + '    </div>'
        + '    <span class="images-section-count">' + templateCountText + '</span>'
        + '  </div>';

      if (totalCount === 0) {
        html += '<div class="images-empty">' + t('images.none') + '</div>';
      } else {
        const groups = groupByVendor(list);
        groups.forEach(function (group) {
          const count = group.items.length;
          const vendorName = escapeHtml(group.vendor);
          html += ''
            + '<div class="vendor-group">'
            + '  <div class="vendor-header">'
            + '    <span class="vendor-name">' + vendorName + '</span>'
            + '    <span class="vendor-count">' + t('images.vendorCount', { count: count }) + '</span>'
            + '  </div>'
            + '  <div class="vendor-tags">';

          group.items.forEach(function (entry) {
            const fullEsc = escapeHtml(entry.full);
            const versionEsc = escapeHtml(entry.version);
            html += ''
              + '<div class="tag-pill" title="' + fullEsc + '">'
              + '  <span class="pill-name">' + versionEsc + '</span>'
              + '  <button type="button" class="pill-action delete-image-btn" data-type="' + key + '" data-name="' + fullEsc + '">'
              + t('images.deleteAction')
              + '</button>'
              + '</div>';
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

  if (imagesResult) {
    imagesResult.addEventListener('click', function (evt) {
      const btn = evt.target.closest('.delete-image-btn');
      if (!btn) return;

      const type = btn.getAttribute('data-type') || '';
      const name = btn.getAttribute('data-name') || '';
      if (!type || !name) {
        showMessage('error', t('images.deleteFail'));
        return;
      }

      const typeLabel = IMAGE_LABELS[type] || type.toUpperCase();
      const confirmText = t('images.deleteConfirm', { name: name, type: typeLabel });
      if (!window.confirm(confirmText)) {
        return;
      }

      deleteImage(type, name);
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
