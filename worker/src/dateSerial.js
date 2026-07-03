// Google Sheets serial date system: day 0 = 1899-12-30, no Excel 1900 leap-year bug.
// Reference: https://developers.google.com/sheets/api/guides/formats#about_dates
const EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86400000;

function daysSinceEpochUTC(y, m, d) {
  return (Date.UTC(y, m - 1, d) - EPOCH_UTC_MS) / MS_PER_DAY;
}

// 'YYYY-MM-DD' -> integer serial (no time component, no timezone ambiguity).
export function dateOnlyToSerial(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return daysSinceEpochUTC(y, m, d);
}

// integer serial -> 'YYYY-MM-DD'
export function serialToDateOnlyString(serial) {
  const ms = EPOCH_UTC_MS + Math.round(serial) * MS_PER_DAY;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function tzPartsToUTCms(y, m, d, h, mi, s) {
  return Date.UTC(y, m - 1, d, h, mi, s);
}

function getTimeZoneOffsetMs(timeZone, utcInstantMs) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = {};
  for (const p of dtf.formatToParts(new Date(utcInstantMs))) parts[p.type] = p.value;
  const asUTC = tzPartsToUTCms(
    Number(parts.year), Number(parts.month), Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  return asUTC - utcInstantMs; // timeZone wall-clock time minus UTC time
}

function zonedWallClockToUTCms(y, m, d, h, mi, s, timeZone) {
  const guessUTC = tzPartsToUTCms(y, m, d, h, mi, s);
  const offset = getTimeZoneOffsetMs(timeZone, guessUTC);
  return guessUTC - offset;
}

// ISO instant string -> serial, placed on the grid as SHEET_TIMEZONE would show it.
export function instantToSerial(isoString, timeZone) {
  const instantMs = new Date(isoString).getTime();
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = {};
  for (const p of dtf.formatToParts(new Date(instantMs))) parts[p.type] = p.value;
  const days = daysSinceEpochUTC(Number(parts.year), Number(parts.month), Number(parts.day));
  const fraction = (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) / 86400;
  return days + fraction;
}

// serial -> ISO instant string, interpreting the serial's wall-clock as SHEET_TIMEZONE.
export function serialToInstantISO(serial, timeZone) {
  const days = Math.floor(serial);
  const fraction = serial - days;
  const dateMs = EPOCH_UTC_MS + days * MS_PER_DAY;
  const dateOnly = new Date(dateMs);
  const y = dateOnly.getUTCFullYear();
  const m = dateOnly.getUTCMonth() + 1;
  const d = dateOnly.getUTCDate();
  const totalSeconds = Math.round(fraction * 86400);
  const h = Math.floor(totalSeconds / 3600);
  const mi = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const utcMs = zonedWallClockToUTCms(y, m, d, h, mi, s, timeZone);
  return new Date(utcMs).toISOString();
}
