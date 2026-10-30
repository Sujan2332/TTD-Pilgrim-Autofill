// ---------------------------------------------------------------------------
// TTD Pilgrim Autofill - content script
//
// This runs only on ttdevasthanams.ap.gov.in. It fills the General Details
// fields once, then fills as many Pilgrim Details rows as are available on
// the page (attempting to add more rows first if you selected more pilgrims
// than there are rows open).
//
// IMPORTANT: different seva types (Arjitha Seva, Special Entry, etc.) use
// different `name` HTML attributes for the same fields (e.g. "name" vs
// "fname", "idType" vs "photoIdType"), different container class names (or
// no class at all), and even a different section order (General Details can
// appear before OR after Pilgrim Details). Matching by exact `name`
// attribute or container class only works for the one page it was built
// against. Instead, every field here is found by its floating <label> TEXT
// ("Name", "Age", "Email", "Photo ID Proof", etc.), normalized to ignore
// case/spacing/punctuation differences ("Photo ID Number" and "Photo Id
// Number" both normalize to "photoidnumber"). This is far more stable
// across different seva forms, since the visible label text is consistent
// even when the underlying markup isn't.
// ---------------------------------------------------------------------------

console.log("[TTD Autofill] content script loaded on", location.href);

const CONTENT_SCRIPT_INSTANCE_KEY = "__ttdAutofillContentScriptLoaded";
const CONTENT_SCRIPT_INSTANCE = { id: `${Date.now()}-${Math.random()}` };
window[CONTENT_SCRIPT_INSTANCE_KEY] = CONTENT_SCRIPT_INSTANCE;

const ADD_PILGRIM_TEXT_PATTERN = /add.*pilgrim/i;

// Ensure MAIN-world bridge listener is active to execute trusted React onClick handlers
function ensurePageBridge() {
  if (document.getElementById("__ttd_page_bridge_tag")) return;
  try {
    const script = document.createElement("script");
    script.id = "__ttd_page_bridge_tag";
    script.textContent = "// ---------------------------------------------------------------------------\n// TTD Pilgrim Autofill - Page Bridge\n//\n// Runs in the MAIN world to bridge React synthetic events that require\n// isTrusted flags or direct component handler calls.\n// ---------------------------------------------------------------------------\n\n(function() {\n  if (window.__TTD_BRIDGE_V2_LOADED__) return;\n  window.__TTD_BRIDGE_V2_LOADED__ = true;\n\n  // Count TTD's in-flight requests (fetch + XHR) and publish the number on <html data-ttd-pending>.\n  // The content script waits for it to reach 0 (e.g. calendar reload after a temple change) instead of\n  // sleeping a fixed second. Only counts - requests and responses pass through untouched.\n  (function trackPendingRequests() {\n    var pending = 0;\n    var publish = function(delta) {\n      pending = Math.max(0, pending + delta);\n      try { document.documentElement.setAttribute('data-ttd-pending', String(pending)); } catch (e) {}\n    };\n    publish(0);\n    if (typeof window.fetch === 'function') {\n      var origFetch = window.fetch;\n      window.fetch = function() {\n        publish(1);\n        var done = function() { publish(-1); };\n        try {\n          var p = origFetch.apply(this, arguments);\n          p.then(done, done);\n          return p;\n        } catch (e) {\n          done();\n          throw e;\n        }\n      };\n    }\n    var origSend = XMLHttpRequest.prototype.send;\n    XMLHttpRequest.prototype.send = function() {\n      publish(1);\n      this.addEventListener('loadend', function() { publish(-1); }, { once: true });\n      return origSend.apply(this, arguments);\n    };\n  })();\n\n  function getFiberAndProps(el) {\n    if (!el) return { fiber: null, props: null };\n    var keys = [];\n    try {\n      keys = Object.getOwnPropertyNames(el);\n    } catch (e) {\n      keys = Object.keys(el);\n    }\n\n    var propsKey = keys.find(function(k) {\n      return k.startsWith(\"__reactProps\") || k.startsWith(\"__reactEventHandlers\");\n    });\n    var fiberKey = keys.find(function(k) {\n      return k.startsWith(\"__reactFiber\") || k.startsWith(\"_reactFiber\") || k.startsWith(\"__reactInternalInstance\");\n    });\n\n    var props = propsKey ? el[propsKey] : null;\n    var fiber = fiberKey ? el[fiberKey] : null;\n\n    if (!props && fiber) {\n      props = fiber.memoizedProps || fiber.pendingProps || null;\n    }\n    return { fiber: fiber, props: props };\n  }\n\n  function makeSyntheticEvent(el, type) {\n    return {\n      isTrusted: true,\n      type: type || \"click\",\n      bubbles: true,\n      cancelable: true,\n      defaultPrevented: false,\n      target: el,\n      currentTarget: el,\n      nativeEvent: {\n        isTrusted: true,\n        type: type || \"click\",\n        target: el,\n        currentTarget: el,\n        button: 0,\n        buttons: type === \"mouseup\" || type === \"click\" ? 0 : 1,\n      },\n      preventDefault: function() { this.defaultPrevented = true; },\n      stopPropagation: function() { this.propagationStopped = true; },\n      persist: function() {},\n    };\n  }\n\n  function invokeReactHandlers(el) {\n    if (!el) return false;\n    var res = getFiberAndProps(el);\n    var p = res.props;\n    var handled = false;\n\n    if (p) {\n      if (typeof p.onPointerDown === \"function\") {\n        try { p.onPointerDown(makeSyntheticEvent(el, \"pointerdown\")); handled = true; } catch (e) {}\n      }\n      if (typeof p.onMouseDown === \"function\") {\n        try { p.onMouseDown(makeSyntheticEvent(el, \"mousedown\")); handled = true; } catch (e) {}\n      }\n      if (typeof p.onClick === \"function\") {\n        try { p.onClick(makeSyntheticEvent(el, \"click\")); handled = true; } catch (e) {}\n      }\n      if (typeof p.onSelect === \"function\") {\n        try { p.onSelect(makeSyntheticEvent(el, \"select\")); handled = true; } catch (e) {}\n      }\n    }\n\n    // Check direct children (e.g. <span> inside <li> or <button>)\n    if (!handled && el.children && el.children.length > 0) {\n      for (var i = 0; i < el.children.length; i++) {\n        var child = el.children[i];\n        var cRes = getFiberAndProps(child);\n        var cp = cRes.props;\n        if (cp) {\n          if (typeof cp.onMouseDown === \"function\") {\n            try { cp.onMouseDown(makeSyntheticEvent(child, \"mousedown\")); handled = true; } catch (e) {}\n          }\n          if (typeof cp.onClick === \"function\") {\n            try { cp.onClick(makeSyntheticEvent(child, \"click\")); handled = true; } catch (e) {}\n          }\n        }\n      }\n    }\n\n    // Check parent ONLY IF NOT an option item inside a dropdown list!\n    var isDropdownOption = (\n      el.tagName === \"LI\" ||\n      el.getAttribute(\"role\") === \"option\" ||\n      (el.className && String(el.className).includes(\"listItem\")) ||\n      (typeof el.closest === \"function\" && el.closest(\"ul, [class*='floatingDropdown']\"))\n    );\n\n    if (!handled && !isDropdownOption) {\n      var parent = el.parentElement;\n      var depth = 0;\n      while (parent && parent !== document.body && depth < 3) {\n        if (parent.tagName === \"FORM\" || parent.tagName === \"BODY\") break;\n        var pRes = getFiberAndProps(parent);\n        var pp = pRes.props;\n        if (pp && typeof pp.onClick === \"function\") {\n          try { pp.onClick(makeSyntheticEvent(parent, \"click\")); handled = true; break; } catch (e) {}\n        }\n        parent = parent.parentElement;\n        depth++;\n      }\n    }\n\n    return handled;\n  }\n\n  function dispatchNativeClickSequence(el) {\n    if (!el) return;\n    try { el.scrollIntoView({ block: \"nearest\", behavior: \"instant\" }); } catch (e) {}\n    try { el.focus(); } catch (e) {}\n\n    var rect = el.getBoundingClientRect();\n    var clientX = Math.round(rect.left + (rect.width ? rect.width / 2 : 0));\n    var clientY = Math.round(rect.top + (rect.height ? rect.height / 2 : 0));\n\n    var downInit = {\n      bubbles: true,\n      cancelable: true,\n      composed: true,\n      view: window,\n      clientX: clientX,\n      clientY: clientY,\n      button: 0,\n      buttons: 1,\n    };\n\n    var upInit = {\n      bubbles: true,\n      cancelable: true,\n      composed: true,\n      view: window,\n      clientX: clientX,\n      clientY: clientY,\n      button: 0,\n      buttons: 0,\n    };\n\n    try {\n      el.dispatchEvent(new PointerEvent(\"pointerover\", upInit));\n      el.dispatchEvent(new MouseEvent(\"mouseover\", upInit));\n      el.dispatchEvent(new PointerEvent(\"pointerenter\", upInit));\n      el.dispatchEvent(new MouseEvent(\"mouseenter\", upInit));\n      el.dispatchEvent(new PointerEvent(\"pointerdown\", Object.assign({}, downInit, { pointerType: \"mouse\" })));\n      el.dispatchEvent(new MouseEvent(\"mousedown\", downInit));\n      el.dispatchEvent(new PointerEvent(\"pointerup\", Object.assign({}, upInit, { pointerType: \"mouse\" })));\n      el.dispatchEvent(new MouseEvent(\"mouseup\", upInit));\n      el.dispatchEvent(new MouseEvent(\"click\", upInit));\n      if (typeof el.click === \"function\") {\n        el.click();\n      }\n    } catch (e) {\n      console.warn(\"[TTD Bridge] Native event dispatch failed:\", e);\n    }\n  }\n\n  function executeBridgeClick(el) {\n    if (!el) return;\n    invokeReactHandlers(el);\n    dispatchNativeClickSequence(el);\n  }\n\n  function waitFor(checkFn, timeoutMs, intervalMs) {\n    return new Promise(function(resolve) {\n      var start = Date.now();\n      (function tick() {\n        var result = checkFn();\n        if (result) return resolve(result);\n        if (Date.now() - start >= timeoutMs) return resolve(null);\n        setTimeout(tick, intervalMs || 25);\n      })();\n    });\n  }\n\n  // TTD's custom dropdowns (tickets, gender, photo ID) TOGGLE on every click, so fire exactly\n  // one opening action at a time and stop as soon as options render - a burst of clicks opens\n  // the menu and immediately closes it again.\n  async function openDropdownStepwise(input, findOptions, waitMs) {\n    var options = findOptions();\n    if (options.length > 0) return options;\n\n    var callProp = function(el, name, type) {\n      return function() {\n        var p = el && getFiberAndProps(el).props;\n        if (!p || typeof p[name] !== 'function') return false;\n        try { p[name](makeSyntheticEvent(el, type)); return true; } catch (e) { return false; }\n      };\n    };\n    var nativeClick = function(el) {\n      return function() {\n        if (!el || typeof el.click !== 'function') return false;\n        el.click();\n        return true;\n      };\n    };\n    var nativeFocus = function(el) {\n      return function() {\n        if (!el) return false;\n        try { el.blur(); el.focus(); return true; } catch (e) { return false; }\n      };\n    };\n\n    var wrapper = input.parentElement;\n    var icon = wrapper && wrapper.querySelector('img');\n    var openers = [\n      callProp(input, 'onClick', 'click'),\n      callProp(input, 'onMouseDown', 'mousedown'),\n      callProp(input, 'onFocus', 'focus'),\n      callProp(wrapper, 'onClick', 'click'),\n      callProp(icon, 'onClick', 'click'),\n      nativeFocus(input),\n      nativeClick(input),\n      nativeClick(icon),\n      nativeClick(wrapper),\n    ];\n\n    for (var i = 0; i < openers.length; i++) {\n      if (!openers[i]()) continue;\n      options = await waitFor(function() {\n        var found = findOptions();\n        return found.length > 0 ? found : null;\n      }, waitMs, 20);\n      if (options) return options;\n    }\n    return [];\n  }\n\n  // Items of the menu that belongs to `input`. CSS-module prefixes change between TTD builds\n  // (\"floatingDropdown_listItem\", \"_36WbrG_listItem\"), so match on the stable suffix.\n  function findMenuItems(input) {\n    var wrapper = input.parentElement;\n    var menu = wrapper && wrapper.querySelector('[style*=\"z-index: 999\"], [style*=\"z-index:999\"]');\n    var scope = menu || wrapper;\n    var items = scope ? Array.from(scope.querySelectorAll('[class*=\"listItem\"], li, [role=\"option\"]')) : [];\n    if (items.length === 0) {\n      items = Array.from(document.querySelectorAll('[class*=\"listItem\"]'));\n    }\n    return items.filter(function(el, idx, arr) {\n      return el.textContent && el.textContent.trim() && arr.indexOf(el) === idx;\n    });\n  }\n\n  // One click on a menu option: its React onClick if present, otherwise a native click.\n  function clickMenuOption(el) {\n    var nodes = [el, el.firstElementChild].filter(Boolean);\n    for (var i = 0; i < nodes.length; i++) {\n      var p = getFiberAndProps(nodes[i]).props;\n      if (p && typeof p.onClick === 'function') {\n        try { p.onClick(makeSyntheticEvent(nodes[i], 'click')); return; } catch (e) {}\n      }\n    }\n    try { el.click(); } catch (e) {}\n  }\n\n  async function selectTicketsInMainWorld(desiredCount) {\n    const desiredInt = parseInt(desiredCount, 10);\n    console.log('[TTD Bridge] selectTicketsInMainWorld requested count:', desiredInt);\n\n    // Keep in sync with findTicketCountInput() in content.js\n    function findTicketInputEl() {\n      const isTicketInput = el =>\n        el && el.tagName === 'INPUT' && !['templeSelected', 'sevaSelected'].includes(el.getAttribute('name'));\n\n      let el = document.querySelector('input[name=\"noOfTickets\"]');\n      if (el) return el;\n\n      el = Array.from(document.querySelectorAll('[class*=\"slotHeader\"] input')).find(isTicketInput);\n      if (el) return el;\n\n      // Visible \"Number of Tickets\" label - restricted to text elements so <script> JSON can't match\n      const labelEl = Array.from(document.querySelectorAll('div, span, label, p')).find(\n        node => node.children.length === 0 && /^\\s*number\\s+of\\s+tickets\\s*$/i.test(node.textContent)\n      );\n      for (let node = labelEl?.parentElement, depth = 0; node && depth < 3; node = node.parentElement, depth++) {\n        el = Array.from(node.querySelectorAll('input')).find(isTicketInput);\n        if (el) return el;\n      }\n\n      el = Array.from(document.querySelectorAll('#scrollSlotType input')).find(isTicketInput);\n      return el || null;\n    }\n\n    let input = null;\n    for (let i = 0; i < 25; i++) {\n      input = findTicketInputEl();\n      if (input) break;\n      await new Promise(r => setTimeout(r, 60));\n    }\n\n    if (!input) {\n      console.warn('[TTD Bridge] Ticket input not found');\n      window.dispatchEvent(new CustomEvent('__TTD_TICKETS_SELECTED__', { detail: { success: false, reason: 'input_not_found' } }));\n      return false;\n    }\n\n    function getTicketMenuOptions() {\n      // 1. Dropdown list items that are numeric\n      let direct = Array.from(document.querySelectorAll('[class*=\"listItem\"]')).filter(el => {\n        const t = el.textContent?.trim();\n        const n = parseInt(t, 10);\n        return !isNaN(n) && n >= 1 && n <= 10 && (t === String(n) || t === String(n).padStart(2, '0'));\n      });\n      if (direct.length > 0) return direct;\n\n      // 2. Menu containers scoped to input wrapper or nearby container\n      const wrapper = input.parentElement;\n      const slotContainer = input.closest('#scrollSlotType') || input.closest('[class*=\"slotHeader\"]') || wrapper?.parentElement;\n      const menuContainer = wrapper?.querySelector('[style*=\"z-index: 999\"], [style*=\"z-index\"], .dropdown_scroll, [class*=\"dropdown\"]') ||\n                            wrapper?.parentElement?.querySelector('[style*=\"z-index: 999\"], [style*=\"z-index\"], .dropdown_scroll') ||\n                            slotContainer?.querySelector('[style*=\"z-index: 999\"], .dropdown_scroll, [class*=\"dropdown\"]');\n      if (!menuContainer) return [];\n\n      const items = Array.from(menuContainer.querySelectorAll('li, div, span')).filter(el => {\n        const t = el.textContent?.trim();\n        const n = parseInt(t, 10);\n        return !isNaN(n) && n >= 1 && n <= 10 && (t === String(n) || t === String(n).padStart(2, '0')) &&\n               (el.children.length === 0 || (el.children.length === 1 && el.firstElementChild.children.length === 0));\n      });\n      return items;\n    }\n\n    function fireReactClickOnOption(optionEl) {\n      if (!optionEl) return false;\n      const candidates = [optionEl, optionEl.parentElement];\n      for (const el of candidates) {\n        if (!el) continue;\n        const key = Object.keys(el).find(k => k.startsWith('__reactProps') || k.startsWith('__reactEventHandlers'));\n        if (key && el[key]) {\n          const p = el[key];\n          if (typeof p.onClick === 'function') {\n            try {\n              console.log('[TTD Bridge] Invoking React onClick on ticket option:', el.tagName, el.className, el.textContent.trim());\n              p.onClick({\n                isTrusted: true,\n                nativeEvent: { isTrusted: true, button: 0 },\n                preventDefault: () => {},\n                stopPropagation: () => {},\n                target: el,\n                currentTarget: el\n              });\n              return true;\n            } catch (err) {\n              console.warn('[TTD Bridge] Option onClick error:', err);\n            }\n          }\n          if (typeof p.onMouseDown === 'function') {\n            try {\n              p.onMouseDown({\n                isTrusted: true,\n                nativeEvent: { isTrusted: true, button: 0 },\n                preventDefault: () => {},\n                stopPropagation: () => {},\n                target: el,\n                currentTarget: el\n              });\n              return true;\n            } catch (err) {}\n          }\n        }\n      }\n\n      // Fallback: native clicks\n      try {\n        optionEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window, pointerType: 'mouse' }));\n        optionEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));\n        optionEl.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window, pointerType: 'mouse' }));\n        optionEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));\n        optionEl.click();\n      } catch (e) {}\n\n      return true;\n    }\n\n    // Step 1: Open ticket dropdown if not already open (one toggle at a time)\n    let options = await openDropdownStepwise(input, getTicketMenuOptions, 300);\n\n    if (options.length === 0) {\n      console.warn('[TTD Bridge] Could not open ticket dropdown options');\n      window.dispatchEvent(new CustomEvent('__TTD_TICKETS_SELECTED__', { detail: { success: false, reason: 'no_options', count: input.value } }));\n      return false;\n    }\n\n    console.log(`[TTD Bridge] Found ${options.length} ticket options in dropdown`);\n\n    // Step 2: Parse available ticket counts and select best (exact match OR max available <= desired)\n    const availableOptions = [];\n    for (const optEl of options) {\n      const val = parseInt(optEl.textContent.trim(), 10);\n      if (!isNaN(val) && val >= 1) {\n        availableOptions.push({ el: optEl, count: val });\n      }\n    }\n\n    let best = availableOptions.find(o => o.count === desiredInt);\n\n    // If desired (e.g. 5) is not available: select the MAX available number <= desiredInt\n    if (!best) {\n      const eligible = availableOptions.filter(o => o.count <= desiredInt).sort((a, b) => b.count - a.count);\n      if (eligible.length > 0) {\n        best = eligible[0]; // Maximum available number <= desired\n      } else {\n        // If all available options are > desiredInt, pick the lowest\n        availableOptions.sort((a, b) => a.count - b.count);\n        best = availableOptions[0];\n      }\n      console.log(`[TTD Bridge] Desired ${desiredInt} not in options. Selecting max available: ${best.count}`);\n    } else {\n      console.log(`[TTD Bridge] Desired ${desiredInt} found in dropdown options.`);\n    }\n\n    // Step 3: Click the target option\n    fireReactClickOnOption(best.el);\n\n    // Step 4: Verify input.value updated (up to 800ms)\n    let isSuccess = false;\n    const startVerify = Date.now();\n    while (Date.now() - startVerify < 800) {\n      if (parseInt(input.value, 10) === best.count) {\n        isSuccess = true;\n        break;\n      }\n      await new Promise(r => setTimeout(r, 40));\n    }\n\n    // Retry once if not updated\n    if (!isSuccess) {\n      console.log('[TTD Bridge] Retrying ticket option click once...');\n      fireReactClickOnOption(best.el);\n      const startVerify2 = Date.now();\n      while (Date.now() - startVerify2 < 600) {\n        if (parseInt(input.value, 10) === best.count) {\n          isSuccess = true;\n          break;\n        }\n        await new Promise(r => setTimeout(r, 40));\n      }\n    }\n\n    console.log('[TTD Bridge] Final ticket input value:', input.value, 'Target:', best.count, 'Success:', isSuccess);\n    window.dispatchEvent(new CustomEvent('__TTD_TICKETS_SELECTED__', {\n      detail: { success: isSuccess || parseInt(input.value, 10) === best.count, count: input.value, selectedCount: best.count }\n    }));\n    return true;\n  }\n\n  function normalizeOptionText(text) {\n    return String(text || \"\").toLowerCase().replace(/[^a-z0-9]/g, \"\");\n  }\n\n  function matchOptionText(actual, expected) {\n    const a = normalizeOptionText(actual);\n    const b = normalizeOptionText(expected);\n    if (!a || !b) return false;\n    if (a === b) return true;\n    const genders = [\"male\", \"female\", \"transgender\"];\n    if (genders.includes(a) || genders.includes(b)) {\n      return a === b;\n    }\n    const isAadhaarA = a.includes(\"aadhar\") || a.includes(\"aadhaar\");\n    const isAadhaarB = b.includes(\"aadhar\") || b.includes(\"aadhaar\");\n    if (isAadhaarA && isAadhaarB) return true;\n    if (a.includes(\"passport\") && b.includes(\"passport\")) return true;\n    if (a.includes(\"voter\") && b.includes(\"voter\")) return true;\n    if (b.length >= 4 && (a.includes(b) || b.includes(a))) return true;\n    return false;\n  }\n\n  function matchTempleText(actual, expected) {\n    const a = normalizeOptionText(actual);\n    const b = normalizeOptionText(expected);\n    if (!a || !b) return false;\n    if (a === b) return true;\n    if (a.includes(b) || b.includes(a)) return true;\n\n    const keyTokens = [\n      \"srivari\", \"tirumala\", \"pradakshina\", \"govindaraja\", \"padmavathi\",\n      \"srinivasamangapuram\", \"appalayagunta\", \"surya\", \"narayanavanam\",\n      \"vontimitta\", \"thallapaka\", \"karvetinagaram\"\n    ];\n    for (const token of keyTokens) {\n      if (b.includes(token) && a.includes(token)) return true;\n    }\n    return false;\n  }\n\n  async function selectDropdownInMainWorld(value) {\n    const input = document.querySelector('[data-ttd-target=\"active\"]');\n    if (!input) {\n      console.warn('[TTD Bridge] Dropdown target input not found');\n      window.dispatchEvent(new CustomEvent('__TTD_DROPDOWN_SELECTED__', { detail: { success: false, reason: 'not_found' } }));\n      return false;\n    }\n    try {\n      if (matchOptionText(input.value, value)) {\n        console.log('[TTD Bridge] Dropdown already matches:', input.value);\n        return true;\n      }\n\n      // 1. Open this input's menu one toggle at a time\n      const options = await openDropdownStepwise(input, () => findMenuItems(input), 250);\n      if (options.length === 0) {\n        console.warn('[TTD Bridge] Dropdown did not open for value:', value);\n        return false;\n      }\n\n      // 2. Click the matching option only - never fall back to options[0] (would pick a wrong gender)\n      const target = options.find(el => matchOptionText(el.textContent, value));\n      if (!target) {\n        console.warn('[TTD Bridge] No option matches \"' + value + '\" in:', options.map(o => o.textContent.trim()));\n        return false;\n      }\n      console.log('[TTD Bridge] Clicking option:', target.textContent.trim());\n      clickMenuOption(target);\n\n      // 3. Verify; if React ignored the handler call, retry once with a native click\n      let ok = !!(await waitFor(() => matchOptionText(input.value, value), 600, 20));\n      if (!ok && target.isConnected) {\n        try { target.click(); } catch (e) {}\n        ok = !!(await waitFor(() => matchOptionText(input.value, value), 600, 20));\n      }\n      return ok;\n    } finally {\n      const isSuccess = matchOptionText(input.value, value);\n      console.log('[TTD Bridge] Final dropdown value:', input.value, 'Success:', isSuccess);\n      input.removeAttribute('data-ttd-target');\n      window.dispatchEvent(new CustomEvent('__TTD_DROPDOWN_SELECTED__', { detail: { value: input.value, success: isSuccess } }));\n    }\n  }\n\n  async function selectTempleInMainWorld(targetTemple) {\n    if (!targetTemple) return false;\n    console.log('[TTD Bridge] selectTempleInMainWorld requested:', targetTemple);\n\n    const input = document.querySelector('input[name=\"templeSelected\"]') ||\n                  document.querySelector('input[placeholder*=\"Select Temple\"]') ||\n                  document.querySelector('input[label=\"Temple\"]');\n\n    if (!input) {\n      console.warn('[TTD Bridge] Temple input not found');\n      window.dispatchEvent(new CustomEvent('__TTD_TEMPLE_SELECTED__', { detail: { success: false, reason: 'input_not_found' } }));\n      return false;\n    }\n\n    if (matchTempleText(input.value, targetTemple)) {\n      console.log('[TTD Bridge] Temple already matches:', input.value);\n      window.dispatchEvent(new CustomEvent('__TTD_TEMPLE_SELECTED__', { detail: { success: true, temple: input.value } }));\n      return true;\n    }\n\n    // Open the menu one toggle at a time (the old onClick + native click pair toggled it shut again)\n    const options = await openDropdownStepwise(input, () => findMenuItems(input), 250);\n    if (options.length === 0) {\n      console.warn('[TTD Bridge] Could not open temple dropdown');\n      window.dispatchEvent(new CustomEvent('__TTD_TEMPLE_SELECTED__', { detail: { success: false, reason: 'no_options' } }));\n      return false;\n    }\n\n    const target = options.find(el => matchTempleText(el.textContent, targetTemple)) ||\n                   options.find(el => matchOptionText(el.textContent, targetTemple));\n    if (!target) {\n      console.warn('[TTD Bridge] Target temple option not found in list:', targetTemple);\n      window.dispatchEvent(new CustomEvent('__TTD_TEMPLE_SELECTED__', { detail: { success: false, reason: 'target_not_found' } }));\n      return false;\n    }\n\n    console.log('[TTD Bridge] Clicking temple option:', target.textContent.trim());\n    try { target.scrollIntoView({ block: 'nearest', behavior: 'instant' }); } catch (e) {}\n    clickMenuOption(target);\n    let isSuccess = !!(await waitFor(() => matchTempleText(input.value, targetTemple), 600, 20));\n    if (!isSuccess && target.isConnected) {\n      try { target.click(); } catch (e) {}\n      isSuccess = !!(await waitFor(() => matchTempleText(input.value, targetTemple), 600, 20));\n    }\n\n    console.log('[TTD Bridge] Final temple value:', input.value, 'Success:', isSuccess);\n    window.dispatchEvent(new CustomEvent('__TTD_TEMPLE_SELECTED__', { detail: { success: isSuccess, temple: input.value } }));\n    return isSuccess;\n  }\n\n  // Guards against overlapping Continue requests (each one would click again)\n  let continueInFlight = false;\n\n  async function clickContinueInMainWorld() {\n    console.log('[TTD Bridge] clickContinueInMainWorld requested');\n    if (continueInFlight) {\n      console.log('[TTD Bridge] Continue already in flight - ignoring duplicate request');\n      return false;\n    }\n    continueInFlight = true;\n\n    // Calendar Continue only: once the pilgrim form (a \"Name\" field) is up, its Continue matches the\n    // same selectors, and clicking it submits the empty form - lighting up every validation error.\n    // Visible form only: TTD's Arjitha page can keep a hidden pilgrim form in the DOM on the slot step\n    function onPilgrimForm() {\n      return Array.from(document.querySelectorAll('label')).some(l => {\n        if (!/^name\\W*$/i.test(l.textContent.trim())) return false;\n        const r = l.getBoundingClientRect();\n        return r.width > 0 && r.height > 0 && getComputedStyle(l).visibility !== 'hidden';\n      });\n    }\n\n    // <button> elements only, labelled Continue. Arjitha wraps both buttons in\n    // <div class=\"mg5vGq_desktop-continue-btn\"> - matching that div clicked nothing, and the old\n    // child-handler fallback then fired the Back button too (bouncing to the home page).\n    function findContinueBtn() {\n      if (onPilgrimForm()) return null;\n      const isContinue = b => b && /^continue$/i.test(b.textContent.trim());\n      const candidates = [\n        ...document.querySelectorAll('button[class*=\"continue-btn\"], button[class*=\"PilgrimSlotBooking_continue\"], button[class*=\"purpleDesktopButton\"], button[class*=\"SlotBooking_purple\"]'),\n        ...document.querySelectorAll('button'),\n      ];\n      return candidates.find(isContinue) || null;\n    }\n\n    // Wait up to 2500ms for Continue button to be present and enabled\n    let continueBtn = null;\n    const start = Date.now();\n    while (Date.now() - start < 2500) {\n      continueBtn = findContinueBtn();\n      if (continueBtn && !continueBtn.disabled && !continueBtn.getAttribute('disabled') && !continueBtn.classList.contains('disabled')) {\n        break;\n      }\n      await new Promise(r => setTimeout(r, 40));\n    }\n\n    if (!continueBtn) {\n      console.warn('[TTD Bridge] Continue button not found or remained disabled');\n      continueInFlight = false;\n      return false;\n    }\n\n    console.log('[TTD Bridge] Found enabled Continue button. Clicking once...');\n\n    // Exactly ONE click per attempt. Every extra click fires another slot-block request, and TTD\n    // (Arjitha Seva especially) treats the duplicates as a conflicting booking and bounces to home.\n    try { continueBtn.scrollIntoView({ block: 'nearest', behavior: 'instant' }); } catch (e) {}\n    continueBtn.click();\n\n    // Second (and last) attempt only if nothing happened at all: still on the calendar after 2.5s with\n    // Continue still enabled. Uses the React handler directly in case the native click was ignored.\n    setTimeout(() => {\n      const stillThere = findContinueBtn();\n      if (stillThere && stillThere === continueBtn && !stillThere.disabled && document.contains(stillThere)) {\n        console.log('[TTD Bridge] Continue had no effect after 2.5s - trying its React handler once...');\n        const p = getFiberAndProps(stillThere).props;\n        if (p && typeof p.onClick === 'function') {\n          try { p.onClick(makeSyntheticEvent(stillThere, 'click')); } catch (e) {}\n        }\n      }\n      continueInFlight = false;\n    }, 2500);\n\n    return true;\n  }\n\n  window.addEventListener(\n    \"__TTD_REACT_CLICK__\",\n    function(e) {\n      if (e.target) {\n        executeBridgeClick(e.target);\n      }\n    },\n    true\n  );\n\n  window.addEventListener(\n    \"__TTD_SELECT_TICKETS__\",\n    function(e) {\n      if (e.detail && e.detail.count) {\n        selectTicketsInMainWorld(e.detail.count);\n      }\n    },\n    true\n  );\n\n  window.addEventListener(\n    \"__TTD_SELECT_DROPDOWN__\",\n    function(e) {\n      if (e.detail && e.detail.value) {\n        selectDropdownInMainWorld(e.detail.value);\n      }\n    },\n    true\n  );\n\n  window.addEventListener(\n    \"__TTD_SELECT_TEMPLE__\",\n    function(e) {\n      if (e.detail && e.detail.temple) {\n        selectTempleInMainWorld(e.detail.temple);\n      }\n    },\n    true\n  );\n\n  window.addEventListener(\n    \"__TTD_CLICK_CONTINUE__\",\n    function() {\n      clickContinueInMainWorld();\n    },\n    true\n  );\n})();\n";
    (document.head || document.documentElement).appendChild(script);
  } catch (err) {
    console.warn("[TTD Autofill] ensurePageBridge error:", err);
  }
}

