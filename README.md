# TTD Pilgrim Autofill

**Save your pilgrim details once. Fill the official TTD booking form in seconds—not minutes.**

---

## Have you ever felt this?

You open [TTD Devasthanams](https://ttdevasthanams.ap.gov.in/) to book darshan or seva. Slots are limited. Everyone is refreshing at the same time. You finally get through—and then the real race begins.

You need to type **email, city, state, country, pincode** for the group. Then **name, age, gender, photo ID type, and ID number** for every pilgrim. Five people? That is dozens of fields. One typo in an Aadhaar digit and you start again. Your hands shake. The page times out. Someone else takes the slot.

Maybe you travel as a family and book for different combinations on different days. Maybe you help relatives who all share one address but different IDs. Copy-pasting from notes, WhatsApp, or a spreadsheet between tabs does not scale when every second counts.

**TTD Pilgrim Autofill** is a Chrome extension built for that moment. You prepare your groups ahead of time—at home, calmly—with import/export via JSON. On the booking page, you select who is traveling today and let the extension fill the form. Optional automation can continue to review, pay, and even choose UPI or card payment—so you spend your energy on *getting* the slot, not on retyping the same details for the hundredth time.

> This tool fills forms on **your** browser on **your** machine. It is not affiliated with TTD. Use it responsibly and always verify details before confirming payment.

---

## What it does

| Feature | Description |
|--------|-------------|
| **Multiple groups** | Store several families or trip combinations (default: 3 groups, 5 pilgrims each). Add more with **+ Add Group**. |
| **General + pilgrim details** | Email, address fields, and per-pilgrim name, age, gender, ID type, ID number. |
| **Select who books today** | Check only the pilgrims you need; autofill uses the first selected pilgrim’s group for general details. |
| **Import / export JSON** | Back up data, share a template with family, or restore after reinstalling the extension. |
| **One-click autofill** | Fills fields on `ttdevasthanams.ap.gov.in` by matching visible label text (works across many seva form layouts). |
| **Keyboard shortcut** | `Ctrl+Shift+Y` on the TTD tab (pilgrims must be selected in the popup first). |
| **Auto-run on load** | When enabled, runs autofill as soon as the pilgrim form appears (after you’ve selected pilgrims). |
| **Continue & Pay Now** | Optional: click through Continue / Confirm and Pay Now after filling. |
| **Payment helper** | Choose **UPI / Generate QR** or **Credit / Debit card**; card details can be stored locally or imported from JSON. |
| **On-page toasts** | Status messages appear on the TTD page even when the popup is closed. |

---

## Requirements

- **Google Chrome** (or a Chromium-based browser that supports Manifest V3 extensions, e.g. Edge with “Load unpacked”).
- Access to **https://ttdevasthanams.ap.gov.in/** while booking.

---

## Install in Chrome (Load unpacked)

You install this extension from the folder on your computer—no Chrome Web Store required.

### 1. Get the extension files

- **Clone or download** this repository, **or**
- Unzip the project folder if someone shared it with you.

You should see files such as `manifest.json`, `popup.html`, `content.js`, and an `icons` folder in the same directory.

### 2. Open Chrome’s extensions page

1. Open **Google Chrome**.
2. In the address bar, go to: `chrome://extensions/`
3. Or: menu **⋮** → **Extensions** → **Manage Extensions**.

### 3. Enable Developer mode

- Turn **Developer mode** **ON** (toggle in the top-right on the Extensions page).

### 4. Load the extension

1. Click **Load unpacked**.
2. Select the **folder** that contains `manifest.json` (the `ttd-autofill-extension` project root—not a parent folder and not a single file inside it).
3. Click **Select Folder**.

You should see **TTD Pilgrim Autofill** in the list, with the extension icon in the toolbar. If the icon is hidden, click the **puzzle piece** (Extensions) and pin **TTD Pilgrim Autofill**.

### 5. After updates

If you pull new code or replace files:

1. Go to `chrome://extensions/` again.
2. Find **TTD Pilgrim Autofill**.
3. Click the **Reload** (circular arrow) button on the extension card.

Your saved groups stay in Chrome local storage unless you clear extension data or remove the extension.

---

## First-time setup

### Open the popup

1. Go to any page (you do not have to be on TTD yet).
2. Click the **TTD Pilgrim Autofill** icon in the toolbar.

### Fill a group

1. Expand **General Details** for a group and enter **email, city, state, country, pincode**.
2. Enter each pilgrim’s **name, age, gender, photo ID type**, and **ID number**.
3. Repeat for other groups if you book different families or combinations.

Data is saved automatically in the browser as you type.

### Import from JSON (optional)

1. Click **Import JSON** and choose a `.json` file.
2. Format: a **top-level array of groups**. Each group is an array whose **first item** is general details and the **next items** (up to 5) are pilgrims:

```json
[
  [
    {
      "email": "you@example.com",
      "city": "Hyderabad",
      "state": "Telangana",
      "country": "India",
      "pincode": "500001"
    },
    {
      "name": "Rama Rao",
      "age": "45",
      "gender": "Male",
      "idType": "Aadhaar Card",
      "idNumber": "123456789012"
    },
    {
      "name": "Lakshmi",
      "age": "42",
      "gender": "Female",
      "idType": "Aadhaar Card",
      "idNumber": "987654321098"
    }
  ]
]
```

3. Use **Sample JSON** / **Export JSON** in the popup to download the current structure (empty template or your saved data).

### Card payment (optional)

1. Under **Payment method**, choose **Credit / Debit card**.
2. Expand **Card Details** and enter fields manually, **or**
3. Use **Card Sample JSON** / **Import Card JSON** (see `ttd-card-details-sample.json` in this repo for the shape).

> **Security:** Card details are stored in **Chrome local storage** on your device only. Never share your JSON exports publicly. Prefer UPI if you do not need card autofill.

---

## How to use on booking day

### Before the slot opens

1. Open the extension popup.
2. **Check the pilgrims** who will be on this booking (per group or use the header checkbox to select all).
3. Confirm **General Details** are complete for the group those pilgrims belong to (the first selected pilgrim’s group is used for address/email).
4. Set options at the bottom:
   - **Also click Continue and Pay Now after autofill** — automates the next steps when the site shows those buttons.
   - **Auto-run the moment the pilgrim form loads** — fills as soon as you land on the pilgrim details page (with pilgrims already selected).
   - **Payment method** — UPI / Generate QR or card (if you use Continue through to payment).

### On the TTD website

1. Log in and navigate to your seva/darshan booking until you reach the **Pilgrim Details** (and general details) form on `ttdevasthanams.ap.gov.in`.
2. Either:
   - Let **auto-run** fill the form when it loads, **or**
   - Click **Autofill Selected Pilgrims** in the popup, **or**
   - Press **`Ctrl+Shift+Y`** while the TTD tab is focused.

3. Watch the **toast notification** (top-right on the page) for success or errors.
4. **Review every field** on the official site before you confirm. You are responsible for accuracy and payment.

The extension can add pilgrim rows (up to 5) if you selected more pilgrims than the page initially shows, then fill each row.

### Keyboard shortcut

| Action | Shortcut |
|--------|----------|
| Autofill selected pilgrims | `Ctrl+Shift+Y` (Windows/Linux) |

The shortcut only works on an active **ttdevasthanams.ap.gov.in** tab and when at least one **named, selected** pilgrim exists in the popup.

To change the shortcut: `chrome://extensions/shortcuts` → find **TTD Pilgrim Autofill**.

---

## Popup controls quick reference

| Control | Purpose |
|---------|---------|
| Header checkbox | Select / deselect all pilgrims |
| Trash (header) | Delete **all** group data |
| **Import JSON** | Load groups from file |
| **Sample JSON** / **Export JSON** | Download template or backup |
| **+ Add Group** | Add another group |
| Group checkbox | Select all pilgrims in that group |
| Group trash | Delete that group |
| **General Details** | Toggle address/email section |
| **Autofill Selected Pilgrims** | Run fill on the active TTD tab |

---

## Tips for a smoother booking

1. **Prepare JSON once** and import before high-traffic days; export after changes as backup.
2. **Select pilgrims before** the form loads if you use auto-run.
3. **Turn off** “Continue and Pay Now” while testing fills; turn it on only when you trust your data.
4. If autofill misses a field, the site may have changed—fill manually and report issues if you maintain a fork.
5. Do not run multiple conflicting bookings; the extension detects some “booking already in progress” messages and surfaces them in the toast.

---

## Troubleshooting

| Problem | Things to try |
|---------|----------------|
| Extension does not appear | Confirm **Load unpacked** pointed at the folder with `manifest.json`. Pin the icon from the extensions menu. |
| Autofill does nothing | Be on `ttdevasthanams.ap.gov.in`, refresh the page, reload the extension, ensure pilgrims are **selected** and have **names**. |
| Shortcut does nothing | Same as above; check `chrome://extensions/shortcuts`. |
| Old behavior after update | **Reload** the extension on `chrome://extensions/`. Hard-refresh the TTD tab (`Ctrl+Shift+R`). |
| Import failed | Validate JSON: array of groups, first element per group = general object, then pilgrim objects. |

---

## Project structure (for developers)

```
ttd-autofill-extension/
├── manifest.json          # Extension manifest (MV3)
├── popup.html / popup.css / popup.js   # Popup UI and storage
├── content.js             # Form fill logic on TTD site
├── background.js          # Keyboard shortcut handler
├── icons/                 # Extension icons
└── ttd-card-details-sample.json
```

---

## Privacy & disclaimer

- Data stays in **your browser** (`chrome.storage.local`) unless you export JSON yourself.
- The extension runs only on **https://ttdevasthanams.ap.gov.in/** (see `host_permissions` in `manifest.json`).
- **Not official TTD software.** Tirumala Tirupati Devasthanams may change their website at any time.
- Always verify pilgrim and payment details on the official site before submitting.

---

## License

If this repository includes a license file, follow that license. Otherwise, treat usage as at your own risk for personal booking assistance.

---

**Om Namo Venkatesaya.** May your booking be swift—and may you always double-check the form before Pay Now.
