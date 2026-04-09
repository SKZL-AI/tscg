/**
 * TSCG Prompt Optimizer - Popup Controller v5.0
 * Handles UI interactions, calls TSCG.optimizePrompt(), and manages chrome.storage.
 *
 * v5.0 additions:
 * - Savings badge showing cumulative token savings
 * - Schema detection stats display
 * - Potential savings estimation for detected tool schemas
 */

(function () {
  'use strict';

  // DOM elements
  var inputEl = document.getElementById('input-prompt');
  var outputEl = document.getElementById('output-prompt');
  var profileEl = document.getElementById('profile-select');
  var optimizeBtn = document.getElementById('optimize-btn');
  var btnText = optimizeBtn.querySelector('.btn-text');
  var btnSpinner = optimizeBtn.querySelector('.btn-spinner');
  var copyBtn = document.getElementById('copy-btn');
  var copyText = document.getElementById('copy-text');
  var toggleCCP = document.getElementById('toggle-ccp');
  var toggleSADF = document.getElementById('toggle-sadf');

  var outputSection = document.getElementById('output-section');
  var metricsBar = document.getElementById('metrics-bar');
  var pipelineDetails = document.getElementById('pipeline-details');

  var metricTokens = document.getElementById('metric-tokens');
  var metricCompression = document.getElementById('metric-compression');
  var metricType = document.getElementById('metric-type');
  var metricTransforms = document.getElementById('metric-transforms');
  var pipelineList = document.getElementById('pipeline-list');

  // Savings badge elements (v5.0)
  var savingsTotalTokens = document.getElementById('savings-total-tokens');
  var savingsOptCount = document.getElementById('savings-opt-count');
  var savingsSchemas = document.getElementById('savings-schemas');
  var savingsPotential = document.getElementById('savings-potential');
  var savingsPotentialText = document.getElementById('savings-potential-text');

  // ============================================================
  // Savings Badge (v5.0)
  // ============================================================

  function loadSavingsBadge() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return;
    }

    chrome.storage.local.get(['tscg_cumulative_savings', 'tscg_detected_schemas'], function (data) {
      // Cumulative savings
      var savings = data.tscg_cumulative_savings;
      if (savings) {
        savingsTotalTokens.textContent = formatNumber(savings.totalTokensSaved || 0);
        savingsOptCount.textContent = formatNumber(savings.optimizationCount || 0);
      } else {
        savingsTotalTokens.textContent = '0';
        savingsOptCount.textContent = '0';
      }

      // Detected schemas
      var schemas = data.tscg_detected_schemas;
      if (schemas && schemas.toolCount > 0) {
        savingsSchemas.textContent = schemas.toolCount;

        // Show potential savings
        if (schemas.estimatedSavedTokens > 0) {
          savingsPotential.classList.remove('hidden');
          savingsPotentialText.textContent =
            'Potential: ~' + formatNumber(schemas.estimatedSavedTokens) +
            ' tokens/call savings (' + schemas.savingsPercent + '%) across ' +
            schemas.toolCount + ' tool' + (schemas.toolCount !== 1 ? 's' : '') +
            ' on ' + schemas.platform;
        }
      } else {
        savingsSchemas.textContent = '0';
      }
    });
  }

  function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  // Load savings on popup open
  loadSavingsBadge();

  // ============================================================
  // Settings
  // ============================================================

  // Load saved settings from chrome.storage
  function loadSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['tscg_profile', 'tscg_ccp', 'tscg_sadf', 'tscg_sadTopK'], function (data) {
        if (data.tscg_profile) profileEl.value = data.tscg_profile;
        if (data.tscg_ccp !== undefined) toggleCCP.checked = data.tscg_ccp;
        if (data.tscg_sadf !== undefined) toggleSADF.checked = data.tscg_sadf;
      });
    }
  }

  // Save settings to chrome.storage
  function saveSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        tscg_profile: profileEl.value,
        tscg_ccp: toggleCCP.checked,
        tscg_sadf: toggleSADF.checked,
      });
    }
  }

  // ============================================================
  // Optimization
  // ============================================================

  function runOptimize() {
    var prompt = inputEl.value.trim();
    if (!prompt) {
      inputEl.focus();
      return;
    }

    // Show loading state
    optimizeBtn.disabled = true;
    btnText.textContent = 'Optimizing...';
    btnSpinner.classList.remove('hidden');

    // Use requestAnimationFrame to allow UI to update
    requestAnimationFrame(function () {
      setTimeout(function () {
        try {
          var options = {
            profile: profileEl.value,
            enableCCP: toggleCCP.checked,
            enableSADF: toggleSADF.checked,
          };

          // Load sadTopK from storage if set
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['tscg_sadTopK', 'tscg_provider'], function (data) {
              if (data.tscg_sadTopK) options.sadTopK = parseInt(data.tscg_sadTopK, 10);
              if (data.tscg_provider) options.provider = data.tscg_provider;
              executeOptimization(prompt, options);
            });
          } else {
            executeOptimization(prompt, options);
          }
        } catch (err) {
          showError(err.message);
          resetButton();
        }
      }, 16);
    });
  }

  function executeOptimization(prompt, options) {
    try {
      var result = TSCG.optimizePrompt(prompt, options);
      displayResult(result);
      saveSettings();

      // Update cumulative savings (v5.0)
      if (result.metrics.tokensSaved > 0) {
        updatePopupSavings(result.metrics.tokensSaved);
      }
    } catch (err) {
      showError(err.message);
    }
    resetButton();
  }

  function updatePopupSavings(tokensSaved) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.get(['tscg_cumulative_savings'], function (data) {
      var current = data.tscg_cumulative_savings || { totalTokensSaved: 0, optimizationCount: 0 };
      current.totalTokensSaved += tokensSaved;
      current.optimizationCount += 1;
      current.lastOptimization = Date.now();
      chrome.storage.local.set({ tscg_cumulative_savings: current }, function () {
        // Refresh the badge
        savingsTotalTokens.textContent = formatNumber(current.totalTokensSaved);
        savingsOptCount.textContent = formatNumber(current.optimizationCount);
      });
    });
  }

  function resetButton() {
    optimizeBtn.disabled = false;
    btnText.textContent = 'Optimize';
    btnSpinner.classList.add('hidden');
  }

  function showError(msg) {
    outputSection.classList.remove('hidden');
    outputEl.value = 'Error: ' + msg;
    outputEl.style.color = '#f85149';
    metricsBar.classList.add('hidden');
    pipelineDetails.classList.add('hidden');
  }

  // Display optimization result
  function displayResult(result) {
    var metrics = result.metrics;
    var pipeline = result.pipeline;

    // Show output
    outputSection.classList.remove('hidden');
    outputEl.style.color = '';
    outputEl.value = result.optimized;

    // Auto-resize output textarea
    outputEl.style.height = 'auto';
    outputEl.style.height = Math.min(outputEl.scrollHeight, 200) + 'px';

    // Show metrics
    metricsBar.classList.remove('hidden');

    if (metrics.tokensSaved > 0) {
      metricTokens.textContent = '~' + metrics.tokensSaved;
      metricTokens.className = 'metric-value';
    } else if (metrics.tokensRemoved < 0) {
      metricTokens.textContent = '+' + Math.abs(metrics.tokensRemoved);
      metricTokens.className = 'metric-value neutral';
    } else {
      metricTokens.textContent = '0';
      metricTokens.className = 'metric-value neutral';
    }

    var compressionPct = ((1 - metrics.compressionRatio) * 100);
    if (compressionPct > 0) {
      metricCompression.textContent = compressionPct.toFixed(1) + '%';
      metricCompression.className = 'metric-value';
    } else {
      metricCompression.textContent = '+' + Math.abs(compressionPct).toFixed(1) + '%';
      metricCompression.className = 'metric-value neutral';
    }

    metricType.textContent = metrics.promptType;
    metricType.className = 'metric-value type';

    metricTransforms.textContent = metrics.transformsApplied + '/' + (metrics.transformsApplied + metrics.transformsSkipped);
    metricTransforms.className = 'metric-value';

    // Show pipeline details
    pipelineDetails.classList.remove('hidden');
    pipelineList.innerHTML = '';

    for (var i = 0; i < pipeline.transforms.length; i++) {
      var t = pipeline.transforms[i];
      var item = document.createElement('div');
      item.className = 'pipeline-item';

      var icon = document.createElement('span');
      icon.className = 'pipeline-icon ' + (t.applied ? 'applied' : 'skipped');
      icon.textContent = t.applied ? '\u2713' : '\u25CB';

      var name = document.createElement('span');
      name.className = 'pipeline-name';
      name.textContent = t.name;

      var tokens = document.createElement('span');
      if (t.tokensRemoved > 0) {
        tokens.className = 'pipeline-tokens saved';
        tokens.textContent = '-' + t.tokensRemoved;
      } else if (t.tokensRemoved < 0) {
        tokens.className = 'pipeline-tokens added';
        tokens.textContent = '+' + Math.abs(t.tokensRemoved);
      } else {
        tokens.className = 'pipeline-tokens zero';
        tokens.textContent = '\u00b10';
      }

      var desc = document.createElement('span');
      desc.className = 'pipeline-desc';
      desc.textContent = t.description;
      desc.title = t.description;

      item.appendChild(icon);
      item.appendChild(name);
      item.appendChild(tokens);
      item.appendChild(desc);
      pipelineList.appendChild(item);
    }
  }

  // Copy to clipboard
  function copyOutput() {
    var text = outputEl.value;
    if (!text) return;

    navigator.clipboard.writeText(text).then(function () {
      copyBtn.classList.add('copied');
      copyText.textContent = 'Copied!';
      setTimeout(function () {
        copyBtn.classList.remove('copied');
        copyText.textContent = 'Copy';
      }, 1500);
    }).catch(function () {
      // Fallback for older browsers
      outputEl.select();
      document.execCommand('copy');
      copyBtn.classList.add('copied');
      copyText.textContent = 'Copied!';
      setTimeout(function () {
        copyBtn.classList.remove('copied');
        copyText.textContent = 'Copy';
      }, 1500);
    });
  }

  // Event listeners
  optimizeBtn.addEventListener('click', runOptimize);
  copyBtn.addEventListener('click', copyOutput);

  // Keyboard shortcut: Ctrl+Enter to optimize
  inputEl.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runOptimize();
    }
  });

  // Auto-save toggles
  toggleCCP.addEventListener('change', saveSettings);
  toggleSADF.addEventListener('change', saveSettings);
  profileEl.addEventListener('change', saveSettings);

  // Load settings on init
  loadSettings();

  // Focus input
  inputEl.focus();
})();