ensurePageBridge();
const MAX_PILGRIM_SLOTS = 5;
const FOLLOW_UP_CONTINUE_KEY = "ttdAutofillFollowUpContinue";
const FOLLOW_UP_CONTINUE_POLL_MS = 40;
// Different stages wait for very different things: the review/pay-now page
// just needs to render (seconds), but actual payment (OTP, bank redirect,
// etc.) can take minutes - a stage's watcher needs a timeout matched to what
// it's actually waiting for, not one blanket value.
const STAGE_TIMEOUT_MS = {
  postContinue: 30000, // waiting for the next page (review/pay-now) to render
  card: 30000, // waiting for the card form to render and accept card values
  generate: 10 * 60 * 1000, // waiting through actual payment completion
};
const FLOW_EXIT_GRACE_MS = 12000;
const BOOKING_ERROR_PATTERN = /(?:booking|reservation)\s+(?:is\s+)?(?:already\s+)?in\s+progress/i;
const AUTO_RUN_PREF_KEY = "ttdAutoRunOnLoad";
const GROUPS_STORAGE_KEY = "ttdGroups";
const CLICK_CONTINUE_PREF_KEY = "ttdClickContinuePref";
const PAYMENT_METHOD_PREF_KEY = "ttdPaymentMethodPref";
const CARD_DETAILS_PREF_KEY = "ttdCardDetailsPref";
const AUTO_RUN_DONE_KEY = "ttdAutofillAutoRunDoneFor";
let followUpContinueWatcherActive = false;
let followUpContinueRunId = 0;

const CONTINUE_BUTTON_SELECTOR = [
  'button[class*="pilgrimDetails_continue-btn"]',
  'button[class*="sevaReview_confirmButton"]',
].join(", ");
const CONTINUE_TEXT_PATTERN = /^(continue|confirm|proceed)$/i;
const PAY_NOW_BUTTON_SELECTOR = 'button[class*="ReviewDetails_desktopPaynowButton"]';
const PAY_NOW_TEXT_PATTERN = /^pay\s*now$/i;
const GENERATE_TEXT_PATTERN = /^generate(?:\s+qr)?$/i;

// ---------------------------------------------------------------------------
// On-page toast: the popup UI only shows status when it's open, but a run
// triggered via the keyboard shortcut (background.js) never opens it. This
// gives visible feedback directly on the page either way.
// ---------------------------------------------------------------------------
let toastEl = null;
let toastHideTimer = null;
let lastClickedContinueButton = null;
let lastAutofillStartedAt = 0;
let autofillActive = false;
let retryAutoRun = null;

