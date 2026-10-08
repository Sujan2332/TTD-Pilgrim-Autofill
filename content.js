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
      if (window.__TTD_BRIDGE_LOADED__) return;
      window.__TTD_BRIDGE_LOADED__ = true;
      function triggerReactClick(el) {
        if (!el) return false;
        var key = Object.keys(el).find(function(k) { return k.startsWith("__reactProps"); });
        if (key && el[key] && typeof el[key].onClick === "function") {
          try {
            el[key].onClick({
              isTrusted: true,
              nativeEvent: { isTrusted: true },
              preventDefault: function() {},
              stopPropagation: function() {},
              target: el,
              currentTarget: el,
            });
            return true;
          } catch (err) {
            console.warn("[TTD Bridge] React onClick error:", err);
          }
        }
        el.click();
        return true;
      }
      window.addEventListener("__TTD_REACT_CLICK__", function(e) {
        if (triggerReactClick(e.target)) {
          e.preventDefault();
        }
      }, true);
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
  await sleep(15);

  // ---- Primary: bulk execCommand('insertText') ----
  el.select();  // select any existing text so insertText replaces it
  document.execCommand('insertText', false, String(value));
  await sleep(25);

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
  return {
    name: findInputsByLabel((n) => n === "name"),
    age: findInputsByLabel((n) => n === "age"),
    gender: findInputsByLabel((n) => n === "gender"),
    idType: findInputsByLabel((n) => n === "photoidproof"),
    idNumber: findInputsByLabel((n) => n === "photoidnumber"),
  };
}

function fireFullClickSequence(el) {
  const rect = el.getBoundingClientRect();
  const x = Math.max(0, rect.left + rect.width / 2);
  const y = Math.max(0, rect.top + rect.height / 2);
  const opts = {
    bubbles: true, cancelable: true, view: window,
    clientX: x, clientY: y, screenX: x, screenY: y,
    button: 0, buttons: 1,
  };
  const pointerOpts = { ...opts, pointerId: 1, pointerType: "mouse" };

  try {
    const touch = new Touch({ identifier: Date.now(), target: el, clientX: x, clientY: y, screenX: x, screenY: y });
    el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, changedTouches: [touch], targetTouches: [touch], touches: [touch] }));
    el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, changedTouches: [touch], targetTouches: [touch], touches: [touch] }));
  } catch (e) {
    // TouchEvent might not be supported on all desktop environments, ignore if so.
  }

  el.dispatchEvent(new PointerEvent("pointerdown", pointerOpts));
  el.dispatchEvent(new MouseEvent("mousedown", opts));
  el.focus();
  el.dispatchEvent(new PointerEvent("pointerup", pointerOpts));
  el.dispatchEvent(new MouseEvent("mouseup", opts));
  el.click();
}

// Bridges React synthetic events in the page context.
function fireReactClick(el) {
  if (!el) return;
  ensurePageBridge();
  el.focus();
  const evt = new CustomEvent("__TTD_REACT_CLICK__", { bubbles: true, cancelable: true });
  el.dispatchEvent(evt);
  if (!evt.defaultPrevented) {
    el.click();
  }
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

// Finds the dropdown list that appears after clicking a custom-dropdown
// input, and clicks the <li> option whose text matches `value`.
// TTD's current build requires direct React onClick triggering with trusted
// mock events. We dispatch __TTD_REACT_CLICK__ which page-bridge.js handles
// in the page's MAIN world.
async function selectDropdownOption(inputEl, value, label) {
  if (!value) return false;

  const wrapper = inputEl.parentElement;

  // Search for dropdown options in the wrapper first, then document-wide.
  const findOptions = () => {
    // 1. Original CSS-modules selector inside the wrapper
    let found = Array.from(wrapper.querySelectorAll(DROPDOWN_OPTION_SELECTOR));
    if (found.length > 0) return found;

    // 2. CSS-modules selector anywhere in the document (portal rendering)
    found = Array.from(document.querySelectorAll(DROPDOWN_OPTION_SELECTOR));
    if (found.length > 0) return found;

    return null;
  };

  // Attempt 1: click the input itself via React bridge
  fireReactClick(inputEl);
  let options = await waitForCondition(findOptions, 1200, 20);

  // Attempt 2: click the dropdown arrow icon
  if (!options) {
    const icon =
      wrapper.querySelector('img[alt="dropdown icon"]') ||
      wrapper.querySelector('img[src*="dropdown"]') ||
      wrapper.querySelector('svg');
    if (icon) {
      fireReactClick(icon);
      options = await waitForCondition(findOptions, 1200, 20);
    }
  }

  // Attempt 3: click the wrapper div itself
  if (!options) {
    fireReactClick(wrapper);
    options = await waitForCondition(findOptions, 800, 20);
  }

  if (!options) {
    console.warn(
      `[TTD Autofill] "${label}" dropdown never opened (no options found) for value "${value}".`
    );
    return false;
  }

  const target = options.find((opt) => matchOptionText(opt.textContent, value));

  if (target) {
    fireReactClick(target);
    await sleep(60);
    console.log(`[TTD Autofill] "${label}" set to "${value}".`);
    return true;
  }

  console.warn(
    `[TTD Autofill] "${label}" dropdown opened but no option matched "${value}". ` +
    `Options seen: ${options.map((o) => o.textContent.trim()).join(", ")}`
  );
  document.body.click(); // close the dropdown so the page isn't left stuck open
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

  // --- Re-query fields for dropdowns ---
  await sleep(30);

  await safe(async () => {
    const fieldsNow = getPilgrimFieldArrays();
    const el = fieldsNow.gender[index];
    if (el && pilgrim.gender) await selectDropdownOption(el, pilgrim.gender, `Gender (${pilgrim.name})`);
  }, "Gender");

  await safe(async () => {
    await sleep(40);
    const fieldsNow = getPilgrimFieldArrays();
    const el = fieldsNow.idType[index];
    if (el && pilgrim.idType) await selectDropdownOption(el, pilgrim.idType, `Photo ID Proof (${pilgrim.name})`);
  }, "Photo ID Proof");

  await safe(async () => {
    // idNumber is typically disabled until idType is chosen - poll rapidly so
    // it fills the moment React enables it.
    if (pilgrim.idNumber) {
      const enabled = await waitForCondition(() => {
        const current = getPilgrimFieldArrays().idNumber[index];
        return current && !current.disabled ? current : null;
      }, 2000, 20);
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (window[CONTENT_SCRIPT_INSTANCE_KEY] !== CONTENT_SCRIPT_INSTANCE) return;
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

    // Allow auto-run to trigger again when the user leaves the form and later
    // returns to the same SPA URL.
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

if (window[CONTENT_SCRIPT_INSTANCE_KEY] === CONTENT_SCRIPT_INSTANCE) {
  resumeFollowUpContinue();
  maybeAutoRun();
  watchBookingFlowExit();
}
