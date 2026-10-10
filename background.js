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

// Atomic Server Clock Synchronization
async function measureServerDrift() {
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    try {
      const res = await fetch(`https://ttdevasthanams.ap.gov.in/?_t=${t0}_${i}`, {
        method: "HEAD",
        cache: "no-store",
      });
      const t1 = Date.now();
      const rtt = t1 - t0;
      const dateHeader = res.headers.get("date");
      if (dateHeader) {
        const serverSecMs = new Date(dateHeader).getTime();
        const estimatedServerMs = serverSecMs + Math.round(rtt / 2);
        const drift = estimatedServerMs - t1;
        samples.push({ drift, rtt, serverTime: estimatedServerMs });
      }
    } catch (e) {
      // ignore individual sample error
    }
  }

  if (samples.length === 0) {
    return { ok: false, error: "Unable to reach TTD server for clock calibration" };
  }

  samples.sort((a, b) => a.drift - b.drift);
  const medianSample = samples[Math.floor(samples.length / 2)];
  return {
    ok: true,
    drift: medianSample.drift,
    rtt: medianSample.rtt,
    serverTime: medianSample.serverTime,
    samplesCount: samples.length,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "GET_SERVER_TIME") {
    measureServerDrift().then(sendResponse);
    return true; // async sendResponse
  }
});