function ensureToastEl() {
  if (toastEl && document.body.contains(toastEl)) {
    document.querySelectorAll("#ttd-autofill-toast").forEach((node) => {
      if (node !== toastEl) node.remove();
    });
    return toastEl;
  }

  // Reuse and clean up any node left by an older content-script instance so
  // status messages never stack on top of one another.
  const existingToasts = Array.from(document.querySelectorAll("#ttd-autofill-toast"));
  toastEl = existingToasts.shift() || document.createElement("div");
  existingToasts.forEach((node) => node.remove());
  toastEl.setAttribute("id", "ttd-autofill-toast");
  toastEl.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 2147483647;
    width: min(360px, calc(100vw - 40px)); padding: 12px 16px;
    border: 1px solid rgba(255,255,255,0.14); border-left: 3px solid #f59e0b;
    border-radius: 12px; font-family: -apple-system, "Segoe UI", Arial, sans-serif;
    font-size: 13px; font-weight: 600; line-height: 1.45; letter-spacing: 0.01em;
    color: #f8fafc; background: rgba(17, 24, 39, 0.96);
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.2);
    backdrop-filter: blur(12px); transition: opacity 0.22s ease, transform 0.22s ease;
    opacity: 0; transform: translateY(-8px); pointer-events: none;
  `;
  toastEl.setAttribute("role", "status");
  toastEl.setAttribute("aria-live", "polite");
  if (!toastEl.isConnected) document.documentElement.appendChild(toastEl);
  return toastEl;
}

function showToast(message, kind = "info") {
  const el = ensureToastEl();
  const accents = { info: "#f59e0b", success: "#34d399", error: "#fb7185" };
  el.style.borderLeftColor = accents[kind] || accents.info;
  el.textContent = message;
  el.style.opacity = "1";
  el.style.transform = "translateY(0)";
  clearTimeout(toastHideTimer);
  toastHideTimer = setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-8px)";
  }, 4000);
}

// In-page prompt with one button per choice plus Cancel. Resolves with the chosen
// choice's `value`, or null when cancelled. Styled to match the toast.
function showChoiceDialog(title, message, choices, cancelLabel = "Cancel") {
  document.getElementById("ttd-autofill-choice")?.remove();
  return new Promise((resolve) => {
    const box = document.createElement("div");
    box.id = "ttd-autofill-choice";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", title);
    box.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 2147483647;
      width: min(380px, calc(100vw - 40px)); padding: 14px 16px;
      border: 1px solid rgba(255,255,255,0.14); border-left: 3px solid #f59e0b;
      border-radius: 12px; font-family: -apple-system, "Segoe UI", Arial, sans-serif;
      font-size: 13px; line-height: 1.45; color: #f8fafc; background: rgba(17, 24, 39, 0.97);
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.3);
    `;

    const heading = document.createElement("div");
    heading.textContent = title;
    heading.style.cssText = "font-weight: 700; font-size: 14px; margin-bottom: 4px;";
    const text = document.createElement("div");
    text.textContent = message;
    text.style.cssText = "color: #cbd5e1; margin-bottom: 10px;";
    const hint = document.createElement("div");
    hint.textContent = "↑ / ↓ to choose · Enter to select · Esc to cancel";
    hint.style.cssText = "color: #94a3b8; font-size: 11px; margin-top: 8px;";
    box.append(heading, text);

    // TTD's modals (e.g. "Pilgrim's booking already in progress") swallow clicks outside themselves.
    // Window capture runs before any page listener, so handle our buttons there and stop the event.
    const actions = new Map();
    const onWindowEvent = (e) => {
      if (!box.contains(e.target)) return;
      e.stopImmediatePropagation();
      if (e.type !== "click") return;
      e.preventDefault();
      actions.get(e.target.closest("button"))?.();
    };
    const blockedTypes = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
    blockedTypes.forEach((t) => window.addEventListener(t, onWindowEvent, true));

    // Keyboard: ↑/↓ move the highlight, Enter selects, Esc cancels. Handled at window capture while the
    // box is open, since TTD's modal keeps focus inside itself.
    const buttons = [];
    let active = 0;
    const paintActive = () => {
      buttons.forEach((b, i) => {
        b.style.outline = i === active ? "2px solid #fbbf24" : "none";
        b.style.outlineOffset = "1px";
      });
    };
    const onKey = (e) => {
      if (!box.isConnected) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        active = (active + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length;
        paintActive();
      } else if (e.key === "Enter" || e.key === " ") {
        actions.get(buttons[active])?.();
      } else if (e.key === "Escape") {
        close(null);
      } else {
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);

    const removeListeners = () => {
      blockedTypes.forEach((t) => window.removeEventListener(t, onWindowEvent, true));
      window.removeEventListener("keydown", onKey, true);
    };
    const close = (result) => {
      removeListeners();
      box.remove();
      resolve(result);
    };
    const makeButton = (label, primary, onClick) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.style.cssText = `
        display: block; width: 100%; margin-top: 6px; padding: 8px 10px; text-align: left;
        border-radius: 8px; cursor: pointer; font: inherit; font-weight: 600;
        border: 1px solid ${primary ? "#f59e0b" : "rgba(255,255,255,0.2)"};
        background: ${primary ? "rgba(245, 158, 11, 0.15)" : "transparent"}; color: #f8fafc;
      `;
      actions.set(btn, onClick);
      btn.addEventListener("mouseenter", () => {
        active = buttons.indexOf(btn);
        paintActive();
      });
      buttons.push(btn);
      return btn;
    };

    choices.forEach((c) => box.appendChild(makeButton(c.label, true, () => close(c.value))));
    box.appendChild(makeButton(cancelLabel, false, () => close(null)));
    box.appendChild(hint);
    paintActive();

    // Removed from outside (e.g. resumeAutomation) - drop the window listeners too
    new MutationObserver((_, obs) => {
      if (!box.isConnected) {
        removeListeners();
        obs.disconnect();
      }
    }).observe(document.documentElement, { childList: true });

    document.documentElement.appendChild(box);
    box.querySelector("button")?.focus();
  });
}

function setNativeValue(el, value) {
  let proto = Object.getPrototypeOf(el);
  let descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  while (proto && !descriptor) {
    proto = Object.getPrototypeOf(proto);
    if (proto) {
      descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    }
  }
  if (descriptor && descriptor.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }
  
  if (el._valueTracker) {
    el._valueTracker.setValue('');
  }

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Unidentified" }));
  el.dispatchEvent(new KeyboardEvent("keypress", { bubbles: true, key: "Unidentified" }));
  el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Unidentified" }));
}

function normalizedFieldValue(value, label) {
  const text = String(value || "").trim();
  if (/card\s*number|expiry|cvv/i.test(label)) return text.replace(/\D/g, "");
  return text.replace(/\s+/g, " ").toLowerCase();
}

