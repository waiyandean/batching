import { valuesAppend, batchUpdate } from '../sheetsClient.js';
import { getSheetsMeta, ensureSheetExists, ensureHeaders } from '../sheetSetup.js';
import { a1Quote, safeSheetName, parseAppendedRowNum } from '../sheetUtils.js';
import { dateOnlyToSerial, instantToSerial } from '../dateSerial.js';
import { SHEET_TIMEZONE, DATE_FORMAT, DATETIME_FORMAT, LABEL_YES_BG, LABEL_YES_FG, LABEL_NO_BG, LABEL_NO_FG } from '../constants.js';

function buildProductHeaders(record) {
  const isCooked = record.productCategory === 'cooked';
  let fixed = ['ID', 'Date', 'Site', 'Staff', 'Category', 'Product Batch', 'Equipment Check', 'Packets Produced', 'Finished Temp (°C)'];
  if (isCooked) fixed = fixed.concat(['Cook Temp (°C)', 'Cook Temp Time', 'Cool Temp (°C)', 'Cool Temp Time']);
  fixed = fixed.concat(['Label Check', 'Notes', 'Saved At']);
  const ingCols = (record.ingredientBatches || []).map((ib) => ib.ingredient);
  const pkgCols = (record.packagingBatches || []).map((pb) => pb.label);
  return fixed.concat(ingCols).concat(pkgCols);
}

export async function saveBatchRecord(env, record) {
  if (!record) throw new Error('No record data');

  const tabName = safeSheetName(record.product || 'Unknown Product');
  let meta = await getSheetsMeta(env);
  const ensured = await ensureSheetExists(env, meta, tabName);
  meta = ensured.meta;
  const sheetId = ensured.sheetId;

  const needed = buildProductHeaders(record);
  const headers = await ensureHeaders(env, sheetId, tabName, needed);
  if (headers.length === 0) throw new Error('Headers missing on sheet: ' + tabName);

  const row = new Array(headers.length).fill('');
  function set(name, value) {
    const i = headers.indexOf(name);
    if (i >= 0) row[i] = value !== null && value !== undefined ? value : '';
  }

  set('ID', record.id || '');
  set('Date', record.date ? dateOnlyToSerial(record.date) : '');
  set('Site', record.site || '');
  set('Staff', record.staff || '');
  set('Category', record.productCategory || 'standard');
  set('Product Batch', record.productBatch || '');
  set('Equipment Check', record.equipCheck ? 'Yes' : 'No');
  set('Packets Produced', record.packetsProduced != null ? record.packetsProduced : '');
  set('Finished Temp (°C)', record.temp != null ? record.temp : '');
  set('Cook Temp (°C)', record.cookTemp != null ? record.cookTemp : '');
  set('Cook Temp Time', record.cookLoggedAt ? instantToSerial(record.cookLoggedAt, SHEET_TIMEZONE) : '');
  set('Cool Temp (°C)', record.coolTemp != null ? record.coolTemp : '');
  set('Cool Temp Time', record.coolLoggedAt ? instantToSerial(record.coolLoggedAt, SHEET_TIMEZONE) : '');
  set('Label Check', record.labelCheck ? 'Yes' : 'No');
  set('Notes', record.notes || '');
  set('Saved At', instantToSerial(record.savedAt || new Date().toISOString(), SHEET_TIMEZONE));

  for (const ib of record.ingredientBatches || []) set(ib.ingredient, ib.batch || '');
  for (const pb of record.packagingBatches || []) set(pb.label, pb.batch || '');

  const appendResult = await valuesAppend(env, `${a1Quote(tabName)}!A1`, [row]);
  const rowNum = parseAppendedRowNum(appendResult.updates.updatedRange);

  const formatRequests = [];
  const dateIdx = headers.indexOf('Date');
  if (dateIdx >= 0) {
    formatRequests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowNum - 1, endRowIndex: rowNum, startColumnIndex: dateIdx, endColumnIndex: dateIdx + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: DATE_FORMAT } } },
        fields: 'userEnteredFormat.numberFormat',
      },
    });
  }
  const savedIdx = headers.indexOf('Saved At');
  if (savedIdx >= 0) {
    formatRequests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowNum - 1, endRowIndex: rowNum, startColumnIndex: savedIdx, endColumnIndex: savedIdx + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: 'DATE_TIME', pattern: DATETIME_FORMAT } } },
        fields: 'userEnteredFormat.numberFormat',
      },
    });
  }
  const labelIdx = headers.indexOf('Label Check');
  if (labelIdx >= 0) {
    const bg = record.labelCheck ? LABEL_YES_BG : LABEL_NO_BG;
    const fg = record.labelCheck ? LABEL_YES_FG : LABEL_NO_FG;
    formatRequests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowNum - 1, endRowIndex: rowNum, startColumnIndex: labelIdx, endColumnIndex: labelIdx + 1 },
        cell: { userEnteredFormat: { backgroundColor: bg, textFormat: { foregroundColor: fg } } },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    });
  }
  if (formatRequests.length > 0) await batchUpdate(env, formatRequests);

  return { result: 'success' };
}
