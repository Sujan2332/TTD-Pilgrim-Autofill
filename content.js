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
  const script = document.createElement("script");
  script.id = "__ttd_page_bridge_tag";
  script.textContent = `
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
        } catch (e) {}
      }

      function executeBridgeClick(el) {
        if (!el) return;
        invokeReactHandlers(el);
        dispatchNativeClickSequence(el);
      }

      async function selectTicketsInMainWorld(desiredCount) {
        var desiredStr = String(desiredCount);
        console.log('[TTD Bridge] selectTicketsInMainWorld requested count:', desiredStr);

        var input = null;
        for (var i = 0; i < 20; i++) {
          input = document.querySelector('.SlotBooking_slotHeader__bV77N input.floating-input') || 
                  document.querySelector('[class*="SlotBooking_slotHeader"] input') ||
                  document.querySelector('input.floating-input[readonly]');
          if (input) break;
          await new Promise(function(r) { setTimeout(r, 50); });
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
          var wrapper = input.parentElement;
          var menuContainer = wrapper?.querySelector('[style*="z-index: 999"], [style*="z-index"], [class*="dropdown"]') ||
                              document.querySelector('[class*="SlotBooking_slotHeader"] [style*="z-index: 999"]') ||
                              document.querySelector('div[style*="z-index: 999"]');
          if (menuContainer) {
            var opts = Array.from(menuContainer.querySelectorAll('*')).filter(function(el) {
              var t = el.textContent.trim();
              return t === valStr && (el.children.length === 0 || (el.children.length === 1 && el.firstElementChild.children.length === 0));
            });
            if (opts.length > 0) return opts[0];
          }

          var all = Array.from(document.querySelectorAll('*')).filter(function(el) {
            var t = el.textContent.trim();
            return t === valStr && el !== input && !el.closest('table') && !el.closest('[class*="DesktopCalender"]') &&
                   (el.children.length === 0 || (el.children.length === 1 && el.firstElementChild.children.length === 0));
          });
          return all[all.length - 1] || null;
        }

        function fireReactClickOnOption(optionEl) {
          if (!optionEl) return false;
          var candidates = [optionEl, optionEl.parentElement];
          for (var i = 0; i < candidates.length; i++) {
            var el = candidates[i];
            if (!el) continue;
            var key = Object.keys(el).find(function(k) { return k.startsWith('__reactProps') || k.startsWith('__reactEventHandlers'); });
            if (key && el[key] && typeof el[key].onClick === 'function') {
              try {
                console.log('[TTD Bridge] Invoking React onClick on option:', el.tagName, el.className, el.textContent.trim());
                el[key].onClick({
                  isTrusted: true,
                  nativeEvent: { isTrusted: true, button: 0 },
                  preventDefault: function() {},
                  stopPropagation: function() {},
                  target: el,
                  currentTarget: el
                });
                return true;
              } catch (err) {
                console.warn('[TTD Bridge] Option onClick error:', err);
              }
            }
          }

          try {
            optionEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window, pointerType: 'mouse' }));
            optionEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
            optionEl.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window, pointerType: 'mouse' }));
            optionEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
            optionEl.click();
          } catch (e) {}

          return true;
        }

        var target = findTargetOption(desiredStr);

        if (!target) {
          var candidates = [input, input.parentElement, input.parentElement ? input.parentElement.querySelector('img') : null];
          var opened = false;
          for (var i = 0; i < candidates.length; i++) {
            var el = candidates[i];
            if (!el) continue;
            var key = Object.keys(el).find(function(k) { return k.startsWith('__reactProps'); });
            if (key && el[key] && typeof el[key].onClick === 'function') {
              try {
                console.log('[TTD Bridge] Opening dropdown via React onClick on:', el.tagName, el.className);
                el[key].onClick({
                  isTrusted: true,
                  nativeEvent: { isTrusted: true },
                  preventDefault: function() {},
                  stopPropagation: function() {},
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

          var startFind = Date.now();
          while (Date.now() - startFind < 1500) {
            target = findTargetOption(desiredStr);
            if (target) break;
            await new Promise(function(r) { setTimeout(r, 40); });
          }
        }

        if (!target) {
          console.warn('[TTD Bridge] Desired count', desiredStr, 'not found, checking available options...');
          var menuContainer = input.parentElement?.querySelector('[style*="z-index: 999"], [style*="z-index"], [class*="dropdown"]') ||
                                document.querySelector('div[style*="z-index: 999"]');
          var allOpts = menuContainer ? Array.from(menuContainer.querySelectorAll('*')).filter(function(el) {
            var n = parseInt(el.textContent.trim(), 10);
            return !isNaN(n) && n >= 1 && n <= 10 && (el.children.length === 0 || (el.children.length === 1 && el.firstElementChild.children.length === 0));
          }) : [];
          if (allOpts.length > 0) {
            allOpts.sort(function(a, b) { return parseInt(b.textContent.trim(), 10) - parseInt(a.textContent.trim(), 10); });
            target = allOpts.find(function(el) { return parseInt(el.textContent.trim(), 10) <= desiredCount; }) || allOpts[0];
            console.log('[TTD Bridge] Selected best available option:', target.textContent.trim());
          }
        }

        if (target) {
          console.log('[TTD Bridge] Clicking option:', target.tagName, target.className, target.textContent.trim());
          fireReactClickOnOption(target);
        } else {
          console.warn('[TTD Bridge] Option not found for count:', desiredStr);
        }

        var startVerify = Date.now();
        while (Date.now() - startVerify < 800) {
          if (String(input.value).trim() === desiredStr) break;
          await new Promise(function(r) { setTimeout(r, 40); });
        }

        if (String(input.value).trim() !== desiredStr && target) {
          console.log('[TTD Bridge] Retrying option click once...');
          fireReactClickOnOption(target);
          var startVerify2 = Date.now();
          while (Date.now() - startVerify2 < 600) {
            if (String(input.value).trim() === desiredStr) break;
            await new Promise(function(r) { setTimeout(r, 40); });
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
        var a = normalizeOptionText(actual);
        var b = normalizeOptionText(expected);
        if (!a || !b) return false;
        if (a === b) return true;
        var genders = ["male", "female", "transgender"];
        if (genders.includes(a) || genders.includes(b)) {
          return a === b;
        }
        var isAadhaarA = a.includes("aadhar") || a.includes("aadhaar");
        var isAadhaarB = b.includes("aadhar") || b.includes("aadhaar");
        if (isAadhaarA && isAadhaarB) return true;
        if (a.includes("passport") && b.includes("passport")) return true;
        if (a.includes("voter") && b.includes("voter")) return true;
        if (b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
        return false;
      }

      async function selectDropdownInMainWorld(value) {
        var input = document.querySelector('[data-ttd-target="active"]');
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

          var candidates = [
            input,
            input.parentElement,
            input.parentElement?.parentElement,
            input.parentElement?.querySelector('img')
          ];

          function findOptionsInMainWorld(valStr) {
            var wrapper = input.parentElement;

            // 1. Instant direct option discovery (fastest path from previous commit)
            var direct = Array.from(wrapper ? wrapper.querySelectorAll('[class*="floatingDropdown_listItem"]') : []);
            if (direct.length === 0) {
              direct = Array.from(document.querySelectorAll('[class*="floatingDropdown_listItem"]'));
            }
            if (direct.length > 0) {
              var matchDirect = direct.filter(function(el) { return matchOptionText(el.textContent, valStr); });
              if (matchDirect.length > 0) return matchDirect;

              var s0 = String(valStr || '').toLowerCase();
              if (s0.includes('aadhaar') || s0.includes('aadhar')) {
                var aadh = direct.filter(function(el) { var t = el.textContent.toLowerCase(); return t.includes('aadhaar') || t.includes('aadhar'); });
                if (aadh.length > 0) return aadh;
                return [direct[0]];
              }
              if (s0.includes('passport')) {
                var pass = direct.filter(function(el) { return el.textContent.toLowerCase().includes('passport'); });
                if (pass.length > 0) return pass;
              }
              return direct;
            }

            // 2. Fallback to container leaves if CSS modules hash differs
            var menuContainer = (wrapper ? wrapper.querySelector('[style*="z-index: 999"], [style*="z-index"], [class*="dropdown"]') : null) ||
                                (wrapper && wrapper.parentElement ? wrapper.parentElement.querySelector('[style*="z-index: 999"], [style*="z-index"], [class*="dropdown"]') : null);
            if (menuContainer) {
              var allLeaves = Array.from(menuContainer.querySelectorAll('*')).filter(function(el) {
                var t = el.textContent ? el.textContent.trim() : "";
                return t && (el.children.length === 0 || (el.children.length === 1 && el.firstElementChild.children.length === 0));
              });
              var matching = allLeaves.filter(function(el) { return matchOptionText(el.textContent, valStr); });
              if (matching.length > 0) return matching;

              var s = String(valStr || '').toLowerCase();
              if (s.includes('aadhaar') || s.includes('aadhar')) {
                var aadhaarOpts = allLeaves.filter(function(el) {
                  var t = el.textContent.toLowerCase();
                  return t.includes('aadhaar') || t.includes('aadhar');
                });
                if (aadhaarOpts.length > 0) return aadhaarOpts;
                if (allLeaves.length > 0) return [allLeaves[0]];
              }
              if (s.includes('passport')) {
                var passOpts = allLeaves.filter(function(el) { return el.textContent.toLowerCase().includes('passport'); });
                if (passOpts.length > 0) return passOpts;
              }
            }
            return [];
          }

          // 1. Check if options are already open
          var options = findOptionsInMainWorld(value);

          // 2. Try candidates with rapid 40ms checks to find the one that opens the menu
          if (!options || options.length === 0) {
            for (var i = 0; i < candidates.length; i++) {
              var c = candidates[i];
              if (!c) continue;
              var key = Object.keys(c).find(function(k) { return k.startsWith('__reactProps'); });
              if (key && c[key]) {
                var p = c[key];
                if (typeof p.onClick === 'function') {
                  console.log('[TTD Bridge] Firing React onClick to open dropdown on:', c.tagName);
                  p.onClick({ isTrusted: true, nativeEvent: { isTrusted: true }, preventDefault: function() {}, stopPropagation: function() {}, target: c, currentTarget: c });
                } else if (typeof p.onMouseDown === 'function') {
                  console.log('[TTD Bridge] Firing React onMouseDown to open dropdown on:', c.tagName);
                  p.onMouseDown({ isTrusted: true, nativeEvent: { isTrusted: true }, preventDefault: function() {}, stopPropagation: function() {}, target: c, currentTarget: c });
                }
              }

              // Rapid 40ms check for options
              var startWait = Date.now();
              while (Date.now() - startWait < 40) {
                await new Promise(function(r) { setTimeout(r, 10); });
                options = findOptionsInMainWorld(value);
                if (options && options.length > 0) break;
              }

              if (options && options.length > 0) break;
            }
          }

          if (options && options.length > 0) {
            var target = options.find(function(el) { return matchOptionText(el.textContent, value); }) || options[0];
            if (target) {
              console.log('[TTD Bridge] Clicking option:', target.textContent.trim());
              var propKey = Object.keys(target).find(function(k) { return k.startsWith('__reactProps'); }) || 
                            Object.keys(target.parentElement).find(function(k) { return k.startsWith('__reactProps'); });
              var propsEl = target[propKey] ? target : target.parentElement;
              if (propsEl && propsEl[propKey]?.onClick) {
                propsEl[propKey].onClick({ isTrusted: true, nativeEvent: { isTrusted: true }, preventDefault: function() {}, stopPropagation: function() {}, target: propsEl, currentTarget: propsEl });
              } else {
                target.click();
              }
            }
          }

          // Snappy 60ms verification wait exactly as previous commit
          if (!matchOptionText(input.value, value)) {
            var startVerify = Date.now();
            while (Date.now() - startVerify < 60) {
              await new Promise(function(r) { setTimeout(r, 10); });
              if (matchOptionText(input.value, value)) break;
            }
          }

          return matchOptionText(input.value, value);
        } finally {
          var isSuccess = matchOptionText(input.value, value);
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
  `;
  (document.head || document.documentElement).appendChild(script);
}
ensurePageBridge();
const SLOT_ADD_WAIT_MS = 100;
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