function fieldValuesMatch(actual, expected, label) {
  return normalizedFieldValue(actual, label) === normalizedFieldValue(expected, label);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Resolves once TTD has no requests in flight for `quietMs` (counted by page-bridge.js on
// <html data-ttd-pending>), after first giving a just-triggered request `startMs` to begin.
// Replaces fixed sleeps after actions that load data (temple change, date click, ticket change).
// Falls back to the timeout when the counter isn't available.
async function waitForNetworkIdle({ startMs = 60, quietMs = 60, timeoutMs = 3000 } = {}) {
  const pendingNow = () => document.documentElement.getAttribute("data-ttd-pending");
  if (pendingNow() === null) {
    await sleep(Math.min(timeoutMs, 400));
    return false;
  }
  await sleep(startMs);
  const deadline = Date.now() + timeoutMs;
  let idleSince = null;
  while (Date.now() < deadline) {
    if (pendingNow() === "0") {
      idleSince ??= Date.now();
      if (Date.now() - idleSince >= quietMs) return true;
    } else {
      idleSince = null;
    }
    await sleep(15);
  }
  return false;
}

function waitForCondition(checkFn, timeoutMs = 1500, intervalMs = 100) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const result = checkFn();
      if (result) {
        resolve(result);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

// ---------------------------------------------------------------------------
// Generic, structure-agnostic field detection by label text.
// ---------------------------------------------------------------------------

function normalizeLabelText(text) {
  return (text || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Scans every floating <label> on the page, strips the required-asterisk
// <sup>, normalizes the remaining text, and pairs it with the <input> that
// lives in the same "position: relative" wrapper (the shared markup pattern
// across every TTD form seen so far - input + label overlay + optional
// dropdown list, all direct children of one wrapper div).
function getAllLabeledInputs() {
  const labels = Array.from(document.querySelectorAll("label"));
  const pairs = [];
  for (const labelEl of labels) {
    let wrapper = labelEl.parentElement;
    let input = null;
    while (wrapper && wrapper !== document.body) {
      input = wrapper.querySelector("input");
      if (input) break;
      wrapper = wrapper.parentElement;
    }
    if (!input) continue;
    const clone = labelEl.cloneNode(true);
    clone.querySelectorAll("sup").forEach((s) => s.remove());
    pairs.push({ normalized: normalizeLabelText(clone.textContent), input });
  }
  return pairs;
}

function findInputsByLabel(matchFn) {
  return getAllLabeledInputs()
    .filter((p) => matchFn(p.normalized))
    .map((p) => p.input);
}

// Sets a text field's value and verifies it actually stuck.  TTD's current
// React build only accepts *trusted* browser input events, so the primary
// strategy is `document.execCommand('insertText')` which the browser treats
// as genuine user input.  The old native-setter path and a char-by-char
// execCommand pass are kept as fallbacks for edge cases / older builds.
async function setTextFieldRobust(el, value, label) {
  if (!el || value === undefined || value === null || value === "") return false;

  el.focus();
  el.dispatchEvent(new Event("focus", { bubbles: true }));
  await sleep(10);

  // ---- Primary: bulk execCommand('insertText') ----
  el.select();  // select any existing text so insertText replaces it
  document.execCommand('insertText', false, String(value));
  await sleep(15);

  if (fieldValuesMatch(el.value, value, label)) {
    el.blur();
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    console.log(`[TTD Autofill] ${label}: set OK via execCommand.`);
    return true;
  }

  // ---- Fallback 1: native setter with _valueTracker reset ----
  console.warn(
    `[TTD Autofill] ${label}: execCommand didn't stick (got "${el.value}"), trying native setter.`
  );
  el.focus();
  setNativeValue(el, value);
  await sleep(80);
  if (fieldValuesMatch(el.value, value, label)) {
    el.blur();
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    console.log(`[TTD Autofill] ${label}: set OK via native setter fallback.`);
    return true;
  }

  // ---- Fallback 2: character-by-character execCommand ----
  console.warn(
    `[TTD Autofill] ${label}: native setter didn't stick (got "${el.value}"), trying char-by-char.`
  );
  el.focus();
  el.select();
  document.execCommand('delete', false, null);
  await sleep(30);
  for (const ch of String(value)) {
    document.execCommand('insertText', false, ch);
    await sleep(20);
  }
  el.blur();
  el.dispatchEvent(new Event("blur", { bubbles: true }));
  await sleep(80);

  if (fieldValuesMatch(el.value, value, label)) {
    console.log(`[TTD Autofill] ${label}: set OK via char-by-char fallback.`);
    return true;
  }

  console.warn(`[TTD Autofill] ${label}: still not set after all retries (got "${el.value}").`);
  return false;
}

async function fillGeneralField(matchFn, value, label) {
  if (!value) return false;
  const el = findInputsByLabel(matchFn)[0];
  if (!el) {
    console.warn(`[TTD Autofill] ${label}: no matching labeled field found on page.`);
    return false;
  }
  return setTextFieldRobust(el, value, label);
}

function findCardPaymentOption() {
  const cardTextPattern = /credit\s*\/\s*debit\s*\/\s*atm\s*card/i;
  const preferred = Array.from(document.querySelectorAll(
    'button, [role="button"], [role="option"], label, a, li'
  ));
  const preferredMatch = preferred.find((node) =>
    cardTextPattern.test(getButtonText(node)) && isButtonAvailable(node)
  );
  if (preferredMatch) return preferredMatch;

  const fallback = Array.from(document.querySelectorAll("div"));
  return fallback.find((node) => {
    if (!cardTextPattern.test(getButtonText(node)) || !isButtonAvailable(node)) return false;
    return !Array.from(node.children).some((child) => cardTextPattern.test(getButtonText(child)));
  }) || null;
}

function normalizeFieldName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findCardFieldByText(labelText) {
  const expected = normalizeFieldName(labelText);
  const selectors = [
    `input[name="${labelText}"]`,
    `input[name="${labelText.toLowerCase()}"]`,
    `input[name="${expected}"]`,
    `input[placeholder="${labelText}"]`,
    `input[placeholder="${labelText.toLowerCase()}"]`,
    `input[placeholder="${expected}"]`,
  ];

  for (const selector of selectors) {
    const match = document.querySelector(selector);
    if (match) return match;
  }

  const allInputs = Array.from(document.querySelectorAll("input"));
  return allInputs.find((input) => {
    const haystack = [
      input.name,
      input.id,
      input.getAttribute("label"),
      input.placeholder,
      input.ariaLabel,
      input.title,
      input.closest("label")?.textContent || "",
      input.closest('div[style*="position: relative"]')?.textContent || "",
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const variants = [labelText.toLowerCase(), expected];
    return variants.some((variant) => haystack.includes(variant));
  }) || null;
}

function hasCardPaymentForm() {
  return Boolean(
    findCardFieldByText("Card number") ||
    findCardFieldByText("Expiry (MM/YY)") ||
    findCardFieldByText("CVV") ||
    findCardFieldByText("Name on Card")
  );
}

async function fillCardDetails(cardDetails) {
  const entries = [
    ["Card number", "cardNumber"],
    ["Expiry (MM/YY)", "expiry"],
    ["CVV", "cvv"],
    ["Name on Card", "cardName"],
  ];

  let filledCount = 0;
  for (const [fieldName, key] of entries) {
    const value = cardDetails?.[key];
    if (!value) continue;
    const input = findCardFieldByText(fieldName);
    if (!input) continue;
    if (await setTextFieldRobust(input, String(value), fieldName)) filledCount++;
  }

  return filledCount;
}

// Pilgrim-row fields are repeated once per pilgrim (up to 5). Rather than
// relying on a container element to group "row 3's" fields together (which
// may not even exist as a distinct, class-named element - see Special
// Entry's markup, which has no row class at all), each field TYPE is
// collected as its own array in DOM order, and pilgrim i's fields are simply
// the i-th element of each array. This works as long as each field type
// repeats the same number of times in the same order, which holds for every
// TTD seva form seen so far.
function getPilgrimFieldArrays() {
  const allInputs = Array.from(document.querySelectorAll("input.floating-input, input"));

  // Exclude general details fields (email, city, state, country, pincode, etc.)
  const pilgrimInputs = allInputs.filter((input) => {
    const n = (input.name || "").toLowerCase();
    const l = (input.getAttribute("label") || "").toLowerCase();
    const ph = (input.placeholder || "").toLowerCase();
    const isGeneral =
      n.includes("email") || l.includes("email") || ph.includes("email") ||
      n === "city" || l === "city" || ph === "city" ||
      n === "state" || l === "state" || ph === "state" ||
      n === "country" || l === "country" || ph === "country" ||
      n === "pincode" || l === "pincode" || ph === "pincode" ||
      n === "mobile" || l === "mobile" || ph === "mobile" ||
      n === "phone" || l === "phone" || ph === "phone";
    return !isGeneral;
  });

  const names = [];
  const ages = [];
  const genders = [];
  const idTypes = [];
  const idNumbers = [];

  for (const input of pilgrimInputs) {
    const nameAttr = (input.name || "").toLowerCase();
    const labelAttr = (input.getAttribute("label") || "").toLowerCase();

    let parentLabelText = "";
    const wrapper = input.closest('div[style*="position: relative"]') || input.parentElement;
    if (wrapper) {
      const lbl = wrapper.querySelector("label");
      if (lbl) {
        parentLabelText = lbl.textContent.toLowerCase().replace(/[^a-z0-9]/g, "");
      }
    }

    // 1. Gender (MUST be distinct from ID Type)
    if (nameAttr === "gender" || labelAttr === "gender" || parentLabelText === "gender") {
      genders.push(input);
      continue;
    }

    // 2. Photo ID Type (MUST be distinct from Gender)
    if (
      nameAttr === "photoidtype" ||
      nameAttr === "idtype" ||
      labelAttr.includes("photo id proof") ||
      labelAttr.includes("id proof") ||
      labelAttr === "photoidproof" ||
      parentLabelText.includes("photoidproof") ||
      parentLabelText === "idproof"
    ) {
      idTypes.push(input);
      continue;
    }

    // 3. Photo ID Number
    if (
      nameAttr === "idproofnumber" ||
      nameAttr === "idnumber" ||
      labelAttr.includes("photo id number") ||
      labelAttr.includes("id number") ||
      labelAttr === "photoidnumber" ||
      parentLabelText.includes("photoidnumber")
    ) {
      idNumbers.push(input);
      continue;
    }

    // 4. Age
    if (nameAttr === "age" || labelAttr === "age" || parentLabelText === "age") {
      ages.push(input);
      continue;
    }

    // 5. Name
    if (nameAttr === "fname" || nameAttr === "name" || labelAttr === "name" || parentLabelText === "name") {
      names.push(input);
      continue;
    }
  }

  const sortByIndex = (arr) => {
    return arr.sort((a, b) => {
      const idA = parseInt(a.id, 10);
      const idB = parseInt(b.id, 10);
      if (!isNaN(idA) && !isNaN(idB)) return idA - idB;
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
  };

  return {
    name: sortByIndex(names),
    age: sortByIndex(ages),
    gender: sortByIndex(genders),
    idType: sortByIndex(idTypes),
    idNumber: sortByIndex(idNumbers),
  };
}


// The pilgrim form is actually shown. TTD's Arjitha page can keep the (hidden) form in the DOM after
// going back to slot selection, so mere presence must not stop the calendar picker or its Continue.
function pilgrimFormOnScreen() {
  return getPilgrimFieldArrays().name.some(isOnScreen);
}

function clickElementFull(el) {
  if (!el) return;
  try { el.scrollIntoView({ block: "nearest", behavior: "instant" }); } catch (e) {}
  try { el.focus?.(); } catch (e) {}

  const rect = el.getBoundingClientRect();
  const clientX = Math.round(rect.left + (rect.width ? rect.width / 2 : 0));
  const clientY = Math.round(rect.top + (rect.height ? rect.height / 2 : 0));
  const downInit = { bubbles: true, cancelable: true, composed: true, view: window, clientX, clientY, button: 0, buttons: 1 };
  const upInit = { bubbles: true, cancelable: true, composed: true, view: window, clientX, clientY, button: 0, buttons: 0 };

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
    if (typeof el.click === "function") el.click();
  } catch (e) {}

  try {
    el.dispatchEvent(new CustomEvent("__TTD_REACT_CLICK__", { bubbles: true, cancelable: true }));
  } catch (e) {}
}

function simulateUserClick(el) {
  if (!el) return false;
  try {
    el.scrollIntoView?.({ block: "nearest", behavior: "instant" });
  } catch (e) {}

  el.focus?.();
  const rect = el.getBoundingClientRect();
  const clientX = Math.round(rect.left + rect.width / 2);
  const clientY = Math.round(rect.top + rect.height / 2);
  const eventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX,
    clientY,
    button: 0,
    buttons: 1,
  };

  try {
    el.dispatchEvent(new PointerEvent("pointerdown", eventInit));
    el.dispatchEvent(new MouseEvent("mousedown", eventInit));
    el.dispatchEvent(new PointerEvent("pointerup", { ...eventInit, buttons: 0 }));
    el.dispatchEvent(new MouseEvent("mouseup", { ...eventInit, buttons: 0 }));
    el.dispatchEvent(new MouseEvent("click", { ...eventInit, buttons: 0 }));
    if (typeof el.click === "function") {
      el.click();
    }
  } catch (e) {}
  return true;
}

// Exactly ONE click. For buttons that send a request to TTD (pilgrim/review Continue, Pay Now, payment
// option, UPI Generate): every extra click is another request, and duplicates made TTD answer
// "Something went wrong" even though the first request worked (the QR still appeared moments later).
function clickOnce(el) {
  if (!el) return false;
  try { el.scrollIntoView?.({ block: "nearest", behavior: "instant" }); } catch (e) {}
  el.click();
  return true;
}

// Bridges React synthetic events in the page context.
function fireReactClick(el) {
  if (!el) return;
  ensurePageBridge();
  try {
    el.focus?.();
  } catch (e) {}
  const evt = new CustomEvent("__TTD_REACT_CLICK__", { bubbles: true, cancelable: true });
  el.dispatchEvent(evt);
  simulateUserClick(el);
}

function normalizeOptionText(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchOptionText(actual, expected) {
  const a = normalizeOptionText(actual);
  const b = normalizeOptionText(expected);
  if (!a || !b) return false;

  // Exact match (e.g. "male" === "male", "female" === "female")
  if (a === b) return true;

  // CRITICAL: Gender values MUST be exact matches because "male" is a substring of "female"!
  const genders = ["male", "female", "transgender"];
  if (genders.includes(a) || genders.includes(b)) {
    return a === b;
  }

  // ID Proof variations (e.g. Aadhaar Card vs Aadhar Card)
  const isAadhaarA = a.includes("aadhar") || a.includes("aadhaar");
  const isAadhaarB = b.includes("aadhar") || b.includes("aadhaar");
  if (isAadhaarA && isAadhaarB) return true;

  if (a.includes("passport") && b.includes("passport")) return true;
  if (a.includes("voter") && b.includes("voter")) return true;

  // Key place / deity distinct tokens for temples
  const keyTokens = [
    "srivari", "tirumala", "pradakshina", "govindaraja", "padmavathi",
    "srinivasamangapuram", "appalayagunta", "surya", "narayanavanam",
    "vontimitta", "thallapaka", "karvetinagaram"
  ];
  for (const token of keyTokens) {
    if (b.includes(token) && a.includes(token)) return true;
  }

  // Multi-word fallback for other non-gender fields
  if (b.length >= 4 && (a.includes(b) || b.includes(a))) return true;

  return false;
}

// Finds the dropdown list that appears after clicking a custom-dropdown input,
// and clicks the option whose text matches `value`.
async function selectDropdownOption(inputEl, value, label) {
  if (!value || !inputEl) return false;

  // 1. If input already matches, return true immediately
  if (matchOptionText(inputEl.value, value)) {
    console.log(`[TTD Autofill] "${label}" already matches "${inputEl.value}".`);
    return true;
  }

  // 2. Delegate directly to MAIN-world bridge
  ensurePageBridge();
  inputEl.setAttribute('data-ttd-target', 'active');

  // The bridge opens the menu one toggle at a time (up to ~2.5s worst case), so give it room to finish
  const bridgeResult = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener('__TTD_DROPDOWN_SELECTED__', onDone);
      inputEl.removeAttribute('data-ttd-target');
      resolve(matchOptionText(inputEl.value, value));
    }, 4000);

    function onDone(e) {
      clearTimeout(timer);
      window.removeEventListener('__TTD_DROPDOWN_SELECTED__', onDone);
      resolve(e.detail?.success || matchOptionText(inputEl.value, value));
    }

    window.addEventListener('__TTD_DROPDOWN_SELECTED__', onDone);
    window.dispatchEvent(new CustomEvent('__TTD_SELECT_DROPDOWN__', { detail: { value: value } }));
  });

  if (bridgeResult || matchOptionText(inputEl.value, value)) {
    console.log(`[TTD Autofill] "${label}" successfully selected via bridge as "${inputEl.value}".`);
    return true;
  }

  console.warn(`[TTD Autofill] Bridge attempt did not confirm "${label}". Falling back to DOM query...`);

  const wrapper = inputEl.parentElement;

  const findOptions = () => {
    // 1. Direct CSS-modules class match (prefix changes per build: floatingDropdown_listItem, _36WbrG_listItem)
    let direct = Array.from(wrapper?.querySelectorAll('[class*="listItem"]') || []);
    if (direct.length === 0) {
      direct = Array.from(document.querySelectorAll('[class*="listItem"]'));
    }
    if (direct.length > 0) return direct;

    // 2. Fallback containers
    const menuContainers = [
      wrapper?.querySelector('[style*="z-index: 999"], [style*="z-index:999"], [style*="z-index"], [class*="floatingDropdown"], ul'),
      wrapper?.parentElement?.querySelector('[style*="z-index: 999"], [style*="z-index:999"], [style*="z-index"], [class*="floatingDropdown"], ul'),
      ...Array.from(
        document.querySelectorAll(
          'div[style*="z-index: 999"], div[style*="z-index:999"], [class*="floatingDropdown_listContainer"], ul[class*="dropdown"], [class*="dropdown_scroll"]'
        )
      ),
    ].filter(Boolean);

    for (const container of menuContainers) {
      const items = Array.from(
        container.querySelectorAll('[class*="listItem"], [role="option"], li, div, span')
      ).filter((el) => {
        const text = el.textContent?.trim();
        if (!text) return false;
        return el.children.length === 0 || (el.children.length === 1 && el.firstElementChild.children.length === 0);
      });
      if (items.length > 0) return items;
    }

    return null;
  };

  // Check if options are already open
  let options = findOptions();

  // One plain click per target - the dropdown toggles, so fireReactClick's burst would close it again
  const icon = wrapper?.querySelector('img[src*="dropdown"], img[alt*="dropdown"], svg');
  for (const opener of [inputEl, icon, wrapper]) {
    if (options || !opener) continue;
    try { opener.click(); } catch (e) {}
    options = await waitForCondition(findOptions, 250, 20);
  }

  if (!options) {
    console.warn(`[TTD Autofill] "${label}" dropdown did not open for value "${value}".`);
    return false;
  }

  // Matching option only - never options[0], which could silently pick the wrong gender / ID type
  const target = options.find((opt) => matchOptionText(opt.textContent, value));
  if (!target) {
    console.warn(`[TTD Autofill] "${label}": no option matches "${value}".`);
    return false;
  }

  target.click();
  await sleep(60);

  if (matchOptionText(inputEl.value, value)) {
    console.log(`[TTD Autofill] "${label}" set to "${value}".`);
    return true;
  }

  // Fallback: direct prototype value setter
  if (!matchOptionText(inputEl.value, value)) {
    try {
      const protoSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      if (protoSetter) {
        protoSetter.call(inputEl, value);
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } catch (e) {}
  }

  const finalOk = matchOptionText(inputEl.value, value);
  if (finalOk) {
    console.log(`[TTD Autofill] "${label}" set to "${value}".`);
    return true;
  }

  console.warn(`[TTD Autofill] "${label}" failed to select "${value}". Current value: "${inputEl.value}".`);
  try {
    document.body.click();
  } catch (e) {}
  return false;
}

function getButtonText(button) {
  return (button?.textContent || "").replace(/\s+/g, " ").trim();
}

function isButtonAvailable(button) {
  return Boolean(
    button &&
    !button.disabled &&
    button.getAttribute("aria-disabled") !== "true"
  );
}

function clickButtonIfEnabled(btn) {
  if (!btn || btn.disabled || btn.getAttribute("aria-disabled") === "true") return false;
  return clickOnce(btn);
}

async function clickContinueIfEnabled(timeoutMs = 4000) {
  const clicked = await waitForCondition(() => {
    const btn = Array.from(document.querySelectorAll(`${CONTINUE_BUTTON_SELECTOR}, button, [role="button"]`))
      .find((candidate) => CONTINUE_TEXT_PATTERN.test(getButtonText(candidate)) && isButtonAvailable(candidate));
    if (!btn || !clickButtonIfEnabled(btn)) return null;
    lastClickedContinueButton = btn;
    return true;
  }, timeoutMs, 25);
  return !!clicked;
}

function findPayNowButton() {
  const candidates = Array.from(document.querySelectorAll(
    `${PAY_NOW_BUTTON_SELECTOR}, button, [role="button"]`
  ));
  return candidates.find((candidate) =>
    PAY_NOW_TEXT_PATTERN.test(getButtonText(candidate)) && isButtonAvailable(candidate)
  ) || null;
}

function findGenerateButton() {
  const candidates = Array.from(document.querySelectorAll(
    'button.j-button.j-button-size__medium.secondary, button, [role="button"]'
  ));
  return candidates.find((candidate) =>
    GENERATE_TEXT_PATTERN.test(getButtonText(candidate)) && isButtonAvailable(candidate)
  ) || null;
}

let generateButtonClicked = false;
function clickGenerateIfEnabled() {
  if (generateButtonClicked) return false;
  const btn = findGenerateButton();
  if (btn) {
    generateButtonClicked = true;
    clickOnce(btn); // was fireReactClick: ~5 clicks -> 5 QR requests -> "Something went wrong"
    return true;
  }
  return false;
}

function findNextContinueButton(allowLastClicked = false) {
  const buttons = Array.from(document.querySelectorAll(`${CONTINUE_BUTTON_SELECTOR}, button, [role="button"]`));
  return buttons.find((button) => {
    if (!allowLastClicked && button === lastClickedContinueButton) return false;
    return CONTINUE_TEXT_PATTERN.test(getButtonText(button)) && isButtonAvailable(button);
  }) || null;
}

function hasBookingFlowControls() {
  return Boolean(
    getPilgrimFieldArrays().name.length ||
    findNextContinueButton() ||
    findPayNowButton() ||
    Array.from(document.querySelectorAll("button, [role=\"button\"]")).some(
      (button) => GENERATE_TEXT_PATTERN.test(getButtonText(button))
    )
  );
}

function isEmptyPilgrimForm() {
  const fields = getPilgrimFieldArrays();
  const allFields = Object.values(fields).flat();
  return fields.name.length > 0 && allFields.every((input) => !String(input.value || "").trim());
}

function hasBookingErrorMessage() {
  if (!BOOKING_ERROR_PATTERN.test(document.body?.innerText || "")) return false;
  // Only count TTD's error once it's actually on screen (not hidden/zero-size markup)
  return Array.from(document.body.querySelectorAll("div, p, span, h1, h2, h3, h4, h5, h6")).some((el) => {
    if (!BOOKING_ERROR_PATTERN.test(el.textContent || "")) return false;
    if (Array.from(el.children).some((c) => BOOKING_ERROR_PATTERN.test(c.textContent || ""))) return false; // innermost only
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.opacity !== "0";
  });
}

// Set when TTD reports "booking already in progress" (e.g. the same pilgrims are still held by an
// earlier attempt left at the payment page). Every automatic step checks it, so the extension stops
// instead of looping slot page -> pilgrim page -> error -> retry. Kept in sessionStorage so it
// survives TTD's navigations; cleared only by the user (Resume button, or a manual popup action).
const AUTOMATION_HALT_KEY = "ttdAutomationHalted";

function isAutomationHalted() {
  return !!sessionStorage.getItem(AUTOMATION_HALT_KEY);
}

function resumeAutomation(reason) {
  if (!isAutomationHalted()) return;
  sessionStorage.removeItem(AUTOMATION_HALT_KEY);
  bookingErrorDialogHandled = false;
  document.getElementById("ttd-autofill-choice")?.remove();
  console.log(`[TTD Autofill] Automation resumed: ${reason}`);
  // The pause kept the "auto-run done for this page" marker so the loop couldn't restart. Resuming
  // means go again: drop it so an already-filled pilgrim form gets re-checked and Continue clicked.
  // If TTD still reports the booking in progress, the next run simply pauses again.
  sessionStorage.removeItem(AUTO_RUN_DONE_KEY);
  setTimeout(() => retryAutoRun?.(), 0);
}

let bookingErrorDialogHandled = false;

// TTD's booking-in-progress error means retrying immediately can't succeed. Clicking TTD's Retry and
// re-arming auto-run used to cause a rapid loop (slot page -> pilgrim page -> error -> Retry -> ...).
// Now: pause ALL automation for this tab, leave TTD's dialog for the user, and offer a Resume button.
function handleBookingErrorIfPresent(reason) {
  if (!hasBookingErrorMessage()) {
    bookingErrorDialogHandled = false;
    return isAutomationHalted();
  }
  if (!isAutomationHalted()) {
    sessionStorage.setItem(AUTOMATION_HALT_KEY, String(Date.now()));
    // Stop the payment-step watcher; keep AUTO_RUN_DONE_KEY so auto-run doesn't re-fire
    sessionStorage.removeItem(FOLLOW_UP_CONTINUE_KEY);
    followUpContinueWatcherActive = false;
    followUpContinueRunId += 1;
    console.log(`[TTD Autofill] Automation paused - ${reason}`);
  }
  if (!bookingErrorDialogHandled) {
    bookingErrorDialogHandled = true;
    showChoiceDialog(
      "TTD: booking already in progress",
      "TTD is still holding an earlier booking for these pilgrims (e.g. one left at the payment page). " +
        "Automation is paused so the extension doesn't keep retrying. Finish or cancel that booking, " +
        "or wait for TTD to release it, then resume. Going back to the home page also restarts automation.",
      [{ label: "Resume automation (closes TTD's alert)", value: "resume" }],
      "Stay paused for now"
    ).then(async (choice) => {
      if (choice !== "resume") return;
      // One click on TTD's own Retry closes its alert - the user asked to go again. Resume only once
      // the alert is gone, or the watcher would see it and pause again straight away.
      const retryBtn = Array.from(document.querySelectorAll("button")).find((b) => /^retry$/i.test(b.textContent.trim()));
      retryBtn?.click();
      await waitForCondition(() => !hasBookingErrorMessage(), 3000, 100);
      resumeAutomation("user clicked Resume");
      showToast("Automation resumed.", "success");
    });
  }
  return true;
}

function clearBookingSessionState(reason) {
  sessionStorage.removeItem(AUTO_RUN_DONE_KEY);
  sessionStorage.removeItem(FOLLOW_UP_CONTINUE_KEY);
  lastClickedContinueButton = null;
  followUpContinueWatcherActive = false;
  followUpContinueRunId += 1;
  console.log(`[TTD Autofill] Cleared booking session state: ${reason}`);
}

function clearStaleRunStateForEmptyForm() {
  if (autofillActive || !isEmptyPilgrimForm()) return false;

  const hadRunState =
    sessionStorage.getItem(AUTO_RUN_DONE_KEY) || sessionStorage.getItem(FOLLOW_UP_CONTINUE_KEY);
  if (!hadRunState) return false;

  clearBookingSessionState("empty pilgrim form");
  console.log("[TTD Autofill] Empty pilgrim form detected; cleared stale run state.");
  return true;
}

function scheduleFollowUpContinue(clickPayNow, paymentMethod = "upi", cardDetails = {}) {
  try {
    generateButtonClicked = false; // new booking run: Generate may be clicked once again
    followUpContinueRunId += 1;
    followUpContinueWatcherActive = false;
    sessionStorage.setItem(FOLLOW_UP_CONTINUE_KEY, JSON.stringify({
      sourceUrl: location.href,
      stage: "postContinue",
      stageDeadline: Date.now() + STAGE_TIMEOUT_MS.postContinue,
      createdAt: Date.now(),
      clickPayNow: !!clickPayNow,
      paymentMethod: paymentMethod || "upi",
      cardDetails: cardDetails || {},
    }));
    resumeFollowUpContinue();
  } catch (err) {
    console.warn("[TTD Autofill] Could not save follow-up state.", err);
  }
}

function resumeFollowUpContinue() {
  if (followUpContinueWatcherActive || isAutomationHalted()) return;

  const watcherRunId = followUpContinueRunId;

  let pending;
  try {
    pending = JSON.parse(sessionStorage.getItem(FOLLOW_UP_CONTINUE_KEY) || "null");
  } catch (err) {
    return;
  }
  if (!pending?.stage) return;
  if (Date.now() > pending.stageDeadline) {
    sessionStorage.removeItem(FOLLOW_UP_CONTINUE_KEY);
    return;
  }

  followUpContinueWatcherActive = true;

  const stop = () => {
    sessionStorage.removeItem(FOLLOW_UP_CONTINUE_KEY);
    if (watcherRunId === followUpContinueRunId) followUpContinueWatcherActive = false;
  };

  const advanceTo = (nextStage) => {
    pending.stage = nextStage;
    pending.sourceUrl = location.href;
    pending.stageDeadline = Date.now() + STAGE_TIMEOUT_MS[nextStage];
    sessionStorage.setItem(FOLLOW_UP_CONTINUE_KEY, JSON.stringify(pending));
  };

  const tryClick = async () => {
    if (watcherRunId !== followUpContinueRunId) return;
    if (!sessionStorage.getItem(FOLLOW_UP_CONTINUE_KEY)) {
      followUpContinueWatcherActive = false;
      return;
    }

    if (pending.stage === "postContinue") {
      const allowReusedContinue = Date.now() - (pending.createdAt || Date.now()) > 800;
      const nextContinue = findNextContinueButton(allowReusedContinue);
      const nextPayNow = findPayNowButton();
      const nextGenerate = pending.paymentMethod !== "card" ? findGenerateButton() : null;
      const cardMethodOption = pending.paymentMethod === "card" ? findCardPaymentOption() : null;
      const navigated =
        location.href !== pending.sourceUrl ||
        nextContinue ||
        nextPayNow ||
        nextGenerate ||
        cardMethodOption ||
        hasCardPaymentForm();

      if (navigated) {
        // A plain Continue/Confirm button is checked FIRST, regardless of
        // the configured payment method - some seva types (e.g. Arjitha
        // Seva) never show a payment-method step at all, so branching on
        // paymentMethod before checking for Continue would get stuck
        // waiting for UI that will never appear on that page.
        if (nextContinue && clickButtonIfEnabled(nextContinue)) {
          showToast("Review page Continue clicked. Watching for the next step...", "success");
          console.log("[TTD Autofill] Review Continue clicked after navigation.");
          advanceTo(pending.paymentMethod === "card" ? "card" : "generate");
        } else if (pending.paymentMethod === "card" && cardMethodOption && clickButtonIfEnabled(cardMethodOption)) {
          showToast("Card payment option selected. Filling card details...", "success");
          console.log("[TTD Autofill] Credit/Debit/ATM Card selected after navigation.");
          advanceTo("card");
        } else if (pending.paymentMethod === "card" && hasCardPaymentForm()) {
          const filled = await fillCardDetails(pending.cardDetails || {});
          if (filled) {
            showToast("Card details filled. Clicking Pay Now...", "success");
            console.log("[TTD Autofill] Card details filled in payment form.");
          }
          await sleep(150); // let the gateway's own validation enable Pay Now
          const payBtn = findPayNowButton();
          if (payBtn && clickButtonIfEnabled(payBtn)) {
            showToast("Pay Now clicked for card payment.", "success");
            console.log("[TTD Autofill] Card payment Pay Now clicked.");
            stop();
            return;
          }
        } else if (pending.paymentMethod !== "card" && nextGenerate && clickGenerateIfEnabled()) {
          showToast("Generate clicked for UPI payment.", "success");
          console.log("[TTD Autofill] Generate clicked directly after navigation.");
          stop();
          return;
        } else if (nextPayNow) {
          if (pending.clickPayNow && clickButtonIfEnabled(nextPayNow)) {
            showToast("Pay Now clicked. Watching for the ticket-generation page...", "success");
            console.log("[TTD Autofill] Pay Now clicked after navigation.");
            advanceTo("generate");
          } else if (!pending.clickPayNow) {
            showToast("Ready to pay - click Pay Now yourself to finish the booking.", "info");
            console.log("[TTD Autofill] Pay Now button found but auto-click is off - stopping here.");
            stop();
            return;
          }
        }
        // If nothing matched yet (e.g. the page is still transitioning),
        // fall through to keep polling rather than giving up.
      }
    } else if (pending.stage === "card") {
      const cardFormReady = hasCardPaymentForm();
      const cardMethodOption = findCardPaymentOption();
      if (!cardFormReady && cardMethodOption && clickButtonIfEnabled(cardMethodOption)) {
        showToast("Card payment option selected. Waiting for card details...", "success");
        console.log("[TTD Autofill] Credit/Debit/ATM Card selected in card stage.");
      }
      if (cardFormReady) {
        const filled = await fillCardDetails(pending.cardDetails || {});
        if (filled) {
          showToast("Card details filled. Clicking Pay Now...", "success");
        }
        await sleep(150);
        const payBtn = findPayNowButton();
        if (payBtn && clickButtonIfEnabled(payBtn)) {
          showToast("Pay Now clicked after card details were filled.", "success");
          console.log("[TTD Autofill] Pay Now clicked after card form completion.");
          stop();
          return;
        }
      }
    } else if (pending.stage === "generate") {
      if (pending.paymentMethod === "card") {
        console.warn("[TTD Autofill] Prevented Generate click because Card payment is selected.");
        advanceTo("card");
        return;
      }
      // Real UPI/QR payment can take minutes to complete externally, so a
      // Generate button not being clickable YET is normal, not a reason to
      // give up - just keep polling until it works or stageDeadline (10
      // minutes) passes, same as any other stage.
      if (clickGenerateIfEnabled()) {
        showToast("Generate clicked. Almost done!", "success");
        console.log("[TTD Autofill] Generate clicked after payment.");
        stop();
        return;
      }
    }

    if (
      Date.now() - (pending.createdAt || Date.now()) > FLOW_EXIT_GRACE_MS &&
      !hasBookingFlowControls() &&
      (pending.stage === "postContinue" || location.href !== pending.sourceUrl)
    ) {
      console.log("[TTD Autofill] Booking flow ended before the next CTA appeared; clearing follow-up state.");
      stop();
      return;
    }

    if (Date.now() < pending.stageDeadline) {
      setTimeout(tryClick, FOLLOW_UP_CONTINUE_POLL_MS);
    } else {
      showToast(`Stopped watching for "${pending.stage}" - check the page manually.`, "error");
      stop();
    }
  };
  tryClick();
}

async function tryAddPilgrimSlot() {
  const buttons = Array.from(document.querySelectorAll("button, a, div[role='button']"));
  const addBtn = buttons.find((b) => ADD_PILGRIM_TEXT_PATTERN.test(b.textContent || ""));
  if (!addBtn) return false;
  const oldCount = getPilgrimFieldArrays().name.length;
  addBtn.click();
  await waitForCondition(() => (getPilgrimFieldArrays().name.length > oldCount ? true : null), 400, 25);
  return true;
}

// Some seva forms (Special Entry) pre-render one row per ticket already
// purchased, so there's nothing to "add". Others (Arjitha Seva) start with
// one row and need an explicit "Add Pilgrim" click per extra row. Either
// way, this just checks how many Name fields currently exist and tries to
// grow that count if it's short.
async function ensureEnoughPilgrimRows(neededCount) {
  let count = getPilgrimFieldArrays().name.length;
  let attempts = 0;
  while (count < neededCount && count < MAX_PILGRIM_SLOTS && attempts < MAX_PILGRIM_SLOTS) {
    const added = await tryAddPilgrimSlot();
    attempts++;
    if (!added) break;
    count = getPilgrimFieldArrays().name.length;
  }
  return count;
}

async function fillPilgrimAtIndex(fields, index, pilgrim) {
  const safe = async (fn, label) => {
    try {
      await fn();
    } catch (err) {
      console.warn(`[TTD Autofill] ${label} threw an error, continuing with the rest:`, err);
    }
  };

  // --- Text fields first ---
  await safe(async () => {
    const el = fields.name[index];
    if (el) await setTextFieldRobust(el, pilgrim.name, `Name (${pilgrim.name})`);
  }, "Name");

  await safe(async () => {
    const el = fields.age[index];
    if (el) await setTextFieldRobust(el, pilgrim.age, `Age (${pilgrim.name})`);
  }, "Age");

  // --- Dropdowns with safe unmounting gaps ---
  await sleep(30);

  await safe(async () => {
    const fieldsNow = getPilgrimFieldArrays();
    const el = fieldsNow.gender[index];
    if (el && pilgrim.gender) await selectDropdownOption(el, pilgrim.gender, `Gender (${pilgrim.name})`);
  }, "Gender");

  await sleep(40);

  await safe(async () => {
    const fieldsNow = getPilgrimFieldArrays();
    const el = fieldsNow.idType[index];
    if (el && pilgrim.idType) await selectDropdownOption(el, pilgrim.idType, `Photo ID Proof (${pilgrim.name})`);
  }, "Photo ID Proof");

  await safe(async () => {
    if (pilgrim.idNumber) {
      let enabled = await waitForCondition(() => {
        const current = getPilgrimFieldArrays().idNumber[index];
        return current && !current.disabled ? current : null;
      }, 1500, 20);

      // If idNumber stayed disabled, retry Photo ID Proof once
      if (!enabled && pilgrim.idType) {
        console.log(`[TTD Autofill] Retrying Photo ID Proof selection for "${pilgrim.name}"...`);
        const el = getPilgrimFieldArrays().idType[index];
        if (el) await selectDropdownOption(el, pilgrim.idType, `Photo ID Proof Retry (${pilgrim.name})`);
        enabled = await waitForCondition(() => {
          const current = getPilgrimFieldArrays().idNumber[index];
          return current && !current.disabled ? current : null;
        }, 1000, 20);
      }

      if (enabled) {
        await setTextFieldRobust(enabled, pilgrim.idNumber, `Photo ID Number (${pilgrim.name})`);
      } else {
        console.warn(
          `[TTD Autofill] Photo ID Number field for "${pilgrim.name}" stayed disabled - idType selection may not have registered.`
        );
      }
    }
  }, "Photo ID Number");
}

async function revisitErroredFields() {
  const errorIcons = Array.from(document.querySelectorAll('img[src="/erroricon.svg"]'));
  if (errorIcons.length === 0) return 0;

  let revisitedCount = 0;
  for (const errorIcon of errorIcons) {
    let fieldWrapper = errorIcon.parentElement;
    let input = null;
    while (fieldWrapper && fieldWrapper !== document.body) {
      input = fieldWrapper.querySelector("input");
      if (input) break;
      fieldWrapper = fieldWrapper.parentElement;
    }
    if (!input || input.disabled || input.readOnly) continue;

    // Re-send the existing value using execCommand so React's controlled
    // state catches up (the native setter no longer triggers React's change
    // detection on TTD's current build).
    const currentValue = input.value;
    input.focus();
    input.select();
    document.execCommand('insertText', false, currentValue);
    await sleep(50);
    input.blur();
    input.dispatchEvent(new Event("blur", { bubbles: true }));
    revisitedCount++;
  }

  if (revisitedCount > 0) {
    await sleep(150);
    console.log(`[TTD Autofill] Revisited ${revisitedCount} errored field(s) without changing values.`);
  }
  return revisitedCount;
}

async function autofill(general, pilgrims, clickContinue, clickPayNow, paymentMethod = "upi", cardDetails = {}) {
  autofillActive = true;
  lastAutofillStartedAt = Date.now();
  try {
    // With Seva & Sniper on, the ticket count chosen there decides how many pilgrims get filled
    // (first N of the ones selected), not the number of pilgrims selected on the Pilgrim tab.
    const sniperCfg = (await chrome.storage.local.get([SNIPER_CONFIG_KEY]))[SNIPER_CONFIG_KEY] || {};
    let ticketCount = parseInt(sniperCfg.ticketCount, 10);
    // Arjitha Seva bookings take at most 2 pilgrims (also covers "Auto (from Pilgrims)")
    if (sniperCfg.sevaSniperEnabled && sniperCfg.targetSeva === "Arjitha Sevas") {
      ticketCount = Math.min(ticketCount > 0 ? ticketCount : Infinity, ARJITHA_MAX_PILGRIMS);
    }
    if (sniperCfg.sevaSniperEnabled && ticketCount > 0 && pilgrims.length > ticketCount) {
      console.log(`[TTD Autofill] Seva & Sniper ticket count is ${ticketCount} - filling first ${ticketCount} of ${pilgrims.length} selected pilgrims.`);
      pilgrims = pilgrims.slice(0, ticketCount);
    }

    showToast(`Filling ${pilgrims.length} pilgrim(s)...`, "info");

    const safeGeneral = async (matchFn, value, label) => {
      try {
        await fillGeneralField(matchFn, value, label);
      } catch (err) {
        console.warn(`[TTD Autofill] ${label} (general) threw an error, continuing with the rest:`, err);
      }
    };

    // 1. General details (once, if this seva's page even has that section -
    // some, like the Ammavari/PAT Special Entry form, don't), matched by
    // label text regardless of which `name` attribute or section position
    // this particular seva form uses.
    await safeGeneral((n) => n.includes("email"), general.email, "Email");
    await safeGeneral((n) => n === "city", general.city, "City");
    await safeGeneral((n) => n === "state", general.state, "State");
    await safeGeneral((n) => n === "country", general.country, "Country");
    await safeGeneral((n) => n === "pincode", general.pincode, "Pincode");

    // 2. Make sure there are enough pilgrim rows, then fill by index.
    const rowCount = await ensureEnoughPilgrimRows(pilgrims.length);
    const fields = getPilgrimFieldArrays(); // re-read in case rows were just added

    let filledCount = 0;
    for (let i = 0; i < rowCount && i < pilgrims.length; i++) {
      await fillPilgrimAtIndex(fields, i, pilgrims[i]);
      filledCount++;
    }

    // Dropdowns can miss on the first pass (e.g. row 1 while the page is still settling) - verify each row, retry once
    for (let i = 0; i < rowCount && i < pilgrims.length; i++) {
      const p = pilgrims[i];
      for (const [key, label] of [["gender", "Gender"], ["idType", "Photo ID Proof"]]) {
        const el = getPilgrimFieldArrays()[key][i];
        if (el && p[key] && !matchOptionText(el.value, p[key])) {
          console.log(`[TTD Autofill] ${label} for "${p.name}" didn't stick (got "${el.value}") - retrying.`);
          await selectDropdownOption(el, p[key], `${label} retry (${p.name})`);
        }
      }
      const idNumEl = getPilgrimFieldArrays().idNumber[i];
      if (idNumEl && p.idNumber && !idNumEl.disabled && !fieldValuesMatch(idNumEl.value, p.idNumber, "Photo ID Number")) {
        await setTextFieldRobust(idNumEl, p.idNumber, `Photo ID Number retry (${p.name})`);
      }
    }

    const unfilledCount = Math.max(0, pilgrims.length - rowCount);
    await sleep(40);
    await revisitErroredFields();

    let continueClicked = false;
    if (clickContinue) {
      await sleep(40);
      continueClicked = await clickContinueIfEnabled();
      if (continueClicked) {
        showToast("Filled + clicked Continue. Watching for the review page...", "success");
        scheduleFollowUpContinue(clickPayNow, paymentMethod, cardDetails);
      } else {
        showToast(
          `Filled ${filledCount} pilgrim(s), but Continue wasn't enabled yet - check for a missing/invalid field.`,
          "error"
        );
      }
    } else {
      showToast(
        `Filled ${filledCount} pilgrim(s).` + (unfilledCount ? ` ${unfilledCount} had no row.` : ""),
        "success"
      );
    }

    return { filledCount, unfilledCount, continueClicked };
  } finally {
    autofillActive = false;
  }
}

const SNIPER_CONFIG_KEY = "ttdSniperConfig";
const SERVER_DRIFT_KEY = "ttdServerDrift";
const ARJITHA_MAX_PILGRIMS = 2; // keep in sync with popup.js
// Set when the user cancels the "seva not available" prompt: stops auto-pick on that calendar
// until they return to the services home page (or reload).
let calendarPickCancelledUrl = null;

// Per-ticket price of each Arjitha seva - a STARTING POINT only, copied from the saved temple pages in
// "arjitha seva temples sevas/" (Oct 2026). Prices seen live on TTD's pages are learned into
// LEARNED_SEVA_PRICES_KEY and always win, so a TTD price change is picked up the next time that seva is shown.
// Used by the "same-price" fallback when the chosen seva isn't offered on the selected date.
const ARJITHA_SEVA_PRICES = {
  "Srivari Temple - Tirumala": {
    "Arjitha Brahmotsavam": 500, "Kalyanotsavam": 1000, "Sahasra Deepalankara Seva": 500, "Unjal Seva": 500,
  },
  "Sapthagiri Gau Pradakshina Shala - Tirupati": { "Sri Srinivasa Divyaanugraha Homam": 1600 },
  "Sri Govindarajaswamy Temple - Tirupathi": { "Kumkumarchana": 250, "Unjal Seva": 116, "Veda Ashirvachanam": 500 },
  "Sri Padmavathi Ammavari Temple - Tiruchanoor": {
    "Abhishekam": 500, "Kalyanotsavam": 500, "Lakshmi Puja": 100, "Suprabhatham": 50, "Vastralankara Seva": 10000,
  },
  "Sri KalyanaVenkateswaraSwamy Temple - Srinivasamangapuram": {
    "Abhishekam to Moolavaru": 500, "Kalyana Kankanam": 20, "Kalyanotsavam": 500,
    "Vasthralankara Seva": 7000, "Veda Ashirvachanam": 500,
  },
  "Sri Prasanna Venkateswara Swamy Temple - Appalayagunta": { "Abhishekam": 30, "Vastralankarana Seva": 3000 },
  "Surya Narayana Swamy Temple - Tiruchanoor": { "Abhishekam to Moolavarlu": 30 },
  "Srinivasa Temple - Tiruchanoor": { "Abhishekam to Moolavarlu": 30 },
  "Sri Kalyana Venkateswara Swamy Temple - Narayanavanam": {
    "Abhishekam to Sri Kalyana Venkateswara Swamy Varu": 30, "Abhishekam to Sri Padmavathi Ammavaru": 30, "Kalyanotsavam": 500,
  },
  "Sri KodandaRamaSwamy Temple - Vontimitta": { "Kalyanotsavam on Pournami day": 1000 },
  "Sri Kodanda Rama Swamy Temple - Tirupathi": { "Ashtothara SathaKalasabhisekham": 50 },
};

// { [normalized temple]: { [normalized seva]: { name, price, seenAt } } } in chrome.storage.local
const LEARNED_SEVA_PRICES_KEY = "ttdArjithaSevaPrices";

// "Kalyanotsavam (10:00 AM )" -> "Kalyanotsavam"
function sevaNameFromCardTitle(title) {
  return String(title || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

// Finds `seva` among keys by normalized name: exact first, then prefix either way
// ("Suprabhatham" vs "Suprabhatham (Friday)").
function findSevaKey(keys, seva) {
  const want = normalizeOptionText(seva);
  return keys.find((k) => normalizeOptionText(k) === want) ||
         keys.find((k) => want.startsWith(normalizeOptionText(k)) || normalizeOptionText(k).startsWith(want)) ||
         null;
}

// Price of `seva` at `temple`: the last price seen live on TTD's page, else the built-in list.
// Returns { price, source } or null.
function lookupArjithaSevaPrice(temple, seva, learned = {}) {
  if (!temple || !seva) return null;
  const learnedForTemple = learned[normalizeOptionText(temple)] || {};
  const learnedKey = findSevaKey(Object.keys(learnedForTemple), seva);
  if (learnedKey) {
    const entry = learnedForTemple[learnedKey];
    return { price: entry.price, source: `seen on TTD ${new Date(entry.seenAt).toLocaleDateString()}` };
  }
  const builtinTemple = Object.keys(ARJITHA_SEVA_PRICES).find((t) => normalizeOptionText(t) === normalizeOptionText(temple));
  const prices = builtinTemple ? ARJITHA_SEVA_PRICES[builtinTemple] : null;
  const builtinKey = prices ? findSevaKey(Object.keys(prices), seva) : null;
  return builtinKey ? { price: prices[builtinKey], source: "built-in list" } : null;
}

// Records the price of every seva card currently shown, so "same price" stays accurate when TTD
// changes prices. Mutates and returns `learned`; writes storage only when something changed.
async function rememberArjithaSevaPrices(temple, cards, learned) {
  if (!temple || !cards.length) return learned;
  const templeKey = normalizeOptionText(temple);
  const forTemple = (learned[templeKey] ||= {});
  let changed = false;
  for (const { name, price } of cards) {
    if (!name || price === null) continue;
    const sevaKey = normalizeOptionText(name);
    const prev = forTemple[sevaKey];
    if (prev && prev.price !== price) {
      console.log(`[TTD Autofill] Price of "${name}" changed on TTD: ₹${prev.price} -> ₹${price}`);
    }
    // Write on a new seva or price change; otherwise refresh seenAt at most daily (avoids a write per page view)
    if (!prev || prev.price !== price || Date.now() - prev.seenAt > 24 * 60 * 60 * 1000) {
      forTemple[sevaKey] = { name, price, seenAt: Date.now() };
      changed = true;
    }
  }
  if (changed) {
    try {
      await chrome.storage.local.set({ [LEARNED_SEVA_PRICES_KEY]: learned });
    } catch (err) {
      console.warn("[TTD Autofill] Could not save learned seva prices:", err);
    }
  }
  return learned;
}

function triggerReactOrNativeClick(el) {
  if (!el) return false;
  try {
    el.scrollIntoView?.({ block: "nearest", behavior: "instant" });
  } catch (e) {}
  ensurePageBridge();
  el.dispatchEvent(new CustomEvent("__TTD_REACT_CLICK__", { bubbles: true, composed: true }));
  return true;
}

function isDateCellCurrentlySelected(cell) {
  if (!cell) return false;
  const bg = (cell.style.background || window.getComputedStyle(cell).backgroundColor || "").toLowerCase();
  return bg.includes("102, 51, 153") || bg.includes("#663399") || cell.classList.contains("selected");
}

function isDateCellAvailable(cell) {
  if (!cell) return false;
  if (isDateCellCurrentlySelected(cell)) return true;
  const pe = cell.style.pointerEvents || window.getComputedStyle(cell).pointerEvents;
  if (pe === "none") return false;
  const bg = (cell.style.background || window.getComputedStyle(cell).backgroundColor || "").toLowerCase();
  return (
    bg.includes("94, 184, 18") ||
    bg.includes("247, 202, 76") ||
    bg.includes("255, 191, 0") ||
    bg.includes("#5eb812") ||
    bg.includes("#f7ca4c")
  );
}

function parseTargetDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const str = dateStr.trim();
  const parts = str.split(/[-/.]/).map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;

  let day, month, year;
  if (parts[0] > 1000) {
    // Format: YYYY-MM-DD
    year = parts[0];
    month = parts[1];
    day = parts[2];
  } else if (parts[2] > 1000) {
    // Format: DD-MM-YYYY
    day = parts[0];
    month = parts[1];
    year = parts[2];
  } else {
    day = parts[0];
    month = parts[1];
    year = parts[2] < 100 ? 2000 + parts[2] : parts[2];
  }

  return {
    day,
    monthIndex: month - 1, // 0-indexed month for TTD cell IDs (e.g. Oct is 9)
    year,
    cellId: `${day}/${month - 1}`,
  };
}

// Supports SED, PAT/Ammavari and Arjitha Seva. CSS-module prefixes change between TTD builds
// ("SlotBooking_slotHeader", "Gz9ikq_slotHeader"), so match on the stable suffix only.
function findTicketCountInput() {
  const isTicketInput = (el) =>
    el && el.tagName === "INPUT" && !["templeSelected", "sevaSelected"].includes(el.getAttribute("name"));

  let el = document.querySelector('input[name="noOfTickets"]');
  if (el) return el;

  el = Array.from(document.querySelectorAll('[class*="slotHeader"] input')).find(isTicketInput);
  if (el) return el;

  // Visible "Number of Tickets" label - restricted to text elements so <script> JSON can't match
  const labelEl = Array.from(document.querySelectorAll("div, span, label, p")).find(
    (node) => node.children.length === 0 && /^\s*number\s+of\s+tickets\s*$/i.test(node.textContent)
  );
  for (let node = labelEl?.parentElement, depth = 0; node && depth < 3; node = node.parentElement, depth++) {
    el = Array.from(node.querySelectorAll("input")).find(isTicketInput);
    if (el) return el;
  }

  el = Array.from(document.querySelectorAll("#scrollSlotType input")).find(isTicketInput);
  return el || null;
}

async function selectTicketCount(desiredTickets) {
  if (!desiredTickets || desiredTickets < 1) return true;

  console.log(`[TTD Autofill] Requesting ticket count: ${desiredTickets}`);
  showToast(`Selecting up to ${desiredTickets} tickets...`, "info");

  const ticketInput = await waitForCondition(findTicketCountInput, 4000, 40);
  if (!ticketInput) {
    console.warn("[TTD Autofill] Ticket input not found in DOM");
    return false;
  }

  const want = parseInt(desiredTickets, 10);
  const currentCount = () => parseInt(ticketInput.value, 10);
  if (currentCount() === want) {
    console.log(`[TTD Autofill] Ticket count is already ${want}`);
    return true;
  }

  // 1. MAIN-world bridge calls the dropdown's React handlers directly. Run it alone and wait for it,
  // so the content-script fallback below doesn't toggle the same dropdown shut mid-selection.
  ensurePageBridge();
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2500);
    window.addEventListener("__TTD_TICKETS_SELECTED__", () => { clearTimeout(timer); resolve(); }, { once: true });
    window.dispatchEvent(new CustomEvent("__TTD_SELECT_TICKETS__", { detail: { count: want } }));
  });
  if (currentCount() === want) {
    console.log(`[TTD Autofill] Ticket count set to ${want} via bridge`);
    return true;
  }

  const getVisibleTicketOptions = () => {
    const wrapper = ticketInput.parentElement;
    const slotContainer = ticketInput.closest('#scrollSlotType') || ticketInput.closest('[class*="slotHeader"]') || wrapper?.parentElement;
    const menuContainer = wrapper?.querySelector('[style*="z-index: 999"], [style*="z-index"], .dropdown_scroll, [class*="dropdown"]') ||
                          wrapper?.parentElement?.querySelector('[style*="z-index: 999"], [style*="z-index"], .dropdown_scroll') ||
                          slotContainer?.querySelector('[style*="z-index: 999"], .dropdown_scroll, [class*="dropdown"]');

    let items = [];
    if (menuContainer) {
      items = Array.from(menuContainer.querySelectorAll('li, div, span')).filter(el => {
        const t = el.textContent?.trim();
        const n = parseInt(t, 10);
        return !isNaN(n) && n >= 1 && n <= 10 && (t === String(n) || t === String(n).padStart(2, '0')) &&
               (el.children.length === 0 || (el.children.length === 1 && el.firstElementChild.children.length === 0));
      });
    }

    if (items.length === 0) {
      items = Array.from(
        document.querySelectorAll('[class*="listItem"]')
      ).filter(el => {
        const t = el.textContent?.trim();
        const n = parseInt(t, 10);
        return !isNaN(n) && n >= 1 && n <= 10 && (t === String(n) || t === String(n).padStart(2, '0'));
      });
    }

    return items;
  };

  // 2. Fallback: open the dropdown and click the option from the content script.
  // One plain click per target - the dropdown toggles, so clickElementFull's burst would close it again.
  let options = getVisibleTicketOptions();
  if (options.length === 0) {
    const clickTargets = [
      ticketInput,
      ticketInput.parentElement?.querySelector('img'),
      ticketInput.parentElement
    ].filter(Boolean);

    for (const target of clickTargets) {
      try { target.click(); } catch (e) {}
      const startWait = Date.now();
      while (Date.now() - startWait < 300) {
        await sleep(25);
        options = getVisibleTicketOptions();
        if (options.length > 0) break;
      }
      if (options.length > 0) break;
    }
  }

  // Click best available option
  if (options.length > 0) {
    const available = [];
    for (const optEl of options) {
      const val = parseInt(optEl.textContent.trim(), 10);
      if (!isNaN(val) && val >= 1) available.push({ el: optEl, count: val });
    }

    let best = available.find(o => o.count === parseInt(desiredTickets, 10));
    if (!best) {
      const eligible = available.filter(o => o.count <= parseInt(desiredTickets, 10)).sort((a, b) => b.count - a.count);
      best = eligible.length > 0 ? eligible[0] : available.sort((a, b) => b.count - a.count)[0];
    }

    if (best) {
      console.log(`[TTD Autofill] Directly clicking ticket option: ${best.count}`);
      clickElementFull(best.el);
      // Best may be below `want` when TTD caps the dropdown - accept that, but verify it stuck
      const stuck = await waitForCondition(() => currentCount() === best.count, 800, 40);
      if (stuck) return true;
    }
  }

  console.warn(`[TTD Autofill] Ticket count did not change (still ${ticketInput.value}, wanted ${want})`);
  return false;
}

async function selectTempleOnPage(targetTemple) {
  if (!targetTemple) return true;
  const input = document.querySelector('input[name="templeSelected"]') ||
                document.querySelector('input[placeholder*="Select Temple"]') ||
                document.querySelector('input[label="Temple"]');
  if (!input) return false;

  const curVal = (input.value || "").trim();
  if (matchOptionText(curVal, targetTemple)) {
    console.log(`[TTD Autofill] Temple already matches "${curVal}"`);
    return true;
  }

  showToast(`Selecting temple: ${targetTemple}...`, "info");
  console.log(`[TTD Autofill] Requesting bridge to select temple: "${targetTemple}" (current: "${curVal}")`);
  ensurePageBridge();

  const bridgeResult = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener("__TTD_TEMPLE_SELECTED__", onDone);
      const isOk = matchOptionText(input.value, targetTemple);
      console.warn(`[TTD Autofill] Temple selection bridge timeout (2.5s). Current value: "${input.value}", Match: ${isOk}`);
      resolve(isOk);
    }, 2500);

    function onDone(e) {
      clearTimeout(timer);
      window.removeEventListener("__TTD_TEMPLE_SELECTED__", onDone);
      console.log("[TTD Autofill] Bridge confirmed temple selection:", e.detail);
      resolve(e.detail?.success || matchOptionText(input.value, targetTemple));
    }

    window.addEventListener("__TTD_TEMPLE_SELECTED__", onDone);
    window.dispatchEvent(new CustomEvent("__TTD_SELECT_TEMPLE__", { detail: { temple: targetTemple } }));
  });

  if (bridgeResult || matchOptionText(input.value, targetTemple)) {
    console.log(`[TTD Autofill] Temple successfully selected via bridge as "${input.value}"`);
    return true;
  }

  // The bridge already tried every way of opening the dropdown one step at a time; a burst-click
  // retry from here would only toggle it shut again.
  console.warn(`[TTD Autofill] Temple "${targetTemple}" could not be selected (still "${input.value}").`);
  return false;
}

