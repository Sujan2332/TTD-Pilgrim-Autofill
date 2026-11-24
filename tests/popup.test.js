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

run();