// The dropdown option <li> elements use CSS-modules classes with a hashed
// suffix (e.g. "floatingDropdown_listItem__tU_5x"), so match by prefix.
const DROPDOWN_OPTION_SELECTOR = '[class*="floatingDropdown_listItem"]';
const CONTINUE_BUTTON_SELECTOR = [
  'button[class*="pilgrimDetails_continue-btn"]',
  'button[class*="sevaReview_confirmButton"]',
].join(", ");
const CONTINUE_TEXT_PATTERN = /^(continue|confirm|proceed)$/i;
const PAY_NOW_BUTTON_SELECTOR = 'button[class*="ReviewDetails_desktopPaynowButton"]';
const PAY_NOW_TEXT_PATTERN = /^pay\s*now$/i;
const GENERATE_BUTTON_SELECTOR = "button";
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

const fireFullClickSequence = simulateUserClick;

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

  const bridgeResult = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener('__TTD_DROPDOWN_SELECTED__', onDone);
      inputEl.removeAttribute('data-ttd-target');
      resolve(matchOptionText(inputEl.value, value));
    }, 350);

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
    // 1. Direct CSS-modules class match (instant)
    let direct = Array.from(wrapper?.querySelectorAll('[class*="floatingDropdown_listItem"]') || []);
    if (direct.length === 0) {
      direct = Array.from(document.querySelectorAll('[class*="floatingDropdown_listItem"]'));
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
        container.querySelectorAll('[class*="floatingDropdown_listItem"], [class*="listItem"], [role="option"], li, div, span')
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

  // Fast attempts with short 180ms waits
  if (!options) {
    fireReactClick(inputEl);
    options = await waitForCondition(findOptions, 180, 15);
  }

  if (!options) {
    const icon = wrapper?.querySelector('img[src*="dropdown"], img[alt*="dropdown"], svg') ||
                 wrapper?.parentElement?.querySelector('img[src*="dropdown"], img[alt*="dropdown"], svg');
    if (icon) {
      fireReactClick(icon);
      options = await waitForCondition(findOptions, 180, 15);
    }
  }

  if (!options && wrapper) {
    fireReactClick(wrapper);
    options = await waitForCondition(findOptions, 150, 15);
  }

  if (!options) {
    console.warn(`[TTD Autofill] "${label}" dropdown did not open for value "${value}".`);
    return false;
  }

  const target = options.find((opt) => matchOptionText(opt.textContent, value)) || options[0];
  if (!target) {
    try { document.body.click(); } catch (e) {}
    return false;
  }

  fireReactClick(target);
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

function findContinueLikeButton() {
  const candidates = Array.from(document.querySelectorAll(`${CONTINUE_BUTTON_SELECTOR}, button, [role="button"]`));
  return candidates.find((button) => CONTINUE_TEXT_PATTERN.test(getButtonText(button))) || null;
}

function clickButtonIfEnabled(btn) {
  if (!btn || btn.disabled || btn.getAttribute("aria-disabled") === "true") return false;
  fireFullClickSequence(btn);
  return true;
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
    fireReactClick(btn);
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
  return BOOKING_ERROR_PATTERN.test(document.body?.innerText || "");
}

const RETRY_BUTTON_TEXT_PATTERN = /^retry$/i;
let bookingErrorDialogHandled = false;

function findRetryButton() {
  return (
    Array.from(document.querySelectorAll("button")).find((b) =>
      RETRY_BUTTON_TEXT_PATTERN.test((b.textContent || "").trim())
    ) || null
  );
}

// Detecting the booking-in-progress error and clearing our own internal
// state isn't enough on its own - TTD's dialog stays visually on screen,
// blocking the page, until its own Retry button is clicked. This clicks it
// once per dialog appearance (not on every polling tick) and clears our
// state alongside it.
function handleBookingErrorIfPresent(reason) {
  if (!hasBookingErrorMessage()) {
    bookingErrorDialogHandled = false;
    return false;
  }
  if (!bookingErrorDialogHandled) {
    bookingErrorDialogHandled = true;
    const retryBtn = findRetryButton();
    if (retryBtn) {
      fireFullClickSequence(retryBtn);
      console.log("[TTD Autofill] Clicked Retry to dismiss the booking-in-progress dialog.");
    }
    showToast(
      "TTD says this booking is already in progress. Dismissed the dialog and cleared extension state.",
      "error"
    );
  }
  if (!autofillActive) clearBookingSessionState(reason);
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
  if (followUpContinueWatcherActive) return;

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
const CALENDAR_PICKED_DONE_KEY = "ttdCalendarPickedDoneFor";

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

async function selectTicketCount(desiredTickets) {
  if (!desiredTickets || desiredTickets <= 1) return true;

  console.log(`[TTD Autofill] Requesting ticket count: ${desiredTickets}`);
  showToast(`Selecting ${desiredTickets} tickets...`, "info");

  // Wait for ticket input to appear in DOM
  const findTicketInput = () => {
    return document.querySelector('.SlotBooking_slotHeader__bV77N input.floating-input') ||
           document.querySelector('[class*="SlotBooking_slotHeader"] input') ||
           document.querySelector('input.floating-input[readonly]');
  };

  const ticketInput = await waitForCondition(findTicketInput, 4000, 40);
  if (!ticketInput) {
    console.warn("[TTD Autofill] Ticket input not found in DOM");
    return false;
  }

  if (String(ticketInput.value).trim() === String(desiredTickets)) {
    console.log(`[TTD Autofill] Ticket count is already ${desiredTickets}`);
    return true;
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener("__TTD_TICKETS_SELECTED__", onDone);
      console.warn("[TTD Autofill] Ticket selection bridge timed out (2.5s)");
      resolve(String(ticketInput.value).trim() === String(desiredTickets));
    }, 2500);

    function onDone(e) {
      clearTimeout(timer);
      window.removeEventListener("__TTD_TICKETS_SELECTED__", onDone);
      console.log("[TTD Autofill] Bridge confirmed ticket count:", e.detail);
      resolve(e.detail?.success || true);
    }

    window.addEventListener("__TTD_TICKETS_SELECTED__", onDone);
    window.dispatchEvent(new CustomEvent("__TTD_SELECT_TICKETS__", { detail: { count: desiredTickets } }));
  });
}

