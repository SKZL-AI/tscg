/**
 * TSCG Content Script v5.0
 * Injects floating "T" button next to prompt textareas on supported AI platforms.
 * When clicked or triggered via Ctrl+Shift+O, optimizes the prompt in-place.
 *
 * v5.0 additions:
 * - Auto-detection of tool schemas in page content (JSON tool definitions)
 * - Schema detection for claude.ai, chatgpt.com, gemini.google.com
 * - Reports detected schema stats to popup via chrome.storage
 */

(function () {
  'use strict';

  // ============================================================
  // Detect which platform we are on
  // ============================================================

  var PLATFORM = detectPlatform();

  function detectPlatform() {
    var host = window.location.hostname;
    if (host.includes('chatgpt.com')) return 'chatgpt';
    if (host.includes('claude.ai')) return 'claude';
    if (host.includes('gemini.google.com')) return 'gemini';
    return 'unknown';
  }

  // Platform-specific textarea selectors
  var TEXTAREA_SELECTORS = {
    chatgpt: [
      '#prompt-textarea',
      'textarea[data-id="root"]',
      'div#prompt-textarea[contenteditable="true"]',
      'div[contenteditable="true"][data-placeholder]',
    ],
    claude: [
      'div.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"][data-placeholder]',
      'fieldset div[contenteditable="true"]',
    ],
    gemini: [
      'div.ql-editor[contenteditable="true"]',
      'div[contenteditable="true"][aria-label]',
      'rich-textarea div[contenteditable="true"]',
    ],
    unknown: [
      'textarea',
      'div[contenteditable="true"]',
    ],
  };

  // Track managed elements to avoid duplicates
  var managedElements = new WeakSet();

  // ============================================================
  // Tool Schema Auto-Detection (v5.0)
  // ============================================================

  var detectedSchemas = [];
  var lastSchemaCheck = 0;
  var SCHEMA_CHECK_INTERVAL = 5000; // 5 seconds

  /**
   * Detect tool schemas embedded in the page.
   * Looks for JSON structures matching OpenAI/Anthropic tool formats.
   */
  function detectToolSchemas() {
    var now = Date.now();
    if (now - lastSchemaCheck < SCHEMA_CHECK_INTERVAL) return;
    lastSchemaCheck = now;

    var schemas = [];

    // Strategy 1: Look for <pre>/<code> blocks containing tool JSON
    var codeBlocks = document.querySelectorAll('pre, code, .code-block, [data-language="json"]');
    for (var i = 0; i < codeBlocks.length; i++) {
      var text = codeBlocks[i].textContent || '';
      var found = extractToolSchemas(text);
      for (var j = 0; j < found.length; j++) {
        schemas.push(found[j]);
      }
    }

    // Strategy 2: Look in conversation messages for inline tool definitions
    var messageSelectors = {
      chatgpt: '.message-content, .markdown, [data-message-author-role]',
      claude: '.font-claude-message, .prose, [data-testid="chat-message"]',
      gemini: '.message-content, .model-response-text, .response-content',
      unknown: '.message, .response, .content',
    };

    var msgSelector = messageSelectors[PLATFORM] || messageSelectors.unknown;
    var messages = document.querySelectorAll(msgSelector);
    for (var k = 0; k < messages.length; k++) {
      var msgText = messages[k].textContent || '';
      // Only check if content looks like it might contain tool schemas
      if (msgText.includes('"function"') || msgText.includes('"input_schema"') || msgText.includes('"parameters"')) {
        var msgSchemas = extractToolSchemas(msgText);
        for (var l = 0; l < msgSchemas.length; l++) {
          schemas.push(msgSchemas[l]);
        }
      }
    }

    // Deduplicate by tool name
    var seen = {};
    var uniqueSchemas = [];
    for (var m = 0; m < schemas.length; m++) {
      var name = schemas[m].name || schemas[m].function_name || 'unknown_' + m;
      if (!seen[name]) {
        seen[name] = true;
        uniqueSchemas.push(schemas[m]);
      }
    }

    if (uniqueSchemas.length > 0) {
      detectedSchemas = uniqueSchemas;
      updateSchemaStats(uniqueSchemas);
    }
  }

  /**
   * Try to extract tool schema objects from a text string.
   */
  function extractToolSchemas(text) {
    var results = [];

    // Try to find JSON arrays or objects
    var jsonCandidates = [];

    // Find JSON-like substrings
    var braceDepth = 0;
    var bracketDepth = 0;
    var start = -1;

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === '{' || ch === '[') {
        if (braceDepth === 0 && bracketDepth === 0) {
          start = i;
        }
        if (ch === '{') braceDepth++;
        else bracketDepth++;
      } else if (ch === '}' || ch === ']') {
        if (ch === '}') braceDepth--;
        else bracketDepth--;
        if (braceDepth === 0 && bracketDepth === 0 && start >= 0) {
          var candidate = text.slice(start, i + 1);
          if (candidate.length > 50 && candidate.length < 50000) {
            jsonCandidates.push(candidate);
          }
          start = -1;
        }
      }
    }

    for (var j = 0; j < jsonCandidates.length; j++) {
      try {
        var parsed = JSON.parse(jsonCandidates[j]);
        var tools = normalizeToolArray(parsed);
        for (var k = 0; k < tools.length; k++) {
          results.push(tools[k]);
        }
      } catch (e) {
        // Not valid JSON, skip
      }
    }

    return results;
  }

  /**
   * Normalize parsed JSON into tool schema objects.
   * Returns array of { name, description, paramCount, format }.
   */
  function normalizeToolArray(parsed) {
    var tools = [];

    if (Array.isArray(parsed)) {
      for (var i = 0; i < parsed.length; i++) {
        var t = identifyTool(parsed[i]);
        if (t) tools.push(t);
      }
    } else {
      var t = identifyTool(parsed);
      if (t) tools.push(t);

      // Check for { tools: [...] } wrapper
      if (parsed.tools && Array.isArray(parsed.tools)) {
        for (var j = 0; j < parsed.tools.length; j++) {
          var tt = identifyTool(parsed.tools[j]);
          if (tt) tools.push(tt);
        }
      }
    }

    return tools;
  }

  /**
   * Identify if an object is a tool definition.
   */
  function identifyTool(obj) {
    if (!obj || typeof obj !== 'object') return null;

    // OpenAI format: { type: "function", function: { name, description, parameters } }
    if (obj.type === 'function' && obj.function && obj.function.name) {
      var params = obj.function.parameters;
      var paramCount = params && params.properties ? Object.keys(params.properties).length : 0;
      return {
        name: obj.function.name,
        function_name: obj.function.name,
        description: (obj.function.description || '').slice(0, 100),
        paramCount: paramCount,
        format: 'openai',
      };
    }

    // Anthropic format: { name, description, input_schema }
    if (obj.name && obj.input_schema) {
      var aParams = obj.input_schema.properties ? Object.keys(obj.input_schema.properties).length : 0;
      return {
        name: obj.name,
        function_name: obj.name,
        description: (obj.description || '').slice(0, 100),
        paramCount: aParams,
        format: 'anthropic',
      };
    }

    return null;
  }

  /**
   * Estimate token savings for detected schemas.
   */
  function estimateSchemaTokenSavings(schemas) {
    // Rough estimate: average tool definition is ~200 tokens,
    // TSCG compresses by ~70% = ~140 tokens saved per tool
    var avgTokensPerTool = 200;
    var savingsRate = 0.70;
    var totalOriginal = schemas.length * avgTokensPerTool;
    var totalSaved = Math.round(totalOriginal * savingsRate);
    return {
      toolCount: schemas.length,
      estimatedOriginalTokens: totalOriginal,
      estimatedSavedTokens: totalSaved,
      savingsPercent: Math.round(savingsRate * 100),
    };
  }

  /**
   * Update schema detection stats in chrome.storage for the popup badge.
   */
  function updateSchemaStats(schemas) {
    var stats = estimateSchemaTokenSavings(schemas);
    stats.platform = PLATFORM;
    stats.timestamp = Date.now();
    stats.tools = schemas.map(function (s) { return s.name; });

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        tscg_detected_schemas: stats,
      });
    }
  }

  // ============================================================
  // Core: Find and Manage Textareas
  // ============================================================

  function findTextareas() {
    var selectors = TEXTAREA_SELECTORS[PLATFORM] || TEXTAREA_SELECTORS.unknown;
    var elements = [];

    for (var i = 0; i < selectors.length; i++) {
      var found = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < found.length; j++) {
        if (!managedElements.has(found[j])) {
          elements.push(found[j]);
        }
      }
    }

    return elements;
  }

  function getTextContent(el) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      return el.value;
    }
    // contenteditable
    return el.innerText || el.textContent || '';
  }

  function setTextContent(el, text) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      // Use native setter to trigger React/framework state updates
      var nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      );
      if (nativeInputValueSetter && nativeInputValueSetter.set) {
        nativeInputValueSetter.set.call(el, text);
      } else {
        el.value = text;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    // contenteditable: ChatGPT, Claude, Gemini all use this
    // Clear existing content and set new text properly
    el.focus();

    // Method 1: Use execCommand for better framework compatibility
    el.innerHTML = '';
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);

    // Dispatch events to notify frameworks
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  }

  // ============================================================
  // Floating Button
  // ============================================================

  function createFloatingButton(targetEl) {
    var btn = document.createElement('button');
    btn.className = 'tscg-float-btn';
    btn.textContent = 'T';
    btn.type = 'button';

    // Position the button
    positionButton(btn, targetEl);

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      optimizeInPlace(targetEl, btn);
    });

    // Insert button into DOM relative to textarea's parent
    var container = targetEl.parentElement;
    if (container) {
      // Ensure the parent has relative positioning for absolute positioning to work
      var parentPosition = window.getComputedStyle(container).position;
      if (parentPosition === 'static') {
        container.style.position = 'relative';
      }
      container.appendChild(btn);
    } else {
      document.body.appendChild(btn);
    }

    managedElements.add(targetEl);

    // Reposition on resize
    var resizeObserver;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(function () {
        positionButton(btn, targetEl);
      });
      resizeObserver.observe(targetEl);
    }

    return btn;
  }

  function positionButton(btn, targetEl) {
    var rect = targetEl.getBoundingClientRect();
    var parentRect = targetEl.parentElement
      ? targetEl.parentElement.getBoundingClientRect()
      : { top: 0, left: 0 };

    // Place button at the top-right corner of the textarea
    btn.style.top = (rect.top - parentRect.top + 6) + 'px';
    btn.style.right = '6px';
  }

  // ============================================================
  // Optimization Logic
  // ============================================================

  function optimizeInPlace(el, btn) {
    var text = getTextContent(el).trim();
    if (!text) return;

    // Visual feedback
    if (btn) {
      btn.classList.add('tscg-processing');
    }

    // Load settings from chrome.storage, then optimize
    loadOptimizationSettings(function (options) {
      try {
        if (typeof TSCG === 'undefined') {
          showToast('TSCG optimizer not loaded', '', true);
          if (btn) btn.classList.remove('tscg-processing');
          return;
        }

        var result = TSCG.optimizePrompt(text, options);
        setTextContent(el, result.optimized);

        // Show success toast
        var savedPct = ((1 - result.metrics.compressionRatio) * 100);
        var detail = '';
        if (savedPct > 0) {
          detail = '<span class="tscg-highlight">~' + result.metrics.tokensSaved + ' tokens saved</span> (' + savedPct.toFixed(1) + '% smaller)';
        } else {
          detail = result.metrics.transformsApplied + ' transforms applied';
        }
        showToast('Prompt optimized', detail);

        // Update cumulative savings stats
        updateCumulativeSavings(result.metrics.tokensSaved);

      } catch (err) {
        showToast('Optimization failed', err.message, true);
      }

      if (btn) {
        btn.classList.remove('tscg-processing');
      }
    });
  }

  function loadOptimizationSettings(callback) {
    var defaults = {
      profile: 'balanced',
      enableCCP: true,
      enableSADF: true,
      sadTopK: 4,
    };

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['tscg_profile', 'tscg_ccp', 'tscg_sadf', 'tscg_sadTopK', 'tscg_provider'], function (data) {
        callback({
          profile: data.tscg_profile || defaults.profile,
          enableCCP: data.tscg_ccp !== undefined ? data.tscg_ccp : defaults.enableCCP,
          enableSADF: data.tscg_sadf !== undefined ? data.tscg_sadf : defaults.enableSADF,
          sadTopK: data.tscg_sadTopK ? parseInt(data.tscg_sadTopK, 10) : defaults.sadTopK,
          provider: data.tscg_provider || null,
        });
      });
    } else {
      callback(defaults);
    }
  }

  // ============================================================
  // Cumulative Savings Tracking (v5.0)
  // ============================================================

  function updateCumulativeSavings(tokensSaved) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    if (tokensSaved <= 0) return;

    chrome.storage.local.get(['tscg_cumulative_savings'], function (data) {
      var current = data.tscg_cumulative_savings || { totalTokensSaved: 0, optimizationCount: 0 };
      current.totalTokensSaved += tokensSaved;
      current.optimizationCount += 1;
      current.lastOptimization = Date.now();
      chrome.storage.local.set({ tscg_cumulative_savings: current });
    });
  }

  // ============================================================
  // Toast Notifications
  // ============================================================

  var currentToast = null;

  function showToast(title, detail, isError) {
    // Remove existing toast
    if (currentToast) {
      currentToast.remove();
      currentToast = null;
    }

    var toast = document.createElement('div');
    toast.className = 'tscg-toast';

    var icon = document.createElement('div');
    icon.className = 'tscg-toast-icon';
    icon.textContent = isError ? '!' : 'T';
    if (isError) {
      icon.style.background = 'linear-gradient(135deg, #f85149, #da3633)';
    }

    var content = document.createElement('div');
    content.className = 'tscg-toast-content';

    var titleEl = document.createElement('div');
    titleEl.className = 'tscg-toast-title';
    titleEl.textContent = title;

    content.appendChild(titleEl);

    if (detail) {
      var detailEl = document.createElement('div');
      detailEl.className = 'tscg-toast-detail';
      detailEl.innerHTML = detail;
      content.appendChild(detailEl);
    }

    toast.appendChild(icon);
    toast.appendChild(content);
    document.body.appendChild(toast);
    currentToast = toast;

    // Auto-dismiss
    setTimeout(function () {
      if (toast.parentNode) {
        toast.classList.add('tscg-toast-out');
        setTimeout(function () {
          if (toast.parentNode) toast.remove();
          if (currentToast === toast) currentToast = null;
        }, 200);
      }
    }, 3000);
  }

  // ============================================================
  // Keyboard Shortcut: Ctrl+Shift+O
  // ============================================================

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'O') {
      e.preventDefault();

      // Find the currently focused or most recent textarea
      var active = document.activeElement;
      var isTextInput = active && (
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'INPUT' ||
        active.getAttribute('contenteditable') === 'true'
      );

      if (isTextInput) {
        optimizeInPlace(active, null);
      } else {
        // Try to find the main prompt textarea
        var selectors = TEXTAREA_SELECTORS[PLATFORM] || TEXTAREA_SELECTORS.unknown;
        for (var i = 0; i < selectors.length; i++) {
          var el = document.querySelector(selectors[i]);
          if (el) {
            optimizeInPlace(el, null);
            break;
          }
        }
      }
    }
  });

  // ============================================================
  // MutationObserver: Watch for new textareas (SPA navigation)
  // ============================================================

  function scanAndAttach() {
    var targets = findTextareas();
    for (var i = 0; i < targets.length; i++) {
      createFloatingButton(targets[i]);
    }

    // Also run schema detection on DOM changes (v5.0)
    detectToolSchemas();
  }

  // Initial scan
  scanAndAttach();

  // Run initial schema detection
  detectToolSchemas();

  // Observe DOM changes for SPAs
  var observer = new MutationObserver(function (mutations) {
    var shouldScan = false;
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].addedNodes.length > 0) {
        shouldScan = true;
        break;
      }
    }
    if (shouldScan) {
      // Debounce
      clearTimeout(observer._tscgTimer);
      observer._tscgTimer = setTimeout(scanAndAttach, 500);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Periodic schema detection (every 10 seconds)
  setInterval(detectToolSchemas, 10000);

})();
