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
  const t = app.t || function (key) { return key; };
  const setLangHeader = app.setLanguageHeader || function () {};

  let lastSections = [];
  let installProgressInterval = null;
  let pendingNameJobId = null;

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
    progressText.textContent = t('ishare2.install.start');
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
  }

  function closeNameChoiceModal() {
    var old = document.querySelector('.ishare2-name-modal');
    if (old) {
      old.remove();
    }
    pendingNameJobId = null;
  }

  function showNameChoiceModal(jobId, resp) {
    if (!jobId || pendingNameJobId === jobId) {
      return;
    }

    closeNameChoiceModal();
    pendingNameJobId = jobId;

    var overlay = document.createElement('div');
    overlay.className = 'ishare2-name-modal';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(15,23,42,0.55)';
    overlay.style.backdropFilter = 'blur(3px)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';
    overlay.style.padding = '18px';

    var modal = document.createElement('div');
    modal.style.width = '92%';
    modal.style.maxWidth = '520px';
    modal.style.background = 'rgba(10,14,26,0.97)';
    modal.style.border = '1px solid rgba(56,189,248,0.3)';
    modal.style.borderRadius = '12px';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    modal.style.boxShadow = '0 25px 60px rgba(0,0,0,0.45)';

    var header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '12px 14px';
    header.style.borderBottom = '1px solid rgba(56,189,248,0.18)';

    var title = document.createElement('div');
    title.style.fontSize = '15px';
    title.style.fontWeight = '600';
    title.style.color = '#e5e7eb';
    title.textContent = t('ishare2.install.chooseTitle');

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.style.background = 'transparent';
    closeBtn.style.color = '#cbd5e1';
    closeBtn.style.border = '1px solid rgba(248,113,113,0.4)';
    closeBtn.style.borderRadius = '8px';
    closeBtn.style.padding = '4px 10px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.addEventListener('click', function () { closeNameChoiceModal(); });

    header.appendChild(title);
    header.appendChild(closeBtn);

    var body = document.createElement('div');
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '10px';
    body.style.padding = '14px';

    var desc = document.createElement('div');
    desc.style.fontSize = '13px';
    desc.style.color = '#cbd5e1';
    desc.textContent = t('ishare2.install.chooseDesc', { baseDir: resp.base_dir || '/opt/unetlab/addons/qemu' });

    var label = document.createElement('label');
    label.style.fontSize = '12px';
    label.style.color = '#9ca3af';
    label.textContent = t('ishare2.install.chooseLabel');

    var input = document.createElement('input');
    input.type = 'text';
    input.value = resp.suggested_name || resp.current_name || '';
    input.placeholder = t('ishare2.install.choosePlaceholder');
    input.style.padding = '10px 12px';
    input.style.borderRadius = '8px';
    input.style.border = '1px solid rgba(148,163,184,0.35)';
    input.style.background = 'rgba(15,23,42,0.6)';
    input.style.color = '#e5e7eb';
    input.style.fontSize = '13px';

    body.appendChild(desc);
    var choices = Array.isArray(resp.choices) ? resp.choices : [];
    if (choices.length) {
      var choiceRow = document.createElement('div');
      choiceRow.style.display = 'flex';
      choiceRow.style.flexWrap = 'wrap';
      choiceRow.style.gap = '8px';

      choices.forEach(function (choice) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = t('ishare2.install.chooseUse', { name: choice });
        btn.style.padding = '6px 10px';
        btn.style.borderRadius = '999px';
        btn.style.border = '1px solid rgba(56,189,248,0.35)';
        btn.style.background = 'rgba(30,41,59,0.7)';
        btn.style.color = '#e2e8f0';
        btn.style.fontSize = '12px';
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', function () {
          input.value = choice;
          input.focus();
        });
        choiceRow.appendChild(btn);
      });

      body.appendChild(choiceRow);
    }

    body.appendChild(label);
    body.appendChild(input);

    var footer = document.createElement('div');
    footer.style.display = 'flex';
    footer.style.justifyContent = 'flex-end';
    footer.style.gap = '10px';
    footer.style.padding = '0 14px 14px 14px';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = t('ishare2.install.chooseCancel');
    cancelBtn.addEventListener('click', function () {
      closeNameChoiceModal();
    });

    var confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'btn-primary';
    confirmBtn.textContent = t('ishare2.install.chooseConfirm');
    confirmBtn.addEventListener('click', function () {
      var name = (input.value || '').trim();
      if (!name) {
        showMessage('error', t('ishare2.install.chooseInvalid'));
        return;
      }
      if (name.indexOf('-') === -1) {
        showMessage('error', t('ishare2.install.chooseNeedsHyphen'));
        return;
      }

      var fd = new FormData();
      fd.append('job_id', jobId);
      fd.append('name', name);

      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/ishare2/install_choose', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      setLangHeader(xhr);

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          var status = xhr.status || 0;
          if (status === 0) {
            showMessage('error', t('ishare2.install.commFail'));
            return;
          }

          var respChoose = null;
          try {
            respChoose = JSON.parse(xhr.responseText || '{}');
          } catch (err) {
            showMessage('error', t('ishare2.install.parseError', { status: status }));
            return;
          }

          if (!respChoose || respChoose.success === false) {
            showMessage('error', (respChoose && respChoose.message) || t('ishare2.install.fail'));
            return;
          }

          showMessage('success', respChoose.message || t('ishare2.install.chooseResumed'));
          closeNameChoiceModal();
          setLoading(true);
        }
      };

      xhr.onerror = function () {
        showMessage('error', t('ishare2.install.commFail'));
      };

      xhr.send(fd);
    });

    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        confirmBtn.click();
      }
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    setTimeout(function () { input.focus(); }, 50);
  }

  function finishInstallProgress() {
    if (!progressContainer || !progressBar || !progressText) return;
    if (installProgressInterval) {
      clearInterval(installProgressInterval);
      installProgressInterval = null;
    }
    progressBar.style.width = '100%';
    setTimeout(function () {
      progressText.style.display = 'none';
      progressContainer.style.display = 'none';
      progressBar.style.width = '0%';
    }, 800);
  }

  function startInstallPolling(jobId) {
    if (!jobId) {
      return;
    }

    if (installProgressInterval) {
      clearInterval(installProgressInterval);
      installProgressInterval = null;
    }

    function poll() {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/ishare2/install_progress?job_id=' + encodeURIComponent(jobId), true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      setLangHeader(xhr);

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          var status = xhr.status || 0;

          if (status === 0) {
            // Falha de rede temporária; não finaliza o job de imediato.
            return;
          }

          if (status === 404) {
            clearInterval(installProgressInterval);
            installProgressInterval = null;
            setLoading(false);
            finishInstallProgress();
            showMessage('error', t('ishare2.install.notFound'));
            return;
          }

          var resp = null;
          try {
            resp = JSON.parse(xhr.responseText || '{}');
          } catch (err) {
            // Não interrompe imediatamente, apenas ignora essa iteração.
            return;
          }

          if (!resp) {
            return;
          }

          var progress = typeof resp.progress === 'number' ? resp.progress : 0;
          var phase = resp.phase || '';
          var msg = resp.message || '';

          if (progressContainer && progressBar && progressText) {
            progressContainer.style.display = 'block';
            progressText.style.display = 'block';
            progressBar.style.width = progress + '%';

            if (phase === 'pull') {
              progressText.textContent = t('ishare2.install.pull', { progress: progress });
            } else if (phase === 'copy') {
              progressText.textContent = t('ishare2.install.copy', { progress: progress });
            } else if (phase === 'fix') {
              progressText.textContent = t('ishare2.install.fix', { progress: progress });
            } else {
              progressText.textContent = msg || t('ishare2.install.generic', { progress: progress });
            }
          }

          var jobStatus = resp.status || '';
          if (jobStatus === 'needs_input') {
            if (progressText) {
              progressText.style.display = 'block';
              progressText.textContent = t('ishare2.install.waitingName');
            }
            showNameChoiceModal(jobId, resp);
            setLoading(false);
            return;
          }
          if (jobStatus === 'success' || jobStatus === 'error') {
            clearInterval(installProgressInterval);
            installProgressInterval = null;
            setLoading(false);
            closeNameChoiceModal();
            finishInstallProgress();

            if (jobStatus === 'success') {
              showMessage('success', msg || t('ishare2.install.success'));
            } else {
              var errText = resp.error || resp.stderr || msg || t('ishare2.install.fail');
              showMessage('error', errText);
            }
          }
        }
      };

      xhr.onerror = function () {
        // Falha pontual na consulta de progresso; a próxima iteração tentará novamente.
      };

      xhr.send(null);
    }

    // Dispara uma primeira consulta imediata e depois em intervalo.
    poll();
    installProgressInterval = setInterval(poll, 2000);
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
    countSpan.textContent = t('ishare2.list.count', { count: items.length });

    headerDiv.appendChild(titleSpan);
    headerDiv.appendChild(countSpan);
    sectionDiv.appendChild(headerDiv);

    if (!items.length) {
      var emptyDiv = document.createElement('div');
      emptyDiv.className = 'images-empty';
      emptyDiv.textContent = t('ishare2.list.none');
      sectionDiv.appendChild(emptyDiv);
      return sectionDiv;
    }

    var headerRow = document.createElement('div');
    headerRow.className = 'ishare2-items-header';

    var headers = (t('ishare2.list.headers') || 'ID,Name,Size,').split(',');
    headers.forEach(function (h) {
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
      btn.innerHTML = '<span class="icon">⬇</span><span>' + t('ishare2.installButton') + '</span>';
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
      showMessage('error', t('ishare2.install.missingIds'));
      return;
    }

    var confirmMsg = t('ishare2.install.confirm', {
      namePart: name ? '"' + name + '" ' : '',
      type: type,
      id: id
    });

    if (!window.confirm(confirmMsg)) {
      return;
    }

    var creds = getCommonCreds();
    if (!creds.eve_ip || !creds.eve_user || !creds.eve_pass) {
      showMessage('error', t('ishare2.install.missingCreds'));
      return;
    }

    setLoading(true);
    startInstallProgress();

    var fd = new FormData();
    fd.append('type', type);
    fd.append('id', id);
    if (name) {
      fd.append('name', name);
    }
    fd.append('eve_ip', creds.eve_ip);
    fd.append('eve_user', creds.eve_user);
    fd.append('eve_pass', creds.eve_pass);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/ishare2/install_async', true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    setLangHeader(xhr);

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        var status = xhr.status || 0;

        if (status === 504) {
          showMessage(
            'error',
            t('ishare2.install.timeout')
          );
          setLoading(false);
          finishInstallProgress();
          return;
        }

        if (status === 0) {
          showMessage(
            'error',
            t('ishare2.install.noServer')
          );
          setLoading(false);
          finishInstallProgress();
          return;
        }

        var resp = null;
        try {
          resp = JSON.parse(xhr.responseText || '{}');
        } catch (err) {
          showMessage(
            'error',
            t('ishare2.install.parseError', { status: status })
          );
          setLoading(false);
          finishInstallProgress();
          return;
        }

        if (!resp) {
          showMessage('error', t('ishare2.install.empty'));
          setLoading(false);
          finishInstallProgress();
          return;
        }

        if (!resp.success || !resp.job_id) {
          showMessage('error', resp.message || t('ishare2.install.failStart'));
          setLoading(false);
          finishInstallProgress();
          return;
        }

        showMessage('success', resp.message || t('ishare2.install.started'));
        startInstallPolling(resp.job_id);
      }
    };

    xhr.onerror = function () {
      setLoading(false);
      finishInstallProgress();
      showMessage('error', t('ishare2.install.commFail'));
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
    setLangHeader(xhr);

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        setLoading(false);
        var status = xhr.status || 0;

        if (status === 504) {
          showMessage(
            'error',
            t('ishare2.search.timeout')
          );
          return;
        }

        if (status === 0) {
          showMessage(
            'error',
            t('ishare2.search.noServer')
          );
          return;
        }

        let resp = null;
        try {
          resp = JSON.parse(xhr.responseText || '{}');
        } catch (err) {
          showMessage(
            'error',
            t('ishare2.search.parseError', { status: status })
          );
          return;
        }

        if (!resp) {
          showMessage('error', t('ishare2.search.empty'));
          return;
        }

        if (!resp.success) {
          showMessage('error', resp.message || t('ishare2.search.fail'));
          if (resp.stderr) {
            showMessage('error', '<pre>' + resp.stderr + '</pre>');
          }
        } else {
          showMessage('success', resp.message || t('ishare2.search.success'));
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
          outputDiv.textContent = t('ishare2.search.noOutput');
        }
      }
    };

    xhr.onerror = function () {
      setLoading(false);
      showMessage('error', t('ishare2.search.noServer'));
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

  window.addEventListener('netconfig:language-changed', function () {
    if (lastSections.length) {
      renderStructuredSections(lastSections, filterInput ? filterInput.value : '');
    }
  });
});