// 1. Calendar & Slot Auto-Picker (Pre-Form Speed)
async function autoPickCalendarAndSlot(customConfig = null) {
  const prefs = await chrome.storage.local.get([SNIPER_CONFIG_KEY, GROUPS_STORAGE_KEY]);
  const config = customConfig || prefs[SNIPER_CONFIG_KEY] || {};
  if (config.autoPickerEnabled === false && !customConfig) return { skipped: true };

  // Detect calendar page
  const hasCalendarElements =
    document.querySelector('[class*="DesktopCalender"]') ||
    document.querySelector('[class*="SlotBooking"]') ||
    document.querySelector('table td[id*="/"]') ||
    document.querySelector('[class*="sevaHeading"]') ||
    document.querySelector('button[value*="0"]') ||
    Array.from(document.querySelectorAll("div, span")).some((el) =>
      /darshan\s+slots|select\s+any\s+1\s+slot/i.test(el.textContent)
    );

  if (!hasCalendarElements) {
    return { ok: false, error: "Calendar not visible on this page." };
  }

  showToast("Calendar detected! Auto-picker initiating...", "info");

  // Step 1: Date selection
  const targetDateStr = config.targetDate?.trim();
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
      await sleep(150);
    }
  } else {
    showToast(
      targetDateStr
        ? `Target date ${targetDateStr} is full or not available.`
        : "No available dates found in calendar.",
      "error"
    );
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

  console.log(`[TTD Autofill] Desired ticket count: ${desiredTickets}`);
  if (desiredTickets > 1) {
    const ticketChanged = await selectTicketCount(desiredTickets);
    if (!ticketChanged) {
      console.warn(`[TTD Autofill] Ticket count is not yet ${desiredTickets}. Retrying once...`);
      await sleep(150);
      await selectTicketCount(desiredTickets);
    }
    // Give TTD time to fetch and re-render slot cards for desiredTickets
    await sleep(350);
  }

  // Step 3: Wait for slot cards and select preferred or first available slot
  let slotPicked = false;
  let attempts = 0;
  const pref = config.preferredSlot;

  while (!slotPicked && attempts < 25) {
    attempts++;
    await sleep(60);

    // 1. Direct match by button value (e.g. "1600", "0900", "1000")
    if (pref && pref !== "any") {
      const directBtn = document.querySelector(`button[value="${pref}"]`);
      if (directBtn) {
        const card = directBtn.closest('[style*="cursor: pointer"]') || directBtn.parentElement;
        const countEl = card?.querySelector('[class*="SlotBooking_availableSlotSection"] div');
        const count = countEl ? parseInt(countEl.textContent.trim(), 10) : 1;
        if (count > 0 || !countEl) {
          fireReactClick(directBtn);
          if (card) fireReactClick(card);
          slotPicked = true;
          showToast(`Selected preferred slot (${pref})`, "success");
          break;
        }
      }
    }

    // 2. Scan slot cards
    const slotCards = Array.from(
      document.querySelectorAll('[class*="SlotBooking_availableSlotSection"]')
    ).map((sec) => sec.closest('[style*="cursor: pointer"]') || sec.parentElement);

    if (slotCards.length === 0) continue;

    const availableSlots = [];
    slotCards.forEach((card) => {
      if (!card) return;
      const countEl = card.querySelector('[class*="SlotBooking_availableSlotSection"] div');
      const count = parseInt(countEl?.textContent?.trim() || "0", 10);
      const radioBtn = card.querySelector("button[value]");
      const radioVal = radioBtn?.value || "";
      const text = card.textContent || "";
      if (count > 0 || radioBtn) {
        availableSlots.push({ card, count, radioBtn, radioVal, text });
      }
    });

    if (availableSlots.length === 0) continue;

    let targetSlot = null;
    if (pref && pref !== "any") {
      targetSlot = availableSlots.find(
        (s) => s.radioVal === pref || s.text.toLowerCase().includes(pref.toLowerCase())
      );
    }

    if (!targetSlot) {
      targetSlot = availableSlots[0];
    }

    if (targetSlot) {
      if (targetSlot.radioBtn) fireReactClick(targetSlot.radioBtn);
      if (targetSlot.card) fireReactClick(targetSlot.card);
      slotPicked = true;
      showToast(`Auto-selected slot with ${targetSlot.count} seats available`, "success");
      break;
    }
  }

  if (!slotPicked) {
    showToast("Slots took too long to load or are full.", "error");
    return { ok: false, error: "Slots unavailable" };
  }

  // Step 4: Click Continue button to advance to Pilgrim details
  if (config.autoContinueCalendar !== false) {
    await sleep(60);
    const continueBtn =
      document.querySelector(".SlotBooking_purpleDesktopButton__eQIFp") ||
      document.querySelector('[class*="purpleDesktopButton"]') ||
      document.querySelector('[class*="SlotBooking_purple"]') ||
      Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim().toLowerCase() === "continue");

    if (continueBtn && !continueBtn.disabled) {
      fireReactClick(continueBtn);
      showToast("Slot booked! Entering Pilgrim Details...", "success");
      return { ok: true, continued: true };
    }
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

  // 4. Other services (e.g. Arjitha Sevas, Accommodation, Homam)
  const normL = l.replace(/[^a-z0-9]/g, "");
  const normT = t.replace(/[^a-z0-9]/g, "");
  return normL.includes(normT) || normT.includes(normL);
}

