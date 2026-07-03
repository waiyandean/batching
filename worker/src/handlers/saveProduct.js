import { valuesGet, valuesAppend, valuesBatchUpdate, batchUpdate } from '../sheetsClient.js';
import { getSheetsMeta, ensureSheetExists, ensureHeaders } from '../sheetSetup.js';
import { a1Quote, colToLetter, parseAppendedRowNum } from '../sheetUtils.js';
import { instantToSerial } from '../dateSerial.js';
import { SHEET_PRODUCTS, PRODUCTS_HEADERS, SHEET_TIMEZONE, DATETIME_FORMAT } from '../constants.js';

export async function saveProduct(env, product) {
  if (!product) throw new Error('No product data');

  let meta = await getSheetsMeta(env);
  const ensured = await ensureSheetExists(env, meta, SHEET_PRODUCTS);
  meta = ensured.meta;
  const sheetId = ensured.sheetId;

  const headers = await ensureHeaders(env, sheetId, SHEET_PRODUCTS, PRODUCTS_HEADERS);

  const values = {
    ID: product.id,
    Name: product.name,
    Category: product.category || 'standard',
    'Packaging Type': product.pkgType || 'standard',
    'Label URL': product.labelUrl || '',
    Ingredients: JSON.stringify(product.ingredients || []),
    'Last Updated': instantToSerial(new Date().toISOString(), SHEET_TIMEZONE),
  };

  const idColIdx = headers.indexOf('ID');
  const idColLetter = colToLetter(idColIdx + 1);
  const ids = await valuesGet(env, `${a1Quote(SHEET_PRODUCTS)}!${idColLetter}2:${idColLetter}`);
  const rowOffset = ids.findIndex((row) => String(row[0]) === String(product.id));

  let rowNum;
  if (rowOffset >= 0) {
    rowNum = rowOffset + 2;
    const updates = Object.keys(values)
      .map((h) => {
        const c = headers.indexOf(h);
        if (c < 0) return null;
        return { range: `${a1Quote(SHEET_PRODUCTS)}!${colToLetter(c + 1)}${rowNum}`, values: [[values[h]]] };
      })
      .filter(Boolean);
    if (updates.length > 0) await valuesBatchUpdate(env, updates);
  } else {
    const row = new Array(headers.length).fill('');
    Object.keys(values).forEach((h) => {
      const c = headers.indexOf(h);
      if (c >= 0) row[c] = values[h];
    });
    const appendResult = await valuesAppend(env, `${a1Quote(SHEET_PRODUCTS)}!A1`, [row]);
    rowNum = parseAppendedRowNum(appendResult.updates.updatedRange);
  }

  const lastUpdatedIdx = headers.indexOf('Last Updated');
  if (lastUpdatedIdx >= 0 && rowNum) {
    await batchUpdate(env, [
      {
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowNum - 1,
            endRowIndex: rowNum,
            startColumnIndex: lastUpdatedIdx,
            endColumnIndex: lastUpdatedIdx + 1,
          },
          cell: { userEnteredFormat: { numberFormat: { type: 'DATE_TIME', pattern: DATETIME_FORMAT } } },
          fields: 'userEnteredFormat.numberFormat',
        },
      },
    ]);
  }

  return { result: 'success' };
}
