/*
 * This file is part of NetConfig Lab Image Manager.
 *
 * NetConfig Lab Image Manager is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

document.addEventListener('DOMContentLoaded', () => {
  // -------------------- ELEMENTOS BASE --------------------
  const form = document.getElementById('uploadForm');
  const messages = document.getElementById('messages');

  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');

  const checkBtn = document.getElementById('checkImagesBtn');
  const imagesResult = document.getElementById('imagesResult');

  const templateNameInput = document.getElementById('template_yaml_name');
  const templateContentInput = document.getElementById('template_content');
  const loadTemplateBtn = document.getElementById('loadTemplateBtn');
  const saveTemplateBtn = document.getElementById('saveTemplateBtn');

  const radioButtons = document.querySelectorAll("input[name='image_type']");
  const baseDirInput = document.getElementById("eve_base_dir");

  const tabButtons = document.querySelectorAll(".tab-button");
  const tabContents = document.querySelectorAll(".tab-content");

  const listTemplatesBtn = document.getElementById('listTemplatesBtn');
  const templateSearchInput = document.getElementById('template_search');
  const templatesListDiv = document.getElementById('templatesList');

  // ---- ICONS ----
  const listIconsBtn = document.getElementById('listIconsBtn');
  const iconsListDiv = document.getElementById('iconsList');
  const uploadIconBtn = document.getElementById('uploadIconBtn');
  const iconFileInput = document.getElementById('icon_file');

  // ---- FIX PERMISSIONS ----
  const fixPermissionsBtn = document.getElementById('fixPermissionsBtn');

  let currentTemplates = []; // lista "all" vinda da API de templates

  // -------------------- FUNÇÕES DE UI --------------------
  function showMessage(type, text) {
    const div = document.createElement('div');
    div.className = 'alert ' + (type === 'error' ? 'alert-error' : 'alert-success');
    div.innerHTML = text;
    messages.appendChild(div);
  }

  function resetProgress() {
    setTimeout(() => {
      if (!progressContainer || !progressText || !progressBar) return;
      progressContainer.style.display = 'none';
      progressText.style.display = 'none';
      progressBar.style.width = '0%';
    }, 1500);
  }

  function getCommonCreds() {
    const eve_ip = form.elements['eve_ip'].value.trim();
    const eve_user = form.elements['eve_user'].value.trim();
    const eve_pass = form.elements['eve_pass'].value.trim();
    return { eve_ip, eve_user, eve_pass };
  }

  // -------------------- TABS --------------------
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));

      btn.classList.add("active");
      const targetId = btn.dataset.tab;
      const content = document.getElementById(targetId);
      if (content) {
        content.classList.add("active");
      }

      messages.innerHTML = "";
    });
  });

  // -------------------- RADIO DO TIPO DE IMAGEM --------------------
  radioButtons.forEach(radio => {
    radio.addEventListener("change", () => {
      if (!baseDirInput) return;
      if (radio.value === "qemu") baseDirInput.value = "/opt/unetlab/addons/qemu";
      if (radio.value === "iol") baseDirInput.value = "/opt/unetlab/addons/iol/bin";
      if (radio.value === "dynamips") baseDirInput.value = "/opt/unetlab/addons/dynamips";
    });
  });

  // -------------------- UPLOAD DE IMAGENS --------------------
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    messages.innerHTML = '';

    const formData = new FormData(form);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    if (xhr.upload && progressContainer && progressBar && progressText) {
      xhr.upload.addEventListener('progress', function (e) {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
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
        } catch (e) {
          showMessage('error', 'Erro ao interpretar resposta do servidor.<br><pre>' +
            (xhr.responseText || String(e)) + '</pre>');
          resetProgress();
          return;
        }

        if (xhr.status === 200 && resp.success) {
          if (progressBar && progressText) {
            progressBar.style.width = '100%';
            progressText.textContent = 'Processando no servidor...';
          }
          showMessage('success', resp.message || 'Upload concluído com sucesso.');
        } else {
          showMessage('error', resp.message || 'Erro ao processar upload.');
          if (resp.errors && resp.errors.length) {
            resp.errors.forEach(err => {
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

  // -------------------- AGRUPAR IMAGENS POR VENDOR --------------------
  function groupByVendor(list) {
    const groups = {};
    list.forEach(name => {
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

    return Object.values(groups).sort((a, b) =>
      a.vendor.toLowerCase().localeCompare(b.vendor.toLowerCase())
    );
  }

  // -------------------- CHECK DE IMAGENS EXISTENTES --------------------
  if (checkBtn) {
    checkBtn.addEventListener('click', function () {
      messages.innerHTML = '';
      imagesResult.style.display = 'none';
      imagesResult.innerHTML = '';

      const { eve_ip, eve_user, eve_pass } = getCommonCreds();

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
          } catch (e) {
            showMessage('error', 'Erro ao interpretar resposta do servidor.<br><pre>' +
              (xhr.responseText || String(e)) + '</pre>');
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
            ['dynamips', 'Dynamips', '/opt/unetlab/addons/dynamips'],
          ];

          let html = `
            <div class="images-title-row">
              <span><strong>Imagens existentes no EVE-NG</strong></span>
              <span>Atualizado agora</span>
            </div>
            <div class="images-sections">
          `;

          sections.forEach(([key, label, path]) => {
            const list = images[key] || [];
            const totalCount = list.length;

            html += `
              <div class="images-section">
                <div class="images-section-header">
                  <div class="images-section-main">
                    <span class="images-section-title">${label}</span>
                    <span class="images-section-path">${path}</span>
                  </div>
                  <span class="images-section-count">${totalCount} template${totalCount === 1 ? '' : 's'}</span>
                </div>
            `;

            if (totalCount === 0) {
              html += `<div class="images-empty">Nenhum template encontrado.</div>`;
            } else {
              const groups = groupByVendor(list);
              groups.forEach(group => {
                const count = group.items.length;
                html += `
                  <div class="vendor-group">
                    <div class="vendor-header">
                      <span class="vendor-name">${group.vendor}</span>
                      <span class="vendor-count">${count} versão${count === 1 ? '' : 'es'}</span>
                    </div>
                    <div class="vendor-tags">
                `;
                group.items.forEach(entry => {
                  html += `<span class="tag-pill" title="${entry.full}">${entry.version}</span>`;
                });
                html += `</div></div>`;
              });
            }
            html += `</div>`;
          });

          html += `</div>`;
          imagesResult.innerHTML = html;
          imagesResult.style.display = 'block';
        }
      };

      xhr.onerror = function () {
        showMessage('error', 'Falha na comunicação com o servidor.');
      };

      xhr.send(fd);
    });
  }

  // -------------------- LISTAGEM DE TEMPLATES (EVE) --------------------
  function renderTemplateList(filterText) {
    if (!templatesListDiv) return;

    const q = (filterText || '').toLowerCase();
    templatesListDiv.innerHTML = '';

    const filtered = currentTemplates.filter(name =>
      name.toLowerCase().includes(q)
    );

    if (!filtered.length) {
      const div = document.createElement('div');
      div.className = 'templates-empty';
      div.textContent = 'Nenhum template encontrado.';
      templatesListDiv.appendChild(div);
      return;
    }

    filtered.forEach(name => {
      const pill = document.createElement('div');
      pill.className = 'template-pill';
      pill.textContent = name;
      pill.title = name;

      pill.addEventListener('click', () => {
        const allPills = templatesListDiv.querySelectorAll('.template-pill');
        allPills.forEach(p => p.classList.remove('active'));
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
    listTemplatesBtn.addEventListener('click', () => {
      messages.innerHTML = '';
      if (templatesListDiv) templatesListDiv.innerHTML = '';

      const { eve_ip, eve_user, eve_pass } = getCommonCreds();

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
          } catch (e) {
            showMessage('error', 'Erro ao interpretar resposta da API de templates.<br><pre>' +
              (xhr.responseText || String(e)) + '</pre>');
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
    templateSearchInput.addEventListener('input', () => {
      renderTemplateList(templateSearchInput.value);
    });
  }

  // -------------------- TEMPLATE YAML: CARREGAR --------------------
  if (loadTemplateBtn) {
    loadTemplateBtn.addEventListener('click', function () {
      messages.innerHTML = '';

      const { eve_ip, eve_user, eve_pass } = getCommonCreds();
      const templateName = templateNameInput.value.trim();

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
          } catch (e) {
            showMessage('error', 'Erro ao interpretar resposta.<br><pre>' +
              (xhr.responseText || String(e)) + '</pre>');
            return;
          }

          if (!resp.success) {
            showMessage('error', resp.message || 'Falha ao buscar template.');
            return;
          }

          templateContentInput.value = resp.content || '';
          showMessage('success', resp.message || 'Template carregado.');
        }
      };

      xhr.onerror = function () {
        showMessage('error', 'Falha na comunicação com o servidor.');
      };

      xhr.send(fd);
    });
  }

  // -------------------- TEMPLATE YAML: SALVAR --------------------
  if (saveTemplateBtn) {
    saveTemplateBtn.addEventListener('click', function () {
      messages.innerHTML = '';

      const { eve_ip, eve_user, eve_pass } = getCommonCreds();
      const templateName = templateNameInput.value.trim();
      const templateContent = templateContentInput.value;

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
          } catch (e) {
            showMessage('error', 'Erro ao interpretar resposta.<br><pre>' +
              (xhr.responseText || String(e)) + '</pre>');
            return;
          }

          if (resp.success) {
            showMessage('success', resp.message || 'Template enviado com sucesso.');
          } else {
            showMessage('error', resp.message || 'Falha ao enviar template.');
            if (resp.errors && resp.errors.length) {
              resp.errors.forEach(err => {
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

  // ============================================================
  //                      ÍCONES (ICONS TAB)
  // ============================================================

  function renderIconsList(icons, eve_ip) {
    if (!iconsListDiv) return;

    iconsListDiv.innerHTML = '';

    if (!icons || !icons.length) {
      const div = document.createElement('div');
      div.className = 'icons-empty';
      div.textContent = 'Nenhum ícone encontrado.';
      iconsListDiv.appendChild(div);
      return;
    }

    icons.forEach(name => {
      const pill = document.createElement('div');
      pill.className = 'icon-pill';
      pill.title = name;

      const img = document.createElement('img');
      // EVE normalmente serve os ícones em /images/icons/<arquivo>.png
      img.src = `http://${eve_ip}/images/icons/${encodeURIComponent(name)}`;
      img.alt = name;

      const span = document.createElement('span');
      span.textContent = name;

      pill.appendChild(img);
      pill.appendChild(span);

      iconsListDiv.appendChild(pill);
    });
  }

  if (listIconsBtn) {
    listIconsBtn.addEventListener('click', () => {
      messages.innerHTML = '';
      if (iconsListDiv) iconsListDiv.innerHTML = '';

      const { eve_ip, eve_user, eve_pass } = getCommonCreds();

      if (!eve_ip || !eve_user || !eve_pass) {
        showMessage('error', 'Preencha IP, usuário e senha para listar ícones.');
        return;
      }

      const fd = new FormData();
      fd.append('eve_ip', eve_ip);
      fd.append('eve_user', eve_user);
      fd.append('eve_pass', eve_pass);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/icons/list', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          let resp = null;
          try {
            resp = JSON.parse(xhr.responseText || '{}');
          } catch (e) {
            showMessage('error', 'Erro ao interpretar resposta da API de ícones.<br><pre>' +
              (xhr.responseText || String(e)) + '</pre>');
            return;
          }

          if (!resp) {
            showMessage('error', 'Resposta vazia da API de ícones.');
            return;
          }

          if (!resp.success) {
            showMessage('error', resp.message || 'Falha ao listar ícones.');
          } else {
            showMessage('success', resp.message || 'Ícones listados com sucesso.');
          }

          const icons = resp.icons || [];
          renderIconsList(icons, eve_ip);
        }
      };

      xhr.onerror = function () {
        showMessage('error', 'Falha na comunicação com o servidor ao listar ícones.');
      };

      xhr.send(fd);
    });
  }

  if (uploadIconBtn) {
    uploadIconBtn.addEventListener('click', () => {
      messages.innerHTML = '';

      const { eve_ip, eve_user, eve_pass } = getCommonCreds();
      const file = iconFileInput ? iconFileInput.files[0] : null;

      if (!eve_ip || !eve_user || !eve_pass) {
        showMessage('error', 'Preencha IP, usuário e senha para enviar o ícone.');
        return;
      }

      if (!file) {
        showMessage('error', 'Selecione um arquivo PNG para enviar.');
        return;
      }

      const fd = new FormData();
      fd.append('eve_ip', eve_ip);
      fd.append('eve_user', eve_user);
      fd.append('eve_pass', eve_pass);
      fd.append('icon_file', file, file.name);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/icons/upload', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          let resp = null;
          try {
            resp = JSON.parse(xhr.responseText || '{}');
          } catch (e) {
            showMessage('error', 'Erro ao interpretar resposta do upload de ícone.<br><pre>' +
              (xhr.responseText || String(e)) + '</pre>');
            return;
          }

          if (resp.success) {
            showMessage('success', resp.message || 'Ícone enviado com sucesso.');
          } else {
            showMessage('error', resp.message || 'Falha ao enviar ícone.');
          }
        }
      };

      xhr.onerror = function () {
        showMessage('error', 'Falha na comunicação com o servidor ao enviar ícone.');
      };

      xhr.send(fd);
    });
  }

  // ============================================================
  //                 BOTÃO FIX PERMISSIONS (IMAGES TAB)
  // ============================================================

  if (fixPermissionsBtn) {
    fixPermissionsBtn.addEventListener('click', () => {
      messages.innerHTML = '';

      const { eve_ip, eve_user, eve_pass } = getCommonCreds();

      if (!eve_ip || !eve_user || !eve_pass) {
        showMessage('error', 'Preencha IP, usuário e senha para executar o fix permissions.');
        return;
      }

      const fd = new FormData();
      fd.append('eve_ip', eve_ip);
      fd.append('eve_user', eve_user);
      fd.append('eve_pass', eve_pass);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/fix-permissions', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          let resp = null;
          try {
            resp = JSON.parse(xhr.responseText || '{}');
          } catch (e) {
            showMessage('error', 'Erro ao interpretar resposta do fix permissions.<br><pre>' +
              (xhr.responseText || String(e)) + '</pre>');
            return;
          }

          if (resp.success) {
            showMessage('success', resp.message || 'Fix permissions executado com sucesso.');
          } else {
            showMessage('error', resp.message || 'Falha ao executar fix permissions.');
          }
        }
      };

      xhr.onerror = function () {
        showMessage('error', 'Falha na comunicação com o servidor ao executar fix permissions.');
      };

      xhr.send(fd);
    });
  }
});
