import { valuesGet, batchUpdate } from '../sheetsClient.js';
import { getSheetsMeta } from '../sheetSetup.js';
import { a1Quote } from '../sheetUtils.js';
import { SHEET_PRODUCTS } from '../constants.js';
import { invalidateProductsCache } from '../setupCache.js';

export async function deleteProduct(env, id) {
  const meta = await getSheetsMeta(env);
  const sheet = meta.sheets.find((s) => s.properties.title === SHEET_PRODUCTS);
  if (!sheet) return { result: 'success' };

  const ids = await valuesGet(env, `${a1Quote(SHEET_PRODUCTS)}!A2:A`);
  const rowOffset = ids.findIndex((row) => String(row[0]) === String(id));
  if (rowOffset < 0) return { result: 'success' };

  const rowNum = rowOffset + 2;
  await batchUpdate(env, [
    {
      deleteDimension: {
        range: { sheetId: sheet.properties.sheetId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum },
      },
    },
  ]);
  await invalidateProductsCache(env);
  return { result: 'success' };
}
