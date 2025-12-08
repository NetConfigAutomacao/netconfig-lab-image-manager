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
      div.textContent = 'Nenhum template encontrado.';
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

  if (listTemplatesBtn) {
    listTemplatesBtn.addEventListener('click', function () {
      const messages = document.getElementById('messages');
      if (messages) {
        messages.innerHTML = '';
      }
      if (templatesListDiv) {
        templatesListDiv.innerHTML = '';
      }

      const creds = getCommonCreds();
      const eve_ip = creds.eve_ip;
      const eve_user = creds.eve_user;
      const eve_pass = creds.eve_pass;

      if (!eve_ip || !eve_user || !eve_pass) {
        showMessage('error', 'Preencha IP, usuário e senha para listar templates.');
        return;
      }

      const fd = new FormData();
      fd.append('eve_ip', eve_ip);
      fd.append('eve_user', eve_user);
      fd.append('eve_pass', eve_pass);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/templates/list', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          let resp = null;
          try {
            resp = JSON.parse(xhr.responseText || '{}');
          } catch (err) {
            showMessage('error', 'Erro ao interpretar resposta da API de templates.<br><pre>' +
              (xhr.responseText || String(err)) + '</pre>');
            return;
          }

          if (!resp) {
            showMessage('error', 'Resposta vazia da API de templates.');
            return;
          }

          if (!resp.success) {
            showMessage('error', resp.message || 'Falha ao listar templates.');
          } else {
            showMessage('success', resp.message || 'Templates listados com sucesso.');
          }

          const templates = (resp.templates && resp.templates.all) || [];
          currentTemplates = templates;
          renderTemplateList(templateSearchInput ? templateSearchInput.value : '');
        }
      };

      xhr.onerror = function () {
        showMessage('error', 'Falha na comunicação com o servidor ao listar templates.');
      };

      xhr.send(fd);
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
        showMessage('error', 'Preencha IP, usuário e senha para carregar o template.');
        return;
      }
      if (!templateName) {
        showMessage('error', 'Informe o nome do arquivo do template (ex: huaweine40.yml).');
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

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          let resp = null;
          try {
            resp = JSON.parse(xhr.responseText || '{}');
          } catch (err) {
            showMessage('error', 'Erro ao interpretar resposta.<br><pre>' +
              (xhr.responseText || String(err)) + '</pre>');
            return;
          }

          if (!resp.success) {
            showMessage('error', resp.message || 'Falha ao buscar template.');
            return;
          }

          if (templateContentInput) {
            templateContentInput.value = resp.content || '';
          }
          showMessage('success', resp.message || 'Template carregado.');
        }
      };

      xhr.onerror = function () {
        showMessage('error', 'Falha na comunicação com o servidor.');
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
        showMessage('error', 'Preencha IP, usuário e senha para salvar o template.');
        return;
      }
      if (!templateName) {
        showMessage('error', 'Informe o nome do arquivo do template.');
        return;
      }
      if (!templateContent.trim()) {
        showMessage('error', 'Preencha o conteúdo YAML antes de salvar.');
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

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          let resp = null;
          try {
            resp = JSON.parse(xhr.responseText || '{}');
          } catch (err) {
            showMessage('error', 'Erro ao interpretar resposta.<br><pre>' +
              (xhr.responseText || String(err)) + '</pre>');
            return;
          }

          if (resp.success) {
            showMessage('success', resp.message || 'Template enviado com sucesso.');
          } else {
            showMessage('error', resp.message || 'Falha ao enviar template.');
            if (resp.errors && resp.errors.length) {
              resp.errors.forEach(function (err) {
                const detail = [];
                if (err.target) detail.push('<b>Destino:</b> ' + err.target);
                if (err.step) detail.push('<b>Etapa:</b> ' + err.step);
                if (err.stdout) detail.push('<pre>' + err.stdout + '</pre>');
                if (err.stderr) detail.push('<pre>' + err.stderr + '</pre>');
                showMessage('error', detail.join('<br>'));
              });
            }
          }
        }
      };

      xhr.onerror = function () {
        showMessage('error', 'Falha na comunicação com o servidor.');
      };

      xhr.send(fd);
    });
  }
});

