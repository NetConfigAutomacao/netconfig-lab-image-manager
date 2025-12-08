/*
 * This file is part of NetConfig Lab Image Manager.
 *
 * NetConfig Lab Image Manager is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

document.addEventListener('DOMContentLoaded', function () {
  const searchBtn = document.getElementById('ishare2_search_btn');
  const queryInput = document.getElementById('ishare2_query');
  const outputDiv = document.getElementById('ishare2Output');

  const app = window.NetConfigApp || {};
  const showMessage = app.showMessage || function () {};

  if (!searchBtn || !outputDiv) {
    return;
  }

  searchBtn.addEventListener('click', function () {
    const messages = document.getElementById('messages');
    if (messages) {
      messages.innerHTML = '';
    }

    outputDiv.textContent = '';

    const query = queryInput ? queryInput.value.trim() : '';

    const fd = new FormData();
    if (query) {
      fd.append('query', query);
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/ishare2/search_all', true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        let resp = null;
        try {
          resp = JSON.parse(xhr.responseText || '{}');
        } catch (err) {
          showMessage('error', 'Erro ao interpretar resposta da API do iShare2.<br><pre>' +
            (xhr.responseText || String(err)) + '</pre>');
          return;
        }

        if (!resp) {
          showMessage('error', 'Resposta vazia da API do iShare2.');
          return;
        }

        if (!resp.success) {
          showMessage('error', resp.message || 'Falha ao executar ishare2 search all.');
          if (resp.stderr) {
            showMessage('error', '<pre>' + resp.stderr + '</pre>');
          }
        } else {
          showMessage('success', resp.message || 'Busca no iShare2 concluída com sucesso.');
        }

        if (typeof resp.output === 'string' && resp.output.trim()) {
          outputDiv.textContent = resp.output;
        } else if (resp.stdout) {
          outputDiv.textContent = resp.stdout;
        } else {
          outputDiv.textContent = 'Nenhuma saída retornada pelo ishare2.';
        }
      }
    };

    xhr.onerror = function () {
      showMessage('error', 'Falha na comunicação com o servidor ao consultar o iShare2.');
    };

    xhr.send(fd);
  });
});

