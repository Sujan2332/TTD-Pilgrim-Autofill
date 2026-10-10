const INITIAL_GROUP_COUNT = 3;
const PILGRIMS_PER_GROUP = 5;
const STORAGE_KEY = "ttdGroups";
const CLICK_CONTINUE_PREF_KEY = "ttdClickContinuePref";
const PAYMENT_METHOD_PREF_KEY = "ttdPaymentMethodPref";
const CARD_DETAILS_PREF_KEY = "ttdCardDetailsPref";
const AUTO_RUN_PREF_KEY = "ttdAutoRunOnLoad";
const SNIPER_CONFIG_KEY = "ttdSniperConfig";
const ACTIVE_TAB_KEY = "ttdActiveTab";
const SERVER_DRIFT_KEY = "ttdServerDrift";
const POPUP_WIDTH_STORAGE_KEY = "ttdPopupWidth";
const POPUP_WIDTH_DEFAULT = 430;
const POPUP_WIDTH_MIN = 430;
const POPUP_WIDTH_MAX = 500;

function clampPopupWidth(width) {
  return Math.min(POPUP_WIDTH_MAX, Math.max(POPUP_WIDTH_MIN, Math.round(width)));
}

function applyPopupWidth(width) {
  const w = clampPopupWidth(width);
  document.documentElement.style.setProperty("--popup-width", `${w}px`);
  document.documentElement.style.width = `${w}px`;
  document.body.style.width = `${w}px`;
  return w;
}

function initPopupResize(savedWidth) {
  const handle = document.getElementById("popupResizeHandle");
  if (!handle) return;

  if (typeof savedWidth === "number" && savedWidth > POPUP_WIDTH_DEFAULT) {
    applyPopupWidth(savedWidth);
  }

  handle.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = document.body.getBoundingClientRect().width;
    handle.classList.add("is-dragging");
    document.body.classList.add("is-resizing-popup");

    const onMove = (moveEvent) => {
      applyPopupWidth(startWidth + (moveEvent.clientX - startX));
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      handle.classList.remove("is-dragging");
      document.body.classList.remove("is-resizing-popup");
      const finalWidth = applyPopupWidth(document.body.getBoundingClientRect().width);
      if (finalWidth > POPUP_WIDTH_DEFAULT) {
        chrome.storage.local.set({ [POPUP_WIDTH_STORAGE_KEY]: finalWidth });
      } else {
        chrome.storage.local.remove(POPUP_WIDTH_STORAGE_KEY);
        applyPopupWidth(POPUP_WIDTH_DEFAULT);
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

function createEmptyGroup(index) {
  return {
    name: `Group ${index + 1}`,
    general: { email: "", city: "", state: "", country: "", pincode: "" },
    pilgrims: Array.from({ length: PILGRIMS_PER_GROUP }, () => ({
      name: "",
      age: "",
      gender: "",
      idType: "",
      idNumber: "",
      selected: false,
    })),
  };
}

function defaultData() {
  return Array.from({ length: INITIAL_GROUP_COUNT }, (_, index) => createEmptyGroup(index));
}

function getDefaultCardDetails() {
  return {
    cardNumber: "",
    expiry: "",
    cvv: "",
    cardName: "",
  };
}

function loadData() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      resolve(res[STORAGE_KEY] || defaultData());
    });
  });
}

function saveData(groups) {
  chrome.storage.local.set({ [STORAGE_KEY]: groups });
}

// Import schema: an array of groups. Each group is itself an array
// whose FIRST element is the general-details object and whose remaining
// elements (up to 5) are pilgrim objects, e.g.:
// [
//   [ {email,city,state,country,pincode}, {name,age,gender,idType,idNumber}, ... ],
//   [ ... group 2 ... ],
//   [ ... group 3 ... ],
//   [ ... additional groups ... ]
// ]
function parseImportedJson(json) {
  if (!Array.isArray(json)) {
    throw new Error("Expected a top-level array of groups.");
  }

  const groupCount = Math.max(INITIAL_GROUP_COUNT, json.length);
  const groups = Array.from({ length: groupCount }, (_, gi) => {
    const groupArr = json[gi];
    const group = createEmptyGroup(gi);
    if (!Array.isArray(groupArr) || groupArr.length === 0) return group;
    const [general, ...pilgrimList] = groupArr;

    group.general = {
      email: general?.email || "",
      city: general?.city || "",
      state: general?.state || "",
      country: general?.country || "",
      pincode: general?.pincode || "",
    };

    pilgrimList.slice(0, PILGRIMS_PER_GROUP).forEach((p, pi) => {
      group.pilgrims[pi] = {
        name: p?.name || "",
        age: p?.age || "",
        gender: p?.gender || "",
        idType: p?.idType || "",
        idNumber: p?.idNumber || "",
        selected: false,
      };
    });

    return group;
  });

  return groups;
}

