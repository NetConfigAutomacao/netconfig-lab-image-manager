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
  const outputDiv = document.getElementById('ishare2Output');
  const progressText = document.getElementById('ishare2ProgressText');
  const progressContainer = document.getElementById('ishare2ProgressContainer');
  const progressBar = document.getElementById('ishare2ProgressBar');
  const filterWrapper = document.getElementById('ishare2FilterWrapper');
  const filterInput = document.getElementById('ishare2_filter');

  const app = window.NetConfigApp || {};
  const showMessage = app.showMessage || function () {};
  const getCommonCreds = app.getCommonCreds || function () {
    return { eve_ip: '', eve_user: '', eve_pass: '' };
  };

  let lastSections = [];

  if (!searchBtn || !outputDiv) {
    return;
  }

  function setLoading(isLoading) {
    try {
      document.body.style.cursor = isLoading ? 'wait' : '';
    } catch (e) {
      // ignore
    }
  }

  function startInstallProgress() {
    if (!progressContainer || !progressBar || !progressText) return;
    progressText.style.display = 'block';
    progressText.textContent = 'Instalando no EVE...';
    progressContainer.style.display = 'block';
    progressBar.style.width = '20%';
  }

  function finishInstallProgress() {
    if (!progressContainer || !progressBar || !progressText) return;
    progressBar.style.width = '100%';
    setTimeout(function () {
      progressText.style.display = 'none';
      progressContainer.style.display = 'none';
      progressBar.style.width = '0%';
    }, 800);
  }

  function buildSectionContent(section) {
    var type = section.type || '';
    var label = section.label || type || 'Images';
    var items = Array.isArray(section.items) ? section.items : [];

    var sectionDiv = document.createElement('div');
    sectionDiv.className = 'ishare2-section';

    var headerDiv = document.createElement('div');
    headerDiv.className = 'ishare2-section-header';

    var titleSpan = document.createElement('span');
    titleSpan.className = 'ishare2-section-title';
    titleSpan.textContent = label;

    var countSpan = document.createElement('span');
    countSpan.className = 'images-section-count';
    countSpan.textContent = items.length + ' item' + (items.length === 1 ? '' : 's');

    headerDiv.appendChild(titleSpan);
    headerDiv.appendChild(countSpan);
    sectionDiv.appendChild(headerDiv);

    if (!items.length) {
      var emptyDiv = document.createElement('div');
      emptyDiv.className = 'images-empty';
      emptyDiv.textContent = 'Nenhuma imagem encontrada para este tipo.';
      sectionDiv.appendChild(emptyDiv);
      return sectionDiv;
    }

    var headerRow = document.createElement('div');
    headerRow.className = 'ishare2-items-header';

    ['ID', 'Nome', 'Tamanho', ''].forEach(function (h) {
      var span = document.createElement('span');
      span.textContent = h;
      headerRow.appendChild(span);
    });

    sectionDiv.appendChild(headerRow);

    items.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'ishare2-item-row';

      var idSpan = document.createElement('span');
      idSpan.className = 'ishare2-item-id';
      idSpan.textContent = item.id;

      var nameSpan = document.createElement('span');
      nameSpan.className = 'ishare2-item-name';
      nameSpan.textContent = item.name || '';

      var sizeSpan = document.createElement('span');
      sizeSpan.className = 'ishare2-item-size';
      sizeSpan.textContent = item.size || '';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-secondary ishare2-install-btn';
      btn.innerHTML = '<span class="icon">⬇</span><span>Install</span>';
      btn.dataset.type = section.type || '';
      btn.dataset.id = String(item.id);
      btn.dataset.name = item.name || '';

      btn.addEventListener('click', function () {
        handleInstallClick(btn.dataset.type, btn.dataset.id, btn.dataset.name);
      });

      row.appendChild(idSpan);
      row.appendChild(nameSpan);
      row.appendChild(sizeSpan);
      row.appendChild(btn);

      sectionDiv.appendChild(row);
    });

    return sectionDiv;
  }

  function applyFilterToSections(sections, filterText) {
    var term = (filterText || '').trim().toLowerCase();
    if (!term) {
      return sections;
    }

    var filtered = [];
    sections.forEach(function (section) {
      var items = Array.isArray(section.items) ? section.items : [];
      var matchedItems = items.filter(function (item) {
        var name = (item.name || '').toLowerCase();
        return name.indexOf(term) !== -1;
      });
      if (matchedItems.length) {
        filtered.push({
          type: section.type,
          label: section.label,
          items: matchedItems
        });
      }
    });

    return filtered;
  }

  function renderStructuredSections(sections, filterText) {
    if (!Array.isArray(sections) || !sections.length) {
      return false;
    }

    var filteredSections = applyFilterToSections(sections, filterText || '');

    // Mapeia por tipo para criar abas QEMU / IOL / DYNAMIPS
    var byType = {};
    filteredSections.forEach(function (s) {
      var t = (s.type || '').toUpperCase();
      if (!t) return;
      byType[t] = s;
    });

    var order = ['QEMU', 'IOL', 'DYNAMIPS'];
    var availableTypes = order.filter(function (t) {
      return byType[t] && Array.isArray(byType[t].items) && byType[t].items.length;
    });

    if (!availableTypes.length) {
      // fallback: mostra todas as seções em sequência
      outputDiv.innerHTML = '';
      filteredSections.forEach(function (section) {
        var panel = document.createElement('div');
        panel.className = 'ishare2-tab-panel active';
        panel.appendChild(buildSectionContent(section));
        outputDiv.appendChild(panel);
      });
      return true;
    }

    outputDiv.innerHTML = '';

    var tabsRow = document.createElement('div');
    tabsRow.className = 'ishare2-tabs';

    var panelsWrapper = document.createElement('div');

    availableTypes.forEach(function (type, index) {
      var section = byType[type];
      var label = section.label || type;
      var itemsCount = (section.items || []).length;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ishare2-tab-button' + (index === 0 ? ' active' : '');
      btn.dataset.type = type;
      btn.textContent = label + ' (' + itemsCount + ')';

      tabsRow.appendChild(btn);

      var panel = document.createElement('div');
      panel.className = 'ishare2-tab-panel' + (index === 0 ? ' active' : '');
      panel.dataset.type = type;
      panel.appendChild(buildSectionContent(section));

      panelsWrapper.appendChild(panel);
    });

    tabsRow.addEventListener('click', function (ev) {
      var target = ev.target;
      if (!(target instanceof HTMLElement)) return;

      if (!target.classList.contains('ishare2-tab-button')) {
        return;
      }

      var selectedType = target.dataset.type;
      if (!selectedType) return;

      var buttons = tabsRow.querySelectorAll('.ishare2-tab-button');
      buttons.forEach(function (b) {
        b.classList.toggle('active', b === target);
      });

      var panels = panelsWrapper.querySelectorAll('.ishare2-tab-panel');
      panels.forEach(function (p) {
        if (p instanceof HTMLElement) {
          p.classList.toggle('active', p.dataset.type === selectedType);
        }
      });
    });

    outputDiv.appendChild(tabsRow);
    outputDiv.appendChild(panelsWrapper);

    return true;
  }

  function handleInstallClick(type, id, name) {
    if (!type || !id) {
      showMessage('error', 'Não foi possível identificar o tipo ou ID da imagem.');
      return;
    }

    var confirmMsg = 'Deseja iniciar a instalação da imagem'
      + (name ? ' "' + name + '"' : '')
      + ' (' + type + ' #' + id + ')?';

    if (!window.confirm(confirmMsg)) {
      return;
    }

    var creds = getCommonCreds();
    if (!creds.eve_ip || !creds.eve_user || !creds.eve_pass) {
      showMessage('error', 'Preencha IP, usuário e senha do EVE-NG antes de instalar uma imagem pelo iShare2.');
      return;
    }

    setLoading(true);
    startInstallProgress();

    var fd = new FormData();
    fd.append('type', type);
    fd.append('id', id);
    fd.append('eve_ip', creds.eve_ip);
    fd.append('eve_user', creds.eve_user);
    fd.append('eve_pass', creds.eve_pass);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/ishare2/install', true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        setLoading(false);
        finishInstallProgress();
        var resp = null;
        try {
          resp = JSON.parse(xhr.responseText || '{}');
        } catch (err) {
          showMessage('error', 'Erro ao interpretar resposta do install do iShare2.<br><pre>' +
            (xhr.responseText || String(err)) + '</pre>');
          return;
        }

        if (!resp) {
          showMessage('error', 'Resposta vazia da API de install do iShare2.');
          return;
        }

        if (resp.success) {
          showMessage('success', resp.message || 'Instalação iniciada/realizada com sucesso pelo iShare2.');
        } else {
          showMessage('error', resp.message || 'Falha ao executar install via iShare2.');
          if (resp.stderr) {
            showMessage('error', '<pre>' + resp.stderr + '</pre>');
          }
        }
      }
    };

    xhr.onerror = function () {
      setLoading(false);
      finishInstallProgress();
      showMessage('error', 'Falha na comunicação com o servidor ao executar install no iShare2.');
    };

    xhr.send(fd);
  }

  searchBtn.addEventListener('click', function () {
    const messages = document.getElementById('messages');
    if (messages) {
      messages.innerHTML = '';
    }

    outputDiv.textContent = '';

    setLoading(true);

    const fd = new FormData();

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/ishare2/search_all', true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        setLoading(false);
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

        lastSections = Array.isArray(resp.sections) ? resp.sections : [];

        if (lastSections.length && filterWrapper && filterInput) {
          filterWrapper.style.display = 'block';
          filterInput.value = '';
          renderStructuredSections(lastSections, '');
          return;
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
      setLoading(false);
      showMessage('error', 'Falha na comunicação com o servidor ao consultar o iShare2.');
    };

    xhr.send(fd);
  });

  if (filterInput) {
    filterInput.addEventListener('input', function () {
      if (!lastSections.length) {
        return;
      }
      renderStructuredSections(lastSections, filterInput.value || '');
    });
  }
});
