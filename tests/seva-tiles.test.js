// Target service tile matching (content.js findSevaTile / matchesSevaLabel) on the Pilgrim Services grid.
// Tile markup as on the live home page (Nov 2026 build, "qiuJGq_" prefix).
const { loadPage, stopPage, test, run, assert } = require("./helpers");

const tile = (label) => `<div class="qiuJGq_iconList"><div class="qiuJGq_icon"><img src="x.svg"></div><div class="qiuJGq_label">${label}</div></div>`;
const VD_SED = "Vaikunta Dwara Darshanam - Special Entry Darshan";
const VD_DIP = "Vaikunta Dwara Darshanam - Electronic Dip";
const SED = "Special Entry Darshan";
const PAT = "Special Entry Darshan (Ammavari Temple)";

function grid(labels) {
  const html = `<!doctype html><html><body><div class="qiuJGq_services">${labels.map(tile).join("")}</div></body></html>`;
  const { window: w } = loadPage(html, { url: "https://ttdevasthanams.ap.gov.in/home/dashboard", storage: { ttdSniperConfig: {} } });
  const pick = (target) => w.findSevaTile(target)?.textContent.trim() || null;
  return { w, pick };
}

// Live grid order (screenshot): Vaikunta Dwara SED first, Electronic Dip, PAT ... (plus the plain SED tile when offered)
const LIVE = [VD_SED, "Arjitha Sevas", VD_DIP, "Sri Srinivasa Divyanugraha Homam", "Accommodation", PAT, "Differently Abled/Sr.Citizen Darshan"];

test("Vaikunta Dwara SED target -> its own tile", () => {
  const { w, pick } = grid(LIVE);
  stopPage(w);
  assert(pick(VD_SED) === VD_SED, `picked "${pick(VD_SED)}"`);
});

test("Vaikunta Dwara SED never picks the Vaikunta Dwara Electronic Dip tile", () => {
  const { w, pick } = grid([VD_DIP, "Accommodation", SED]);
  stopPage(w);
  assert(pick(VD_SED) === null, `picked "${pick(VD_SED)}"`);
});

test("Vaikunta Dwara SED never picks the plain Special Entry Darshan tile", () => {
  const { w, pick } = grid([SED, PAT]);
  stopPage(w);
  assert(pick(VD_SED) === null, `picked "${pick(VD_SED)}"`);
});

test("Special Entry Darshan (₹300) target -> plain SED tile, even with Vaikunta Dwara SED listed first", () => {
  const { w, pick } = grid([VD_SED, VD_DIP, PAT, SED]);
  stopPage(w);
  assert(pick(SED) === SED, `picked "${pick(SED)}"`);
});

test("Special Entry Darshan (₹300) never falls back to the Vaikunta Dwara SED tile", () => {
  const { w, pick } = grid(LIVE); // no plain SED tile today
  stopPage(w);
  assert(pick(SED) === null, `picked "${pick(SED)}" - would book Vaikunta Dwara instead of SED`);
});

test("PAT / Ammavari target -> Ammavari tile, not either SED", () => {
  const { w, pick } = grid([VD_SED, SED, PAT]);
  stopPage(w);
  assert(pick(PAT) === PAT, `picked "${pick(PAT)}"`);
});

test("Vaikunta Dwara Electronic Dip target -> its own tile, with Vaikunta SED listed first", () => {
  const { w, pick } = grid(LIVE);
  stopPage(w);
  assert(pick(VD_DIP) === VD_DIP, `picked "${pick(VD_DIP)}"`);
});

test("Vaikunta Dwara Electronic Dip never picks Vaikunta SED or the plain Seva E-Dip tile", () => {
  const { w, pick } = grid([VD_SED, "Seva E-Dip", SED]);
  stopPage(w);
  assert(pick(VD_DIP) === null, `picked "${pick(VD_DIP)}"`);
});

test("Seva E-Dip target doesn't pick the Vaikunta Dwara Electronic Dip tile", () => {
  const { w, pick } = grid([VD_DIP, "Seva E-Dip"]);
  stopPage(w);
  assert(pick("Seva E-Dip") === "Seva E-Dip", `picked "${pick("Seva E-Dip")}"`);
});

run();