function normalizeCardDetails(value) {
  const source = value?.cardDetails && typeof value.cardDetails === "object"
    ? value.cardDetails
    : value;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("Expected a card JSON object with cardNumber, expiry, cvv, and cardName.");
  }

  return {
    cardNumber: String(source.cardNumber || "").trim(),
    expiry: String(source.expiry || "").trim(),
    cvv: String(source.cvv || "").trim(),
    cardName: String(source.cardName || "").trim(),
  };
}

function getCardDetailsFromInputs() {
  return {
    cardNumber: document.querySelector('[data-field="cardNumber"]').value.trim(),
    expiry: document.querySelector('[data-field="expiry"]').value.trim(),
    cvv: document.querySelector('[data-field="cvv"]').value.trim(),
    cardName: document.querySelector('[data-field="cardName"]').value.trim(),
  };
}

function applyCardDetails(cardDetails) {
  document.querySelector('[data-field="cardNumber"]').value = cardDetails.cardNumber;
  document.querySelector('[data-field="expiry"]').value = cardDetails.expiry;
  document.querySelector('[data-field="cvv"]').value = cardDetails.cvv;
  document.querySelector('[data-field="cardName"]').value = cardDetails.cardName;
  chrome.storage.local.set({ [CARD_DETAILS_PREF_KEY]: cardDetails });
}

// Mirrors parseImportedJson's schema for round-tripping data back out.
function exportGroups(groups) {
  return groups.map((group) => [
    { ...group.general },
    ...group.pilgrims.map(({ name, age, gender, idType, idNumber }) => ({
      name,
      age,
      gender,
      idType,
      idNumber,
    })),
  ]);
}

function hasGroupData(groups) {
  return groups.some((group) => {
    const generalHasData = Object.values(group.general).some((value) => String(value || "").trim());
    const pilgrimHasData = group.pilgrims.some((pilgrim) =>
      [pilgrim.name, pilgrim.age, pilgrim.gender, pilgrim.idType, pilgrim.idNumber]
        .some((value) => String(value || "").trim())
    );
    return generalHasData || pilgrimHasData;
  });
}

function updateExportButton(groups) {
  const exportBtn = document.getElementById("exportBtn");
  if (!exportBtn) return;
  const hasData = hasGroupData(groups);
  exportBtn.textContent = hasData ? "Export JSON" : "Download Sample JSON";
  exportBtn.title = hasData
    ? "Export your saved groups as JSON"
    : "Download an example JSON format";
}

function updateGeneralDetailsReminder(group, toggleBtn) {
  const isIncomplete = Object.values(group.general).some((value) => !String(value || "").trim());
  toggleBtn.classList.toggle("needs-attention", isIncomplete);
}

function setStatus(msg, isError = false) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = `status ${isError ? "error" : "success"}`;
  if (msg) setTimeout(() => { el.textContent = ""; }, 3500);
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ __error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}

// The content script only exists in tabs that were (re)loaded after the
// extension itself was last loaded/reloaded. If this extension's code was
// reloaded in chrome://extensions while the TTD tab was already open, that
// tab's old content script gets disconnected and sendMessage fails with
// "receiving end does not exist". Rather than requiring a manual page
// refresh every time, inject the script on demand and retry once.
async function sendAutofillMessage(tab, message) {
  let response = await sendMessageToTab(tab.id, message);
  if (response && response.__error) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    } catch (err) {
      return {
        ok: false,
        error: "Couldn't inject the autofill script into this tab. Reload the TTD page and try again.",
      };
    }
    response = await sendMessageToTab(tab.id, message);
    if (response && response.__error) {
      return {
        ok: false,
        error: "Still couldn't reach the page after re-injecting. Reload the TTD tab manually and try again.",
      };
    }
  }
  return response;
}