function findSevaTile(targetSeva) {
  if (!targetSeva || targetSeva === "none") return null;

  // 1. Look for .services_iconList container elements
  const tiles = Array.from(document.querySelectorAll('[class*="services_iconList"]'));
  for (const tile of tiles) {
    const labelEl = tile.querySelector('[class*="services_label"]') || tile;
    if (matchesSevaLabel(labelEl.textContent || "", targetSeva)) {
      return labelEl;
    }
  }

  // 2. Fallback: Search inside services containers
  const containers = Array.from(document.querySelectorAll('[class*="services_flex"], [class*="services_container"]'));
  for (const cont of containers) {
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
  if (lastClickedTime && Date.now() - lastClickedTime < 8000) {
    console.log("[TTD Autofill] Target Seva tile already clicked recently, preventing duplicate clicks.");
    return true;
  }

  const targetEl = findSevaTile(targetSeva);
  if (!targetEl) {
    return false;
  }

  // Synchronous lock before dispatching click
  window.__TTD_SEVA_NAVIGATING__ = true;
  sessionStorage.setItem("ttdSevaClickedTime", String(Date.now()));

  showToast(`Opening ${targetSeva}...`, "success");
  console.log("[TTD Autofill] Auto-clicking target Seva tile:", targetSeva);

  try {
    targetEl.scrollIntoView({ behavior: "instant", block: "center" });
  } catch (e) {}

  // Single clean native click
  try {
    targetEl.click();
  } catch (err) {
    console.error("[TTD Autofill] Error clicking seva tile:", err);
  }

  return true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (window[CONTENT_SCRIPT_INSTANCE_KEY] !== CONTENT_SCRIPT_INSTANCE) return;

  if (message.action === "TRIGGER_CALENDAR_PICKER") {
    autoPickCalendarAndSlot(message.config)
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
    // If on dashboard, click seva tile; if on calendar, pick calendar and slot
    if (document.querySelector('[class*="services_iconList"]')) {
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
    if (getPilgrimFieldArrays().name.length === 0) return;
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
    sessionStorage.removeItem(CALENDAR_PICKED_DONE_KEY);

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
    // If navigation already triggered or clicked recently, disconnect observer & exit
    const lastClickedTime = parseInt(sessionStorage.getItem("ttdSevaClickedTime") || "0", 10);
    if (window.__TTD_SEVA_NAVIGATING__ || (lastClickedTime && Date.now() - lastClickedTime < 8000)) {
      if (sevaObserver) {
        sevaObserver.disconnect();
        sevaObserver = null;
      }
      return;
    }

    // Must be on dashboard with services grid
    const hasServiceGrid = document.querySelector('[class*="services_iconList"]');
    if (!hasServiceGrid) {
      return;
    }

    if (isChecking) return;
    isChecking = true;

    try {
      const config = cachedSniperConfig || (await chrome.storage.local.get([SNIPER_CONFIG_KEY]))[SNIPER_CONFIG_KEY] || {};
      if (!config.autoClickTargetSeva || !config.targetSeva || config.targetSeva === "none") return;

      const clicked = autoClickTargetSevaTile(config.targetSeva);
      if (clicked) {
        // Disconnect immediately on success to eliminate any duplicate event triggers
        if (sevaObserver) {
          sevaObserver.disconnect();
          sevaObserver = null;
        }
      }
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
    // On back navigation, allow re-click only if last click was > 8s ago
    const lastClickedTime = parseInt(sessionStorage.getItem("ttdSevaClickedTime") || "0", 10);
    if (Date.now() - lastClickedTime > 8000) {
      window.__TTD_SEVA_NAVIGATING__ = false;
      sessionStorage.removeItem("ttdSevaClickedTime");
      if (!sevaObserver) {
        sevaObserver = new MutationObserver(() => tryClickSeva());
        sevaObserver.observe(document.documentElement, { childList: true, subtree: true });
      }
      tryClickSeva();
    }
  });
}

// 3. Calendar Auto-Pick Observer
async function maybeAutoPickCalendar() {
  let isPicking = false;

  const tryCalendarPick = async () => {
    if (isPicking) return;
    const calendarEl =
      document.querySelector('.DesktopCalender_container__mi7nR') ||
      document.querySelector('[class*="DesktopCalender_container"]') ||
      document.querySelector('.SlotBooking_slotBookingDesktop__sAffl') ||
      document.querySelector('[class*="SlotBooking_slotBookingDesktop"]') ||
      document.querySelector('[class*="SlotBooking_slotBookingMobile"]') ||
      document.querySelector('table td[id*="/"]');

    if (calendarEl) {
      sessionStorage.removeItem("ttdSevaClickedTime");
      window.__TTD_SEVA_NAVIGATING__ = false;
    }

    if (!calendarEl) return;

    // Skip if already on pilgrim details page
    if (document.querySelector('button[class*="pilgrimDetails_continue-btn"]')) return;

    isPicking = true;
    try {
      console.log('[TTD Autofill] Calendar detected! Running autoPickCalendarAndSlot...');
      await autoPickCalendarAndSlot();
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
  if (!config || !config.sniperEnabled || !config.dropTime) return;

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
  maybeAutoClickTargetSeva();
  maybeAutoPickCalendar();
  initSniperScheduler();
}
