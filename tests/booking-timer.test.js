// Booking timer (content.js): starts at the target service click (or the calendar auto-pick if the service was
// clicked by hand), stops at the last payment click (Generate / Pay Now / Proceed). Shown only when Seva & Sniper
// is ON and "Show booking timer" is ticked.
const { referencePage, loadPage, stopPage, sleep, test, run, assert } = require("./helpers");

const HOME_PAGE = referencePage("home/seva_container.html");
const PAT_PAGE = referencePage("calendar/Calendar_Ammavari_Page.html");
const TIMER_KEY = "ttdBookingTimer";
const config = (extra = {}) => ({ sevaSniperEnabled: true, showBookingTimer: true, targetSeva: "Special Entry Darshan", autoClickTargetSeva: true, ...extra });

const field = (label) => `<div style="position: relative;"><label>${label}</label><input type="text" /></div>`;
const CARD_PAGE = `<!doctype html><html><body>${field("Card number")}${field("Expiry (MM/YY)")}${field("CVV")}${field("Name on Card")}
  <div class="css-1qrn2ps"><button class="j-button j-button-size__medium primary j-button-flex" aria-label="button Proceed"><div>Proceed</div></button></div></body></html>`;
const UPI_PAGE = `<!doctype html><html><body><button class="j-button j-button-size__medium secondary">Generate QR</button></body></html>`;

function open(html, url, { cfg = config(), timer, pending } = {}) {
  const storage = { ttdSniperConfig: cfg };
  const { window: w, logs } = loadPage(html, {
    url,
    storage,
    beforeScripts(w) {
      if (timer) w.sessionStorage.setItem(TIMER_KEY, JSON.stringify(timer));
      if (pending) w.sessionStorage.setItem("ttdAutofillFollowUpContinue", JSON.stringify(pending));
    },
  });
  const badge = () => w.document.getElementById("ttd-autofill-timer");
  const badgeText = () => badge()?.querySelector("[data-text]")?.textContent || "";
  const timerNow = () => JSON.parse(w.sessionStorage.getItem(TIMER_KEY) || "null");
  return { w, logs, storage, badge, badgeText, timerNow };
}

const payStage = (stage, paymentMethod) => ({
  sourceUrl: "x", stage, stageDeadline: Date.now() + 30000, createdAt: Date.now(), clickPayNow: true, paymentMethod,
  cardDetails: { cardNumber: "4111111111111111", expiry: "12/30", cvv: "123", cardName: "TEST CARDHOLDER" },
});

test("service tile clicked -> timer starts and shows on the page", async () => {
  const p = open(HOME_PAGE, "https://ttdevasthanams.ap.gov.in/home/dashboard");
  await sleep(500);
  stopPage(p.w);
  assert(p.timerNow()?.startLabel === "Special Entry Darshan", `timer: ${JSON.stringify(p.timerNow())}`);
  assert(/⏱ Booking timer \d/.test(p.badgeText()), `badge: "${p.badgeText()}"`);
});

test("running timer keeps counting on the next page (queue, calendar...)", async () => {
  const p = open("<!doctype html><html><body>queue</body></html>", "https://ttdevasthanams.ap.gov.in/queue", { timer: { start: Date.now() - 42000, startLabel: "Special Entry Darshan" } });
  await sleep(300);
  stopPage(p.w);
  assert(/⏱ Booking timer 42\.\d s/.test(p.badgeText()), `badge: "${p.badgeText()}"`);
});

test("card: Proceed clicked -> timer stops, shows the total, saves the last run", async () => {
  const p = open(CARD_PAGE, "https://ttdevasthanams.ap.gov.in/payment", {
    timer: { start: Date.now() - 12300, startLabel: "Special Entry Darshan" },
    pending: payStage("card", "card"),
  });
  await sleep(2000);
  stopPage(p.w);
  assert(/✅ Booking automated in 1[2-4]\.\d s \(Special Entry Darshan → Proceed\)/.test(p.badgeText()), `badge: "${p.badgeText()}"`);
  const last = p.storage.ttdLastBookingRun;
  assert(last && last.endLabel === "Proceed" && last.ms >= 12300 && last.ms < 15000, `saved: ${JSON.stringify(last)}`);
});