function render(groups) {
  const container = document.getElementById("groups");
  container.innerHTML = "";
  const groupTpl = document.getElementById("group-template");
  const pilgrimTpl = document.getElementById("pilgrim-template");

  groups.forEach((group, gi) => {
    const node = groupTpl.content.cloneNode(true);
    const section = node.querySelector(".group");
    const nameInput = node.querySelector(".group-name");
    const toggleBtn = node.querySelector(".toggle-btn");
    const detailsChevron = node.querySelector(".details-chevron");
    const deleteBtn = node.querySelector(".delete-group-btn");
    const groupSelectAll = node.querySelector(".group-select-all");
    const generalDiv = node.querySelector(".general-details");
    const pilgrimsDiv = node.querySelector(".pilgrims");

    const isRequiredGroup = gi < INITIAL_GROUP_COUNT;
    deleteBtn.title = isRequiredGroup ? "Clear this group's data" : "Delete this group";
    deleteBtn.setAttribute("aria-label", deleteBtn.title);
    deleteBtn.addEventListener("click", () => {
      loadData().then((currentGroups) => {
        if (gi >= currentGroups.length) return;
        if (gi < INITIAL_GROUP_COUNT) {
          const groupName = currentGroups[gi].name;
          currentGroups[gi] = createEmptyGroup(gi);
          currentGroups[gi].name = groupName;
        } else {
          currentGroups.splice(gi, 1);
        }
        saveData(currentGroups);
        render(currentGroups);
        setStatus(isRequiredGroup
          ? "Group data cleared. This group is ready for fresh details."
          : "Group deleted successfully.");
      });
    });

    groupSelectAll.addEventListener("change", () => {
      group.pilgrims.forEach((pilgrim) => {
        pilgrim.selected = groupSelectAll.checked;
      });
      saveData(groups);
      render(groups);
    });

    nameInput.value = group.name;
    nameInput.addEventListener("input", () => {
      group.name = nameInput.value;
      saveData(groups);
      updateExportButton(groups);
    });

    toggleBtn.addEventListener("click", () => {
      generalDiv.classList.toggle("open");
      detailsChevron.textContent = generalDiv.classList.contains("open") ? "▴" : "▾";
    });

    generalDiv.querySelectorAll("input[data-field]").forEach((input) => {
      const field = input.dataset.field;
      input.value = group.general[field] || "";
      input.addEventListener("input", () => {
        group.general[field] = input.value;
        saveData(groups);
        updateGeneralDetailsReminder(group, toggleBtn);
        updateExportButton(groups);
      });
    });

    updateGeneralDetailsReminder(group, toggleBtn);

    group.pilgrims.forEach((pilgrim, pi) => {
      const pNode = pilgrimTpl.content.cloneNode(true);
      const row = pNode.querySelector(".pilgrim-row");
      const check = pNode.querySelector(".pilgrim-check");
      check.checked = !!pilgrim.selected;
      row.classList.toggle("selected", !!pilgrim.selected);
      check.addEventListener("change", () => {
        pilgrim.selected = check.checked;
        row.classList.toggle("selected", check.checked);
        saveData(groups);
        updateSelectionCount(groups);
        updateSelectionToggles(groups);
      });

      pNode.querySelectorAll("[data-field]").forEach((input) => {
        const field = input.dataset.field;
        input.value = pilgrim[field] || "";
        input.addEventListener("input", () => {
          pilgrim[field] = input.value;
          saveData(groups);
          updateExportButton(groups);
        });
        input.addEventListener("change", () => {
          pilgrim[field] = input.value;
          saveData(groups);
          updateExportButton(groups);
        });
      });

      pilgrimsDiv.appendChild(pNode);
    });

    container.appendChild(node);
  });

  updateSelectionCount(groups);
  updateSelectionToggles(groups);
  updateExportButton(groups);
}

function handleAddGroup() {
  loadData().then((groups) => {
    groups.push(createEmptyGroup(groups.length));
    saveData(groups);
    render(groups);
    setStatus(`Group ${groups.length} added. You can fill it now.`);
  });
}

