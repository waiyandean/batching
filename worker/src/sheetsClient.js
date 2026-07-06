import { getAccessToken } from './auth.js';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const RETRY_STATUSES = new Set([429, 500, 503]);
const RETRY_DELAYS_MS = [300, 900];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(env, method, url, body) {
  const token = await getAccessToken(env);
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return res.json();
    const text = await res.text();
    if (RETRY_STATUSES.has(res.status) && attempt < RETRY_DELAYS_MS.length) {
      lastErr = text;
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    let message = text;
    try {
      const parsed = JSON.parse(text);
      message = parsed.error?.message || text;
    } catch (_) {
      // not JSON, keep raw text
    }
    throw new Error(message);
  }
  throw new Error(lastErr || 'Sheets API request failed after retries');
}

export function isUnknownRangeError(err) {
  return typeof err.message === 'string' && err.message.includes('Unable to parse range');
}

export function isAlreadyExistsError(err) {
  return typeof err.message === 'string' && /already exists/i.test(err.message);
}

export async function getMeta(env, fields) {
  const url = `${BASE}/${env.GOOGLE_SHEET_ID}?fields=${encodeURIComponent(fields)}`;
  return request(env, 'GET', url);
}

export async function valuesGet(env, range, opts = {}) {
  return valuesGetFrom(env, env.GOOGLE_SHEET_ID, range, opts);
}

// Same as valuesGet but against an explicit spreadsheet id (the batching worker
// otherwise only ever touches env.GOOGLE_SHEET_ID). Used by the catalog read
// path, which lives in the shared stock-check sheet, not the batching sheet.
export async function valuesGetFrom(env, spreadsheetId, range, opts = {}) {
  const params = new URLSearchParams();
  if (opts.valueRenderOption) params.set('valueRenderOption', opts.valueRenderOption);
  const qs = params.toString();
  const url = `${BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}${qs ? '?' + qs : ''}`;
  const data = await request(env, 'GET', url);
  return data.values || [];
}

export async function valuesBatchGet(env, ranges, opts = {}) {
  const params = new URLSearchParams();
  ranges.forEach((r) => params.append('ranges', r));
  if (opts.valueRenderOption) params.set('valueRenderOption', opts.valueRenderOption);
  const url = `${BASE}/${env.GOOGLE_SHEET_ID}/values:batchGet?${params.toString()}`;
  const data = await request(env, 'GET', url);
  return data.valueRanges || [];
}

export async function valuesUpdate(env, range, values, opts = {}) {
  const valueInputOption = opts.valueInputOption || 'RAW';
  const url = `${BASE}/${env.GOOGLE_SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=${valueInputOption}`;
  return request(env, 'PUT', url, { range, majorDimension: 'ROWS', values });
}

export async function valuesAppend(env, range, values, opts = {}) {
  const valueInputOption = opts.valueInputOption || 'RAW';
  // OVERWRITE (not INSERT_ROWS): appending after the header should just fill the
  // next already-blank row. INSERT_ROWS does a literal structural row-insert, which
  // copies the formatting of the row above (the header's dark background/bold text)
  // down onto the new data row -- a real formatting bug we hit during testing.
  const insertDataOption = opts.insertDataOption || 'OVERWRITE';
  const url = `${BASE}/${env.GOOGLE_SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=${valueInputOption}&insertDataOption=${insertDataOption}`;
  return request(env, 'POST', url, { range, majorDimension: 'ROWS', values });
}

// data: [{ range: 'A1Range', values: [[...]] }, ...]
export async function valuesBatchUpdate(env, data, opts = {}) {
  const valueInputOption = opts.valueInputOption || 'RAW';
  const url = `${BASE}/${env.GOOGLE_SHEET_ID}/values:batchUpdate`;
  return request(env, 'POST', url, {
    valueInputOption,
    data: data.map((d) => ({ range: d.range, majorDimension: 'ROWS', values: d.values })),
  });
}

// requests: structural/formatting requests, e.g. { addSheet: {...} }, { repeatCell: {...} }
export async function batchUpdate(env, requests) {
  const url = `${BASE}/${env.GOOGLE_SHEET_ID}:batchUpdate`;
  return request(env, 'POST', url, { requests });
}
