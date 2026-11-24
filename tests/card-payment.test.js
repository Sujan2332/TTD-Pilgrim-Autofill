// Card payment step (content.js follow-up "card" stage): fill the card form, then click its submit button ONCE.
const { loadPage, stopPage, sleep, test, run, assert } = require("./helpers");

const CARD = { cardNumber: "4111111111111111", expiry: "12/30", cvv: "123", cardName: "TEST CARDHOLDER" };

const field = (label) => `<div style="position: relative;"><label>${label}</label><input type="text" /></div>`;
// Gateway's narrow (small-window) layout: submit is "Proceed" - markup as on the live page
const PROCEED = '<div class="css-1qrn2ps"><button class="j-button j-button-size__medium primary j-button-flex" aria-label="button Proceed"><div style="flex-basis: unset;">Proceed</div></button></div>';

function cardPage(buttonsHtml) {
  return `<!doctype html><html><body><h3>Pay via new card</h3>
    ${field("Card number")}${field("Expiry (MM/YY)")}${field("CVV")}${field("Name on Card")}
    ${buttonsHtml}</body></html>`;
}

// hidden: button texts to treat as hidden (zero size, like Chrome reports for display:none - jsdom has no layout)
async function runCardStage(html, { hidden = [] } = {}) {
  const clicks = {};
  const { window: w, logs } = loadPage(html, {
    url: "https://ttdevasthanams.ap.gov.in/payment/card",
    beforeScripts(w) {
      w.sessionStorage.setItem("ttdAutofillFollowUpContinue", JSON.stringify({
        sourceUrl: w.location.href, stage: "card", stageDeadline: Date.now() + 30000, createdAt: Date.now(),
        clickPayNow: true, paymentMethod: "card", cardDetails: CARD,
      }));
      w.document.querySelectorAll("button").forEach((b) => {
        const name = b.textContent.trim();
        clicks[name] = 0;
        b.addEventListener("click", () => clicks[name]++);
        if (hidden.includes(name)) b.getBoundingClientRect = () => ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 });
      });
    },
  });
  await sleep(2500);
  const values = [...w.document.querySelectorAll("input")].map((i) => i.value);
  stopPage(w);
  return { clicks, values, logs };
}

test("small-window layout: card filled, then Proceed clicked exactly once", async () => {
  const r = await runCardStage(cardPage(PROCEED));
  assert(r.values.join("|") === "4111111111111111|12/30|123|TEST CARDHOLDER", `card fields: ${r.values.join(" | ")}`);
  assert(r.clicks.Proceed === 1, `Proceed clicked ${r.clicks.Proceed} times`);
});

test("desktop layout: Pay Now still used (and clicked once)", async () => {
  const r = await runCardStage(cardPage('<button>Pay Now</button>'));
  assert(r.clicks["Pay Now"] === 1, `Pay Now clicked ${r.clicks["Pay Now"]} times`);
});

test("both present: Pay Now preferred, Proceed left alone", async () => {
  const r = await runCardStage(cardPage(`<button>Pay Now</button>${PROCEED}`));
  assert(r.clicks["Pay Now"] === 1 && r.clicks.Proceed === 0, `Pay Now ${r.clicks["Pay Now"]}x, Proceed ${r.clicks.Proceed}x`);
});

test("hidden Pay Now left in the DOM by an earlier page is ignored - visible Proceed clicked", async () => {
  const hiddenPayNow = '<div style="display: none;"><button class="ReviewDetails_desktopPaynowButton__x">Pay Now</button></div>';
  const r = await runCardStage(cardPage(hiddenPayNow + PROCEED), { hidden: ["Pay Now"] });
  assert(r.clicks["Pay Now"] === 0, `hidden Pay Now clicked ${r.clicks["Pay Now"]} times`);
  assert(r.clicks.Proceed === 1, `Proceed clicked ${r.clicks.Proceed} times`);
});

test("disabled Proceed is not clicked", async () => {
  const r = await runCardStage(cardPage(PROCEED.replace("<button ", "<button disabled ")));
  assert(r.clicks.Proceed === 0, `disabled Proceed clicked ${r.clicks.Proceed} times`);
});

run();
