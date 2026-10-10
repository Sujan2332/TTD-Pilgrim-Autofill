// ---------------------------------------------------------------------------
// TTD Pilgrim Autofill - Page Bridge
//
// Runs in the MAIN world to bridge React synthetic events that require
// isTrusted flags or direct component handler calls.
// ---------------------------------------------------------------------------

(function() {
  if (window.__TTD_BRIDGE_V2_LOADED__) return;
  window.__TTD_BRIDGE_V2_LOADED__ = true;

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

  async function selectTicketsInMainWorld(desiredCount) {
    const desiredStr = String(desiredCount);
    console.log('[TTD Bridge] selectTicketsInMainWorld requested count:', desiredStr);

    let input = null;
    for (let i = 0; i < 20; i++) {
      input = document.querySelector('.SlotBooking_slotHeader__bV77N input.floating-input') || 
              document.querySelector('[class*="SlotBooking_slotHeader"] input') ||
              document.querySelector('input.floating-input[readonly]');
      if (input) break;
      await new Promise(r => setTimeout(r, 50));
    }

    if (!input) {
      console.warn('[TTD Bridge] Ticket input not found');
      window.dispatchEvent(new CustomEvent('__TTD_TICKETS_SELECTED__', { detail: { success: false, reason: 'input_not_found' } }));
      return false;
    }

    if (String(input.value).trim() === desiredStr) {
      console.log('[TTD Bridge] Ticket count is already', desiredStr);
      window.dispatchEvent(new CustomEvent('__TTD_TICKETS_SELECTED__', { detail: { success: true, count: desiredStr } }));
      return true;
    }

    function findTargetOption(valStr) {
      // 1. Look inside the dropdown menu container under the input or z-index: 999
      const wrapper = input.parentElement;
      const menuContainer = wrapper?.querySelector('[style*="z-index: 999"], [style*="z-index"], [class*="dropdown"]') ||
                            document.querySelector('[class*="SlotBooking_slotHeader"] [style*="z-index: 999"]') ||
                            document.querySelector('div[style*="z-index: 999"]');
      if (menuContainer) {
        const opts = Array.from(menuContainer.querySelectorAll('*')).filter(el => {
          const t = el.textContent.trim();
          return t === valStr && (el.children.length === 0 || (el.children.length === 1 && el.firstElementChild.children.length === 0));
        });
        if (opts.length > 0) return opts[0];
      }

      // 2. Fallback: all elements on page matching valStr that are NOT calendar date cells
      const all = Array.from(document.querySelectorAll('*')).filter(el => {
        const t = el.textContent.trim();
        return t === valStr && el !== input && !el.closest('table') && !el.closest('[class*="DesktopCalender"]') &&
               (el.children.length === 0 || (el.children.length === 1 && el.firstElementChild.children.length === 0));
      });
      return all[all.length - 1] || null;
    }

    function fireReactClickOnOption(optionEl) {
      if (!optionEl) return false;
      // Check optionEl first, then only its direct parent if no handler found
      const candidates = [optionEl, optionEl.parentElement];
      for (const el of candidates) {
        if (!el) continue;
        const key = Object.keys(el).find(k => k.startsWith('__reactProps') || k.startsWith('__reactEventHandlers'));
        if (key && el[key] && typeof el[key].onClick === 'function') {
          try {
            console.log('[TTD Bridge] Invoking React onClick on option:', el.tagName, el.className, el.textContent.trim());
            el[key].onClick({
              isTrusted: true,
              nativeEvent: { isTrusted: true, button: 0 },
              preventDefault: () => {},
              stopPropagation: () => {},
              target: el,
              currentTarget: el
            });
            return true; // STOP IMMEDIATELY! Do not walk further up or click parent wrapper!
          } catch (err) {
            console.warn('[TTD Bridge] Option onClick error:', err);
          }
        }
      }

      // Fallback: native clicks only on optionEl itself
      try {
        optionEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window, pointerType: 'mouse' }));
        optionEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        optionEl.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window, pointerType: 'mouse' }));
        optionEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        optionEl.click();
      } catch (e) {}

      return true;
    }

    // Step 1: Check if options are ALREADY visible in DOM before clicking to open
    let target = findTargetOption(desiredStr);

    if (!target) {
      // Step 1b: Dropdown not open yet. Open using candidate loop (call ONCE and break)
      const candidates = [input, input.parentElement, input.parentElement ? input.parentElement.querySelector('img') : null];
      let opened = false;
      for (const el of candidates) {
        if (!el) continue;
        const key = Object.keys(el).find(k => k.startsWith('__reactProps'));
        if (key && el[key] && typeof el[key].onClick === 'function') {
          try {
            console.log('[TTD Bridge] Opening dropdown via React onClick on:', el.tagName, el.className);
            el[key].onClick({
              isTrusted: true,
              nativeEvent: { isTrusted: true },
              preventDefault: () => {},
              stopPropagation: () => {},
              target: el,
              currentTarget: el
            });
            opened = true;
            break;
          } catch (e) {
            console.warn('[TTD Bridge] Error opening ticket dropdown:', e);
          }
        }
      }
      if (!opened) {
        console.log('[TTD Bridge] Falling back to native click on input');
        input.click();
      }

      // Step 2: Poll for options (up to 1500ms)
      const startFind = Date.now();
      while (Date.now() - startFind < 1500) {
        target = findTargetOption(desiredStr);
        if (target) break;
        await new Promise(r => setTimeout(r, 40));
      }
    }

    // Step 2b: Fallback if exact desired count not present (e.g. only 2 or 4 slots allowed)
    if (!target) {
      console.warn('[TTD Bridge] Desired count', desiredStr, 'not found in dropdown, checking available options...');
      const menuContainer = input.parentElement?.querySelector('[style*="z-index: 999"], [style*="z-index"], [class*="dropdown"]') ||
                            document.querySelector('div[style*="z-index: 999"]');
      const allOpts = menuContainer ? Array.from(menuContainer.querySelectorAll('*')).filter(el => {
        const n = parseInt(el.textContent.trim(), 10);
        return !isNaN(n) && n >= 1 && n <= 10 && (el.children.length === 0 || (el.children.length === 1 && el.firstElementChild.children.length === 0));
      }) : [];
      if (allOpts.length > 0) {
        allOpts.sort((a, b) => parseInt(b.textContent.trim(), 10) - parseInt(a.textContent.trim(), 10));
        target = allOpts.find(el => parseInt(el.textContent.trim(), 10) <= desiredCount) || allOpts[0];
        console.log('[TTD Bridge] Selected best available option:', target.textContent.trim());
      }
    }

    // Step 3: Click target option via React handler
    if (target) {
      console.log('[TTD Bridge] Clicking option:', target.tagName, target.className, target.textContent.trim());
      fireReactClickOnOption(target);
    } else {
      console.warn('[TTD Bridge] Option not found for count:', desiredStr);
    }

    // Poll to verify input.value has changed (up to 800ms)
    const startVerify = Date.now();
    while (Date.now() - startVerify < 800) {
      if (String(input.value).trim() === desiredStr) break;
      await new Promise(r => setTimeout(r, 40));
    }

    // If still not updated and target is available, retry click once
    if (String(input.value).trim() !== desiredStr && target) {
      console.log('[TTD Bridge] Retrying option click once...');
      fireReactClickOnOption(target);
      const startVerify2 = Date.now();
      while (Date.now() - startVerify2 < 600) {
        if (String(input.value).trim() === desiredStr) break;
        await new Promise(r => setTimeout(r, 40));
      }
    }

    console.log('[TTD Bridge] Final ticket input value:', input.value);
    window.dispatchEvent(new CustomEvent('__TTD_TICKETS_SELECTED__', {
      detail: { success: String(input.value).trim() === desiredStr, count: input.value }
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

      const candidates = [
        input,
        input.parentElement,
        input.parentElement?.parentElement,
        input.parentElement?.querySelector('img')
      ];

      function findOptionsInMainWorld(valStr) {
        const wrapper = input.parentElement;

        // 1. Instant direct option discovery (fastest path from previous commit)
        let direct = Array.from(wrapper?.querySelectorAll('[class*="floatingDropdown_listItem"]') || []);
        if (direct.length === 0) {
          direct = Array.from(document.querySelectorAll('[class*="floatingDropdown_listItem"]'));
        }
        if (direct.length > 0) {
          const matchDirect = direct.filter(el => matchOptionText(el.textContent, valStr));
          if (matchDirect.length > 0) return matchDirect;

          const s = String(valStr || '').toLowerCase();
          if (s.includes('aadhaar') || s.includes('aadhar')) {
            const aadh = direct.filter(el => el.textContent.toLowerCase().includes('aadhaar') || el.textContent.toLowerCase().includes('aadhar'));
            if (aadh.length > 0) return aadh;
            return [direct[0]];
          }
          if (s.includes('passport')) {
            const pass = direct.filter(el => el.textContent.toLowerCase().includes('passport'));
            if (pass.length > 0) return pass;
          }
          return direct;
        }

        // 2. Fallback to container leaves if CSS modules hash differs
        const menuContainer = wrapper?.querySelector('[style*="z-index: 999"], [style*="z-index"], [class*="dropdown"]') ||
                              wrapper?.parentElement?.querySelector('[style*="z-index: 999"], [style*="z-index"], [class*="dropdown"]');
        if (menuContainer) {
          const allLeaves = Array.from(menuContainer.querySelectorAll('*')).filter(el => {
            const t = el.textContent?.trim();
            return t && (el.children.length === 0 || (el.children.length === 1 && el.firstElementChild.children.length === 0));
          });
          const matching = allLeaves.filter(el => matchOptionText(el.textContent, valStr));
          if (matching.length > 0) return matching;

          const s = String(valStr || '').toLowerCase();
          if (s.includes('aadhaar') || s.includes('aadhar')) {
            const aadhaarOpts = allLeaves.filter(el => {
              const t = el.textContent.toLowerCase();
              return t.includes('aadhaar') || t.includes('aadhar');
            });
            if (aadhaarOpts.length > 0) return aadhaarOpts;
            if (allLeaves.length > 0) return [allLeaves[0]];
          }
          if (s.includes('passport')) {
            const passOpts = allLeaves.filter(el => el.textContent.toLowerCase().includes('passport'));
            if (passOpts.length > 0) return passOpts;
          }
        }
        return [];
      }

      // 1. Check if options are already open
      let options = findOptionsInMainWorld(value);

      // 2. Try candidates with rapid 40ms checks to find the one that opens the menu
      if (!options || options.length === 0) {
        for (const c of candidates) {
          const key = Object.keys(c).find(k => k.startsWith('__reactProps'));
          if (key && c[key]) {
            const p = c[key];
            if (typeof p.onClick === 'function') {
              console.log('[TTD Bridge] Firing React onClick on candidate:', c.tagName);
              p.onClick({ isTrusted: true, nativeEvent: { isTrusted: true }, preventDefault: ()=>{}, stopPropagation: ()=>{}, target: c, currentTarget: c });
            } else if (typeof p.onMouseDown === 'function') {
              console.log('[TTD Bridge] Firing React onMouseDown on candidate:', c.tagName);
              p.onMouseDown({ isTrusted: true, nativeEvent: { isTrusted: true }, preventDefault: ()=>{}, stopPropagation: ()=>{}, target: c, currentTarget: c });
            }
          }

          // Rapid 40ms check for options
          const startWait = Date.now();
          while (Date.now() - startWait < 40) {
            await new Promise(r => setTimeout(r, 10));
            options = findOptionsInMainWorld(value);
            if (options && options.length > 0) break;
          }

          if (options && options.length > 0) break;
        }
      }

      if (options && options.length > 0) {
        const target = options.find(el => matchOptionText(el.textContent, value)) || options[0];
        if (target) {
          console.log('[TTD Bridge] Clicking option:', target.textContent.trim());
          const key = Object.keys(target).find(k => k.startsWith('__reactProps')) || 
                      Object.keys(target.parentElement).find(k => k.startsWith('__reactProps'));
          const propsEl = target[key] ? target : target.parentElement;
          if (propsEl && propsEl[key]?.onClick) {
            propsEl[key].onClick({ isTrusted: true, nativeEvent: { isTrusted: true }, preventDefault: ()=>{}, stopPropagation: ()=>{}, target: propsEl, currentTarget: propsEl });
          } else {
            target.click();
          }
        }
      }

      // Snappy 60ms verification wait exactly as previous commit
      if (!matchOptionText(input.value, value)) {
        const startVerify = Date.now();
        while (Date.now() - startVerify < 60) {
          await new Promise(r => setTimeout(r, 10));
          if (matchOptionText(input.value, value)) break;
        }
      }

      return matchOptionText(input.value, value);
    } finally {
      const isSuccess = matchOptionText(input.value, value);
      console.log('[TTD Bridge] Final dropdown value:', input.value, 'Success:', isSuccess);
      input.removeAttribute('data-ttd-target');
      window.dispatchEvent(new CustomEvent('__TTD_DROPDOWN_SELECTED__', { detail: { value: input.value, success: isSuccess } }));
    }
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
})();
