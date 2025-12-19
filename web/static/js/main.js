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
  const platformBadge = document.getElementById('platformBadge');
  const platformLogo = document.getElementById('platformLogo');
  const resourceBox = document.getElementById('resourceBox');
  const resourceCpu = document.getElementById('resourceCpu');
  const resourceMem = document.getElementById('resourceMem');
  const resourceDisk = document.getElementById('resourceDisk');
  const resourceCpuBar = document.getElementById('resourceCpuBar');
  const resourceMemBar = document.getElementById('resourceMemBar');
  const resourceDiskBar = document.getElementById('resourceDiskBar');
  const systemReloadBtn = document.getElementById('systemReloadBtn');

  const tabImagesBtn = document.querySelector('.tab-button[data-tab="images-tab"]');
  const tabVrnetlabBtn = document.querySelector('.tab-button[data-tab="vrnetlab-tab"]');
  const tabContainerImagesBtn = document.querySelector('.tab-button[data-tab="container-images-tab"]');
  const tabTemplatesBtn = document.querySelector('.tab-button[data-tab="templates-tab"]');
  const tabIconsBtn = document.querySelector('.tab-button[data-tab="icons-tab"]');
  const tabIshare2Btn = document.querySelector('.tab-button[data-tab="ishare2-tab"]');
  const tabSystemBtn = document.querySelector('.tab-button[data-tab="system-tab"]');
  const vrnetlabTab = document.getElementById('vrnetlab-tab');
  const containerImagesTab = document.getElementById('container-images-tab');
  const imagesTab = document.getElementById('images-tab');
  const templatesTab = document.getElementById('templates-tab');
  const iconsTab = document.getElementById('icons-tab');
  const ishare2Tab = document.getElementById('ishare2-tab');

  function setVisible(el, visible) {
    if (!el) return;
    el.style.display = visible ? '' : 'none';
  }

  function updateTabsForPlatform(platform) {
    const isContainerlab = !!(platform && platform.name === 'containerlab');

    // ContainerLab não tem (nativamente) os diretórios/fluxos de templates/ícones do EVE/PNETLab,
    // então escondemos essas abas para evitar confusão.
    setVisible(tabImagesBtn, !isContainerlab);
    setVisible(tabTemplatesBtn, !isContainerlab);
    setVisible(tabIconsBtn, !isContainerlab);
    setVisible(tabIshare2Btn, !isContainerlab);
    setVisible(tabVrnetlabBtn, isContainerlab);
    setVisible(tabContainerImagesBtn, isContainerlab);
    setVisible(vrnetlabTab, isContainerlab);
    setVisible(containerImagesTab, isContainerlab);
    setVisible(imagesTab, !isContainerlab);
    setVisible(templatesTab, !isContainerlab);
    setVisible(iconsTab, !isContainerlab);
    setVisible(ishare2Tab, !isContainerlab);

    const activeContent = document.querySelector('.tab-content.active');
    const activeId = activeContent ? activeContent.id : '';
    if (isContainerlab) {
      const shouldSwitch = (activeId === 'templates-tab' || activeId === 'icons-tab' || activeId === 'ishare2-tab' || activeId === 'images-tab');
      if (shouldSwitch) {
        if (tabContainerImagesBtn && tabContainerImagesBtn.click) {
          tabContainerImagesBtn.click();
        } else if (tabVrnetlabBtn && tabVrnetlabBtn.click) {
          tabVrnetlabBtn.click();
        } else if (tabSystemBtn && tabSystemBtn.click) {
          tabSystemBtn.click();
        }
      }
    } else if ((activeId === 'vrnetlab-tab' || activeId === 'container-images-tab') && tabImagesBtn && tabImagesBtn.click) {
      tabImagesBtn.click();
    }
  }

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

  function setPlatformInfo(platform) {
    updateTabsForPlatform(platform && platform.name ? platform : null);
    if (!platform || !platform.name) {
      if (platformBadge) {
        platformBadge.style.display = 'none';
        platformBadge.textContent = '';
        platformBadge.title = '';
      }
      if (platformLogo) {
        platformLogo.style.display = 'none';
        platformLogo.src = '';
        platformLogo.alt = '';
      }
      return;
    }

    var nameKey = 'platform.unknown';
    if (platform.name === 'eve-ng') nameKey = 'platform.eve';
    if (platform.name === 'pnetlab') nameKey = 'platform.pnetlab';
    if (platform.name === 'containerlab') nameKey = 'platform.containerlab';

    const label = t('platform.label', { name: t(nameKey) });
    if (platformBadge) {
      platformBadge.textContent = label;
      platformBadge.style.display = 'inline-flex';
      platformBadge.title = platform.raw ? platform.raw : '';
    }

    if (platformLogo) {
      if (platform.name === 'eve-ng') {
        platformLogo.src = '/static/img/eve-ng-logo.png';
        platformLogo.alt = 'EVE-NG';
        platformLogo.style.display = 'inline-block';
      } else if (platform.name === 'pnetlab') {
        platformLogo.src = '/static/img/pnetlab-logo.png';
        platformLogo.alt = 'PNETLab';
        platformLogo.style.display = 'inline-block';
      } else if (platform.name === 'containerlab') {
        platformLogo.src = '/static/img/containerlab-logo.png';
        platformLogo.alt = 'ContainerLab';
        platformLogo.style.display = 'inline-block';
      } else {
        platformLogo.style.display = 'none';
        platformLogo.src = '';
        platformLogo.alt = '';
      }
    }
  }

  function formatPercent(val) {
    if (typeof val !== 'number' || isNaN(val)) return 'N/A';
    return val.toFixed(0) + '%';
  }

  function formatMem(valMb) {
    if (typeof valMb !== 'number' || isNaN(valMb)) return 'N/A';
    if (valMb >= 1024) return (valMb / 1024).toFixed(1) + ' GB';
    return valMb.toFixed(0) + ' MB';
  }

  function formatDisk(valKb) {
    if (typeof valKb !== 'number' || isNaN(valKb)) return 'N/A';
    const gb = valKb / (1024 * 1024);
    if (gb >= 1) return gb.toFixed(1) + ' GB';
    const mb = valKb / 1024;
    return mb.toFixed(0) + ' MB';
  }

  function setResources(resources) {
    if (!resourceBox) return;
    if (!resources) {
      resourceBox.style.display = 'none';
      return;
    }
    resourceBox.style.display = 'grid';
    if (resourceCpu) resourceCpu.textContent = formatPercent(resources.cpu_percent);
    if (resourceCpuBar) resourceCpuBar.style.width = Math.min(100, Math.max(0, resources.cpu_percent || 0)) + '%';
    if (resourceMem) {
      var used = formatMem(resources.mem_used_mb);
      var total = formatMem(resources.mem_total_mb);
      var perc = formatPercent(resources.mem_percent);
      resourceMem.textContent = used + ' / ' + total + ' (' + perc + ')';
      if (resourceMemBar) resourceMemBar.style.width = Math.min(100, Math.max(0, resources.mem_percent || 0)) + '%';
    }
    if (resourceDisk) {
      var usedD = formatDisk(resources.disk_used_kb);
      var totalD = formatDisk(resources.disk_total_kb);
      var percD = formatPercent(resources.disk_percent);
      resourceDisk.textContent = usedD + ' / ' + totalD + ' (' + percD + ')';
      if (resourceDiskBar) resourceDiskBar.style.width = Math.min(100, Math.max(0, resources.disk_percent || 0)) + '%';
    }
  }

  function markDirty() {
    setDependentButtons(false);
    setFeatureAreaVisible(false);
    setPlatformInfo(null);
    setResources(null);
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
  setResources(null);

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

    const platformResult = results.find(function (r) {
      return r.status === 'fulfilled' && r.value && r.value.platform;
    });
    const platformName = platformResult && platformResult.value && platformResult.value.platform ? platformResult.value.platform.name : '';
    if (platformResult && platformResult.value) {
      setPlatformInfo(platformResult.value.platform);
      setResources(platformResult.value.resources || null);
    } else {
      setPlatformInfo(null);
      setResources(null);
    }

    if (platformName === 'containerlab') {
      if (typeof app.loadVrnetlabStatus === 'function') {
        app.loadVrnetlabStatus({ skipMessage: true }).catch(function () {
          // Falha silenciosa para não interromper o fluxo principal
        });
      }
      if (typeof app.loadContainerImages === 'function') {
        app.loadContainerImages({ skipMessage: true, auto: true }).catch(function () {
          // Falha silenciosa
        });
      }
    }

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

  function reloadSystemInfo() {
    const loader = app.loadImages;
    if (!loader) return;
    if (systemReloadBtn) {
      systemReloadBtn.disabled = true;
      systemReloadBtn.classList.add('btn-disabled');
      systemReloadBtn.textContent = t('ui.system.reloadLoading');
    }
    loader({ skipClearMessages: false }).then(function (resp) {
      if (resp && resp.platform) setPlatformInfo(resp.platform);
      if (resp && resp.resources) setResources(resp.resources);
      if (resp && resp.success) {
        showMessage('success', t('load.success'));
      }
    }).catch(function () {
      showMessage('error', t('load.failed'));
    }).finally(function () {
      if (systemReloadBtn) {
        systemReloadBtn.disabled = false;
        systemReloadBtn.classList.remove('btn-disabled');
        systemReloadBtn.textContent = t('ui.system.reload');
      }
    });
  }

  if (systemReloadBtn) {
    systemReloadBtn.addEventListener('click', reloadSystemInfo);
  }
});
