/**
 * TSCG Options Page Controller
 * Manages settings persistence via chrome.storage.local.
 */

(function () {
  'use strict';

  // DOM elements
  var profileEl = document.getElementById('opt-profile');
  var ccpEl = document.getElementById('opt-ccp');
  var sadfEl = document.getElementById('opt-sadf');
  var topkEl = document.getElementById('opt-topk');
  var topkValue = document.getElementById('topk-value');
  var apiKeyEl = document.getElementById('api-key');
  var resetBtn = document.getElementById('reset-btn');

  var providerEl = document.getElementById('opt-provider');

  // Storage keys
  var KEYS = {
    profile: 'tscg_profile',
    ccp: 'tscg_ccp',
    sadf: 'tscg_sadf',
    sadTopK: 'tscg_sadTopK',
    apiKey: 'tscg_apiKey',
    provider: 'tscg_provider',
  };

  // Defaults
  var DEFAULTS = {
    tscg_profile: 'balanced',
    tscg_ccp: true,
    tscg_sadf: true,
    tscg_sadTopK: 4,
    tscg_apiKey: '',
    tscg_provider: 'anthropic',
  };

  // Load settings
  function loadSettings() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return;
    }

    chrome.storage.local.get(Object.values(KEYS), function (data) {
      if (data[KEYS.profile]) profileEl.value = data[KEYS.profile];
      if (data[KEYS.ccp] !== undefined) ccpEl.checked = data[KEYS.ccp];
      if (data[KEYS.sadf] !== undefined) sadfEl.checked = data[KEYS.sadf];
      if (data[KEYS.sadTopK] !== undefined) {
        topkEl.value = data[KEYS.sadTopK];
        topkValue.textContent = data[KEYS.sadTopK];
      }
      if (data[KEYS.apiKey]) apiKeyEl.value = data[KEYS.apiKey];
      if (data[KEYS.provider]) providerEl.value = data[KEYS.provider];
    });
  }

  // Save a single setting
  function saveSetting(key, value) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return;
    }

    var data = {};
    data[key] = value;
    chrome.storage.local.set(data, function () {
      showStatus('Settings saved');
    });
  }

  // Show status message
  var statusTimeout = null;
  function showStatus(message) {
    // Remove existing
    var existing = document.querySelector('.status-message');
    if (existing) existing.remove();
    if (statusTimeout) clearTimeout(statusTimeout);

    var el = document.createElement('div');
    el.className = 'status-message';
    el.textContent = message;
    document.body.appendChild(el);

    statusTimeout = setTimeout(function () {
      if (el.parentNode) el.remove();
    }, 2000);
  }

  // Event listeners
  profileEl.addEventListener('change', function () {
    saveSetting(KEYS.profile, profileEl.value);
  });

  providerEl.addEventListener('change', function () {
    saveSetting(KEYS.provider, providerEl.value);
  });

  ccpEl.addEventListener('change', function () {
    saveSetting(KEYS.ccp, ccpEl.checked);
  });

  sadfEl.addEventListener('change', function () {
    saveSetting(KEYS.sadf, sadfEl.checked);
  });

  topkEl.addEventListener('input', function () {
    topkValue.textContent = topkEl.value;
  });

  topkEl.addEventListener('change', function () {
    topkValue.textContent = topkEl.value;
    saveSetting(KEYS.sadTopK, parseInt(topkEl.value, 10));
  });

  // Debounce API key saving
  var apiKeyTimer = null;
  apiKeyEl.addEventListener('input', function () {
    clearTimeout(apiKeyTimer);
    apiKeyTimer = setTimeout(function () {
      saveSetting(KEYS.apiKey, apiKeyEl.value.trim());
    }, 800);
  });

  // Reset
  resetBtn.addEventListener('click', function () {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(DEFAULTS, function () {
        // Restore UI
        profileEl.value = DEFAULTS.tscg_profile;
        ccpEl.checked = DEFAULTS.tscg_ccp;
        sadfEl.checked = DEFAULTS.tscg_sadf;
        topkEl.value = DEFAULTS.tscg_sadTopK;
        topkValue.textContent = DEFAULTS.tscg_sadTopK;
        providerEl.value = DEFAULTS.tscg_provider;
        apiKeyEl.value = '';
        showStatus('All settings reset to defaults');
      });
    }
  });

  // Initialize
  loadSettings();
})();
