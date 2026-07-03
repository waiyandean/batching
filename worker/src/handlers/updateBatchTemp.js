import { valuesBatchGet, valuesBatchUpdate, batchUpdate } from '../sheetsClient.js';
import { getSheetsMeta } from '../sheetSetup.js';
import { a1Quote, colToLetter } from '../sheetUtils.js';
import { instantToSerial } from '../dateSerial.js';
import { SHEET_PRODUCTS, SHEET_TIMEZONE, DATETIME_FORMAT } from '../constants.js';

export async function updateBatchTemp(env, body) {
  const meta = await getSheetsMeta(env);
  const candidates = meta.sheets.filter((s) => s.properties.title !== SHEET_PRODUCTS);
  const titles = candidates.map((s) => s.properties.title);
  if (titles.length === 0) return { result: 'error', message: 'Record not found: ' + body.recordId };

  const valueRanges = await valuesBatchGet(
    env,
    titles.map((t) => a1Quote(t)),
    { valueRenderOption: 'UNFORMATTED_VALUE' }
  );

  let match = null;
  valueRanges.forEach((vr, i) => {
    if (match) return;
    const values = vr.values || [];
    if (values.length <= 1) return;
    const headers = values[0].map(String);
    for (let r = 0; r < values.length - 1; r++) {
      const row = values[r + 1];
      if (String(row[0]) === String(body.recordId)) {
        match = {
          sheetTitle: titles[i],
          sheetId: candidates[i].properties.sheetId,
          headers,
          rowNum: r + 2,
        };
        break;
      }
    }
  });

  if (!match) return { result: 'error', message: 'Record not found: ' + body.recordId };

  const tempColName = body.tempType === 'cook' ? 'Cook Temp (°C)' : body.tempType === 'cool' ? 'Cool Temp (°C)' : null;
  const timeColName = body.tempType === 'cook' ? 'Cook Temp Time' : body.tempType === 'cool' ? 'Cool Temp Time' : null;
  if (!tempColName) return { result: 'success' };

  const tempColIdx = match.headers.indexOf(tempColName);
  const timeColIdx = match.headers.indexOf(timeColName);
  const updates = [];
  if (tempColIdx >= 0) {
    updates.push({
      range: `${a1Quote(match.sheetTitle)}!${colToLetter(tempColIdx + 1)}${match.rowNum}`,
      values: [[body.temp]],
    });
  }
  if (timeColIdx >= 0) {
    updates.push({
      range: `${a1Quote(match.sheetTitle)}!${colToLetter(timeColIdx + 1)}${match.rowNum}`,
      values: [[body.loggedAt ? instantToSerial(body.loggedAt, SHEET_TIMEZONE) : '']],
    });
  }
  if (updates.length > 0) await valuesBatchUpdate(env, updates);

  if (timeColIdx >= 0 && body.loggedAt) {
    await batchUpdate(env, [
      {
        repeatCell: {
          range: {
            sheetId: match.sheetId,
            startRowIndex: match.rowNum - 1,
            endRowIndex: match.rowNum,
            startColumnIndex: timeColIdx,
            endColumnIndex: timeColIdx + 1,
          },
          cell: { userEnteredFormat: { numberFormat: { type: 'DATE_TIME', pattern: DATETIME_FORMAT } } },
          fields: 'userEnteredFormat.numberFormat',
        },
      },
    ]);
  }

  return { result: 'success' };
}
