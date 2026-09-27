const STORAGE_KEY = "ttdGroups";
const CLICK_CONTINUE_PREF_KEY = "ttdClickContinuePref";
const PAYMENT_METHOD_PREF_KEY = "ttdPaymentMethodPref";
const CARD_DETAILS_PREF_KEY = "ttdCardDetailsPref";

function sendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response);
    });
  });
}

async function triggerAutofillFromShortcut() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes("ttdevasthanams.ap.gov.in")) return;

  const stored = await chrome.storage.local.get([
    STORAGE_KEY,
    CLICK_CONTINUE_PREF_KEY,
    PAYMENT_METHOD_PREF_KEY,
    CARD_DETAILS_PREF_KEY,
  ]);
  const groups = stored[STORAGE_KEY] || [];
  const clickContinue = stored[CLICK_CONTINUE_PREF_KEY] === undefined ? true : !!stored[CLICK_CONTINUE_PREF_KEY];
  const clickPayNow = clickContinue;
  const paymentMethod = stored[PAYMENT_METHOD_PREF_KEY] || "upi";
  const cardDetails = stored[CARD_DETAILS_PREF_KEY] || {};
  const selected = [];
  groups.forEach((group) => {
    group.pilgrims.forEach((pilgrim) => {
      if (pilgrim.selected && pilgrim.name.trim()) selected.push({ pilgrim, group });
    });
  });
  if (selected.length === 0) return;

  const message = {
    action: "AUTOFILL_TTD",
    general: selected[0].group.general,
    pilgrims: selected.map(({ pilgrim }) => pilgrim),
    clickContinue,
    clickPayNow,
    paymentMethod,
    cardDetails,
  };

  let response = await sendMessageToTab(tab.id, message);
  if (!response) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      response = await sendMessageToTab(tab.id, message);
    } catch (err) {
      return;
    }
  }
  console.debug("[TTD Autofill] Keyboard autofill response:", response);
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "autofill-selected") triggerAutofillFromShortcut();
});