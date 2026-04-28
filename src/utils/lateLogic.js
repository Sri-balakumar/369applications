// Pure helper that computes whether a given check-in time is late, based
// on a cached Odoo late-config payload. Used in the offline check-in flow
// where we can't ask the server for `is_late` / `late_minutes`.
//
// Mirrors the session-detection logic in
// odoo_modules/hr_attendance_late/models/hr_attendance.py:
//   - Anything at/after office_start_hour_2 (split shift) → Session 2
//   - Otherwise → Session 1
// Late if check-in > session-start + threshold minutes.

/**
 * @param {Date} checkInDate            local Date object (employee's tz)
 * @param {object|null} lateConfig      raw cached config from
 *                                      `hr.attendance.late.config.get_config_for_employee`
 * @returns {{
 *   isLate: boolean,
 *   lateMinutes?: number,
 *   lateMinutesDisplay?: string,
 *   session?: '1'|'2',
 *   expectedStart?: number,
 * }}
 */
// Convert a float hour (e.g. 13.25) to "HH:MM" matching Odoo's display.
export const floatToHM = (h) => {
  const total = Math.round((h ?? 0) * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

export const computeLocalLateInfo = (checkInDate, lateConfig) => {
  if (!checkInDate || isNaN(checkInDate?.getTime?.())) return { isLate: false };

  // Hardcoded sensible defaults if no cached config exists yet (first run,
  // or user never went online before checking in offline). This guarantees
  // the popup still fires for genuinely-late check-ins instead of silently
  // skipping because of a null cache.
  const config = lateConfig || {
    shift_type: 'split',
    office_start_hour: 8.0,
    office_start_hour_2: 14.0,
    late_threshold_minutes: 15,
  };

  const localHour = checkInDate.getHours() + checkInDate.getMinutes() / 60;
  const session2Start = typeof config.office_start_hour_2 === 'number' ? config.office_start_hour_2 : 14.0;
  const session1Start = typeof config.office_start_hour === 'number' ? config.office_start_hour : 8.0;
  const threshold = typeof config.late_threshold_minutes === 'number' ? config.late_threshold_minutes : 15;
  const shiftType = config.shift_type ?? 'split';

  const isSession2 = shiftType === 'split' && localHour >= session2Start;
  const officeStart = isSession2 ? session2Start : session1Start;

  const officeStartDt = new Date(checkInDate);
  officeStartDt.setHours(
    Math.floor(officeStart),
    Math.round((officeStart % 1) * 60),
    0,
    0,
  );
  const allowedDt = new Date(officeStartDt.getTime() + threshold * 60 * 1000);

  console.log('[late-calc] config session1:', session1Start, 'session2:', session2Start,
              'threshold:', threshold, 'shift:', shiftType,
              '→ chose session', isSession2 ? '2' : '1', 'expectedStart:', officeStart,
              'checkInLocalHour:', localHour.toFixed(3));

  if (checkInDate <= allowedDt) {
    return {
      isLate: false,
      session: isSession2 ? '2' : '1',
      expectedStart: officeStart,
      expectedStartDisplay: floatToHM(officeStart),
    };
  }

  const lateMinutes = Math.floor((checkInDate - officeStartDt) / 60000);
  const h = Math.floor(lateMinutes / 60);
  const m = lateMinutes % 60;

  return {
    isLate: true,
    lateMinutes,
    lateMinutesDisplay: `${h}:${String(m).padStart(2, '0')}`,
    session: isSession2 ? '2' : '1',
    expectedStart: officeStart,
    expectedStartDisplay: floatToHM(officeStart),
  };
};