function updateSelectionToggles(groups) {
  const allPilgrims = groups.flatMap((group) => group.pilgrims);
  const selectAllBtn = document.getElementById("selectAllBtn");
  if (selectAllBtn) {
    const selectedCount = allPilgrims.filter((pilgrim) => pilgrim.selected).length;
    selectAllBtn.checked = allPilgrims.length > 0 && selectedCount === allPilgrims.length;
    selectAllBtn.indeterminate = selectedCount > 0 && selectedCount < allPilgrims.length;
  }

  document.querySelectorAll(".group-select-all").forEach((control, index) => {
    const pilgrims = groups[index]?.pilgrims || [];
    const selectedCount = pilgrims.filter((pilgrim) => pilgrim.selected).length;
    control.checked = pilgrims.length > 0 && selectedCount === pilgrims.length;
    control.indeterminate = selectedCount > 0 && selectedCount < pilgrims.length;
  });
}

async function handleSelectAll(event) {
  const groups = await loadData();
  groups.forEach((group) => {
    group.pilgrims.forEach((pilgrim) => {
      pilgrim.selected = event.target.checked;
    });
  });
  saveData(groups);
  render(groups);
  setStatus(event.target.checked
    ? "All pilgrims selected across every group."
    : "All pilgrim selections cleared. Your saved data is safe.");
}

async function handleClearAll() {
  if (!window.confirm("Delete all group data and restore 3 empty groups?")) return;
  const groups = defaultData();
  saveData(groups);
  render(groups);
  setStatus("All group data cleared. Three empty groups are ready.");
}

function updateSelectionCount(groups) {
  const el = document.getElementById("selectionCount");
  if (!el) return;
  const count = groups.reduce(
    (sum, g) => sum + g.pilgrims.filter((p) => p.selected && p.name.trim()).length,
    0
  );
  el.innerHTML = count === 0 ? "No pilgrims selected" : `<strong>${count}</strong> pilgrim(s) selected`;
}

async function handleAutofill() {
  const groups = await loadData();

  // Gather selected pilgrims in group/row order, keep a reference to
  // which group each selected pilgrim belongs to.
  const selected = [];
  groups.forEach((group) => {
    group.pilgrims.forEach((pilgrim) => {
      if (pilgrim.selected && pilgrim.name.trim()) {
        selected.push({ pilgrim, group });
      }
    });
  });

  if (selected.length === 0) {
    setStatus("Select at least one pilgrim before starting autofill.", true);
    return;
  }

  // General details come from the first selected pilgrim's group.
  const general = selected[0].group.general;
  const pilgrims = selected.map((s) => s.pilgrim);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes("ttdevasthanams.ap.gov.in")) {
    setStatus("Open the TTD pilgrim details page first, then try autofill again.", true);
    return;
  }

  const clickContinue = document.getElementById("clickContinueCheckbox").checked;
  const clickPayNow = clickContinue;
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || "upi";
  const cardDetails = {
    cardNumber: document.querySelector('[data-field="cardNumber"]').value.trim(),
    expiry: document.querySelector('[data-field="expiry"]').value.trim(),
    cvv: document.querySelector('[data-field="cvv"]').value.trim(),
    cardName: document.querySelector('[data-field="cardName"]').value.trim(),
  };

  const response = await sendAutofillMessage(tab, {
    action: "AUTOFILL_TTD",
    general,
    pilgrims,
    clickContinue,
    clickPayNow,
    paymentMethod,
    cardDetails,
  });

  if (response && response.ok) {
    setStatus(
      `Autofill complete: ${response.filledCount} pilgrim(s) filled.` +
        (response.unfilledCount
          ? ` ${response.unfilledCount} selected pilgrim(s) had no available slot.`
          : "")
    );
  } else {
    setStatus((response && response.error) || "Autofill could not be completed. Please try again.", true);
  }
}

function handleImportClick() {
  document.getElementById("importFile").click();
}

function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const json = JSON.parse(reader.result);
      const groups = parseImportedJson(json);
      saveData(groups);
      render(groups);
      setStatus(`Import complete: ${groups.length} group(s) loaded.`);
    } catch (err) {
      setStatus(`Import failed: ${err.message}`, true);
    } finally {
      event.target.value = ""; // allow re-importing the same file later
    }
  };
  reader.readAsText(file);
}

function handleImportCardClick() {
  document.getElementById("importCardFile").click();
}

function handleImportCardFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const cardDetails = normalizeCardDetails(JSON.parse(reader.result));
      applyCardDetails(cardDetails);
      setStatus("Card details imported and saved successfully.");
    } catch (err) {
      setStatus(`Card import failed: ${err.message}`, true);
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function handleDownloadCardSample() {
  const sample = {
    cardNumber: "4111111111111111",
    expiry: "12/30",
    cvv: "123",
    cardName: "TEST CARDHOLDER",
  };
  const blob = new Blob([JSON.stringify(sample, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ttd-card-details-sample.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Card JSON sample downloaded. Replace the sample values before importing.");
}

async function handleExport() {
  const groups = await loadData();
  updateExportButton(groups);
  const json = JSON.stringify(exportGroups(groups), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `ttd-groups-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  setStatus("JSON downloaded successfully. It is ready to reuse or share.");
}

function getDefaultSniperConfig() {
  return {
    targetSeva: "Special Entry Darshan",
    autoClickTargetSeva: false,
    autoPickerEnabled: true,
    targetDate: "",
    fallbackGreenDate: true,
    preferredSlot: "any",
    ticketCount: "auto",
    autoContinueCalendar: true,
    sniperEnabled: false,
    dropTime: "10:00:00",
    leadTimeMs: 250,
  };
}

async function loadSniperConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SNIPER_CONFIG_KEY], (res) => {
      resolve(Object.assign(getDefaultSniperConfig(), res[SNIPER_CONFIG_KEY] || {}));
    });
  });
}

function getSniperConfigFromInputs() {
  return {
    targetSeva: document.getElementById("targetSevaSelect")?.value || "Special Entry Darshan",
    autoClickTargetSeva: !!document.getElementById("autoClickTargetSevaCheckbox")?.checked,
    autoPickerEnabled: !!document.getElementById("autoPickerEnabledCheckbox")?.checked,
    targetDate: document.getElementById("targetDateField")?.value || "",
    fallbackGreenDate: !!document.getElementById("fallbackGreenDateCheckbox")?.checked,
    preferredSlot: document.getElementById("preferredSlotSelect")?.value || "any",
    ticketCount: document.getElementById("ticketCountSelect")?.value || "auto",
    autoContinueCalendar: !!document.getElementById("autoContinueCalendarCheckbox")?.checked,
    sniperEnabled: !!document.getElementById("sniperEnabledToggle")?.checked,
    dropTime: document.getElementById("sniperDropTimeInput")?.value || "10:00:00",
    leadTimeMs: parseInt(document.getElementById("sniperLeadTimeInput")?.value, 10) || 250,
  };
}

function applySniperConfigToInputs(config) {
  if (document.getElementById("targetSevaSelect")) {
    document.getElementById("targetSevaSelect").value = config.targetSeva || "Special Entry Darshan";
  }
  if (document.getElementById("autoClickTargetSevaCheckbox")) {
    document.getElementById("autoClickTargetSevaCheckbox").checked = !!config.autoClickTargetSeva;
  }
  if (document.getElementById("autoPickerEnabledCheckbox")) {
    document.getElementById("autoPickerEnabledCheckbox").checked = config.autoPickerEnabled !== false;
  }
  if (document.getElementById("targetDateField")) {
    document.getElementById("targetDateField").value = config.targetDate || "";
    // Restrict date picker to today onwards
    const todayStr = new Date().toISOString().split("T")[0];
    document.getElementById("targetDateField").min = todayStr;
  }
  if (document.getElementById("fallbackGreenDateCheckbox")) {
    document.getElementById("fallbackGreenDateCheckbox").checked = config.fallbackGreenDate !== false;
  }
  if (document.getElementById("preferredSlotSelect")) {
    document.getElementById("preferredSlotSelect").value = config.preferredSlot || "any";
  }
  if (document.getElementById("ticketCountSelect")) {
    document.getElementById("ticketCountSelect").value = config.ticketCount || "auto";
  }
  if (document.getElementById("autoContinueCalendarCheckbox")) {
    document.getElementById("autoContinueCalendarCheckbox").checked = config.autoContinueCalendar !== false;
  }
  if (document.getElementById("sniperEnabledToggle")) {
    document.getElementById("sniperEnabledToggle").checked = !!config.sniperEnabled;
  }
  if (document.getElementById("sniperDropTimeInput")) {
    document.getElementById("sniperDropTimeInput").value = config.dropTime || "10:00:00";
  }
  if (document.getElementById("sniperLeadTimeInput")) {
    document.getElementById("sniperLeadTimeInput").value = config.leadTimeMs ?? 250;
  }
}

function initTabs(initialTab) {
  const tabSevaBtn = document.getElementById("tabSevaBtn");
  const tabPilgrimsBtn = document.getElementById("tabPilgrimsBtn");
  const tabSevaContent = document.getElementById("tabSevaContent");
  const tabPilgrimsContent = document.getElementById("tabPilgrimsContent");

  function switchTab(tab) {
    if (tab === "pilgrims") {
      tabPilgrimsBtn.classList.add("active");
      tabPilgrimsBtn.setAttribute("aria-selected", "true");
      tabSevaBtn.classList.remove("active");
      tabSevaBtn.setAttribute("aria-selected", "false");
      tabPilgrimsContent.classList.add("active");
      tabSevaContent.classList.remove("active");
    } else {
      tabSevaBtn.classList.add("active");
      tabSevaBtn.setAttribute("aria-selected", "true");
      tabPilgrimsBtn.classList.remove("active");
      tabPilgrimsBtn.setAttribute("aria-selected", "false");
      tabSevaContent.classList.add("active");
      tabPilgrimsContent.classList.remove("active");
    }
    chrome.storage.local.set({ [ACTIVE_TAB_KEY]: tab });
  }

  tabSevaBtn?.addEventListener("click", () => switchTab("seva"));
  tabPilgrimsBtn?.addEventListener("click", () => switchTab("pilgrims"));

  switchTab(initialTab || "seva");
}

let currentDriftMs = 0;

function formatLiveTime(timestamp) {
  const d = new Date(timestamp);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(Math.floor(d.getMilliseconds() / 100));
  return `${hh}:${mm}:${ss}.${ms}`;
}

function updateLiveClockDisplay() {
  const clockEl = document.getElementById("ttdLiveClock");
  if (!clockEl) return;
  const ttdTime = Date.now() + currentDriftMs;
  clockEl.textContent = formatLiveTime(ttdTime);
}

function updateCountdownDisplay() {
  const countdownEl = document.getElementById("sniperCountdownDisplay");
  const toggle = document.getElementById("sniperEnabledToggle");
  const dropTimeInput = document.getElementById("sniperDropTimeInput");
  const leadTimeInput = document.getElementById("sniperLeadTimeInput");
  if (!countdownEl || !toggle || !dropTimeInput) return;

  if (!toggle.checked) {
    countdownEl.textContent = "Sniper Idle (Toggle ON to arm)";
    countdownEl.className = "sniper-countdown-badge";
    return;
  }

  const dropTimeParts = dropTimeInput.value.split(":");
  if (dropTimeParts.length < 2) return;

  const now = new Date(Date.now() + currentDriftMs);
  const targetDate = new Date(now);
  targetDate.setHours(
    parseInt(dropTimeParts[0], 10),
    parseInt(dropTimeParts[1], 10),
    parseInt(dropTimeParts[2] || 0, 10),
    0
  );

  let diffMs = targetDate.getTime() - now.getTime();
  const leadMs = parseInt(leadTimeInput?.value, 10) || 0;
  const triggerDiffMs = diffMs - leadMs;

  if (triggerDiffMs > 0) {
    const totalSecs = Math.floor(triggerDiffMs / 1000);
    const hrs = String(Math.floor(totalSecs / 3600)).padStart(2, "0");
    const mins = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, "0");
    const secs = String(totalSecs % 60).padStart(2, "0");
    const ms = String(triggerDiffMs % 1000).padStart(3, "0");

    countdownEl.textContent = `Drop in ${hrs}:${mins}:${secs}.${ms} (-${leadMs}ms lead)`;
    countdownEl.className =
      triggerDiffMs < 10000 ? "sniper-countdown-badge armed urgent" : "sniper-countdown-badge armed";
  } else if (triggerDiffMs > -10000) {
    countdownEl.textContent = `Sniper fired - executing quota pickup`;
    countdownEl.className = "sniper-countdown-badge armed urgent";

    if (triggerDiffMs <= 0 && triggerDiffMs > -3000 && lastFiredDropTime !== dropTimeInput.value) {
      lastFiredDropTime = dropTimeInput.value;
      const cfg = getSniperConfigFromInputs();
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab?.id && tab.url?.includes("ttdevasthanams.ap.gov.in")) {
          chrome.tabs.sendMessage(tab.id, { action: "EXECUTE_SNIPER_NOW", config: cfg });
        }
      });
    }
  } else {
    countdownEl.textContent = `Drop time has passed for today (${dropTimeInput.value})`;
    countdownEl.className = "sniper-countdown-badge";
  }
}

let lastFiredDropTime = "";

async function calibrateClock() {
  const driftBadge = document.getElementById("clockDriftBadge");
  const syncBtn = document.getElementById("syncClockBtn");
  if (driftBadge) {
    driftBadge.className = "drift-badge calibrating";
    driftBadge.textContent = "Syncing...";
  }
  if (syncBtn) syncBtn.disabled = true;

  try {
    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "GET_SERVER_TIME" }, resolve);
    });

    if (res && res.ok) {
      currentDriftMs = res.drift;
      chrome.storage.local.set({ [SERVER_DRIFT_KEY]: currentDriftMs });
      if (driftBadge) {
        driftBadge.className = "drift-badge calibrated";
        const sign = currentDriftMs >= 0 ? "+" : "";
        driftBadge.textContent = `Drift: ${sign}${currentDriftMs}ms (RTT: ${res.rtt}ms)`;
      }
      setStatus(`Clock calibrated! Drift: ${currentDriftMs}ms (RTT: ${res.rtt}ms)`, "success");
    } else {
      if (driftBadge) {
        driftBadge.className = "drift-badge uncalibrated";
        driftBadge.textContent = "Offline/Error";
      }
    }
  } catch (err) {
    if (driftBadge) {
      driftBadge.className = "drift-badge uncalibrated";
      driftBadge.textContent = "Error";
    }
  } finally {
    if (syncBtn) syncBtn.disabled = false;
  }
}

async function handleConfigAutoSave() {
  const cfg = getSniperConfigFromInputs();
  await chrome.storage.local.set({ [SNIPER_CONFIG_KEY]: cfg });
  updateCountdownDisplay();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && tab.url?.includes("ttdevasthanams.ap.gov.in")) {
      chrome.tabs.sendMessage(tab.id, { action: "INIT_SNIPER_SCHEDULER", config: cfg });
    }
  } catch (err) {
    // Tab querying or messaging error ignored
  }
}

(async function init() {
  const storedPopupWidth = await new Promise((resolve) => {
    chrome.storage.local.get([POPUP_WIDTH_STORAGE_KEY], (res) => {
      const value = res[POPUP_WIDTH_STORAGE_KEY];
      resolve(typeof value === "number" ? value : null);
    });
  });
  initPopupResize(storedPopupWidth);

  // Initialize Tabs
  const storedActiveTab = await new Promise((resolve) => {
    chrome.storage.local.get([ACTIVE_TAB_KEY], (res) => resolve(res[ACTIVE_TAB_KEY] || "seva"));
  });
  initTabs(storedActiveTab);

  // Initialize Seva & Sniper Config
  const sniperConfig = await loadSniperConfig();
  applySniperConfigToInputs(sniperConfig);

  // Initialize Clock Calibration & Drift
  const storedDrift = await new Promise((resolve) => {
    chrome.storage.local.get([SERVER_DRIFT_KEY], (res) => resolve(res[SERVER_DRIFT_KEY] || 0));
  });
  currentDriftMs = storedDrift || 0;
  const driftBadge = document.getElementById("clockDriftBadge");
  if (driftBadge && storedDrift) {
    driftBadge.className = "drift-badge calibrated";
    const sign = storedDrift >= 0 ? "+" : "";
    driftBadge.textContent = `Drift: ${sign}${storedDrift}ms`;
  }

  // Start live clock ticks & countdown
  updateLiveClockDisplay();
  updateCountdownDisplay();
  setInterval(updateLiveClockDisplay, 200);
  setInterval(updateCountdownDisplay, 50);

  // Attach tab 1 events
  document.getElementById("syncClockBtn")?.addEventListener("click", calibrateClock);

  // Auto-save on changing any input in Tab 1
  [
    "targetSevaSelect",
    "autoClickTargetSevaCheckbox",
    "autoPickerEnabledCheckbox",
    "targetDateField",
    "fallbackGreenDateCheckbox",
    "preferredSlotSelect",
    "ticketCountSelect",
    "autoContinueCalendarCheckbox",
    "sniperEnabledToggle",
    "sniperDropTimeInput",
    "sniperLeadTimeInput",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", handleConfigAutoSave);
      if (el.tagName === "INPUT" && (el.type === "text" || el.type === "number" || el.type === "time" || el.type === "date")) {
        el.addEventListener("input", handleConfigAutoSave);
      }
    }
  });

  // Preset pills
  document.querySelectorAll(".preset-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".preset-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      const dropTimeInput = document.getElementById("sniperDropTimeInput");
      if (dropTimeInput) {
        dropTimeInput.value = pill.dataset.time;
        handleConfigAutoSave();
      }
    });
  });

  // Automatically calibrate clock if uncalibrated or fresh open
  calibrateClock();

  // Tab 2: Pilgrim Groups and Preferences
  const groups = await loadData();
  render(groups);

  const clickContinueCheckbox = document.getElementById("clickContinueCheckbox");
  const autoRunCheckbox = document.getElementById("autoRunCheckbox");
  const paymentMethodRadios = Array.from(document.querySelectorAll('input[name="paymentMethod"]'));
  const cardDetailsSection = document.getElementById("cardDetailsSection");
  const cardDetailsDisclosure = document.getElementById("cardDetailsDisclosure");
  const cardNumberInput = document.querySelector('[data-field="cardNumber"]');
  const expiryInput = document.querySelector('[data-field="expiry"]');
  const cvvInput = document.querySelector('[data-field="cvv"]');
  const cardNameInput = document.querySelector('[data-field="cardName"]');
  const storedPrefs = await new Promise((resolve) => {
    chrome.storage.local.get(
      [CLICK_CONTINUE_PREF_KEY, PAYMENT_METHOD_PREF_KEY, CARD_DETAILS_PREF_KEY, AUTO_RUN_PREF_KEY],
      resolve
    );
  });
  // Default to checked (matches the HTML default) if no preference saved yet.
  clickContinueCheckbox.checked =
    storedPrefs[CLICK_CONTINUE_PREF_KEY] === undefined ? true : !!storedPrefs[CLICK_CONTINUE_PREF_KEY];

  const savedPaymentMethod = storedPrefs[PAYMENT_METHOD_PREF_KEY] || "upi";
  paymentMethodRadios.forEach((radio) => {
    radio.checked = radio.value === savedPaymentMethod;
  });

  const savedCardDetails = storedPrefs[CARD_DETAILS_PREF_KEY] || getDefaultCardDetails();
  applyCardDetails(normalizeCardDetails(savedCardDetails));

  const syncCardSection = () => {
    const selected = document.querySelector('input[name="paymentMethod"]:checked')?.value || "upi";
    cardDetailsSection.hidden = selected !== "card";
    if (selected !== "card") cardDetailsDisclosure.open = false;
  };
  syncCardSection();

  autoRunCheckbox.checked =
    storedPrefs[AUTO_RUN_PREF_KEY] === undefined ? true : !!storedPrefs[AUTO_RUN_PREF_KEY];
  clickContinueCheckbox.addEventListener("change", () => {
    chrome.storage.local.set({ [CLICK_CONTINUE_PREF_KEY]: clickContinueCheckbox.checked });
  });
  paymentMethodRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      chrome.storage.local.set({ [PAYMENT_METHOD_PREF_KEY]: radio.value });
      syncCardSection();
    });
  });
  [cardNumberInput, expiryInput, cvvInput, cardNameInput].forEach((input) => {
    input.addEventListener("input", () => {
      chrome.storage.local.set({ [CARD_DETAILS_PREF_KEY]: getCardDetailsFromInputs() });
    });
  });
  autoRunCheckbox.addEventListener("change", () => {
    chrome.storage.local.set({ [AUTO_RUN_PREF_KEY]: autoRunCheckbox.checked });
  });

  document.getElementById("autofillBtn").addEventListener("click", handleAutofill);
  document.getElementById("importBtn").addEventListener("click", handleImportClick);
  document.getElementById("importFile").addEventListener("change", handleImportFile);
  document.getElementById("importCardBtn").addEventListener("click", handleImportCardClick);
  document.getElementById("importCardFile").addEventListener("change", handleImportCardFile);
  document.getElementById("downloadCardSampleBtn").addEventListener("click", handleDownloadCardSample);
  document.getElementById("exportBtn").addEventListener("click", handleExport);
  document.getElementById("addGroupBtn").addEventListener("click", handleAddGroup);
  document.getElementById("selectAllBtn").addEventListener("change", handleSelectAll);
  document.getElementById("clearAllBtn").addEventListener("click", handleClearAll);
})();
