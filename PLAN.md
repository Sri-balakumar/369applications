# WFH + Office Attendance Implementation Plan

## Overview
When user taps "User Attendance", show two options: **Office** and **Work From Home**.

## Flow

### 1. Mode Selection (New initial screen in UserAttendanceScreen)
- Two card buttons: "Office" (green) and "Work From Home" (blue)
- State: `attendanceMode` = `null` | `'office'` | `'wfh'`
- Back button resets to mode selection

### 2. Office Mode (existing flow, unchanged)
- Fingerprint scan → device ID lookup → location verification → check-in/check-out with camera

### 3. Work From Home Mode
After fingerprint verification + device ID lookup:

**Case A: No approved WFH request for today**
- Show WFH request form:
  - Date picker (defaults to today)
  - Reason text input (required)
  - Submit button
- On submit: creates `hr.wfh.request` record in Odoo (state=draft), then calls `action_submit` to move to pending
- Shows success: "WFH request submitted for approval"
- Also shows list of past/pending WFH requests with status

**Case B: Approved WFH request exists for today**
- Show check-in/check-out buttons (same UI as office mode)
- On check-in: calls `action_checkin` on the WFH request (no location verification, camera still required)
- On check-out: calls `action_checkout` on the WFH request (fingerprint re-verify, camera still required)
- The Odoo model handles creating/updating hr.attendance records automatically

## Files to Modify

### `src/services/AttendanceService.js` - Add 4 new functions:
1. `submitWfhRequest(userId, date, reason)` - POST to create hr.wfh.request + call action_submit
2. `getTodayApprovedWfh(userId)` - Search hr.wfh.request where request_date=today, state in [approved, checked_in]
3. `wfhCheckIn(requestId)` - Call action_checkin on hr.wfh.request
4. `wfhCheckOut(requestId)` - Call action_checkout on hr.wfh.request

### `src/screens/Home/Options/UserAttendance/UserAttendanceScreen.js` - Major changes:
1. Add mode selection UI (before fingerprint screen)
2. Add WFH request form UI (date picker, reason input, submit)
3. Add WFH check-in/check-out flow (skip location verification)
4. Add WFH request status display

## Odoo Model: `hr.wfh.request`
- `employee_user_id` (many2one res.users)
- `request_date` (date)
- `reason` (text)
- `state`: draft → pending → approved → checked_in → checked_out
- Actions: `action_submit`, `action_checkin`, `action_checkout`
