/*
 * This file is part of NetConfig Lab Image Manager.
 *
 * NetConfig Lab Image Manager is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('uploadForm');
  if (!form) {
    return;
  }

  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');

  const radioButtons = document.querySelectorAll("input[name='image_type']");
  const baseDirInput = document.getElementById('eve_base_dir');

  const app = window.NetConfigApp || {};
  const showMessage = app.showMessage || function () {};
  const t = app.t || function (key) { return key; };
  const setLangHeader = app.setLanguageHeader || function () {};

  function resetProgress() {
    setTimeout(function () {
      if (!progressContainer || !progressText || !progressBar) return;
      progressContainer.style.display = 'none';
      progressText.style.display = 'none';
      progressBar.style.width = '0%';
    }, 1500);
  }

  radioButtons.forEach(function (radio) {
    radio.addEventListener('change', function () {
      if (!baseDirInput) return;
      if (radio.value === 'qemu') baseDirInput.value = '/opt/unetlab/addons/qemu';
      if (radio.value === 'iol') baseDirInput.value = '/opt/unetlab/addons/iol/bin';
      if (radio.value === 'dynamips') baseDirInput.value = '/opt/unetlab/addons/dynamips';
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const messages = document.getElementById('messages');
    if (messages) {
      messages.innerHTML = '';
    }

    const formData = new FormData(form);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    setLangHeader(xhr);

    if (xhr.upload && progressContainer && progressBar && progressText) {
      xhr.upload.addEventListener('progress', function (event) {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          var loadedMB = event.loaded / (1024 * 1024);
          var totalMB = event.total / (1024 * 1024);

          progressContainer.style.display = 'block';
          progressText.style.display = 'block';
          progressBar.style.width = percent + '%';
          progressText.textContent = t('upload.progress', {
            percent: percent,
            loaded: loadedMB.toFixed(1),
            total: totalMB.toFixed(1)
          });
        } else {
          // Não foi possível calcular o tamanho total: mostra progresso indeterminado
          progressContainer.style.display = 'block';
          progressText.style.display = 'block';
          progressBar.style.width = '100%';
          progressText.textContent = t('upload.progress.indeterminate');
        }
      });
    }

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        let resp = null;
        try {
          resp = JSON.parse(xhr.responseText || '{}');
        } catch (err) {
          showMessage('error', t('msg.parseError') + '<br><pre>' +
            (xhr.responseText || String(err)) + '</pre>');
          resetProgress();
          return;
        }

        if (xhr.status === 200 && resp && resp.success) {
          if (progressBar && progressText) {
            progressBar.style.width = '100%';
            progressText.textContent = t('upload.processing');
          }
          showMessage('success', resp.message || t('upload.success'));
        } else {
          showMessage('error', (resp && resp.message) || t('upload.error'));
          if (resp && resp.errors && resp.errors.length) {
            resp.errors.forEach(function (err) {
              const detail = [];
              if (err.filename) detail.push('<b>' + err.filename + '</b>');
              if (err.context) detail.push('<b>' + t('labels.context') + '</b> ' + err.context);
              if (err.stdout) detail.push('<pre>' + err.stdout + '</pre>');
              if (err.stderr) detail.push('<pre>' + err.stderr + '</pre>');
              showMessage('error', detail.join('<br>'));
            });
          }
        }
        resetProgress();
      }
    };

    xhr.onerror = function () {
      showMessage('error', t('msg.networkError'));
      resetProgress();
    };

    xhr.send(formData);
  });
});
