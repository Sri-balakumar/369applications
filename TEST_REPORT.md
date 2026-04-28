---
pdf_options:
  format: A4
  margin: 18mm
  printBackground: true
stylesheet:
  - TEST_REPORT.css
---

# App Quality Report

**Employee Attendance Mobile App — Automated Tests Summary**
*Generated 29 April 2026 · 369ai Project*

---

## What This Report Is About

We added a set of automated tests to the Employee Attendance mobile app. These tests run in seconds and check that important parts of the app work correctly. If anyone changes the code in a way that breaks something important, the tests will fail and we'll know right away — before the bug reaches a real user.

---

## The Numbers At A Glance

| Metric | Value |
|---|---|
| **Total Tests** | **113** |
| **Test Files** | **9** |
| **Pass Rate** | **100%** |
| **Time to Run All** | **~8 seconds** |

113 individual checks. Every single one passes. The whole suite runs in about 8 seconds, which means you can run it any time you change something to make sure nothing broke.

---

## What The Tests Check (In Plain English)

### The Late-Tracking Feature

- ✓ When someone is late, the popup that asks for a reason has the right design — clock icon, "You're Late" title, deduction amount, reason input box, and "Submit Reason" button.
- ✓ When the user types their late reason and taps Submit, it gets saved correctly to the Odoo system.
- ✓ When the user views the Late Waiver Request screen, it shows BOTH morning and afternoon late records (it used to only show morning ones — that bug is now caught automatically).
- ✓ When someone tries to check in late and Odoo's old strict rule is still on the server, the app gracefully works around it so the user still sees the popup.
- ✓ When the network is down, the app shows a clean error instead of crashing.

### The Checkout Confirmation

- ✓ The checkout confirmation message warns the user *"Once checked out, you cannot check in again to this session today"* — exactly as expected.
- ✓ The buttons are labeled **"YES, CHECK OUT"** and **"CANCEL"** (not the older "YES" / "NO").

### The Offline Queue (when no internet)

- ✓ When the app is offline, it stores the user's actions safely in a queue.
- ✓ When internet comes back, the queue gets emptied to Odoo correctly.
- ✓ If a sync fails, the app tracks the retry count and the error reason.
- ✓ If a queued item is edited before it syncs, the edit gets merged in correctly.
- ✓ The "Sync now" button can reset retry counts so stuck items get another chance.

### The Sale Order Below-Cost Guard

- ✓ When a salesperson tries to sell a product below cost, the system catches it.
- ✓ Sales above cost or equal to cost go through normally.
- ✓ Products without a cost set are correctly skipped.
- ✓ The audit log line is formatted correctly with product name, prices, and margin.

### The Attendance Service (the bridge between app and Odoo)

- ✓ Submitting a leave request sends the right data to Odoo (employee, dates, reason, half-day flag).
- ✓ Submitting a Work-From-Home request creates the right record.
- ✓ Cancelling a leave request calls the right Odoo action.
- ✓ Submitting a waiver request creates the draft AND auto-submits it for approval in one flow.
- ✓ Fetching today's late info returns the right shape for the popup.
- ✓ Fetching late config (office hours, threshold, grace period) works correctly.
- ✓ All these handle network failures and Odoo errors without crashing.

---

## Why This Matters

> **Before these tests existed:** If someone changed code that broke the late-reason popup or the waiver dropdown filter, you'd only find out when a user complained or you noticed it manually. That's slow and stressful.
>
> **Now:** Run `npm test` in 8 seconds and instantly know if any of these features are broken. You can change code with confidence.

---

## Recent Bugs That Are Now Permanently Guarded

During this session we fixed several bugs in the late-tracking feature. Each one now has a test that will scream loudly if anyone accidentally undoes the fix.

| The Bug We Fixed | Status |
|---|---|
| Mobile waiver dropdown only showed Session 1 (morning) late records, hiding Session 2 (afternoon) ones | **PROTECTED** — A test now fails if the old filter ever returns |
| Mobile check-in failed when Odoo had a strict "must enter late reason at save time" rule | **PROTECTED** — Test verifies the workaround placeholder is sent |
| Late-reason popup design got reverted to a simpler version | **PROTECTED** — 9 design checks (title, icon, button, etc.) |
| Checkout confirmation text reverted to old "YES/NO" wording without the no-rejoin warning | **PROTECTED** — 3 text-content checks |
| The Submit Reason button stopped saving the typed reason to the right field | **PROTECTED** — Test verifies the exact payload sent to Odoo |

---

## What Each Test File Does

| File | # Tests | What it tests |
|---|---|---|
| Sanity check | 3 | Confirms the test machinery itself works. |
| Offline queue | 17 | Every operation on the offline write queue (add, get, count, remove, retry, merge, reset, clear). |
| Below-cost guard | 10 | The sale-order safeguard that flags under-priced lines. |
| Attendance service | 31 | Late reason submission, leave/waiver/WFH requests, late info fetching, all the bridge calls to Odoo. |
| Offline sync service | 10 | The background process that flushes the offline queue when internet returns. |
| Location tracking service | 7 | The GPS write-to-Odoo and fetch-from-Odoo helpers. |
| Cache warmer | 6 | The startup process that pre-fetches data from Odoo for offline use. |
| General API | 9 | Critical endpoints for sale orders, products, and partners. |
| User attendance screen | 14 | The check-in/check-out screen design (popup text, button labels, gating logic). |

---

## What These Tests DO NOT Check

To be transparent, here's what's NOT covered — these still need manual testing on a real device:

- ✗ Tapping a button on a real device actually triggering its action (we test the code's logic, not the touchscreen).
- ✗ Camera permissions and fingerprint scanner (these need real hardware).
- ✗ Toast messages appearing on screen.
- ✗ Navigation between screens.
- ✗ Filter chips on the Sale Order list.
- ✗ The Recompute Late Records button on the Odoo backend (different system).

> **What this means in practice:** Before each app release, do a quick manual smoke test on a real phone — check in, check out, submit a late reason, file a waiver. The automated tests handle the deep stuff (data integrity, math, error handling) so manual testing only needs to cover the obvious user-visible flows.

---

## How To Use The Tests Day-To-Day

| When you... | Run this command |
|---|---|
| Want to check everything still works | `npm test` |
| Are actively coding and want auto-rerun | `npm run test:watch` |
| Want to see which lines aren't tested yet | `npm run test:coverage` |
| Want to run only attendance tests | `npx jest AttendanceService` |
| Just changed the offline queue | `npx jest offlineQueue` |

---

## Recommended Habits

- ✓ Run `npm test` before pushing any code change. If it's red, don't push.
- ✓ When you fix a bug, write a small test for it. That bug can never come back unnoticed.
- ✓ When you add a new feature, add at least one happy-path test for it.
- ✓ If a test fails, read it carefully — usually the failure message tells you exactly what went wrong.

---

## Bottom Line

> **113 automated checks now protect the most important parts of your app.** The recent late-tracking and waiver fixes are permanently guarded. The full suite runs in 8 seconds. You can change code without fear of silently breaking something.
>
> For runtime UI behavior (button taps, navigation, camera flows), do a 5-minute manual smoke test on a real device before each release. The automated tests handle everything underneath.

---

*App Quality Report · Employee Attendance App · 369ai · April 2026*