// 1. Calendar & Slot Auto-Picker (Pre-Form Speed)
async function autoPickCalendarAndSlot(customConfig = null, { manual = false } = {}) {
  const prefs = await chrome.storage.local.get([SNIPER_CONFIG_KEY, GROUPS_STORAGE_KEY, LEARNED_SEVA_PRICES_KEY]);
  const learnedPrices = prefs[LEARNED_SEVA_PRICES_KEY] || {};
  const storedConfig = prefs[SNIPER_CONFIG_KEY] || {};
  const config = customConfig || storedConfig;
  // Master switch is read from storage so a stale or passed-in config can never bypass it
  // Slot already chosen: the pilgrim form is up (on Arjitha it sits below the calendar on the same page)
  if (!manual && pilgrimFormOnScreen()) {
    return { skipped: true };
  }
  if (!manual && handleBookingErrorIfPresent("TTD booking-in-progress error (calendar picker start)")) {
    console.log("[TTD Autofill] Automation paused (booking already in progress) - skipping calendar auto-pick.");
    return { skipped: true };
  }
  if (!manual && !storedConfig.sevaSniperEnabled) {
    console.log("[TTD Autofill] Seva & Sniper automation is OFF - skipping calendar auto-pick.");
    return { skipped: true };
  }
  // Popup toggle "Auto-select date and slot" (stored as autoPickerEnabled): ON = first available date &
  // slot, ignoring Target Date / Fallback / Preferred Slot. OFF = use those settings.
  const pickAny = config.autoPickerEnabled !== false;

  // Detect calendar page
  const hasCalendarElements =
    document.querySelector('[class*="DesktopCalender"]') ||
    document.querySelector('[class*="SlotBooking"]') ||
    document.querySelector('table td[id*="/"]') ||
    document.querySelector('[class*="sevaHeading"]') ||
    document.querySelector('button[value*="0"]') ||
    Array.from(document.querySelectorAll("div, span")).some((el) =>
      /darshan\s+slots|select\s+any\s+1\s+slot|seva\s+slots/i.test(el.textContent)
    );

  if (!hasCalendarElements) {
    return { ok: false, error: "Calendar not visible on this page." };
  }

  showToast("Calendar detected! Auto-picker initiating...", "info");

  // Step 0: Handle Temple Selection if on Arjitha Seva
  const templeInput = document.querySelector('input[name="templeSelected"]') ||
                      document.querySelector('input[placeholder*="Select Temple"]');
  if (templeInput && config.arjithaTemple) {
    const curTemple = (templeInput.value || "").trim();
    if (!matchOptionText(curTemple, config.arjithaTemple)) {
      showToast(`Selecting temple: ${config.arjithaTemple}...`, "info");
      const ok = await selectTempleOnPage(config.arjithaTemple);
      if (ok) {
        showToast(`Temple changed to ${config.arjithaTemple}. Loading calendar...`, "success");
        // Wait for TTD's calendar data for the new temple (not a fixed 1s sleep)
        await waitForNetworkIdle({ startMs: 80, quietMs: 60, timeoutMs: 3000 });
      }
    }
  }

  // Step 1: Date selection
  const targetDateStr = pickAny ? "" : config.targetDate?.trim(); // empty = first available date
  const parsed = parseTargetDate(targetDateStr);

  const findTargetOrAvailableCell = () => {
    if (parsed) {
      let candidateCell = document.getElementById(parsed.cellId);
      if (!candidateCell) {
        candidateCell = document.getElementById(`${parsed.day}/${parsed.monthIndex + 1}`);
      }
      if (candidateCell && (isDateCellAvailable(candidateCell) || isDateCellCurrentlySelected(candidateCell))) {
        return candidateCell;
      }
    }

    if (config.fallbackGreenDate !== false || !targetDateStr) {
      const allDateCells = Array.from(document.querySelectorAll('table td[id*="/"]')).filter(isDateCellAvailable);
      if (allDateCells.length > 0) {
        return allDateCells[0];
      }
    }
    return null;
  };

  let selectedDateCell = findTargetOrAvailableCell();
  // When navigating via SPA, API quota might take 100-300ms to color dates green: wait up to 3s with 50ms ticks
  if (!selectedDateCell) {
    selectedDateCell = await waitForCondition(findTargetOrAvailableCell, 3000, 50);
  }

  if (selectedDateCell) {
    if (isDateCellCurrentlySelected(selectedDateCell)) {
      showToast(`Target date (${selectedDateCell.id || targetDateStr}) is already active.`, "info");
    } else {
      simulateUserClick(selectedDateCell);
      showToast(`Auto-selected date (Cell ${selectedDateCell.id || selectedDateCell.textContent.trim()})`, "success");
      // The seva/slot cards for this date load from TTD
      await waitForNetworkIdle({ startMs: 50, quietMs: 40, timeoutMs: 2500 });
    }
  } else {
    showToast(
      targetDateStr
        ? `Target date ${targetDateStr} is full or not available.`
        : "No available dates found in calendar.",
      "error"
    );
  }

  // Helper to match slot times in either 24-hr or 12-hr format (e.g. "1000" matches "10:00 AM", "1500" matches "03:00 PM")
  function timeMatch(cardText, prefTime) {
    if (!prefTime || prefTime === "any") return true;
    if (!cardText) return false;
    const t = cardText.toLowerCase();
    const p = prefTime.toLowerCase().trim();
    if (t.includes(p)) return true;
    if (p.length === 4 && /^\d{4}$/.test(p)) {
      const hh = parseInt(p.slice(0, 2), 10);
      const mm = p.slice(2);
      const hh24 = String(hh).padStart(2, "0");
      const hh12 = String(hh % 12 || 12).padStart(2, "0");
      return t.includes(`${hh24}:${mm}`) || t.includes(`${hh12}:${mm}`) || t.includes(`${hh % 12 || 12}:${mm}`);
    }
    return false;
  }

  // Step 2: Handle Number of Tickets if needed
  let desiredTickets = 1;
  if (config.ticketCount && config.ticketCount !== "auto") {
    desiredTickets = parseInt(config.ticketCount, 10) || 1;
  } else {
    const groups = prefs[GROUPS_STORAGE_KEY] || prefs["ttdGroups"] || [];
    let selCount = 0;
    let namedCount = 0;
    groups.forEach((g) => {
      (g.pilgrims || []).forEach((p) => {
        if (p.name && p.name.trim()) {
          namedCount++;
          if (p.selected) selCount++;
        }
      });
    });
    if (selCount > 0) {
      desiredTickets = Math.min(6, selCount);
    } else if (namedCount > 0) {
      desiredTickets = Math.min(6, namedCount);
    }
  }

  const isArjithaSevaPage = !!document.querySelector('input[name="templeSelected"]') ||
                            !!document.querySelector('#scrollSlotType') ||
                            Array.from(document.querySelectorAll('span, div')).some(el => /select\s+any\s+1\s+seva/i.test(el.textContent));
  // Arjitha Seva bookings take at most 2 pilgrims (also caps "Auto (from Pilgrims)")
  if (isArjithaSevaPage && desiredTickets > ARJITHA_MAX_PILGRIMS) {
    console.log(`[TTD Autofill] Arjitha Seva allows ${ARJITHA_MAX_PILGRIMS} pilgrims max - capping ${desiredTickets} to ${ARJITHA_MAX_PILGRIMS}.`);
    desiredTickets = ARJITHA_MAX_PILGRIMS;
  }
  console.log(`[TTD Autofill] Desired ticket count: ${desiredTickets}`);

  // On SED, select tickets first to filter time slots.
  // On Arjitha Seva, wait until Seva card is selected first so the tickets dropdown reflects that Seva's exact allowed limits.
  if (!isArjithaSevaPage && desiredTickets > 1) {
    await selectTicketCount(desiredTickets);
    // TTD re-fetches the slot cards for the selected ticket count
    await waitForNetworkIdle({ startMs: 50, quietMs: 40, timeoutMs: 2500 });
  }

  // Step 3: Wait for slot / seva cards and select preferred or target seva
  function findSlotCards() {
    const cards = [];

    // Strategy 1: Find by RadioButton button inside card (used in Arjitha Seva)
    const radioBtns = Array.from(
      document.querySelectorAll('button[style*="RadioButton"], button[style*="radio"], button[style*="background-image"], button[value*="0"], button[value*="1"]')
    );
    // The card is the SMALLEST ancestor of the radio that carries its own "N Available" badge and no
    // other radio. Looser rules (closest cursor:pointer / border-radius) could grab a container holding
    // several cards; its text then starts with the first card's "0 Available", so every seva looked full.
    const cardForRadio = (btn) => {
      for (let el = btn.parentElement; el && el !== document.body; el = el.parentElement) {
        if (/\d+\s*Available/i.test(el.textContent || "")) {
          return el.querySelectorAll("button").length === 1 ? el : null;
        }
      }
      return null;
    };
    radioBtns.forEach((btn) => {
      const card = cardForRadio(btn);
      if (card && !cards.includes(card)) {
        cards.push(card);
      }
    });

    // From a card's "N Available" badge, the card is the SMALLEST ancestor that also holds the price
    // (₹...) and only this one badge. The old "closest rounded element" rule stopped at the coloured
    // badge block itself (it has rounded corners) - a "card" with no title, persons or radio.
    const cardForBadge = (badge) => {
      for (let el = badge.parentElement; el && el !== document.body; el = el.parentElement) {
        const text = el.textContent || "";
        if (/₹\s*[\d,]+/.test(text)) {
          return (text.match(/Available/gi) || []).length === 1 ? el : null;
        }
      }
      return null;
    };

    // Strategy 2: Find by "Available" badge
    if (cards.length === 0) {
      const availBadges = Array.from(document.querySelectorAll('div, span')).filter((el) => {
        return el.children.length === 0 && /^available$/i.test(el.textContent.trim());
      });
      availBadges.forEach((badge) => {
        const card = cardForBadge(badge);
        if (card && !cards.includes(card)) {
          cards.push(card);
        }
      });
    }

    // Strategy 3: Standard CSS modules class names (SED / Ammavari)
    if (cards.length === 0) {
      const secElements = Array.from(document.querySelectorAll('[class*="availableSlotSection"]'));
      secElements.forEach((sec) => {
        const card = cardForBadge(sec.firstElementChild || sec);
        if (card && !cards.includes(card)) {
          cards.push(card);
        }
      });
    }

    return cards;
  }

  function parseSlotCard(card) {
    if (!card) return null;
    const text = card.textContent?.trim() || "";

    // Extract available count (e.g. "16 Available", "31 Available", "0 Available")
    let count = 0;
    const m = text.match(/(\d+)\s*Available/i) || text.match(/Available\s*(\d+)/i);
    if (m) {
      count = parseInt(m[1], 10);
    } else {
      const countEl = card.querySelector('[class*="SlotBooking_availableSlotSection"] div, div[style*="121, 193, 57"]');
      if (countEl) count = parseInt(countEl.textContent.replace(/\D/g, "") || "0", 10);
    }

    const radioBtn = card.querySelector(
      'button[style*="RadioButton"], button[value], button, input[type="radio"], [role="radio"], img[src*="adio" i]'
    );
    const radioVal = radioBtn?.value || "";

    // Check if card or radio is already selected. Only explicit signals - a bare "selected" substring
    // also matches "unselected"/"notSelected" markup and made full cards look chosen.
    const isSelected =
      card.innerHTML.includes("RadioSelected") ||
      radioBtn?.checked === true ||
      radioBtn?.getAttribute?.("aria-checked") === "true" ||
      (radioBtn && /Select(ed)?\b/.test(radioBtn.style?.backgroundImage || "") && !/unselect/i.test(radioBtn.style?.backgroundImage || ""));

    const isFull = (m && count === 0) || /quota\s+is\s+full/i.test(text);

    return { card, count, radioBtn, radioVal, text, isSelected, isFull };
  }

  let slotPicked = false;
  let pickedSlot = null;
  let attempts = 0;
  const pref = pickAny ? "any" : config.preferredSlot;
  const targetSevaName = config.arjithaSeva && config.arjithaSeva !== "any" ? config.arjithaSeva.toLowerCase().trim() : null;

  // Card heading, e.g. "Veda Ashirvachanam (08:00 AM )" - TTD renders it in red rgb(226, 78, 90)
  const slotTitle = (s) =>
    (s.card.querySelector('[style*="226, 78, 90"]')?.textContent || s.text.replace(/^\s*\d+\s*Available/i, ""))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
  const priceOf = (s) => {
    const m = s.text.match(/₹\s*([\d,]+)/);
    return m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
  };
  let sevaMissingPolls = 0;

  while (!slotPicked && attempts < 30) {
    attempts++;
    if (attempts > 1) await sleep(60); // first look is immediate - the cards are usually already there

    // TTD can send us back here and show "booking already in progress" while we're picking
    if (handleBookingErrorIfPresent("TTD booking-in-progress error (during slot pick)")) {
      return { ok: false, continued: false, paused: true };
    }

    // 1. Direct match by button value (e.g. "1600", "0900", "1000") in SED.
    // Skipped when a specific Arjitha seva is wanted - the button value alone can't tell sevas apart.
    if (pref && pref !== "any" && !targetSevaName) {
      const directBtn = document.querySelector(`button[value="${pref}"]`);
      if (directBtn) {
        const card = directBtn.closest('[style*="cursor: pointer"]') || directBtn.parentElement;
        fireReactClick(directBtn);
        if (card) fireReactClick(card);
        try { directBtn.click(); } catch (e) {}
        slotPicked = true;
        showToast(`Selected preferred slot (${pref})`, "success");
        break;
      }
    }

    // 2. Multi-strategy card discovery (Arjitha Seva, SED, Ammavari)
    const rawCards = findSlotCards();
    if (rawCards.length === 0) continue;

    const parsedSlots = rawCards.map(parseSlotCard).filter(Boolean);

    // Learn the live price of every seva shown (full ones too) - keeps "same price" current
    if (isArjithaSevaPage) {
      const pageTemple = document.querySelector('input[name="templeSelected"]')?.value || config.arjithaTemple;
      await rememberArjithaSevaPrices(
        pageTemple,
        parsedSlots.map((s) => ({ name: sevaNameFromCardTitle(slotTitle(s)), price: priceOf(s) })),
        learnedPrices
      );
    }

    const availableSlots = parsedSlots.filter((s) => !s.isFull && (s.count > 0 || s.radioBtn));
    if (availableSlots.length === 0) continue;

    let targetSlot = null;

    // A. Match target specific Arjitha Seva if configured
    if (targetSevaName) {
      targetSlot = availableSlots.find((s) => s.text.toLowerCase().includes(targetSevaName));
      if (targetSlot) {
        console.log(`[TTD Autofill] Found match for target Arjitha Seva: "${config.arjithaSeva}"`);
      } else {
        // Give the card list a few polls to settle before deciding the seva isn't offered
        if (++sevaMissingPolls < 3) continue;

        // Not offered on this date: auto-pick a replacement if the user allowed it in the popup
        const fallback = config.arjithaFallback || "ask";
        const wanted = lookupArjithaSevaPrice(config.arjithaTemple, config.arjithaSeva, learnedPrices);
        const wantedPrice = wanted?.price ?? null;
        if (wanted) console.log(`[TTD Autofill] Price of "${config.arjithaSeva}": ₹${wanted.price} (${wanted.source}).`);
        let autoPick = null;
        if ((fallback === "samePrice" || fallback === "samePriceThenAny") && wantedPrice !== null) {
          autoPick = availableSlots.find((s) => priceOf(s) === wantedPrice) || null;
        }
        if (!autoPick && (fallback === "samePriceThenAny" || fallback === "any")) {
          autoPick = availableSlots[0];
        }
        if (autoPick) {
          const price = priceOf(autoPick);
          console.log(`[TTD Autofill] "${config.arjithaSeva}" not offered - auto-picked "${slotTitle(autoPick)}" (₹${price}, fallback "${fallback}").`);
          showToast(`${config.arjithaSeva} not available - auto-picked ${slotTitle(autoPick)}${price !== null ? ` (₹${price})` : ""}`, "info");
          targetSlot = autoPick;
        }
      }
      if (!targetSlot) {
        // Not offered and no auto-pick allowed/possible: ask instead of silently booking a different seva
        console.log(`[TTD Autofill] "${config.arjithaSeva}" not offered on this date - asking user.`);
        const wantedPrice = lookupArjithaSevaPrice(config.arjithaTemple, config.arjithaSeva, learnedPrices)?.price ?? null;
        const chosenTitle = await showChoiceDialog(
          `${config.arjithaSeva}${wantedPrice !== null ? ` (₹${wantedPrice})` : ""} is not available`,
          "It isn't offered on the selected date. Book one of these sevas instead?",
          availableSlots.map((s) => ({
            label: `${slotTitle(s)}${priceOf(s) !== null ? ` · ₹${priceOf(s)}` : ""} · ${s.count} available`,
            value: slotTitle(s),
          })),
          "Cancel – I'll choose myself"
        );
        if (!chosenTitle) {
          // Stop auto-picking on this page until the user leaves the booking flow
          calendarPickCancelledUrl = location.href;
          showToast("Auto-pick stopped. Choose a seva or another date yourself.", "info");
          return { ok: false, continued: false, cancelled: true };
        }
        // The page may have re-rendered while the dialog was open - re-find the card by its title
        targetSlot = findSlotCards().map(parseSlotCard).find((s) => s && !s.isFull && slotTitle(s) === chosenTitle);
        if (!targetSlot) {
          showToast(`"${chosenTitle}" is no longer available. Please choose manually.`, "error");
          return { ok: false, continued: false };
        }
      }
    }

    // B. Match preferred slot time if configured
    if (!targetSlot && pref && pref !== "any") {
      targetSlot = availableSlots.find(
        (s) => s.radioVal === pref || timeMatch(s.text, pref)
      );
    }

    // C. Preferred time not offered (e.g. no 6 PM slot that day): closest previous slot (5 PM).
    // If nothing is earlier than the preferred time, take the earliest slot after it.
    if (!targetSlot && pref && /^\d{4}$/.test(pref)) {
      const toMinutes = (hhmm) => parseInt(hhmm.slice(0, 2), 10) * 60 + parseInt(hhmm.slice(2), 10);
      const prefMin = toMinutes(pref);
      const timed = availableSlots
        .filter((s) => /^\d{4}$/.test(s.radioVal))
        .sort((a, b) => toMinutes(a.radioVal) - toMinutes(b.radioVal));
      const earlier = timed.filter((s) => toMinutes(s.radioVal) < prefMin);
      targetSlot = earlier[earlier.length - 1] || timed.find((s) => toMinutes(s.radioVal) > prefMin) || null;
      if (targetSlot) {
        console.log(`[TTD Autofill] Preferred slot ${pref} not offered - picking closest previous: ${targetSlot.radioVal}`);
        showToast(`${pref} slot not available - picked ${targetSlot.radioVal} instead`, "info");
      }
    }

    // D. Default: first available slot
    if (!targetSlot) {
      targetSlot = availableSlots[0];
    }

    if (targetSlot) {
      console.log("[TTD Autofill] Target slot found, clicking seva card & radio button...");
      if (targetSlot.radioBtn) {
        clickElementFull(targetSlot.radioBtn);
      }
      if (targetSlot.card) {
        clickElementFull(targetSlot.card);
      }
      slotPicked = true;
      pickedSlot = targetSlot;
      const title = targetSlot.text.split("\n")[0].trim().substring(0, 32);
      showToast(`Selected seva/slot: ${title} (${targetSlot.count} seats)`, "success");
      await waitForNetworkIdle({ startMs: 40, quietMs: 40, timeoutMs: 1500 });
      break;
    }
  }

  // Fallback check: if any card is already marked selected by the portal
  if (!slotPicked) {
    const rawCards = findSlotCards();
    const alreadySelected = rawCards.map(parseSlotCard).find((s) => s && s.isSelected);
    if (alreadySelected) {
      slotPicked = true;
      pickedSlot = alreadySelected;
      console.log("[TTD Autofill] A slot was already selected on portal.");
    }
  }

  // Nothing selectable (all full, or the cards never rendered): stop here instead of setting tickets
  // and clicking a Continue that TTD will reject with "Please select an available slot".
  if (!slotPicked) {
    console.warn("[TTD Autofill] No available seva/slot found to select - not clicking Continue.");
    showToast("No available seva/slot found for this date - please choose one yourself.", "error");
    return { ok: false, continued: false, error: "no_slot_available" };
  }

  // The ticket count setting means PILGRIMS. Some Arjitha sevas admit several pilgrims per ticket
  // (card says "2 Persons" for Veda Ashirvachanam), so 2 pilgrims there = 1 ticket, not 2 (= 4 rows).
  const personsMatch = pickedSlot?.text.match(/(\d+)\s*Persons?\b/i);
  const personsPerTicket = personsMatch ? parseInt(personsMatch[1], 10) : 1;
  if (personsPerTicket > 1) {
    const pilgrimsWanted = desiredTickets;
    desiredTickets = Math.ceil(pilgrimsWanted / personsPerTicket);
    console.log(`[TTD Autofill] Seva admits ${personsPerTicket} persons/ticket - ${pilgrimsWanted} pilgrim(s) = ${desiredTickets} ticket(s).`);
  }

  // Post-slot selection: set tickets when more than 1 is needed, or when the dropdown holds a
  // different value (e.g. 02 left over from an earlier attempt but this seva needs just 1)
  let ticketsOk = true;
  const ticketInputNow = findTicketCountInput();
  const ticketsBefore = ticketInputNow ? ticketInputNow.value : null;
  if (desiredTickets > 1 || (ticketInputNow && parseInt(ticketInputNow.value, 10) !== desiredTickets)) {
    ticketsOk = await selectTicketCount(desiredTickets);
    await waitForNetworkIdle({ startMs: 40, quietMs: 40, timeoutMs: 1500 });
  }

  // TTD clears the seva selection when the ticket count changes - pick the same card again
  // (re-found by title, the list may have re-rendered)
  if (ticketsOk && pickedSlot && ticketInputNow && findTicketCountInput()?.value !== ticketsBefore) {
    const wantedTitle = slotTitle(pickedSlot);
    const again = findSlotCards().map(parseSlotCard).find((s) => s && slotTitle(s) === wantedTitle);
    if (again) {
      console.log(`[TTD Autofill] Ticket count changed - re-selecting "${wantedTitle}".`);
      if (again.radioBtn) clickElementFull(again.radioBtn);
      clickElementFull(again.card);
      await waitForNetworkIdle({ startMs: 40, quietMs: 40, timeoutMs: 1500 });
    }
  }

  // Never auto-continue with the wrong ticket count - leave it for the user to fix
  if (!ticketsOk) {
    showToast(`Could not set ${desiredTickets} ticket(s) - please select it manually, then Continue.`, "error");
    return { ok: false, continued: false, error: "ticket_count_not_set" };
  }

  // Step 4: Click Continue button to advance to Pilgrim details
  if (config.autoContinueCalendar !== false) {
    showToast("Slot selected. Clicking Continue...", "info");
    ensurePageBridge();

    // Last check before committing: never click Continue while TTD's booking error is up
    if (handleBookingErrorIfPresent("TTD booking-in-progress error (before calendar Continue)")) {
      return { ok: false, continued: false, paused: true };
    }

    // Continue is clicked exactly once, by the MAIN-world bridge (it owns the single delayed retry).
    // Each extra click fires another slot-block request; TTD treats duplicates as a conflicting
    // booking and bounces to the home page (seen on Arjitha Seva).
    window.dispatchEvent(new CustomEvent("__TTD_CLICK_CONTINUE__"));

    const onPilgrimForm = pilgrimFormOnScreen;
    if (await waitForCondition(onPilgrimForm, 8000, 100)) {
      showToast("Slot booked! Entering Pilgrim Details...", "success");
      return { ok: true, continued: true };
    }
    console.warn("[TTD Autofill] Pilgrim Details did not open after clicking Continue.");
    showToast("Clicked Continue, but Pilgrim Details didn't open - check the page.", "error");
    return { ok: false, continued: false };
  }

  return { ok: true, continued: false };
}

