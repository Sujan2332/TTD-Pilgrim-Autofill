// ---------------------------------------------------------------------------
// TTD Pilgrim Autofill - Page Bridge
//
// Runs in the MAIN world to bridge React synthetic events that require
// isTrusted flags or direct component handler calls.
// ---------------------------------------------------------------------------

(function() {
  if (window.__TTD_BRIDGE_V2_LOADED__) return;
  window.__TTD_BRIDGE_V2_LOADED__ = true;

  // Count TTD's in-flight requests (fetch + XHR) and publish the number on <html data-ttd-pending>.
  // The content script waits for it to reach 0 (e.g. calendar reload after a temple change) instead of
  // sleeping a fixed second. Only counts - requests and responses pass through untouched.
  (function trackPendingRequests() {
    var pending = 0;
    var publish = function(delta) {
      pending = Math.max(0, pending + delta);
      try { document.documentElement.setAttribute('data-ttd-pending', String(pending)); } catch (e) {}
    };
    publish(0);
    if (typeof window.fetch === 'function') {
      var origFetch = window.fetch;
      window.fetch = function() {
        publish(1);
        var done = function() { publish(-1); };
        try {
          var p = origFetch.apply(this, arguments);
          p.then(done, done);
          return p;
        } catch (e) {
          done();
          throw e;
        }
      };
    }
    var origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
      publish(1);
      this.addEventListener('loadend', function() { publish(-1); }, { once: true });
      return origSend.apply(this, arguments);
    };
  })();

  function getFiberAndProps(el) {
    if (!el) return { fiber: null, props: null };
    var keys = [];
    try {
      keys = Object.getOwnPropertyNames(el);
    } catch (e) {
      keys = Object.keys(el);
    }

    var propsKey = keys.find(function(k) {
      return k.startsWith("__reactProps") || k.startsWith("__reactEventHandlers");
    });
    var fiberKey = keys.find(function(k) {
      return k.startsWith("__reactFiber") || k.startsWith("_reactFiber") || k.startsWith("__reactInternalInstance");
    });

    var props = propsKey ? el[propsKey] : null;
    var fiber = fiberKey ? el[fiberKey] : null;

    if (!props && fiber) {
      props = fiber.memoizedProps || fiber.pendingProps || null;
    }
    return { fiber: fiber, props: props };
  }

  function makeSyntheticEvent(el, type) {
    return {
      isTrusted: true,
      type: type || "click",
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      target: el,
      currentTarget: el,
      nativeEvent: {
        isTrusted: true,
        type: type || "click",
        target: el,
        currentTarget: el,
        button: 0,
        buttons: type === "mouseup" || type === "click" ? 0 : 1,
      },
      preventDefault: function() { this.defaultPrevented = true; },
      stopPropagation: function() { this.propagationStopped = true; },
      persist: function() {},
    };
  }

  function invokeReactHandlers(el) {
    if (!el) return false;
    var res = getFiberAndProps(el);
    var p = res.props;
    var handled = false;

    if (p) {
      if (typeof p.onPointerDown === "function") {
        try { p.onPointerDown(makeSyntheticEvent(el, "pointerdown")); handled = true; } catch (e) {}
      }
      if (typeof p.onMouseDown === "function") {
        try { p.onMouseDown(makeSyntheticEvent(el, "mousedown")); handled = true; } catch (e) {}
      }
      if (typeof p.onClick === "function") {
        try { p.onClick(makeSyntheticEvent(el, "click")); handled = true; } catch (e) {}
      }
      if (typeof p.onSelect === "function") {
        try { p.onSelect(makeSyntheticEvent(el, "select")); handled = true; } catch (e) {}
      }
    }

    // Check direct children (e.g. <span> inside <li> or <button>)
    if (!handled && el.children && el.children.length > 0) {
      for (var i = 0; i < el.children.length; i++) {
        var child = el.children[i];
        var cRes = getFiberAndProps(child);
        var cp = cRes.props;
        if (cp) {
          if (typeof cp.onMouseDown === "function") {
            try { cp.onMouseDown(makeSyntheticEvent(child, "mousedown")); handled = true; } catch (e) {}
          }
          if (typeof cp.onClick === "function") {
            try { cp.onClick(makeSyntheticEvent(child, "click")); handled = true; } catch (e) {}
          }
        }
      }
    }

    // Check parent ONLY IF NOT an option item inside a dropdown list!
    var isDropdownOption = (
      el.tagName === "LI" ||
      el.getAttribute("role") === "option" ||
      (el.className && String(el.className).includes("listItem")) ||
      (typeof el.closest === "function" && el.closest("ul, [class*='floatingDropdown']"))
    );

    if (!handled && !isDropdownOption) {
      var parent = el.parentElement;
      var depth = 0;
      while (parent && parent !== document.body && depth < 3) {
        if (parent.tagName === "FORM" || parent.tagName === "BODY") break;
        var pRes = getFiberAndProps(parent);
        var pp = pRes.props;
        if (pp && typeof pp.onClick === "function") {
          try { pp.onClick(makeSyntheticEvent(parent, "click")); handled = true; break; } catch (e) {}
        }
        parent = parent.parentElement;
        depth++;
      }
    }

    return handled;
  }

  function dispatchNativeClickSequence(el) {
    if (!el) return;
    try { el.scrollIntoView({ block: "nearest", behavior: "instant" }); } catch (e) {}
    try { el.focus(); } catch (e) {}

    var rect = el.getBoundingClientRect();
    var clientX = Math.round(rect.left + (rect.width ? rect.width / 2 : 0));
    var clientY = Math.round(rect.top + (rect.height ? rect.height / 2 : 0));

    var downInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: clientX,
      clientY: clientY,
      button: 0,
      buttons: 1,
    };

    var upInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: clientX,
      clientY: clientY,
      button: 0,
      buttons: 0,
    };

    try {
      el.dispatchEvent(new PointerEvent("pointerover", upInit));
      el.dispatchEvent(new MouseEvent("mouseover", upInit));
      el.dispatchEvent(new PointerEvent("pointerenter", upInit));
      el.dispatchEvent(new MouseEvent("mouseenter", upInit));
      el.dispatchEvent(new PointerEvent("pointerdown", Object.assign({}, downInit, { pointerType: "mouse" })));
      el.dispatchEvent(new MouseEvent("mousedown", downInit));
      el.dispatchEvent(new PointerEvent("pointerup", Object.assign({}, upInit, { pointerType: "mouse" })));
      el.dispatchEvent(new MouseEvent("mouseup", upInit));
      el.dispatchEvent(new MouseEvent("click", upInit));
      if (typeof el.click === "function") {
        el.click();
      }
    } catch (e) {
      console.warn("[TTD Bridge] Native event dispatch failed:", e);
    }
  }

  function executeBridgeClick(el) {
    if (!el) return;
    invokeReactHandlers(el);
    dispatchNativeClickSequence(el);
  }

  function waitFor(checkFn, timeoutMs, intervalMs) {
    return new Promise(function(resolve) {
      var start = Date.now();
      (function tick() {
        var result = checkFn();
        if (result) return resolve(result);
        if (Date.now() - start >= timeoutMs) return resolve(null);
        setTimeout(tick, intervalMs || 25);
      })();
    });
  }

  // TTD's custom dropdowns (tickets, gender, photo ID) TOGGLE on every click, so fire exactly
  // one opening action at a time and stop as soon as options render - a burst of clicks opens
  // the menu and immediately closes it again.
  async function openDropdownStepwise(input, findOptions, waitMs) {
    var options = findOptions();
    if (options.length > 0) return options;

    var callProp = function(el, name, type) {
      return function() {
        var p = el && getFiberAndProps(el).props;
        if (!p || typeof p[name] !== 'function') return false;
        try { p[name](makeSyntheticEvent(el, type)); return true; } catch (e) { return false; }
      };
    };
    var nativeClick = function(el) {
      return function() {
        if (!el || typeof el.click !== 'function') return false;
        el.click();
        return true;
      };
    };
    var nativeFocus = function(el) {
      return function() {
        if (!el) return false;
        try { el.blur(); el.focus(); return true; } catch (e) { return false; }
      };
    };

    var wrapper = input.parentElement;
    var icon = wrapper && wrapper.querySelector('img');
    var openers = [
      callProp(input, 'onClick', 'click'),
      callProp(input, 'onMouseDown', 'mousedown'),
      callProp(input, 'onFocus', 'focus'),
      callProp(wrapper, 'onClick', 'click'),
      callProp(icon, 'onClick', 'click'),
      nativeFocus(input),
      nativeClick(input),
      nativeClick(icon),
      nativeClick(wrapper),
    ];

    for (var i = 0; i < openers.length; i++) {
      if (!openers[i]()) continue;
      options = await waitFor(function() {
        var found = findOptions();
        return found.length > 0 ? found : null;
      }, waitMs, 20);
      if (options) return options;
    }
    return [];
  }

  // Items of the menu that belongs to `input`. CSS-module prefixes change between TTD builds
  // ("floatingDropdown_listItem", "_36WbrG_listItem"), so match on the stable suffix.
  function findMenuItems(input) {
    var wrapper = input.parentElement;
    var menu = wrapper && wrapper.querySelector('[style*="z-index: 999"], [style*="z-index:999"]');
    var scope = menu || wrapper;
    var items = scope ? Array.from(scope.querySelectorAll('[class*="listItem"], li, [role="option"]')) : [];
    if (items.length === 0) {
      items = Array.from(document.querySelectorAll('[class*="listItem"]'));
    }
    return items.filter(function(el, idx, arr) {
      return el.textContent && el.textContent.trim() && arr.indexOf(el) === idx;
    });
  }

  // One click on a menu option: its React onClick if present, otherwise a native click.
  function clickMenuOption(el) {
    var nodes = [el, el.firstElementChild].filter(Boolean);
    for (var i = 0; i < nodes.length; i++) {
      var p = getFiberAndProps(nodes[i]).props;
      if (p && typeof p.onClick === 'function') {
        try { p.onClick(makeSyntheticEvent(nodes[i], 'click')); return; } catch (e) {}
      }
    }
    try { el.click(); } catch (e) {}
  }

  async function selectTicketsInMainWorld(desiredCount) {
    const desiredInt = parseInt(desiredCount, 10);
    console.log('[TTD Bridge] selectTicketsInMainWorld requested count:', desiredInt);

    // Keep in sync with findTicketCountInput() in content.js
    function findTicketInputEl() {
      const isTicketInput = el =>
        el && el.tagName === 'INPUT' && !['templeSelected', 'sevaSelected'].includes(el.getAttribute('name'));

      let el = document.querySelector('input[name="noOfTickets"]');
      if (el) return el;

      el = Array.from(document.querySelectorAll('[class*="slotHeader"] input')).find(isTicketInput);
      if (el) return el;

      // Visible "Number of Tickets" label - restricted to text elements so <script> JSON can't match
      const labelEl = Array.from(document.querySelectorAll('div, span, label, p')).find(
        node => node.children.length === 0 && /^\s*number\s+of\s+tickets\s*$/i.test(node.textContent)
      );
      for (let node = labelEl?.parentElement, depth = 0; node && depth < 3; node = node.parentElement, depth++) {
        el = Array.from(node.querySelectorAll('input')).find(isTicketInput);
        if (el) return el;
      }

      el = Array.from(document.querySelectorAll('#scrollSlotType input')).find(isTicketInput);
      return el || null;
    }

    let input = null;
    for (let i = 0; i < 25; i++) {
      input = findTicketInputEl();
      if (input) break;
      await new Promise(r => setTimeout(r, 60));
    }

    if (!input) {
      console.warn('[TTD Bridge] Ticket input not found');
      window.dispatchEvent(new CustomEvent('__TTD_TICKETS_SELECTED__', { detail: { success: false, reason: 'input_not_found' } }));
      return false;
    }

    function getTicketMenuOptions() {
      // 1. Direct floating dropdown items that are numeric
      let direct = Array.from(
        document.querySelectorAll('.floatingDropdown_listItem__tU_5x, [class*="floatingDropdown_listItem"], [class*="listItem"]')
      ).filter(el => {
        const t = el.textContent?.trim();
        const n = parseInt(t, 10);
        return !isNaN(n) && n >= 1 && n <= 10 && (t === String(n) || t === String(n).padStart(2, '0'));
      });
      if (direct.length > 0) return direct;

      // 2. Menu containers scoped to input wrapper or nearby container
      const wrapper = input.parentElement;
      const slotContainer = input.closest('#scrollSlotType') || input.closest('[class*="slotHeader"]') || wrapper?.parentElement;
      const menuContainer = wrapper?.querySelector('[style*="z-index: 999"], [style*="z-index"], .dropdown_scroll, [class*="dropdown"]') ||
                            wrapper?.parentElement?.querySelector('[style*="z-index: 999"], [style*="z-index"], .dropdown_scroll') ||
                            slotContainer?.querySelector('[style*="z-index: 999"], .dropdown_scroll, [class*="dropdown"]');
      if (!menuContainer) return [];

      const items = Array.from(menuContainer.querySelectorAll('li, div, span')).filter(el => {
        const t = el.textContent?.trim();
        const n = parseInt(t, 10);
        return !isNaN(n) && n >= 1 && n <= 10 && (t === String(n) || t === String(n).padStart(2, '0')) &&
               (el.children.length === 0 || (el.children.length === 1 && el.firstElementChild.children.length === 0));
      });
      return items;
    }

    function fireReactClickOnOption(optionEl) {
      if (!optionEl) return false;
      const candidates = [optionEl, optionEl.parentElement];
      for (const el of candidates) {
        if (!el) continue;
        const key = Object.keys(el).find(k => k.startsWith('__reactProps') || k.startsWith('__reactEventHandlers'));
        if (key && el[key]) {
          const p = el[key];
          if (typeof p.onClick === 'function') {
            try {
              console.log('[TTD Bridge] Invoking React onClick on ticket option:', el.tagName, el.className, el.textContent.trim());
              p.onClick({
                isTrusted: true,
                nativeEvent: { isTrusted: true, button: 0 },
                preventDefault: () => {},
                stopPropagation: () => {},
                target: el,
                currentTarget: el
              });
              return true;
            } catch (err) {
              console.warn('[TTD Bridge] Option onClick error:', err);
            }
          }
          if (typeof p.onMouseDown === 'function') {
            try {
              p.onMouseDown({
                isTrusted: true,
                nativeEvent: { isTrusted: true, button: 0 },
                preventDefault: () => {},
                stopPropagation: () => {},
                target: el,
                currentTarget: el
              });
              return true;
            } catch (err) {}
          }
        }
      }

      // Fallback: native clicks
      try {
        optionEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window, pointerType: 'mouse' }));
        optionEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        optionEl.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window, pointerType: 'mouse' }));
        optionEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        optionEl.click();
      } catch (e) {}

      return true;
    }

    // Step 1: Open ticket dropdown if not already open (one toggle at a time)
    let options = await openDropdownStepwise(input, getTicketMenuOptions, 300);

    if (options.length === 0) {
      console.warn('[TTD Bridge] Could not open ticket dropdown options');
      window.dispatchEvent(new CustomEvent('__TTD_TICKETS_SELECTED__', { detail: { success: false, reason: 'no_options', count: input.value } }));
      return false;
    }

    console.log(`[TTD Bridge] Found ${options.length} ticket options in dropdown`);

    // Step 2: Parse available ticket counts and select best (exact match OR max available <= desired)
    const availableOptions = [];
    for (const optEl of options) {
      const val = parseInt(optEl.textContent.trim(), 10);
      if (!isNaN(val) && val >= 1) {
        availableOptions.push({ el: optEl, count: val });
      }
    }

    let best = availableOptions.find(o => o.count === desiredInt);

    // If desired (e.g. 5) is not available: select the MAX available number <= desiredInt
    if (!best) {
      const eligible = availableOptions.filter(o => o.count <= desiredInt).sort((a, b) => b.count - a.count);
      if (eligible.length > 0) {
        best = eligible[0]; // Maximum available number <= desired
      } else {
        // If all available options are > desiredInt, pick the lowest
        availableOptions.sort((a, b) => a.count - b.count);
        best = availableOptions[0];
      }
      console.log(`[TTD Bridge] Desired ${desiredInt} not in options. Selecting max available: ${best.count}`);
    } else {
      console.log(`[TTD Bridge] Desired ${desiredInt} found in dropdown options.`);
    }

    // Step 3: Click the target option
    fireReactClickOnOption(best.el);

    // Step 4: Verify input.value updated (up to 800ms)
    let isSuccess = false;
    const startVerify = Date.now();
    while (Date.now() - startVerify < 800) {
      if (parseInt(input.value, 10) === best.count) {
        isSuccess = true;
        break;
      }
      await new Promise(r => setTimeout(r, 40));
    }

    // Retry once if not updated
    if (!isSuccess) {
      console.log('[TTD Bridge] Retrying ticket option click once...');
      fireReactClickOnOption(best.el);
      const startVerify2 = Date.now();
      while (Date.now() - startVerify2 < 600) {
        if (parseInt(input.value, 10) === best.count) {
          isSuccess = true;
          break;
        }
        await new Promise(r => setTimeout(r, 40));
      }
    }

    console.log('[TTD Bridge] Final ticket input value:', input.value, 'Target:', best.count, 'Success:', isSuccess);
    window.dispatchEvent(new CustomEvent('__TTD_TICKETS_SELECTED__', {
      detail: { success: isSuccess || parseInt(input.value, 10) === best.count, count: input.value, selectedCount: best.count }
    }));
    return true;
  }

  function normalizeOptionText(text) {
    return String(text || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function matchOptionText(actual, expected) {
    const a = normalizeOptionText(actual);
    const b = normalizeOptionText(expected);
    if (!a || !b) return false;
    if (a === b) return true;
    const genders = ["male", "female", "transgender"];
    if (genders.includes(a) || genders.includes(b)) {
      return a === b;
    }
    const isAadhaarA = a.includes("aadhar") || a.includes("aadhaar");
    const isAadhaarB = b.includes("aadhar") || b.includes("aadhaar");
    if (isAadhaarA && isAadhaarB) return true;
    if (a.includes("passport") && b.includes("passport")) return true;
    if (a.includes("voter") && b.includes("voter")) return true;
    if (b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
    return false;
  }

  function matchTempleText(actual, expected) {
    const a = normalizeOptionText(actual);
    const b = normalizeOptionText(expected);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;

    const keyTokens = [
      "srivari", "tirumala", "pradakshina", "govindaraja", "padmavathi",
      "srinivasamangapuram", "appalayagunta", "surya", "narayanavanam",
      "vontimitta", "thallapaka", "karvetinagaram"
    ];
    for (const token of keyTokens) {
      if (b.includes(token) && a.includes(token)) return true;
    }
    return false;
  }

  async function selectDropdownInMainWorld(value) {
    const input = document.querySelector('[data-ttd-target="active"]');
    if (!input) {
      console.warn('[TTD Bridge] Dropdown target input not found');
      window.dispatchEvent(new CustomEvent('__TTD_DROPDOWN_SELECTED__', { detail: { success: false, reason: 'not_found' } }));
      return false;
    }
    try {
      if (matchOptionText(input.value, value)) {
        console.log('[TTD Bridge] Dropdown already matches:', input.value);
        return true;
      }

      // 1. Open this input's menu one toggle at a time
      const options = await openDropdownStepwise(input, () => findMenuItems(input), 250);
      if (options.length === 0) {
        console.warn('[TTD Bridge] Dropdown did not open for value:', value);
        return false;
      }

      // 2. Click the matching option only - never fall back to options[0] (would pick a wrong gender)
      const target = options.find(el => matchOptionText(el.textContent, value));
      if (!target) {
        console.warn('[TTD Bridge] No option matches "' + value + '" in:', options.map(o => o.textContent.trim()));
        return false;
      }
      console.log('[TTD Bridge] Clicking option:', target.textContent.trim());
      clickMenuOption(target);

      // 3. Verify; if React ignored the handler call, retry once with a native click
      let ok = !!(await waitFor(() => matchOptionText(input.value, value), 600, 20));
      if (!ok && target.isConnected) {
        try { target.click(); } catch (e) {}
        ok = !!(await waitFor(() => matchOptionText(input.value, value), 600, 20));
      }
      return ok;
    } finally {
      const isSuccess = matchOptionText(input.value, value);
      console.log('[TTD Bridge] Final dropdown value:', input.value, 'Success:', isSuccess);
      input.removeAttribute('data-ttd-target');
      window.dispatchEvent(new CustomEvent('__TTD_DROPDOWN_SELECTED__', { detail: { value: input.value, success: isSuccess } }));
    }
  }

  async function selectTempleInMainWorld(targetTemple) {
    if (!targetTemple) return false;
    console.log('[TTD Bridge] selectTempleInMainWorld requested:', targetTemple);

    const input = document.querySelector('input[name="templeSelected"]') ||
                  document.querySelector('input[placeholder*="Select Temple"]') ||
                  document.querySelector('input[label="Temple"]');

    if (!input) {
      console.warn('[TTD Bridge] Temple input not found');
      window.dispatchEvent(new CustomEvent('__TTD_TEMPLE_SELECTED__', { detail: { success: false, reason: 'input_not_found' } }));
      return false;
    }

    if (matchTempleText(input.value, targetTemple)) {
      console.log('[TTD Bridge] Temple already matches:', input.value);
      window.dispatchEvent(new CustomEvent('__TTD_TEMPLE_SELECTED__', { detail: { success: true, temple: input.value } }));
      return true;
    }

    // Open the menu one toggle at a time (the old onClick + native click pair toggled it shut again)
    const options = await openDropdownStepwise(input, () => findMenuItems(input), 250);
    if (options.length === 0) {
      console.warn('[TTD Bridge] Could not open temple dropdown');
      window.dispatchEvent(new CustomEvent('__TTD_TEMPLE_SELECTED__', { detail: { success: false, reason: 'no_options' } }));
      return false;
    }

    const target = options.find(el => matchTempleText(el.textContent, targetTemple)) ||
                   options.find(el => matchOptionText(el.textContent, targetTemple));
    if (!target) {
      console.warn('[TTD Bridge] Target temple option not found in list:', targetTemple);
      window.dispatchEvent(new CustomEvent('__TTD_TEMPLE_SELECTED__', { detail: { success: false, reason: 'target_not_found' } }));
      return false;
    }

    console.log('[TTD Bridge] Clicking temple option:', target.textContent.trim());
    try { target.scrollIntoView({ block: 'nearest', behavior: 'instant' }); } catch (e) {}
    clickMenuOption(target);
    let isSuccess = !!(await waitFor(() => matchTempleText(input.value, targetTemple), 600, 20));
    if (!isSuccess && target.isConnected) {
      try { target.click(); } catch (e) {}
      isSuccess = !!(await waitFor(() => matchTempleText(input.value, targetTemple), 600, 20));
    }

    console.log('[TTD Bridge] Final temple value:', input.value, 'Success:', isSuccess);
    window.dispatchEvent(new CustomEvent('__TTD_TEMPLE_SELECTED__', { detail: { success: isSuccess, temple: input.value } }));
    return isSuccess;
  }

  // Guards against overlapping Continue requests (each one would click again)
  let continueInFlight = false;

  async function clickContinueInMainWorld() {
    console.log('[TTD Bridge] clickContinueInMainWorld requested');
    if (continueInFlight) {
      console.log('[TTD Bridge] Continue already in flight - ignoring duplicate request');
      return false;
    }
    continueInFlight = true;

    // Calendar Continue only: once the pilgrim form (a "Name" field) is up, its Continue matches the
    // same selectors, and clicking it submits the empty form - lighting up every validation error.
    // Visible form only: TTD's Arjitha page can keep a hidden pilgrim form in the DOM on the slot step
    function onPilgrimForm() {
      return Array.from(document.querySelectorAll('label')).some(l => {
        if (!/^name\W*$/i.test(l.textContent.trim())) return false;
        const r = l.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(l).visibility !== 'hidden';
      });
    }

    // <button> elements only, labelled Continue. Arjitha wraps both buttons in
    // <div class="mg5vGq_desktop-continue-btn"> - matching that div clicked nothing, and the old
    // child-handler fallback then fired the Back button too (bouncing to the home page).
    function findContinueBtn() {
      if (onPilgrimForm()) return null;
      const isContinue = b => b && /^continue$/i.test(b.textContent.trim());
      const candidates = [
        ...document.querySelectorAll('button[class*="continue-btn"], button[class*="PilgrimSlotBooking_continue"], button[class*="purpleDesktopButton"], button[class*="SlotBooking_purple"]'),
        ...document.querySelectorAll('button'),
      ];
      return candidates.find(isContinue) || null;
    }

    // Wait up to 2500ms for Continue button to be present and enabled
    let continueBtn = null;
    const start = Date.now();
    while (Date.now() - start < 2500) {
      continueBtn = findContinueBtn();
      if (continueBtn && !continueBtn.disabled && !continueBtn.getAttribute('disabled') && !continueBtn.classList.contains('disabled')) {
        break;
      }
      await new Promise(r => setTimeout(r, 40));
    }

    if (!continueBtn) {
      console.warn('[TTD Bridge] Continue button not found or remained disabled');
      continueInFlight = false;
      window.dispatchEvent(new CustomEvent('__TTD_CONTINUE_CLICKED__', { detail: { success: false } }));
      return false;
    }

    console.log('[TTD Bridge] Found enabled Continue button. Clicking once...');

    // Exactly ONE click per attempt. Every extra click fires another slot-block request, and TTD
    // (Arjitha Seva especially) treats the duplicates as a conflicting booking and bounces to home.
    try { continueBtn.scrollIntoView({ block: 'nearest', behavior: 'instant' }); } catch (e) {}
    continueBtn.click();

    // Second (and last) attempt only if nothing happened at all: still on the calendar after 2.5s with
    // Continue still enabled. Uses the React handler directly in case the native click was ignored.
    setTimeout(() => {
      const stillThere = findContinueBtn();
      if (stillThere && stillThere === continueBtn && !stillThere.disabled && document.contains(stillThere)) {
        console.log('[TTD Bridge] Continue had no effect after 2.5s - trying its React handler once...');
        const p = getFiberAndProps(stillThere).props;
        if (p && typeof p.onClick === 'function') {
          try { p.onClick(makeSyntheticEvent(stillThere, 'click')); } catch (e) {}
        }
      }
      continueInFlight = false;
    }, 2500);

    window.dispatchEvent(new CustomEvent('__TTD_CONTINUE_CLICKED__', { detail: { success: true } }));
    return true;
  }

  window.addEventListener(
    "__TTD_REACT_CLICK__",
    function(e) {
      if (e.target) {
        executeBridgeClick(e.target);
      }
    },
    true
  );

  window.addEventListener(
    "__TTD_SELECT_TICKETS__",
    function(e) {
      if (e.detail && e.detail.count) {
        selectTicketsInMainWorld(e.detail.count);
      }
    },
    true
  );

  window.addEventListener(
    "__TTD_SELECT_DROPDOWN__",
    function(e) {
      if (e.detail && e.detail.value) {
        selectDropdownInMainWorld(e.detail.value);
      }
    },
    true
  );

  window.addEventListener(
    "__TTD_SELECT_TEMPLE__",
    function(e) {
      if (e.detail && e.detail.temple) {
        selectTempleInMainWorld(e.detail.temple);
      }
    },
    true
  );

  window.addEventListener(
    "__TTD_CLICK_CONTINUE__",
    function() {
      clickContinueInMainWorld();
    },
    true
  );
})();