test("UPI: Generate clicked -> timer stops", async () => {
  const p = open(UPI_PAGE, "https://ttdevasthanams.ap.gov.in/payment", {
    timer: { start: Date.now() - 8000, startLabel: "Special Entry Darshan" },
    pending: payStage("generate", "upi"),
  });
  await sleep(800);
  stopPage(p.w);
  assert(/✅ Booking automated in [89]\.\d s \(Special Entry Darshan → Generate\)/.test(p.badgeText()), `badge: "${p.badgeText()}"`);
});

test("finished timer isn't restarted or changed by a later click", async () => {
  const done = { start: 1000, end: 15000, startLabel: "Special Entry Darshan", endLabel: "Proceed" };
  const p = open(UPI_PAGE, "https://ttdevasthanams.ap.gov.in/payment", { timer: done, pending: payStage("generate", "upi") });
  await sleep(800);
  stopPage(p.w);
  assert(JSON.stringify(p.timerNow()) === JSON.stringify(done), `timer changed: ${JSON.stringify(p.timerNow())}`);
});

test("Seva & Sniper OFF -> no timer on the page", async () => {
  const p = open("<!doctype html><html><body>queue</body></html>", "https://ttdevasthanams.ap.gov.in/queue", {
    cfg: config({ sevaSniperEnabled: false }), timer: { start: Date.now() - 5000, startLabel: "Special Entry Darshan" },
  });
  await sleep(300);
  stopPage(p.w);
  assert(!p.badge(), "timer shown with Seva & Sniper OFF");
});

test("\"Show booking timer\" unticked -> no timer on the page", async () => {
  const p = open("<!doctype html><html><body>queue</body></html>", "https://ttdevasthanams.ap.gov.in/queue", {
    cfg: config({ showBookingTimer: false }), timer: { start: Date.now() - 5000, startLabel: "Special Entry Darshan" },
  });
  await sleep(300);
  stopPage(p.w);
  assert(!p.badge(), "timer shown with the checkbox off");
});

test("× closes it, and it stays closed on the next page", async () => {
  const p = open("<!doctype html><html><body>queue</body></html>", "https://ttdevasthanams.ap.gov.in/queue", { timer: { start: Date.now() - 5000, startLabel: "Special Entry Darshan" } });
  await sleep(300);
  p.badge().querySelector("button").click();
  const saved = p.w.sessionStorage.getItem(TIMER_KEY);
  stopPage(p.w);
  assert(!p.badge(), "still shown after ×");
  const q = open("<!doctype html><html><body>calendar</body></html>", "https://ttdevasthanams.ap.gov.in/x", { timer: JSON.parse(saved) });
  await sleep(300);
  stopPage(q.w);
  assert(!q.badge(), "came back on the next page");
});

test("stale run (over 30 min, never finished) is dropped", async () => {
  const p = open("<!doctype html><html><body>queue</body></html>", "https://ttdevasthanams.ap.gov.in/queue", { timer: { start: Date.now() - 31 * 60000, startLabel: "Special Entry Darshan" } });
  await sleep(300);
  stopPage(p.w);
  assert(!p.badge() && p.timerNow() === null, "stale timer shown/kept");
});

test("calendar auto-pick: starts the timer only when none is running", async () => {
  const cal = { ...config(), autoPickerEnabled: true, ticketCount: "1", autoContinueCalendar: false, arjithaSeva: "any" };
  const fresh = open(PAT_PAGE, "https://ttdevasthanams.ap.gov.in/spat/slot-booking", { cfg: cal });
  await Promise.race([fresh.w.autoPickCalendarAndSlot(cal, { manual: true }), sleep(3000)]);
  stopPage(fresh.w);
  assert(fresh.timerNow()?.startLabel === "calendar", `no timer started: ${JSON.stringify(fresh.timerNow())}`);

  const running = { start: Date.now() - 20000, startLabel: "Special Entry Darshan" };
  const kept = open(PAT_PAGE, "https://ttdevasthanams.ap.gov.in/spat/slot-booking", { cfg: cal, timer: running });
  await Promise.race([kept.w.autoPickCalendarAndSlot(cal, { manual: true }), sleep(3000)]);
  stopPage(kept.w);
  assert(kept.timerNow()?.start === running.start, "restarted a running timer");
});

run();