// 2. Home Page / Pilgrim Services Grid Auto-Click
function matchesSevaLabel(labelText, targetSeva) {
  if (!labelText || !targetSeva) return false;
  const l = labelText.toLowerCase().trim();
  const t = targetSeva.toLowerCase().trim();

  // 1. Exact match
  if (l === t) return true;

  // 2. Ammavari / PAT Special Entry Darshan
  const isAmmavariTarget = t.includes("ammavari") || /\bpat\b/i.test(targetSeva);
  if (isAmmavariTarget) {
    const hasAmmavariOrPat = l.includes("ammavari") || /\bpat\b/i.test(labelText);
    const hasDarshanOrSed = l.includes("darshan") || l.includes("special entry");
    return hasAmmavariOrPat && hasDarshanOrSed;
  }

  // 3. Regular Special Entry Darshan (MUST NOT be Ammavari)
  if (t.includes("special entry darshan") || t === "sed") {
    if (l.includes("ammavari") || /\bpat\b/i.test(labelText)) return false;
    return l.includes("special entry darshan");
  }

  // 4. Arjitha Seva (matches "Arjitha Seva", "Arjitha Sevas", "Arjitha")
  if (t.includes("arjitha")) {
    return l.includes("arjitha");
  }

  // 5. Other services (e.g. Accommodation, Homam)
  const normL = l.replace(/[^a-z0-9]/g, "");
  const normT = t.replace(/[^a-z0-9]/g, "");
  return normL.includes(normT) || normT.includes(normL);
}

