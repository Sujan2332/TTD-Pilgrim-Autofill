// Calendar & slot auto-picker (content.js autoPickCalendarAndSlot) on saved TTD calendar pages.
const { referencePage, loadPage, stopPage, sleep, test, run, assert } = require("./helpers");

const PAT_PAGE = referencePage("calendar/Calendar_Ammavari_Page.html");

// The popup keeps the Arjitha temple/seva after the target service is switched, so the PAT config still carries them
const PAT_CONFIG_WITH_OLD_ARJITHA = {
  sevaSniperEnabled: true,
  targetSeva: "Special Entry Darshan (Ammavari Temple)",
  autoPickerEnabled: true,
  arjithaTemple: "Sri Padmavathi Ammavari Temple - Tiruchanoor",
  arjithaSeva: "Kalyana Kankanam",
  arjithaFallback: "ask",
  ticketCount: "1",
  autoContinueCalendar: false,
};

test("PAT: a leftover Arjitha seva setting doesn't trigger the \"seva not available\" prompt", async () => {
  const { window: w } = loadPage(PAT_PAGE, {
    url: "https://ttdevasthanams.ap.gov.in/spat/slot-booking?flow=spat&flowIdentifier=spat",
    storage: { ttdSniperConfig: PAT_CONFIG_WITH_OLD_ARJITHA },
  });
  const result = await Promise.race([
    w.autoPickCalendarAndSlot(PAT_CONFIG_WITH_OLD_ARJITHA, { manual: true }),
    sleep(4000).then(() => "still running after 4 s"),
  ]);
  const dialog = w.document.getElementById("ttd-autofill-choice");
  stopPage(w);
  assert(!dialog, `prompt shown on PAT: "${dialog && dialog.getAttribute("aria-label")}"`);
  assert(result && result.ok !== false && typeof result === "object", `picker result: ${JSON.stringify(result)}`);
});

// Arjitha must keep using the seva setting
const PADMAVATHI_PAGE = referencePage("arjitha-seva/temples/temple_4_Sri_Padmavathi_Ammavari_Temple_-_Tiruchanoor.html");
const arjithaConfig = (seva) => ({
  sevaSniperEnabled: true,
  targetSeva: "Arjitha Sevas",
  autoPickerEnabled: true,
  arjithaTemple: "Sri Padmavathi Ammavari Temple - Tiruchanoor",
  arjithaSeva: seva,
  arjithaFallback: "ask",
  ticketCount: "1",
  autoContinueCalendar: false,
});

async function pickOnPadmavathi(seva) {
  const config = arjithaConfig(seva);
  const { window: w, logs } = loadPage(PADMAVATHI_PAGE, { url: "https://ttdevasthanams.ap.gov.in/arjitha-seva", storage: { ttdSniperConfig: config } });
  const result = await Promise.race([w.autoPickCalendarAndSlot(config, { manual: true }), sleep(4000).then(() => "still running after 4 s")]);
  const dialog = w.document.getElementById("ttd-autofill-choice");
  stopPage(w);
  return { result, dialogTitle: dialog && dialog.getAttribute("aria-label"), logs };
}

test("Arjitha: seva offered on the page (Kalyanotsavam) -> picked, no prompt", async () => {
  const r = await pickOnPadmavathi("Kalyanotsavam");
  assert(!r.dialogTitle, `unexpected prompt "${r.dialogTitle}"`);
  assert(r.logs.some((l) => /Found match for target Arjitha Seva: "Kalyanotsavam"/.test(l)), "Kalyanotsavam was not matched");
});

test("Arjitha: seva not offered (Kalyana Kankanam, fallback = ask) -> still asks", async () => {
  const r = await pickOnPadmavathi("Kalyana Kankanam");
  assert(r.dialogTitle && /Kalyana Kankanam.*is not available/.test(r.dialogTitle), `expected the prompt, got "${r.dialogTitle}"`);
});

run();
