import { valuesBatchGet } from '../sheetsClient.js';
import { getSheetsMeta } from '../sheetSetup.js';
import { a1Quote } from '../sheetUtils.js';
import { serialToDateOnlyString, serialToInstantISO } from '../dateSerial.js';
import { SHEET_PRODUCTS, SHEET_TIMEZONE } from '../constants.js';

function cell(row, idx) {
  return idx >= 0 && row[idx] !== undefined ? row[idx] : '';
}

export async function getPendingTemps(env) {
  const meta = await getSheetsMeta(env);
  const titles = meta.sheets.map((s) => s.properties.title).filter((t) => t !== SHEET_PRODUCTS);
  if (titles.length === 0) return { result: 'success', records: [] };

  const valueRanges = await valuesBatchGet(
    env,
    titles.map((t) => a1Quote(t)),
    { valueRenderOption: 'UNFORMATTED_VALUE' }
  );

  const records = [];
  valueRanges.forEach((vr, i) => {
    const sheetTitle = titles[i];
    const values = vr.values || [];
    if (values.length <= 1) return;

    const headers = values[0].map(String);
    const catIdx = headers.indexOf('Category');
    const cookIdx = headers.indexOf('Cook Temp (°C)');
    const coolIdx = headers.indexOf('Cool Temp (°C)');
    if (catIdx < 0 || cookIdx < 0) return;

    const dateIdx = headers.indexOf('Date');
    const savedIdx = headers.indexOf('Saved At');
    const batchIdx = headers.indexOf('Product Batch');
    const staffIdx = headers.indexOf('Staff');

    for (const row of values.slice(1)) {
      if (String(cell(row, catIdx)) !== 'cooked') continue;
      const cookVal = cell(row, cookIdx);
      const coolVal = coolIdx >= 0 ? cell(row, coolIdx) : '';
      if (cookVal !== '' && (coolIdx < 0 || coolVal !== '')) continue;

      const dateVal = cell(row, dateIdx);
      const savedVal = cell(row, savedIdx);

      records.push({
        id: String(cell(row, 0)),
        date: typeof dateVal === 'number' ? serialToDateOnlyString(dateVal) : String(dateVal),
        product: sheetTitle,
        productBatch: String(cell(row, batchIdx)),
        staff: String(cell(row, staffIdx)),
        savedAt: typeof savedVal === 'number' ? serialToInstantISO(savedVal, SHEET_TIMEZONE) : String(savedVal),
        cookTemp: cookVal !== '' ? cookVal : null,
        coolTemp: coolIdx >= 0 && coolVal !== '' ? coolVal : null,
        cookLoggedAt: null,
      });
    }
  });

  return { result: 'success', records };
}