// TTD's CSS-module prefix changes between builds ("services_iconList__aQJoS", "qiuJGq_iconList"),
// so match on the stable suffix only.
const SEVA_TILE_SELECTOR = '[class*="iconList"]';
const SEVA_LABEL_SELECTOR = '[class*="label"]';

function isOnScreen(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
}

// Only tiles the user can actually see: TTD also keeps service tiles in hidden markup (e.g. menus) on
// other pages, and clicking those from the slot/pilgrim page restarted the booking flow by itself.
function visibleSevaTiles() {
  return Array.from(document.querySelectorAll(SEVA_TILE_SELECTOR)).filter(isOnScreen);
}

function findSevaTile(targetSeva) {
  if (!targetSeva || targetSeva === "none") return null;

  // 1. Look for iconList tile elements
  const tiles = visibleSevaTiles();
  // Exact label wins first, so "Angapradakshinam" doesn't pick "Angapradakshinam (for Locals)"
  const wanted = targetSeva.toLowerCase().trim();
  for (const tile of tiles) {
    const labelEl = tile.querySelector(SEVA_LABEL_SELECTOR) || tile;
    if ((labelEl.textContent || "").toLowerCase().trim() === wanted) {
      return labelEl;
    }
  }
  for (const tile of tiles) {
    const labelEl = tile.querySelector(SEVA_LABEL_SELECTOR) || tile;
    if (matchesSevaLabel(labelEl.textContent || "", targetSeva)) {
      return labelEl;
    }
  }

  // 2. Fallback: Search inside services containers
  const containers = Array.from(document.querySelectorAll('[class*="services_flex"], [class*="services_container"]'));
  for (const cont of containers) {
    if (!isOnScreen(cont)) continue;
    const items = Array.from(cont.querySelectorAll('[class*="services_label"], div, span'));
    for (const el of items) {
      if (matchesSevaLabel(el.textContent || "", targetSeva)) {
        return el;
      }
    }
  }

  return null;
}

