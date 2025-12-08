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

    if (xhr.upload && progressContainer && progressBar && progressText) {
      xhr.upload.addEventListener('progress', function (event) {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          progressContainer.style.display = 'block';
          progressText.style.display = 'block';
          progressBar.style.width = percent + '%';
          progressText.textContent = 'Enviando arquivos... ' + percent + '%';
        }
      });
    }

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        let resp = null;
        try {
          resp = JSON.parse(xhr.responseText || '{}');
        } catch (err) {
          showMessage('error', 'Erro ao interpretar resposta do servidor.<br><pre>' +
            (xhr.responseText || String(err)) + '</pre>');
          resetProgress();
          return;
        }

        if (xhr.status === 200 && resp && resp.success) {
          if (progressBar && progressText) {
            progressBar.style.width = '100%';
            progressText.textContent = 'Processando no servidor...';
          }
          showMessage('success', resp.message || 'Upload concluído com sucesso.');
        } else {
          showMessage('error', (resp && resp.message) || 'Erro ao processar upload.');
          if (resp && resp.errors && resp.errors.length) {
            resp.errors.forEach(function (err) {
              const detail = [];
              if (err.filename) detail.push('<b>' + err.filename + '</b>');
              if (err.context) detail.push('<b>Contexto:</b> ' + err.context);
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
      showMessage('error', 'Falha na comunicação com o servidor.');
      resetProgress();
    };

    xhr.send(formData);
  });
});

