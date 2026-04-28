# Maestro E2E Tests — Quick Start

This folder contains end-to-end (E2E) tests that drive the **real running app** on a real device or emulator. Each YAML file is one user-flow scenario. Maestro launches your app, taps real buttons, types in real fields, and reports pass/fail.

Think of it as Selenium for your mobile app — but simpler.

---

## What's in here

| File | What it tests |
|---|---|
| `config.yaml` | Shared config (app id) |
| `01_login.yaml` | Login form → Home screen |
| `02_checkin.yaml` | User Attendance screen → Check In button → fingerprint prompt |
| `03_late_reason_popup.yaml` | "You're Late" popup design + Submit Reason flow |
| `04_checkout_confirmation.yaml` | Check Out confirmation popup with new wording + button labels |
| `05_waiver_request.yaml` | Late Waiver Request — Session 1 AND Session 2 visible, submission flow |

---

## One-time setup (Windows)

### Step 1 — Install Maestro CLI

Open **PowerShell** (you don't need admin rights):

```powershell
iwr -useb https://get.maestro.mobile.dev | iex
```

This downloads the Maestro binary and adds it to your PATH. Restart your terminal afterwards.

Verify install:

```cmd
maestro --version
```

You should see something like `1.x.x`.

### Step 2 — Get a device or emulator ready

**Option A — Real Android phone:**
1. Settings → About phone → tap "Build number" 7 times → Developer options enabled
2. Settings → Developer options → enable "USB debugging"
3. Plug into PC with USB cable
4. On the phone, tap "Allow" when the trust prompt appears
5. Verify: `adb devices` should list your phone

**Option B — Android emulator:**
1. Open Android Studio → Device Manager → Create Device
2. Pick a Pixel 5 (or any modern device profile) + API 33+
3. Start the emulator

### Step 3 — Install your app on that device

```cmd
cd c:\Users\sriba\Desktop\employee_attendance
npx expo run:android
```

This builds the dev APK and installs it on the connected device. Keep Metro running in another terminal.

Confirm the app's package id matches the one in `.maestro/config.yaml`:

- `appId: com.danat.alphalize` (from `app.json` → `expo.android.package`)

### Step 4 — Set test credentials

Open `.maestro/01_login.yaml` and replace:

```yaml
- inputText: "TEST_USER@example.com"
- inputText: "TEST_PASSWORD"
```

with a real test account on your Odoo server. **Use a dedicated test user**, not a real employee account — these flows will check in / check out / submit waivers, polluting their attendance records.

---

## Run the tests

### Run a single flow

```cmd
cd c:\Users\sriba\Desktop\employee_attendance
maestro test .maestro/01_login.yaml
```

You'll see the device wake up, the app launch, and Maestro tap through the steps. At the end you get a green PASS or red FAIL with the exact step that failed.

### Run all flows in order

```cmd
maestro test .maestro/
```

Maestro runs all `.yaml` files alphabetically. Total runtime: ~2-3 minutes for 5 flows.

### Run interactively (record mode)

If you want to see Maestro paint a colored overlay on each tap as it happens:

```cmd
maestro studio
```

This opens a browser-based UI where you can:
- See the live device screen
- Walk through each step manually
- Record new flows by tapping in the UI

---

## Reading the results

Maestro writes a report to `.maestro/test-output/` with:

- A screenshot of the screen at each step
- The HTML report `.maestro/test-output/index.html`
- A pass/fail summary

Open `index.html` in any browser to see annotated screenshots — useful when a test fails and you need to see exactly which screen the app was on.

---

## Adapting flows to your real app

The flow files use `assertVisible: "text..."` to find UI elements by their displayed text. If your app uses slightly different labels, edit the YAML to match.

Common adjustments needed:

| Where | What to change |
|---|---|
| `01_login.yaml` | Email/password placeholder text, "SIGN IN" button label |
| `02_checkin.yaml` | "User Attendance" menu item label |
| `03_late_reason_popup.yaml` | Already matches the current popup design — should work as-is |
| `04_checkout_confirmation.yaml` | Already matches the new "YES, CHECK OUT" / "CANCEL" buttons |
| `05_waiver_request.yaml` | Menu navigation path to reach Waiver screen |

If you don't know the exact text shown for a button, use `maestro studio` and click the element — it'll show the matching text.

---

## When to run these

| When | What to run |
|---|---|
| **Before each release** | `maestro test .maestro/` (the full suite) |
| **After changing the late popup design** | `maestro test .maestro/03_late_reason_popup.yaml` |
| **After changing checkout flow** | `maestro test .maestro/04_checkout_confirmation.yaml` |
| **Daily smoke test** | `maestro test .maestro/01_login.yaml` |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `maestro: command not found` | Restart terminal after install. If still missing, check `%USERPROFILE%\.maestro\bin` is in PATH. |
| `No connected devices` | Run `adb devices` — should list one. If empty: re-plug USB, accept trust prompt on phone. |
| Test fails at `tapOn: "Login"` | The text might be different — use `maestro studio` to find the actual label. |
| Test times out at fingerprint | Real fingerprint can't be auto-passed. Use `Settings → Biometrics → Add fingerprint` on the emulator and pre-enroll a fingerprint, then use `adb shell input keyevent 26` to trigger; or edit the test to skip fingerprint when running on emulator. |
| App version mismatch (`com.danat.alphalize not installed`) | Run `npx expo run:android` to build and install the latest dev APK. |

---

## Adding new flows

Copy any existing `.yaml` file as a template, change the steps, save with the next number prefix (`06_<name>.yaml`).

Example new flow — Submit a leave request:

```yaml
appId: com.danat.alphalize
---
- launchApp:
    stopApp: false
- tapOn: "Leave Requests"
- tapOn: "New Request"
- tapOn: "Leave Type"
- tapOn: "Sick Leave"
- tapOn: "From Date"
# ... etc
- tapOn: "Submit"
- assertVisible: "Pending Approval"
```

Maestro YAML reference: <https://maestro.mobile.dev/api-reference/commands>

---

## What this gives you that Jest tests don't

| Concern | Jest (113 tests) | Maestro |
|---|---|---|
| Service payload to Odoo | ✅ | — |
| Offline queue logic | ✅ | — |
| Tapping Check In actually opens the camera | ❌ | ✅ |
| Popup actually appears at runtime | ❌ | ✅ |
| Navigation between screens works | ❌ | ✅ |
| Fingerprint flow reaches the prompt | ❌ | ✅ |
| Toast messages display | ❌ | ✅ |

Run **both** for full coverage — Jest gives you a 8-second safety net, Maestro gives you 3-minute deep verification before each release.