function autoClickTargetSevaTile(targetSeva) {
  if (!targetSeva || targetSeva === "none") return false;

  // Prevent multiple clicks or reload loops
  if (window.__TTD_SEVA_NAVIGATING__) {
    return true;
  }
  const lastClickedTime = parseInt(sessionStorage.getItem("ttdSevaClickedTime") || "0", 10);
  if (lastClickedTime && Date.now() - lastClickedTime < 3000) {
    console.log("[TTD Autofill] Target Seva tile already clicked recently, preventing duplicate clicks.");
    return true;
  }

  const targetEl = findSevaTile(targetSeva);
  if (!targetEl) {
    return false;
  }

  // Target container tile or anchor
  const tileEl = targetEl.closest(SEVA_TILE_SELECTOR) || targetEl.closest('a') || targetEl;

  // Synchronous lock before dispatching click
  window.__TTD_SEVA_NAVIGATING__ = true;
  sessionStorage.setItem("ttdSevaClickedTime", String(Date.now()));
  setTimeout(() => { window.__TTD_SEVA_NAVIGATING__ = false; }, 3000);

  showToast(`Opening ${targetSeva}...`, "success");
  console.log("[TTD Autofill] Auto-clicking target Seva tile:", targetSeva, tileEl);

  try {
    tileEl.scrollIntoView({ behavior: "instant", block: "center" });
  } catch (e) {}

  // Dispatch React click to tile container and label
  fireReactClick(tileEl);
  if (tileEl !== targetEl) {
    fireReactClick(targetEl);
  }
  try {
    tileEl.click();
  } catch (err) {
    console.error("[TTD Autofill] Error clicking seva tile:", err);
  }

  return true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (window[CONTENT_SCRIPT_INSTANCE_KEY] !== CONTENT_SCRIPT_INSTANCE) return;

  // An explicit action from the popup means the user wants to go again - lift any pause
  if (["TRIGGER_CALENDAR_PICKER", "CLICK_TARGET_SEVA", "AUTOFILL_TTD"].includes(message.action)) {
    resumeAutomation(`manual popup action (${message.action})`);
  }

  if (message.action === "TRIGGER_CALENDAR_PICKER") {
    autoPickCalendarAndSlot(message.config, { manual: true })
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.action === "CLICK_TARGET_SEVA") {
    const target = message.targetSeva || message.config?.targetSeva;
    const clicked = autoClickTargetSevaTile(target);
    sendResponse({
      ok: clicked,
      message: clicked ? `Clicked "${target}" on Dashboard!` : `Tile for "${target}" not found on Dashboard.`,
    });
    return true;
  }

  if (message.action === "EXECUTE_SNIPER_NOW") {
    const cfg = message.config || {};
    if (!cfg.sevaSniperEnabled || cfg.autoClickTargetSeva !== false) {
      sendResponse({ ok: false, skipped: true });
      return;
    }
    // If on dashboard, click seva tile; if on calendar, pick calendar and slot
    if (visibleSevaTiles().length > 0) {
      const clicked = autoClickTargetSevaTile(cfg.targetSeva);
      sendResponse({ ok: clicked });
    } else {
      autoPickCalendarAndSlot(cfg)
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
    }
    return true;
  }

  if (message.action === "INIT_SNIPER_SCHEDULER") {
    initSniperScheduler(message.config).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.action !== "AUTOFILL_TTD") return;

  autofill(
    message.general,
    message.pilgrims,
    message.clickContinue,
    message.clickPayNow,
    message.paymentMethod,
    message.cardDetails
  )
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));

  return true; // keep the message channel open for the async response
});

async function maybeAutoRun() {
  let runInProgress = false;

  const tryAutoRun = async () => {
    // Visible form only - a hidden one left on the slot step must not be filled/submitted
    if (!pilgrimFormOnScreen()) return;
    if (handleBookingErrorIfPresent("TTD booking-in-progress error (auto-run)")) return;
    clearStaleRunStateForEmptyForm();
    if (runInProgress) return;
    runInProgress = true;

    try {
      const prefs = await chrome.storage.local.get([
        AUTO_RUN_PREF_KEY,
        GROUPS_STORAGE_KEY,
        CLICK_CONTINUE_PREF_KEY,
        PAYMENT_METHOD_PREF_KEY,
        CARD_DETAILS_PREF_KEY,
      ]);
      if (prefs[AUTO_RUN_PREF_KEY] === false) return;

      const groups = prefs[GROUPS_STORAGE_KEY] || [];
      const selected = [];
      groups.forEach((group) => {
        group.pilgrims.forEach((pilgrim) => {
          if (pilgrim.selected && pilgrim.name && pilgrim.name.trim()) {
            selected.push({ pilgrim, group });
          }
        });
      });
      if (selected.length === 0 || sessionStorage.getItem(AUTO_RUN_DONE_KEY) === location.href) return;

      const clickContinue =
        prefs[CLICK_CONTINUE_PREF_KEY] === undefined ? true : !!prefs[CLICK_CONTINUE_PREF_KEY];
      const paymentMethod = prefs[PAYMENT_METHOD_PREF_KEY] || "upi";
      const cardDetails = prefs[CARD_DETAILS_PREF_KEY] || {};
      const general = selected[0].group.general;
      const pilgrims = selected.map((s) => s.pilgrim);

      sessionStorage.setItem(AUTO_RUN_DONE_KEY, location.href);
      showToast("Auto-run: pilgrim form detected, filling now...", "info");
      await autofill(general, pilgrims, clickContinue, clickContinue, paymentMethod, cardDetails);
    } catch (err) {
      console.error("[TTD Autofill] Auto-run threw an error:", err);
      showToast(`Auto-run error: ${err.message}`, "error");
    } finally {
      runInProgress = false;
    }
  };
  retryAutoRun = tryAutoRun;

  const observer = new MutationObserver(() => {
    tryAutoRun();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[AUTO_RUN_PREF_KEY]?.newValue) {
      tryAutoRun();
    }
  });

  tryAutoRun();
}

function watchForBookingError() {
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      handleBookingErrorIfPresent("TTD booking-in-progress error (page change)");
    }, 100);
  }).observe(document.documentElement, { childList: true, subtree: true });
}

function watchBookingFlowExit() {
  setInterval(() => {
    if (handleBookingErrorIfPresent("TTD booking-in-progress error (periodic watch)")) return;
    if (clearStaleRunStateForEmptyForm()) {
      retryAutoRun?.();
      return;
    }
    if (hasBookingFlowControls()) return;

    // Allow auto-run & calendar picker to trigger again when the user leaves and later returns
    sessionStorage.removeItem(AUTO_RUN_DONE_KEY);

    const rawPending = sessionStorage.getItem(FOLLOW_UP_CONTINUE_KEY);
    if (!rawPending) return;
    try {
      const pending = JSON.parse(rawPending);
      const stateAge = Date.now() - (pending?.createdAt || Date.now());
      if (stateAge > FLOW_EXIT_GRACE_MS && (pending?.stage === "postContinue" || location.href !== pending?.sourceUrl)) {
        sessionStorage.removeItem(FOLLOW_UP_CONTINUE_KEY);
      }
    } catch (err) {
      sessionStorage.removeItem(FOLLOW_UP_CONTINUE_KEY);
    }
  }, 1000);
}

let cachedSniperConfig = null;
chrome.storage.local.get([SNIPER_CONFIG_KEY]).then((res) => {
  cachedSniperConfig = res[SNIPER_CONFIG_KEY] || {};
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[SNIPER_CONFIG_KEY]) {
    cachedSniperConfig = changes[SNIPER_CONFIG_KEY].newValue || {};
  }
});

// 2.5 Auto-Click Target Seva on Dashboard Load (instant zero-delay execution)
async function maybeAutoClickTargetSeva() {
  let sevaObserver = null;
  let isChecking = false;

  const tryClickSeva = async () => {
    // If navigation already triggered or clicked recently, exit
    const lastClickedTime = parseInt(sessionStorage.getItem("ttdSevaClickedTime") || "0", 10);
    if (window.__TTD_SEVA_NAVIGATING__ || (lastClickedTime && Date.now() - lastClickedTime < 3000)) {
      return;
    }

    if (!chrome.runtime?.id) {
      sevaObserver?.disconnect();
      sevaObserver = null;
      return;
    }

    // Must be on dashboard with services grid
    const tilesOnScreen = visibleSevaTiles();
    if (tilesOnScreen.length === 0) {
      return;
    }
    calendarPickCancelledUrl = null; // back on the home page - next calendar visit may auto-pick again
    // The booking-in-progress loop never passes through home, so reaching it means a fresh start.
    // Require the real services grid (many tiles) so a stray "iconList" class elsewhere can't lift the pause.
    if (tilesOnScreen.length >= 5) {
      resumeAutomation("back on the home page");
    }

    if (isChecking) return;
    isChecking = true;

    try {
      const config = cachedSniperConfig || (await chrome.storage.local.get([SNIPER_CONFIG_KEY]))[SNIPER_CONFIG_KEY] || {};
      // On page load only when "Click Pilgrim Service as soon as page loads" is ticked; otherwise the sniper clicks at drop time
      const shouldClick = !!config.sevaSniperEnabled && config.autoClickTargetSeva !== false;
      if (!shouldClick || !config.targetSeva || config.targetSeva === "none") return;

      // Keep observing after a click: TTD returns to home via client-side navigation (no popstate),
      // and a disconnected observer would never auto-click again. The 3s click guard prevents repeats.
      autoClickTargetSevaTile(config.targetSeva);
    } finally {
      isChecking = false;
    }
  };

  // Run immediate synchronous check
  tryClickSeva();

  // Observer to catch Next.js mounting the grid
  sevaObserver = new MutationObserver(() => {
    tryClickSeva();
  });
  sevaObserver.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("popstate", () => {
    window.__TTD_SEVA_NAVIGATING__ = false;
    sessionStorage.removeItem("ttdSevaClickedTime");
    if (!sevaObserver) {
      sevaObserver = new MutationObserver(() => tryClickSeva());
      sevaObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
    tryClickSeva();
  });
}

// 3. Calendar Auto-Pick Observer
async function maybeAutoPickCalendar() {
  let isPicking = false;

  // Log why the picker stands down (only when the reason changes, so the console isn't flooded)
  let lastSkipReason = null;
  const logSkip = (reason) => {
    if (reason !== lastSkipReason) console.log(`[TTD Autofill] Calendar auto-pick waiting: ${reason}`);
    lastSkipReason = reason;
  };

  const tryCalendarPick = async () => {
    if (isPicking) return;
    // Orphaned script left behind by an extension reload - stop watching
    if (!chrome.runtime?.id) {
      calObserver.disconnect();
      return;
    }
    const masterCfg =
      cachedSniperConfig || (await chrome.storage.local.get([SNIPER_CONFIG_KEY]))[SNIPER_CONFIG_KEY] || {};
    if (!masterCfg.sevaSniperEnabled) return;
    const calendarEl =
      document.querySelector('[class*="DesktopCalender_container"]') ||
      document.querySelector('[class*="SlotBooking_slotBookingDesktop"]') ||
      document.querySelector('[class*="SlotBooking_slotBookingMobile"]') ||
      document.querySelector('table td[id*="/"]');

    if (calendarEl) {
      sessionStorage.removeItem("ttdSevaClickedTime");
      window.__TTD_SEVA_NAVIGATING__ = false;
    }

    if (!calendarEl) return;

    // Skip if already on pilgrim details page
    // (Arjitha renders the form on the same page, below the still-present calendar)
    if (pilgrimFormOnScreen()) return logSkip("pilgrim form is on screen");

    if (handleBookingErrorIfPresent("TTD booking-in-progress error (calendar page)")) {
      return logSkip("automation paused (booking already in progress)");
    }

    // User cancelled the "seva not available" prompt on this page - leave it to them
    if (calendarPickCancelledUrl === location.href) return logSkip("user cancelled the seva prompt on this page");
    lastSkipReason = null;

    isPicking = true;
    try {
      console.log('[TTD Autofill] Calendar detected! Running autoPickCalendarAndSlot...');
      const result = await autoPickCalendarAndSlot();
      console.log("[TTD Autofill] Calendar auto-pick finished:", JSON.stringify(result));
    } catch (err) {
      console.error("[TTD Autofill] Calendar auto-picker error:", err);
    } finally {
      setTimeout(() => { isPicking = false; }, 2000);
    }
  };

  const calObserver = new MutationObserver(() => {
    tryCalendarPick();
  });
  calObserver.observe(document.documentElement, { childList: true, subtree: true });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && (changes[SNIPER_CONFIG_KEY] || changes[SERVER_DRIFT_KEY])) {
      initSniperScheduler();
      tryCalendarPick();
    }
  });

  tryCalendarPick();
}

// 4. Sub-Millisecond Quota Drop Sniper Scheduler
let activeSniperTimerId = null;
let activeSniperSpinId = null;

async function initSniperScheduler(overrideConfig = null) {
  if (activeSniperTimerId) {
    clearTimeout(activeSniperTimerId);
    activeSniperTimerId = null;
  }
  if (activeSniperSpinId) {
    cancelAnimationFrame(activeSniperSpinId);
    activeSniperSpinId = null;
  }

  const prefs = await chrome.storage.local.get([SNIPER_CONFIG_KEY, SERVER_DRIFT_KEY]);
  const config = overrideConfig || prefs[SNIPER_CONFIG_KEY];
  if (!config || !config.sevaSniperEnabled || !config.sniperEnabled || !config.dropTime) return;
  if (config.autoClickTargetSeva !== false) return; // on-load click mode disables the sniper

  const driftMs = prefs[SERVER_DRIFT_KEY] || 0;
  const parts = config.dropTime.split(":");
  if (parts.length < 2) return;

  const nowServer = new Date(Date.now() + driftMs);
  const targetServer = new Date(nowServer);
  targetServer.setHours(
    parseInt(parts[0], 10),
    parseInt(parts[1], 10),
    parseInt(parts[2] || 0, 10),
    0
  );

  let diffMs = targetServer.getTime() - nowServer.getTime();
  const leadMs = config.leadTimeMs ?? 250;
  const triggerDiffMs = diffMs - leadMs;

  const fireSniperAction = () => {
    if (!cachedSniperConfig?.sevaSniperEnabled || isAutomationHalted()) return;
    console.log("[TTD Sniper] *** FIRING SNIPER ACTION NOW ***");
    showToast("Sniper fired! Executing target action...", "success");

    // If on home/dashboard page, click the target service
    if (autoClickTargetSevaTile(config.targetSeva)) {
      return;
    }

    // If on calendar page, refresh and pick
    const refreshBtn =
      document.querySelector('button img[src*="refresh"]')?.closest("button") ||
      Array.from(document.querySelectorAll("button")).find((b) => /refresh/i.test(b.textContent));

    if (refreshBtn) {
      triggerReactOrNativeClick(refreshBtn);
      setTimeout(() => autoPickCalendarAndSlot(config), 120);
    } else {
      autoPickCalendarAndSlot(config);
    }
  };

  // If drop time is right now or passed within the last 60 seconds (user testing or recent drop)
  if (triggerDiffMs <= 0) {
    if (triggerDiffMs >= -60000) {
      console.log(`[TTD Sniper] Drop time was within past 60s (${triggerDiffMs}ms ago). Firing immediately!`);
      fireSniperAction();
    } else {
      console.log(`[TTD Sniper] Drop time has passed for today (${config.dropTime}).`);
    }
    return;
  }

  console.log(`[TTD Sniper] Scheduled in ${triggerDiffMs}ms with lead ${leadMs}ms (server drift ${driftMs}ms)`);
  showToast(`Sniper armed for ${config.dropTime} (-${leadMs}ms lead)`, "info");

  // High-precision hybrid timer (setTimeout + requestAnimationFrame spin)
  if (triggerDiffMs > 1500) {
    activeSniperTimerId = setTimeout(() => {
      const targetLocalTime = Date.now() + 1500;
      const spin = () => {
        if (Date.now() >= targetLocalTime) {
          fireSniperAction();
        } else {
          activeSniperSpinId = requestAnimationFrame(spin);
        }
      };
      activeSniperSpinId = requestAnimationFrame(spin);
    }, triggerDiffMs - 1500);
  } else {
    const targetLocalTime = Date.now() + triggerDiffMs;
    const spin = () => {
      if (Date.now() >= targetLocalTime) {
        fireSniperAction();
      } else {
        activeSniperSpinId = requestAnimationFrame(spin);
      }
    };
    activeSniperSpinId = requestAnimationFrame(spin);
  }
}

if (window[CONTENT_SCRIPT_INSTANCE_KEY] === CONTENT_SCRIPT_INSTANCE) {
  resumeFollowUpContinue();
  maybeAutoRun();
  watchBookingFlowExit();
  watchForBookingError();
  maybeAutoClickTargetSeva();
  maybeAutoPickCalendar();
  initSniperScheduler();
}
