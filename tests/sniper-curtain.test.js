// Quota sniper vs TTD's release curtain: at the drop TTD shows /curtain?section=dashboard (announcement only,
// no service tiles) and it doesn't lift by itself. The sniper must open the dashboard and click the target there.
const { referencePage, loadPage, stopPage, sleep, test, run, assert } = require("./helpers");

// Built from the live screenshot (24 Nov 2026) - no saved copy yet
const CURTAIN_PAGE = `<!doctype html><html><body><div class="curtain">
  <p>Srivari Special Entry Darshan (Rs.300) tickets for February - 2027 and Sri Padmavathi Ammavari Special Entry
  Darshan (Rs. 200) tickets for December - 2026 will be available for booking w.e.f. 24.11.2026, 10:00 AM</p>
  <p>Check our official TTD App for seamless access to Darshan, Seva bookings, and Srivari updates.</p>
</div></body></html>`;
const CURTAIN_URL = "https://ttdevasthanams.ap.gov.in/curtain?section=dashboard";
const HOME_PAGE = referencePage("home/seva_container.html");
const PENDING_KEY = "ttdSniperPendingSeva";

const hhmmss = (d) => [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
const sniperConfig = (dropTime) => ({
  sevaSniperEnabled: true, sniperEnabled: true, autoClickTargetSeva: false,
  targetSeva: "Special Entry Darshan", dropTime, leadTimeMs: 250,
});

function open(html, url, { config, pending, extraSession = {} }) {
  const { window: w, logs } = loadPage(html, {
    url,
    storage: { ttdSniperConfig: config, ttdServerDrift: 0 },
    beforeScripts(w) {
      if (pending) w.sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      for (const [k, v] of Object.entries(extraSession)) w.sessionStorage.setItem(k, v);
    },
  });
  const navigations = () => logs.filter((l) => /jsdomError: .*navigation/i.test(l)).length;
  const pendingNow = () => JSON.parse(w.sessionStorage.getItem(PENDING_KEY) || "null");
  return { w, logs, navigations, pendingNow };
}

test("drop time on the curtain -> refreshes the page (instead of doing nothing)", async () => {
  const p = open(CURTAIN_PAGE, CURTAIN_URL, { config: sniperConfig(hhmmss(new Date())), extraSession: { ttdSevaClickedTime: String(Date.now()) } });
  await sleep(500);
  stopPage(p.w);
  assert(p.logs.some((l) => /FIRING SNIPER ACTION NOW/.test(l)), "sniper did not fire");
  assert(p.logs.some((l) => /refreshing to reach "Special Entry Darshan" \(try 1\//.test(l)), "did not refresh the curtain");
  assert(p.navigations() === 1, `${p.navigations()} navigations`);
  assert(p.pendingNow()?.targetSeva === "Special Entry Darshan" && p.pendingNow().tries === 1, `pending: ${JSON.stringify(p.pendingNow())}`);
  assert(p.w.sessionStorage.getItem("ttdSevaClickedTime") === null, "earlier tile-click guard not cleared - it would swallow the dashboard click");
});

test("dashboard with the pending note -> clicks Special Entry Darshan once, clears the note", async () => {
  const p = open(HOME_PAGE, "https://ttdevasthanams.ap.gov.in/home/dashboard", {
    config: sniperConfig("23:59:59"),
    pending: { targetSeva: "Special Entry Darshan", until: Date.now() + 60000, tries: 1 },
  });
  await sleep(600);
  stopPage(p.w);
  const clicks = p.logs.filter((l) => /Auto-clicking target Seva tile: Special Entry Darshan/.test(l)).length;
  assert(clicks === 1, `tile clicked ${clicks} times`);
  assert(p.pendingNow() === null, "pending note not cleared");
});

test("curtain shows again while pending -> refreshes again after ~1 s (try 4 after 3)", async () => {
  const p = open(CURTAIN_PAGE, CURTAIN_URL, {
    config: sniperConfig("23:59:59"),
    pending: { targetSeva: "Special Entry Darshan", until: Date.now() + 60000, tries: 3 },
  });
  await sleep(500);
  const early = p.navigations();
  await sleep(900);
  stopPage(p.w);
  assert(early === 0, "retried without waiting - would hammer TTD");
  assert(p.navigations() === 1 && p.pendingNow()?.tries === 4, `navigations ${p.navigations()}, pending ${JSON.stringify(p.pendingNow())}`);
  assert(p.logs.some((l) => /refreshing to reach .*\(try 4\//.test(l)), "try 4 should be a refresh");
});

test("still up after 5 refreshes -> opens /home/dashboard instead (try 6)", async () => {
  const p = open(CURTAIN_PAGE, CURTAIN_URL, {
    config: sniperConfig("23:59:59"),
    pending: { targetSeva: "Special Entry Darshan", until: Date.now() + 60000, tries: 5 },
  });
  await sleep(1400);
  stopPage(p.w);
  assert(p.logs.some((l) => /opening the dashboard to click "Special Entry Darshan" \(try 6\//.test(l)), "did not switch to the dashboard");
  assert(p.navigations() === 1, `${p.navigations()} navigations`);
});

test("refresh within 60 s of the drop (sniper re-fires on load) -> still paced at ~1 s, no reload storm", async () => {
  const p = open(CURTAIN_PAGE, CURTAIN_URL, {
    config: sniperConfig(hhmmss(new Date())), // drop time = now: the sniper fires again on this load
    pending: { targetSeva: "Special Entry Darshan", until: Date.now() + 60000, tries: 2 },
  });
  await sleep(500);
  const early = p.navigations();
  await sleep(900);
  stopPage(p.w);
  assert(p.logs.some((l) => /FIRING SNIPER ACTION NOW/.test(l)), "sniper did not re-fire (test setup)");
  assert(early === 0, `refreshed ${early}x immediately - should wait ~1 s`);
  assert(p.navigations() === 1 && p.pendingNow()?.tries === 3, `navigations ${p.navigations()}, pending ${JSON.stringify(p.pendingNow())}`);
});

test("master switch turned off during the retries -> stops", async () => {
  const p = open(CURTAIN_PAGE, CURTAIN_URL, {
    config: { ...sniperConfig("23:59:59"), sevaSniperEnabled: false },
    pending: { targetSeva: "Special Entry Darshan", until: Date.now() + 60000, tries: 2 },
  });
  await sleep(1400);
  stopPage(p.w);
  assert(p.navigations() === 0, "kept refreshing with automation OFF");
  assert(p.pendingNow() === null, "pending note not cleared");
});

test("gives up after the retry limit (~2 min) with a message", async () => {
  const p = open(CURTAIN_PAGE, CURTAIN_URL, {
    config: sniperConfig("23:59:59"),
    pending: { targetSeva: "Special Entry Darshan", until: Date.now() + 60000, tries: 120 },
  });
  await sleep(1400);
  stopPage(p.w);
  assert(p.navigations() === 0, "kept navigating past the limit");
  assert(p.pendingNow() === null, "pending note not cleared");
  assert(p.logs.some((l) => /Curtain still up after 120 tries/.test(l)), "no give-up message");
});

test("curtain without a pending sniper (and no drop now) -> nothing happens", async () => {
  const p = open(CURTAIN_PAGE, CURTAIN_URL, { config: sniperConfig("23:59:59") });
  await sleep(1400);
  stopPage(p.w);
  assert(p.navigations() === 0, "navigated on its own");
});

test("dashboard without a pending note, on-load click off -> no click (unchanged)", async () => {
  const p = open(HOME_PAGE, "https://ttdevasthanams.ap.gov.in/home/dashboard", { config: sniperConfig("23:59:59") });
  await sleep(600);
  stopPage(p.w);
  assert(!p.logs.some((l) => /Auto-clicking target Seva tile/.test(l)), "clicked a tile without being asked");
});

test("expired pending note is ignored", async () => {
  const p = open(HOME_PAGE, "https://ttdevasthanams.ap.gov.in/home/dashboard", {
    config: sniperConfig("23:59:59"),
    pending: { targetSeva: "Special Entry Darshan", until: Date.now() - 1000, tries: 2 },
  });
  await sleep(600);
  stopPage(p.w);
  assert(!p.logs.some((l) => /Auto-clicking target Seva tile/.test(l)), "acted on an expired note");
});

run();
