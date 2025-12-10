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
  const showMessage = app.showMessage || function () {};
  const getCommonCreds = app.getCommonCreds || function () {
    return { eve_ip: '', eve_user: '', eve_pass: '' };
  };
  const t = app.t || function (key) { return key; };

  const loadBtn = document.getElementById('loadDataBtn');
  const form = document.getElementById('uploadForm');
  const dependentButtons = document.querySelectorAll('[data-requires-load="true"]');
  const featureArea = document.getElementById('featureArea');

  function setDependentButtons(enabled) {
    dependentButtons.forEach(function (btn) {
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.disabled = !enabled;
      btn.classList.toggle('btn-disabled', !enabled);
    });
  }

  function setFeatureAreaVisible(enabled) {
    if (featureArea) {
      featureArea.dataset.state = enabled ? 'ready' : 'locked';
    }
  }

  function markDirty() {
    setDependentButtons(false);
    setFeatureAreaVisible(false);
  }

  ['eve_ip', 'eve_user', 'eve_pass'].forEach(function (fieldName) {
    const field = form && form.elements ? form.elements[fieldName] : null;
    if (field && field.addEventListener) {
      field.addEventListener('input', markDirty);
    }
  });

  // Inicialmente os botões que dependem do carregamento ficam desativados.
  setDependentButtons(false);
  setFeatureAreaVisible(false);

  function setLoadBtnState(isLoading) {
    if (!loadBtn) return;
    const label = loadBtn.querySelector('[data-i18n="ui.loadDataBtn"]') || loadBtn;
    if (isLoading) {
      loadBtn.disabled = true;
      loadBtn.classList.add('is-loading');
      if (label) {
        label.textContent = t('ui.loadDataBtnLoading');
      }
    } else {
      loadBtn.disabled = false;
      loadBtn.classList.remove('is-loading');
      if (label) {
        label.textContent = t('ui.loadDataBtn');
      }
    }
  }

  function clearMessages() {
    const messages = document.getElementById('messages');
    if (messages) {
      messages.innerHTML = '';
    }
  }

  function handleLoadAll() {
    clearMessages();

    const creds = getCommonCreds();
    if (!creds.eve_ip || !creds.eve_user || !creds.eve_pass) {
      showMessage('error', t('load.missingCreds'));
      return;
    }

    setLoadBtnState(true);
    setDependentButtons(false);

    const loaders = [
      app.loadImages ? app.loadImages({ skipClearMessages: true }) : Promise.resolve({ success: true }),
      app.loadIcons ? app.loadIcons({ skipClearMessages: true }) : Promise.resolve({ success: true }),
      app.loadTemplates ? app.loadTemplates({ skipClearMessages: true }) : Promise.resolve({ success: true })
    ];

    Promise.allSettled(loaders)
      .then(function (results) {
        const fulfilled = results.filter(function (r) {
          return r.status === 'fulfilled' && r.value && r.value.success !== false;
        }).length;
        const total = results.length;
        const anySuccess = fulfilled > 0;

        if (fulfilled === total) {
          showMessage('success', t('load.success'));
        } else if (fulfilled > 0) {
          showMessage('error', t('load.partial', { success: fulfilled, total: total }));
        } else {
          showMessage('error', t('load.failed'));
        }

        setFeatureAreaVisible(anySuccess);
        setDependentButtons(anySuccess);
      })
      .catch(function () {
        showMessage('error', t('load.failed'));
        setFeatureAreaVisible(false);
        setDependentButtons(false);
      })
      .finally(function () {
        setLoadBtnState(false);
      });
  }

  if (loadBtn) {
    loadBtn.addEventListener('click', handleLoadAll);
  }
});
