/*
 * This file is part of NetConfig Lab Image Manager.
 *
 * NetConfig Lab Image Manager is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

document.addEventListener('DOMContentLoaded', function () {
  const app = window.NetConfigApp || {};
  const t = app.t || function (key) { return key; };
  var currentAppVersion = '';
  var lastUpdateInfo = null;

  function setAppVersionBadge(version) {
    const pill = document.getElementById('appVersionPill');
    const value = document.getElementById('appVersionValue');
    if (!pill || !value) return;

    if (!version) {
      pill.style.display = 'none';
      value.textContent = '--';
      pill.title = '';
      return;
    }

    value.textContent = version;
    pill.style.display = 'inline-flex';
    pill.title = t('ui.version.tooltip', { version: version });
    pill.classList.remove('has-update');
    pill.onclick = null;
  }

  function loadAppVersionFromApi() {
    return new Promise(function (resolve, reject) {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/version', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      if (window.NetConfigApp && window.NetConfigApp.setLanguageHeader) {
        window.NetConfigApp.setLanguageHeader(xhr);
      }
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error('HTTP ' + xhr.status));
          return;
        }
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          resolve((data && data.version) ? String(data.version) : '');
        } catch (e) {
          reject(e);
        }
      };
      xhr.onerror = function () { reject(new Error('network error')); };
      xhr.send();
    });
  }

  function loadUpdateInfoFromApi() {
    return new Promise(function (resolve, reject) {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/update', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      if (window.NetConfigApp && window.NetConfigApp.setLanguageHeader) {
        window.NetConfigApp.setLanguageHeader(xhr);
      }
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error('HTTP ' + xhr.status));
          return;
        }
        try {
          resolve(JSON.parse(xhr.responseText || '{}'));
        } catch (e) {
          reject(e);
        }
      };
      xhr.onerror = function () { reject(new Error('network error')); };
      xhr.send();
    });
  }

  function applyUpdateState(updateInfo) {
    const pill = document.getElementById('appVersionPill');
    if (!pill) return;
    lastUpdateInfo = updateInfo || null;
    if (!updateInfo || updateInfo.success !== true || updateInfo.update_available !== true) {
      pill.classList.remove('has-update');
      pill.onclick = null;
      if (currentAppVersion) {
        pill.title = t('ui.version.tooltip', { version: currentAppVersion });
      }
      renderUpdateNotice(null);
      return;
    }

    const releaseUrl = (updateInfo.release_url || '').trim();
    const latest = (updateInfo.latest_version || '').trim();
    pill.classList.add('has-update');
    pill.title = t('ui.version.updateTooltip', { current: currentAppVersion, latest: latest }) + ' · ' + t('ui.version.updateHint');
    if (releaseUrl) {
      pill.onclick = function () {
        window.open(releaseUrl, '_blank', 'noopener');
      };
    }

    renderUpdateNotice(updateInfo);
  }

  function renderUpdateNotice(updateInfo) {
    const notice = document.getElementById('updateNotice');
    const text = document.getElementById('updateNoticeText');
    const meta = document.getElementById('updateNoticeMeta');
    const commandLabel = document.getElementById('updateCommandLabel');
    const commandText = document.getElementById('updateCommandText');
    const releaseBtn = document.getElementById('updateReleaseBtn');
    const copyBtn = document.getElementById('updateCopyBtn');
    if (!notice || !text || !meta || !commandLabel || !commandText || !releaseBtn || !copyBtn) return;

    if (!updateInfo || updateInfo.success !== true || updateInfo.update_available !== true) {
      notice.style.display = 'none';
      text.textContent = '';
      meta.textContent = '';
      meta.style.display = 'none';
      commandLabel.style.display = 'none';
      commandText.style.display = 'none';
      commandText.textContent = '';
      releaseBtn.style.display = 'none';
      releaseBtn.onclick = null;
      copyBtn.style.display = 'none';
      copyBtn.onclick = null;
      return;
    }

    const current = (updateInfo.current_version || currentAppVersion || '').trim();
    const latest = (updateInfo.latest_version || '').trim();
    const releaseUrl = (updateInfo.release_url || '').trim();
    const updateCommand = (updateInfo.update_command || '').trim();
    const dirtyWorktree = updateInfo.dirty_worktree === true;

    text.textContent = t('ui.update.summary', { current: current, latest: latest });

    if (dirtyWorktree) {
      meta.textContent = t('ui.update.dirtyWarning');
      meta.style.display = 'block';
    } else {
      meta.textContent = '';
      meta.style.display = 'none';
    }

    if (updateCommand) {
      commandLabel.style.display = 'block';
      commandText.style.display = 'block';
      commandText.textContent = updateCommand;
      copyBtn.style.display = 'inline-flex';
      copyBtn.onclick = function () {
        copyUpdateCommand(updateCommand);
      };
    } else {
      commandLabel.style.display = 'none';
      commandText.style.display = 'none';
      commandText.textContent = '';
      copyBtn.style.display = 'none';
      copyBtn.onclick = null;
    }

    if (releaseUrl) {
      releaseBtn.style.display = 'inline-flex';
      releaseBtn.onclick = function () {
        window.open(releaseUrl, '_blank', 'noopener');
      };
    } else {
      releaseBtn.style.display = 'none';
      releaseBtn.onclick = null;
    }

    notice.style.display = 'flex';
  }

  function copyUpdateCommand(command) {
    if (!command) return;
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      showMessage('error', t('ui.update.copyFail'));
      return;
    }

    navigator.clipboard.writeText(command)
      .then(function () {
        showMessage('success', t('ui.update.copySuccess'));
      })
      .catch(function () {
        showMessage('error', t('ui.update.copyFail'));
      });
  }

  function loadAppVersionFromStaticFile() {
    return new Promise(function (resolve, reject) {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/VERSION', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error('HTTP ' + xhr.status));
          return;
        }
        resolve((xhr.responseText || '').trim());
      };
      xhr.onerror = function () { reject(new Error('network error')); };
      xhr.send();
    });
  }

  function showMessage(type, text) {
    const messages = document.getElementById('messages');
    if (!messages) {
      return;
    }

    const div = document.createElement('div');
    div.className = 'alert ' + (type === 'error' ? 'alert-error' : 'alert-success');

    const content = document.createElement('div');
    content.className = 'alert-content';
    content.innerHTML = text;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'alert-close';
    closeBtn.setAttribute('aria-label', t('ui.alert.close'));
    closeBtn.title = t('ui.alert.close');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', function () {
      div.remove();
    });

    div.appendChild(content);
    div.appendChild(closeBtn);
    messages.appendChild(div);

    // Auto-dismiss após 7s (mensagens de erro também são dispensáveis manualmente).
    setTimeout(function () {
      if (div && div.parentNode) {
        div.style.transition = 'opacity .3s ease';
        div.style.opacity = '0';
        setTimeout(function () { if (div && div.parentNode) div.remove(); }, 320);
      }
    }, 7000);
  }

  function getCommonCreds() {
    const form = document.getElementById('uploadForm');
    if (!form || !form.elements) {
      return { eve_ip: '', eve_user: '', eve_pass: '' };
    }

    const eve_ip = (form.elements['eve_ip'] && form.elements['eve_ip'].value || '').trim();
    const eve_user = (form.elements['eve_user'] && form.elements['eve_user'].value || '').trim();
    const eve_pass = (form.elements['eve_pass'] && form.elements['eve_pass'].value || '').trim();
    return { eve_ip, eve_user, eve_pass };
  }

  window.NetConfigApp = window.NetConfigApp || {};
  window.NetConfigApp.showMessage = showMessage;
  window.NetConfigApp.getCommonCreds = getCommonCreds;
  window.NetConfigApp.t = window.NetConfigApp.t || t;
  window.NetConfigApp.getLanguage = window.NetConfigApp.getLanguage || function () { return 'en'; };
  window.NetConfigApp.csrfToken = '';
  window.NetConfigApp.setLanguageHeader = function (xhr) {
    if (xhr && xhr.setRequestHeader) {
      xhr.setRequestHeader('X-Language', (window.NetConfigApp.getLanguage && window.NetConfigApp.getLanguage()) || 'en');
      // CSRF (issue #75): anexa o token a todas as requisições XHR.
      if (window.NetConfigApp.csrfToken) {
        try { xhr.setRequestHeader('X-CSRF-Token', window.NetConfigApp.csrfToken); } catch (e) {}
      }
    }
  };

  // ---- Segurança: status de auth, overlay de login e aviso de modo aberto ----
  function showInsecureBanner() {
    if (document.getElementById('insecureBanner')) return;
    const bar = document.createElement('div');
    bar.id = 'insecureBanner';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99998;background:#7f1d1d;color:#fff;font-size:12px;padding:6px 14px;text-align:center';
    bar.textContent = t('ui.auth.insecure');
    document.body.appendChild(bar);
    document.body.style.paddingTop = '28px';
  }

  function showLoginOverlay() {
    if (document.getElementById('authOverlay')) return;
    const ov = document.createElement('div');
    ov.id = 'authOverlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(7,11,21,0.92)';
    const box = document.createElement('div');
    box.style.cssText = 'background:#0f172a;border:1px solid #334155;border-radius:12px;padding:24px;width:340px;max-width:92%;box-shadow:0 20px 60px rgba(0,0,0,.5)';
    const title = document.createElement('div');
    title.style.cssText = 'font-size:16px;font-weight:700;color:#e5e7eb;margin-bottom:14px';
    title.textContent = t('ui.auth.title');
    const inp = document.createElement('input');
    inp.type = 'password'; inp.className = 'mono';
    inp.placeholder = t('ui.auth.password');
    inp.style.cssText = 'width:100%;padding:10px;border-radius:8px;border:1px solid #334155;background:#0b1220;color:#e5e7eb;margin-bottom:10px';
    const err = document.createElement('div');
    err.style.cssText = 'color:#f87171;font-size:12px;min-height:16px;margin-bottom:8px';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn-primary'; btn.style.cssText = 'width:100%;padding:10px;font-size:13px';
    btn.textContent = t('ui.auth.loginBtn');
    function doLogin() {
      err.textContent = ''; btn.disabled = true;
      const fd = new FormData(); fd.append('password', inp.value);
      const xhr = new XMLHttpRequest(); xhr.open('POST', '/api/auth/login', true);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return; btn.disabled = false;
        let r = null; try { r = JSON.parse(xhr.responseText || '{}'); } catch (e) {}
        if (xhr.status === 200 && r && r.success) {
          window.NetConfigApp.csrfToken = r.csrf || '';
          ov.remove();
        } else if (xhr.status === 429) {
          err.textContent = t('ui.auth.tooMany');
        } else {
          err.textContent = t('ui.auth.invalid');
          inp.value = ''; inp.focus();
        }
      };
      xhr.onerror = function () { btn.disabled = false; err.textContent = t('msg.networkError'); };
      xhr.send(fd);
    }
    btn.addEventListener('click', doLogin);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doLogin(); } });
    box.appendChild(title); box.appendChild(inp); box.appendChild(err); box.appendChild(btn);
    ov.appendChild(box); document.body.appendChild(ov);
    setTimeout(function () { inp.focus(); }, 50);
  }

  function bootstrapAuth() {
    const xhr = new XMLHttpRequest(); xhr.open('GET', '/api/auth/status', true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      let r = null; try { r = JSON.parse(xhr.responseText || '{}'); } catch (e) { return; }
      if (!r) return;
      if (r.csrf) window.NetConfigApp.csrfToken = r.csrf;
      if (r.enabled && !r.authed) { showLoginOverlay(); }
      else if (r.insecure) { showInsecureBanner(); }
    };
    xhr.send();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrapAuth);
  else bootstrapAuth();

  window.addEventListener('netconfig:language-changed', function () {
    if (currentAppVersion) setAppVersionBadge(currentAppVersion);
    if (lastUpdateInfo) {
      applyUpdateState(lastUpdateInfo);
    } else {
      renderUpdateNotice(null);
    }
  });

  loadAppVersionFromApi()
    .catch(function () {
      return loadAppVersionFromStaticFile();
    })
    .then(function (version) {
      currentAppVersion = version || '';
      setAppVersionBadge(version);
      return loadUpdateInfoFromApi()
        .then(function (updateInfo) {
          applyUpdateState(updateInfo);
        })
        .catch(function () {
          // Não falha a UI se a checagem de update falhar
        });
    })
    .catch(function () {
      setAppVersionBadge('');
    });
});
