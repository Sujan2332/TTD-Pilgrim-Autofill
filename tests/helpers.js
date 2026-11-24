// Shared helpers for the mock tests: build a fake TTD page (jsdom) from reference-pages/, stub the Chrome
// extension APIs, and load the extension's real page-bridge.js / content.js into it.
// jsdom has no layout, no innerText and no PointerEvent, so those are stubbed here.
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A saved TTD page without its own <script>s
function referencePage(file) {
  return read(path.join("reference-pages", file)).replace(/<script\b[\s\S]*?<\/script>/gi, "");
}

// Fake TTD page. Returns { window, logs }. Options:
//   bridge: run page-bridge.js first, like Chrome does at document_start (default true)
//   content: run content.js (default true)
//   storage: chrome.storage.local contents
function loadPage(html, { url = "https://ttdevasthanams.ap.gov.in/", bridge = true, content = true, storage = {}, beforeScripts } = {}) {
  const logs = [];
  const virtualConsole = new VirtualConsole();
  ["log", "warn", "error", "info"].forEach((level) => virtualConsole.on(level, (...args) => logs.push(args.map(String).join(" "))));
  virtualConsole.on("jsdomError", (err) => logs.push(`jsdomError: ${err.message}`));

  const dom = new JSDOM(html, { url, runScripts: "dangerously", pretendToBeVisual: true, virtualConsole });
  const w = dom.window;
  w.PointerEvent = w.MouseEvent;
  w.HTMLElement.prototype.getBoundingClientRect = () => ({ top: 10, left: 10, width: 100, height: 20, right: 110, bottom: 30, x: 10, y: 10 });
  Object.defineProperty(w.HTMLElement.prototype, "innerText", { get() { return this.textContent; }, configurable: true });
  w.fetch = () => new Promise(() => {}); // TTD's requests never finish here
  w.chrome = {
    storage: {
      local: {
        get: async (keys) => Object.fromEntries([].concat(keys || Object.keys(storage)).filter((k) => k in storage).map((k) => [k, storage[k]])),
        set: async (obj) => Object.assign(storage, obj),
      },
      onChanged: { addListener() {} },
    },
    runtime: { id: "test", sendMessage: async () => ({}), onMessage: { addListener() {} }, getURL: (p) => `chrome-extension://test/${p}` },
  };
  if (beforeScripts) beforeScripts(w);
  if (bridge) w.eval(read("page-bridge.js"));
  if (content) w.eval(read("content.js"));
  return { window: w, logs };
}

// Stop content.js's timers and watchers (like an unloaded extension) so they don't slow the next test
function stopPage(w) {
  w.chrome.runtime.id = undefined;
}

// TTD-style dropdown: the input TOGGLES the menu on every click; options carry React-style onClick props
function mockDropdown(w, input, labels, menu) {
  const stats = { toggles: 0 };
  if (!menu) {
    menu = w.document.createElement("div");
    menu.style.zIndex = "999";
    input.parentElement.appendChild(menu);
  }
  input.addEventListener("click", () => {
    stats.toggles++;
    if (menu.children.length) {
      menu.innerHTML = "";
      return;
    }
    for (const label of labels) {
      const item = w.document.createElement("div");
      item.className = "_36WbrG_listItem"; // TTD renames the prefix between builds - code must match "listItem"
      item.textContent = label;
      item.__reactProps$mock = { onClick: () => { input.value = label; menu.innerHTML = ""; } };
      menu.appendChild(item);
    }
  });
  return stats;
}

// Tiny test runner: test(name, fn) then run()
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}
async function run() {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  PASS  ${name}`);
    } catch (err) {
      failed++;
      console.log(`  FAIL  ${name}\n        ${err.message}`);
    }
  }
  console.log(failed ? `  ${failed} of ${tests.length} failed` : `  all ${tests.length} passed`);
  process.exit(failed ? 1 : 0); // fake pages keep timers alive - exit explicitly
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

module.exports = { ROOT, read, sleep, referencePage, loadPage, stopPage, mockDropdown, test, run, assert };
