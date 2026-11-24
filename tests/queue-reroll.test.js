// Virtual-queue re-roll (content.js watchVirtualQueue) on the saved TTD queue page:
// wait over 2 min -> clear ALL localStorage + reload; otherwise leave it alone.
const { referencePage, loadPage, stopPage, sleep, test, run, assert } = require("./helpers");

const QUEUE_PAGE = referencePage("queue/ttd_queue_page.html");

// timeline: [[afterMs, "MM:SS" | null (no timer on screen)]]
async function queueRun({ html = QUEUE_PAGE, initial = "02:15", timeline = [], tries = 0, runMs = 2200 } = {}) {
  let timerEl, setAt = null;
  const setTimer = (w, value) => {
    if (value === null) return timerEl.remove();
    if (!timerEl.isConnected) timerEl.__parent.prepend(timerEl);
    timerEl.textContent = value;
    setAt = Math.round(w.performance.now());
  };
  const { window: w, logs } = loadPage(html, {
    url: "https://ttdevasthanams.ap.gov.in/seva-dip/dashboard",
    beforeScripts(w) {
      w.localStorage.setItem("user-access", "abc");
      if (tries) w.sessionStorage.setItem("ttdQueueReroll", JSON.stringify({ tries }));
      timerEl = w.document.querySelector('[class*="circularProgress"]');
      if (!timerEl) return;
      timerEl.__parent = timerEl.parentElement;
      setTimer(w, initial);
      for (const [at, value] of timeline) setTimeout(() => setTimer(w, value), at);
    },
  });
  await sleep(runMs);
  stopPage(w);
  const toasts = [...w.document.querySelectorAll("*")]
    .filter((el) => el.childElementCount === 0 && /Queue wait|re-roll/i.test(el.textContent))
    .map((el) => el.textContent);
  const decided = logs.map((l) => l.match(/decided (\d+) ms/)).find(Boolean);
  return {
    reloaded: logs.some((l) => /jsdomError: .*navigation/i.test(l)),
    cleared: w.localStorage.getItem("user-access") === null,
    toast: toasts[toasts.length - 1] || "",
    tries: JSON.parse(w.sessionStorage.getItem("ttdQueueReroll") || "{}").tries,
    msAfterTimerShown: decided && setAt !== null ? Number(decided[1]) - setAt : null,
  };
}

test("wait 02:15 (over 2 min) -> clears localStorage and reloads", async () => {
  const r = await queueRun({ initial: "02:15" });
  assert(r.cleared, "user-access was not cleared");
  assert(r.reloaded, "page was not reloaded");
  assert(r.tries === 1, `tries should be 1, got ${r.tries}`);
  assert(/re-rolling \(try 1\/25\)/.test(r.toast), `unexpected toast "${r.toast}"`);
});

test("re-roll is quick: decided within 150 ms of the wait showing", async () => {
  const r = await queueRun({ initial: "02:15", runMs: 800 });
  assert(r.msAfterTimerShown !== null && r.msAfterTimerShown <= 150, `took ${r.msAfterTimerShown} ms`);
});

test("wait 01:40 -> nothing cleared, no reload", async () => {
  const r = await queueRun({ initial: "01:40" });
  assert(!r.cleared && !r.reloaded, "should have left the queue alone");
  assert(/within 2 min/.test(r.toast), `unexpected toast "${r.toast}"`);
});

test("wait exactly 02:00 -> within the limit, no reload", async () => {
  const r = await queueRun({ initial: "02:00" });
  assert(!r.cleared && !r.reloaded, "2:00 is within the limit");
});

test("wait 1:02:00 (H:MM:SS) -> re-roll", async () => {
  const r = await queueRun({ initial: "1:02:00" });
  assert(r.cleared && r.reloaded, "hours format not handled");
});

test("0:00 placeholder, then 02:30 -> re-rolls as soon as 02:30 shows", async () => {
  const r = await queueRun({ initial: "00:00", timeline: [[300, "02:30"]] });
  assert(r.cleared && r.reloaded, "did not re-roll");
  assert(r.msAfterTimerShown <= 150, `took ${r.msAfterTimerShown} ms after 02:30 showed`);
});

test("0:00 placeholder, then 01:30 -> stays", async () => {
  const r = await queueRun({ initial: "00:00", timeline: [[300, "01:30"]] });
  assert(!r.cleared && !r.reloaded, "should have stayed");
  assert(/1:30/.test(r.toast), `unexpected toast "${r.toast}"`);
});

test("0:00 that never changes -> stays (after the 1.5 s placeholder wait)", async () => {
  const r = await queueRun({ initial: "00:00" });
  assert(!r.cleared && !r.reloaded, "should have stayed");
  assert(/0:00/.test(r.toast), `unexpected toast "${r.toast}"`);
});

test("queue shown later by client-side navigation -> still re-rolls", async () => {
  const r = await queueRun({ initial: null, timeline: [[700, "03:10"]] });
  assert(r.cleared && r.reloaded, "late queue not noticed");
});

test("stops after 25 tries in a row -> nothing cleared", async () => {
  const r = await queueRun({ initial: "02:15", tries: 25 });
  assert(!r.cleared && !r.reloaded, "should have stopped");
  assert(/stopped after 25/.test(r.toast), `unexpected toast "${r.toast}"`);
});

test("non-queue page -> nothing happens", async () => {
  const r = await queueRun({ html: "<!doctype html><html><body><div>Pilgrim services</div></body></html>", initial: null });
  assert(!r.cleared && !r.reloaded && r.toast === "", "acted on a non-queue page");
});

run();
