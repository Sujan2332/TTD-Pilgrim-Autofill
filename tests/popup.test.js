// Popup (popup.html + popup.js) Seva & Sniper settings.
const { JSDOM, VirtualConsole } = require("jsdom");
const { read, sleep, test, run, assert } = require("./helpers");

// Popup with chrome.storage.local backed by `storage` (popup.js uses the callback form)
async function loadPopup(storage) {
  const html = read("popup.html").replace(/<script[^>]*src=[^>]*><\/script>/gi, "");
  const dom = new JSDOM(html, { url: "chrome-extension://test/popup.html", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  const copy = (v) => JSON.parse(JSON.stringify(v));
  w.chrome = {
    storage: {
      local: {
        get(keys, cb) {
          const list = keys == null ? Object.keys(storage) : typeof keys === "object" && !Array.isArray(keys) ? Object.keys(keys) : [].concat(keys);
          const res = copy(Object.fromEntries(list.filter((k) => k in storage).map((k) => [k, storage[k]])));
          if (cb) return void setTimeout(() => cb(res), 0);
          return Promise.resolve(res);
        },
        set(obj, cb) {
          Object.assign(storage, copy(obj));
          if (cb) cb();
          return Promise.resolve();
        },
      },
      onChanged: { addListener() {} },
    },
    runtime: { lastError: undefined, sendMessage: async () => ({}), onMessage: { addListener() {} } },
    tabs: { query: async () => [], sendMessage: (id, msg, cb) => cb && cb({}) },
    scripting: { executeScript: async () => {} },
  };
  w.eval(read("popup.js"));
  await sleep(300);
  return w;
}

const change = (w, id, value) => {
  const el = w.document.getElementById(id);
  el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
};

test("switching the target service away from Arjitha clears the saved temple and seva", async () => {
  const storage = {
    ttdSniperConfig: {
      sevaSniperEnabled: true,
      targetSeva: "Arjitha Sevas",
      arjithaTemple: "Sri Padmavathi Ammavari Temple - Tiruchanoor",
      arjithaSeva: "Kalyana Kankanam",
      arjithaFallback: "ask",
    },
  };
  const w = await loadPopup(storage);
  change(w, "targetSevaSelect", "Special Entry Darshan (Ammavari Temple)");
  await sleep(200);
  const saved = storage.ttdSniperConfig;
  assert(saved.targetSeva === "Special Entry Darshan (Ammavari Temple)", `target not saved: ${saved.targetSeva}`);
  assert(saved.arjithaSeva === "any", `old seva still saved: "${saved.arjithaSeva}"`);
  assert(saved.arjithaTemple === "Srivari Temple - Tirumala", `old temple still saved: "${saved.arjithaTemple}"`);
});

test("choosing Arjitha Sevas keeps the picked temple and seva", async () => {
  const storage = { ttdSniperConfig: { sevaSniperEnabled: true, targetSeva: "Special Entry Darshan" } };
  const w = await loadPopup(storage);
  change(w, "targetSevaSelect", "Arjitha Sevas");
  change(w, "arjithaTempleSelect", "Sri Padmavathi Ammavari Temple - Tiruchanoor");
  const sevaSelect = w.document.getElementById("arjithaSevaSelect");
  const seva = [...sevaSelect.options].map((o) => o.value).find((v) => v !== "any");
  change(w, "arjithaSevaSelect", seva);
  await sleep(200);
  const saved = storage.ttdSniperConfig;
  assert(saved.arjithaTemple === "Sri Padmavathi Ammavari Temple - Tiruchanoor", `temple not kept: "${saved.arjithaTemple}"`);
  assert(saved.arjithaSeva === seva, `seva not kept: "${saved.arjithaSeva}" (picked "${seva}")`);
});

test("sniper lead time 0 is saved as 0 (fires exactly at the drop time)", async () => {
  const storage = { ttdSniperConfig: { sevaSniperEnabled: true, sniperEnabled: true, leadTimeMs: 250 } };
  const w = await loadPopup(storage);
  const input = w.document.getElementById("sniperLeadTimeInput");
  input.value = "0";
  input.dispatchEvent(new w.Event("input", { bubbles: true }));
  input.dispatchEvent(new w.Event("change", { bubbles: true }));
  await sleep(200);
  assert(storage.ttdSniperConfig.leadTimeMs === 0, `saved lead time: ${storage.ttdSniperConfig.leadTimeMs}`);
});

test("\"Show booking timer\" checkbox is saved, and the last run is shown under it", async () => {
  const storage = {
    ttdSniperConfig: { sevaSniperEnabled: true, showBookingTimer: true },
    ttdLastBookingRun: { ms: 14200, startLabel: "Special Entry Darshan", endLabel: "Proceed", at: Date.now() },
  };
  const w = await loadPopup(storage);
  const hint = w.document.getElementById("lastBookingRunHint");
  assert(!hint.hidden && /Last run: 14\.2 s \(Special Entry Darshan → Proceed\)/.test(hint.textContent), `hint: "${hint.textContent}"`);
  const box = w.document.getElementById("showBookingTimerCheckbox");
  assert(box.checked, "checkbox should start ticked");
  box.checked = false;
  box.dispatchEvent(new w.Event("change", { bubbles: true }));
  await sleep(200);
  assert(storage.ttdSniperConfig.showBookingTimer === false, `saved: ${storage.ttdSniperConfig.showBookingTimer}`);
});

test("\"Show booking timer\" is ticked by default and stays usable when the sniper card is disabled", async () => {
  const storage = { ttdSniperConfig: { sevaSniperEnabled: true, autoClickTargetSeva: true } }; // never saved -> default
  const w = await loadPopup(storage);
  const box = w.document.getElementById("showBookingTimerCheckbox");
  assert(box.checked, "not ticked by default");
  assert(!box.disabled && !box.closest("#sniperCard"), "disabled along with the sniper card (on-load click mode)");
});

run();
