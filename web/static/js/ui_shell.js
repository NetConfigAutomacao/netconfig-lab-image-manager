/*
 * This file is part of NetConfig Lab Image Manager.
 *
 * NetConfig Lab Image Manager is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * NetConfig Lab Image Manager is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with NetConfig Lab Image Manager.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Shell de UI do dashboard: alterna entre gate e dashboard, mantém o seletor
 * de idioma segmentado, o título da página por aba, o card de status e o
 * comportamento de drawer da sidebar em telas pequenas. Não altera os fluxos
 * de dados existentes — apenas o "chrome" da aplicação.
 */
document.addEventListener('DOMContentLoaded', function () {
  var app = window.NetConfigApp || {};
  var t = app.t || function (key) { return key; };

  var body = document.body;
  var featureArea = document.getElementById('featureArea');
  var form = document.getElementById('uploadForm');

  // Mapa aba -> chave i18n do subtítulo exibido na top bar.
  var SUBTITLE_KEYS = {
    'images-tab': 'ui.sub.images',
    'templates-tab': 'ui.sub.templates',
    'icons-tab': 'ui.sub.icons',
    'ishare2-tab': 'ui.sub.ishare2',
    'vrnetlab-tab': 'ui.sub.vrnetlab',
    'container-images-tab': 'ui.sub.containerImages',
    'labs-tab': 'ui.sub.labs',
    'system-tab': 'ui.sub.system'
  };

  /* -------------------- Idioma segmentado -------------------- */
  function syncLangButtons() {
    var current = (app.getLanguage && app.getLanguage()) || 'pt';
    document.querySelectorAll('.lang-seg-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-lang') === current);
    });
  }
  document.querySelectorAll('.lang-seg-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (app.setLanguage) app.setLanguage(btn.getAttribute('data-lang'));
      syncLangButtons();
    });
  });
  window.addEventListener('netconfig:language-changed', syncLangButtons);
  syncLangButtons();

  /* -------------------- Título por aba -------------------- */
  function setPageHeader(tabId, labelKey) {
    var title = document.getElementById('pageTitle');
    var subtitle = document.getElementById('pageSubtitle');
    if (title && labelKey) {
      title.setAttribute('data-i18n', labelKey);
      title.textContent = t(labelKey);
    }
    if (subtitle) {
      var subKey = SUBTITLE_KEYS[tabId] || '';
      if (subKey) {
        subtitle.setAttribute('data-i18n', subKey);
        subtitle.textContent = t(subKey);
        subtitle.style.display = '';
      } else {
        subtitle.style.display = 'none';
      }
    }
  }

  function updateHeaderFromActiveTab() {
    var activeBtn = document.querySelector('.nav-item.active');
    if (!activeBtn) return;
    var labelSpan = activeBtn.querySelector('[data-i18n]');
    var labelKey = labelSpan ? labelSpan.getAttribute('data-i18n') : '';
    setPageHeader(activeBtn.getAttribute('data-tab'), labelKey);
  }

  // tabs.js já troca .active; aqui só refletimos no header e fechamos o drawer.
  document.querySelectorAll('.nav-item').forEach(function (btn) {
    btn.addEventListener('click', function () {
      updateHeaderFromActiveTab();
      body.classList.remove('sidebar-open');
    });
  });
  window.addEventListener('netconfig:language-changed', updateHeaderFromActiveTab);

  /* -------------------- Card de status / host chip -------------------- */
  function getCreds() {
    if (app.getCommonCreds) return app.getCommonCreds();
    return { eve_ip: '', eve_user: '', eve_pass: '' };
  }

  function refreshConnectionInfo() {
    var creds = getCreds();
    var statusHost = document.getElementById('statusHost');
    var statusMeta = document.getElementById('statusMeta');
    var hostChip = document.getElementById('hostChip');
    var hostChipIp = document.getElementById('hostChipIp');
    var hostChipUser = document.getElementById('hostChipUser');
    var platformBadge = document.getElementById('platformBadge');
    var platformText = platformBadge && platformBadge.textContent ? platformBadge.textContent : '';

    if (statusHost) statusHost.textContent = creds.eve_ip || '--';
    if (statusMeta) {
      statusMeta.textContent = [creds.eve_user, platformText].filter(Boolean).join(' · ') || '--';
    }
    if (hostChip) hostChip.style.display = creds.eve_ip ? 'inline-flex' : 'none';
    if (hostChipIp) hostChipIp.textContent = creds.eve_ip || '--';
    if (hostChipUser) hostChipUser.textContent = creds.eve_user || '';

    // Espelha plataforma detectada no chip do System tab.
    var sysBadge = document.getElementById('platformBadgeSystem');
    var topBadge = document.getElementById('platformBadge');
    if (sysBadge && topBadge) {
      if (topBadge.textContent) {
        sysBadge.textContent = topBadge.textContent;
        sysBadge.style.display = 'inline-flex';
      } else {
        sysBadge.style.display = 'none';
      }
    }
  }

  /* -------------------- Gate <-> Dashboard -------------------- */
  function setConnected(connected) {
    body.setAttribute('data-connected', connected ? 'true' : 'false');
    if (connected) {
      refreshConnectionInfo();
      updateHeaderFromActiveTab();
      window.scrollTo(0, 0);
    }
  }

  if (featureArea) {
    var observer = new MutationObserver(function () {
      setConnected(featureArea.dataset.state === 'ready');
    });
    observer.observe(featureArea, { attributes: true, attributeFilter: ['data-state'] });
    // Estado inicial.
    setConnected(featureArea.dataset.state === 'ready');
  }

  // Atualiza badges de plataforma/recursos quando o System é recarregado.
  window.addEventListener('netconfig:language-changed', refreshConnectionInfo);

  /* -------------------- Disconnect -------------------- */
  var disconnectBtn = document.getElementById('disconnectBtn');
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', function () {
      if (featureArea) featureArea.dataset.state = 'locked';
      var pass = form && form.elements ? form.elements['eve_pass'] : null;
      if (pass) pass.value = '';
      var messages = document.getElementById('messages');
      if (messages) messages.innerHTML = '';
      document.querySelectorAll('[data-requires-load="true"]').forEach(function (b) {
        if (b instanceof HTMLButtonElement) { b.disabled = true; b.classList.add('btn-disabled'); }
      });
      setConnected(false);
    });
  }

  /* -------------------- Drawer da sidebar (mobile) -------------------- */
  var sidebarToggle = document.getElementById('sidebarToggle');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function () {
      body.classList.toggle('sidebar-open');
    });
  }

  /* -------------------- Versão na sidebar -------------------- */
  function syncSidebarVersion() {
    var value = document.getElementById('appVersionValue');
    var sidebarVersion = document.getElementById('sidebarVersion');
    if (value && sidebarVersion) sidebarVersion.textContent = value.textContent || '--';
  }
  var versionValue = document.getElementById('appVersionValue');
  if (versionValue) {
    new MutationObserver(syncSidebarVersion).observe(versionValue, { childList: true, characterData: true, subtree: true });
  }
  syncSidebarVersion();
});
