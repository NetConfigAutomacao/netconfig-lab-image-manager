/*
 * This file is part of NetConfig Lab Image Manager.
 *
 * NetConfig Lab Image Manager is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

document.addEventListener('DOMContentLoaded', function () {
  const templateNameInput = document.getElementById('template_yaml_name');
  const templateContentInput = document.getElementById('template_content');
  const loadTemplateBtn = document.getElementById('loadTemplateBtn');
  const saveTemplateBtn = document.getElementById('saveTemplateBtn');

  const listTemplatesBtn = document.getElementById('listTemplatesBtn');
  const templateSearchInput = document.getElementById('template_search');
  const templatesListDiv = document.getElementById('templatesList');

  const app = window.NetConfigApp || {};
  const showMessage = app.showMessage || function () {};
  const getCommonCreds = app.getCommonCreds || function () {
    return { eve_ip: '', eve_user: '', eve_pass: '' };
  };
  const t = app.t || function (key) { return key; };
  const setLangHeader = app.setLanguageHeader || function () {};

  let currentTemplates = [];

  function renderTemplateList(filterText) {
    if (!templatesListDiv) return;

    const q = (filterText || '').toLowerCase();
    templatesListDiv.innerHTML = '';

    const filtered = currentTemplates.filter(function (name) {
      return name.toLowerCase().includes(q);
    });

    if (!filtered.length) {
      const div = document.createElement('div');
      div.className = 'templates-empty';
      div.textContent = t('templates.none');
      templatesListDiv.appendChild(div);
      return;
    }

    filtered.forEach(function (name) {
      const pill = document.createElement('div');
      pill.className = 'template-pill';
      pill.textContent = name;
      pill.title = name;

      pill.addEventListener('click', function () {
        const allPills = templatesListDiv.querySelectorAll('.template-pill');
        allPills.forEach(function (p) {
          p.classList.remove('active');
        });
        pill.classList.add('active');

        if (templateNameInput) {
          templateNameInput.value = name;
        }
        if (loadTemplateBtn) {
          loadTemplateBtn.click();
        }
      });

      templatesListDiv.appendChild(pill);
    });
  }

  function loadTemplatesList(options) {
    options = options || {};
    if (!templatesListDiv) {
      return Promise.resolve({ success: false, reason: 'no-target' });
    }

    if (!options.skipClearMessages) {
      const messages = document.getElementById('messages');
      if (messages) {
        messages.innerHTML = '';
      }
    }
    templatesListDiv.innerHTML = '';

    const creds = getCommonCreds();
    const eve_ip = creds.eve_ip;
    const eve_user = creds.eve_user;
    const eve_pass = creds.eve_pass;

    if (!eve_ip || !eve_user || !eve_pass) {
      if (!options.silent) {
        showMessage('error', t('templates.missingCreds'));
      }
      return Promise.resolve({ success: false, reason: 'missing-creds' });
    }

    const fd = new FormData();
    fd.append('eve_ip', eve_ip);
    fd.append('eve_user', eve_user);
    fd.append('eve_pass', eve_pass);

    return new Promise(function (resolve) {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/templates/list', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      setLangHeader(xhr);

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          let resp = null;
          try {
            resp = JSON.parse(xhr.responseText || '{}');
          } catch (err) {
            if (!options.silent) {
              showMessage('error', t('templates.parseError') + '<br><pre>' +
                (xhr.responseText || String(err)) + '</pre>');
            }
            return resolve({ success: false, reason: 'parse' });
          }

          if (!resp) {
            if (!options.silent) {
              showMessage('error', t('templates.emptyResponse'));
            }
            return resolve({ success: false, reason: 'empty' });
          }

          if (!resp.success) {
            if (!options.silent) {
              showMessage('error', resp.message || t('templates.requestFail'));
            }
          } else if (!options.silent) {
            showMessage('success', resp.message || t('templates.successList'));
          }

          const templates = (resp.templates && resp.templates.all) || [];
          currentTemplates = templates;
          renderTemplateList(templateSearchInput ? templateSearchInput.value : '');
          return resolve({ success: !!resp.success, templates: templates });
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

  if (listTemplatesBtn) {
    listTemplatesBtn.addEventListener('click', function () {
      loadTemplatesList();
    });
  }

  if (templateSearchInput) {
    templateSearchInput.addEventListener('input', function () {
      renderTemplateList(templateSearchInput.value);
    });
  }

  if (loadTemplateBtn) {
    loadTemplateBtn.addEventListener('click', function () {
      const messages = document.getElementById('messages');
      if (messages) {
        messages.innerHTML = '';
      }

      const creds = getCommonCreds();
      const eve_ip = creds.eve_ip;
      const eve_user = creds.eve_user;
      const eve_pass = creds.eve_pass;
      const templateName = templateNameInput && templateNameInput.value
        ? templateNameInput.value.trim()
        : '';

      if (!eve_ip || !eve_user || !eve_pass) {
        showMessage('error', t('templates.missingCreds'));
        return;
      }
      if (!templateName) {
        showMessage('error', t('templates.missingName'));
        return;
      }

      const fd = new FormData();
      fd.append('eve_ip', eve_ip);
      fd.append('eve_user', eve_user);
      fd.append('eve_pass', eve_pass);
      fd.append('template_name', templateName);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/templates/get', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      setLangHeader(xhr);

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          let resp = null;
          try {
            resp = JSON.parse(xhr.responseText || '{}');
          } catch (err) {
            showMessage('error', t('templates.parseError') + '<br><pre>' +
              (xhr.responseText || String(err)) + '</pre>');
            return;
          }

          if (!resp.success) {
            showMessage('error', resp.message || t('templates.loadFail'));
            return;
          }

          if (templateContentInput) {
            templateContentInput.value = resp.content || '';
          }
          showMessage('success', resp.message || t('templates.loadSuccess'));
        }
      };

      xhr.onerror = function () {
        showMessage('error', t('msg.networkError'));
      };

      xhr.send(fd);
    });
  }

  if (saveTemplateBtn) {
    saveTemplateBtn.addEventListener('click', function () {
      const messages = document.getElementById('messages');
      if (messages) {
        messages.innerHTML = '';
      }

      const creds = getCommonCreds();
      const eve_ip = creds.eve_ip;
      const eve_user = creds.eve_user;
      const eve_pass = creds.eve_pass;
      const templateName = templateNameInput && templateNameInput.value
        ? templateNameInput.value.trim()
        : '';
      const templateContent = templateContentInput ? templateContentInput.value : '';

      if (!eve_ip || !eve_user || !eve_pass) {
        showMessage('error', t('templates.saveMissingCreds'));
        return;
      }
      if (!templateName) {
        showMessage('error', t('templates.saveMissingName'));
        return;
      }
      if (!templateContent.trim()) {
        showMessage('error', t('templates.saveMissingContent'));
        return;
      }

      const fd = new FormData();
      fd.append('eve_ip', eve_ip);
      fd.append('eve_user', eve_user);
      fd.append('eve_pass', eve_pass);
      fd.append('template_name', templateName);
      fd.append('template_content', templateContent);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/templates/upload', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      setLangHeader(xhr);

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          let resp = null;
          try {
            resp = JSON.parse(xhr.responseText || '{}');
          } catch (err) {
            showMessage('error', t('templates.parseError') + '<br><pre>' +
              (xhr.responseText || String(err)) + '</pre>');
            return;
          }

          if (resp.success) {
            showMessage('success', resp.message || t('templates.saveSuccess'));
          } else {
            showMessage('error', resp.message || t('templates.saveFail'));
            if (resp.errors && resp.errors.length) {
              resp.errors.forEach(function (err) {
                const detail = [];
                if (err.target) detail.push('<b>' + t('labels.target') + '</b> ' + err.target);
                if (err.step) detail.push('<b>' + t('labels.step') + '</b> ' + err.step);
                if (err.stdout) detail.push('<pre>' + err.stdout + '</pre>');
                if (err.stderr) detail.push('<pre>' + err.stderr + '</pre>');
                showMessage('error', detail.join('<br>'));
              });
            }
          }
        }
      };

      xhr.onerror = function () {
        showMessage('error', t('msg.networkError'));
      };

      xhr.send(fd);
    });
  }

  window.addEventListener('netconfig:language-changed', function () {
    renderTemplateList(templateSearchInput ? templateSearchInput.value : '');
  });

  window.NetConfigApp = window.NetConfigApp || {};
  window.NetConfigApp.loadTemplates = loadTemplatesList;
});
