import { getMeta, valuesGet, valuesUpdate, batchUpdate, isAlreadyExistsError } from './sheetsClient.js';
import { a1Quote, colToLetter } from './sheetUtils.js';
import { HEADER_BG, HEADER_FG } from './constants.js';

export async function getSheetsMeta(env) {
  return getMeta(env, 'sheets.properties(sheetId,title)');
}

function findSheet(meta, title) {
  return meta.sheets.find((s) => s.properties.title === title);
}

// Returns { sheetId, meta } for `title`, creating the tab if it doesn't exist yet.
// Handles the race where two requests try to create the same brand-new tab at once.
export async function ensureSheetExists(env, meta, title) {
  const found = findSheet(meta, title);
  if (found) return { sheetId: found.properties.sheetId, meta };

  try {
    const result = await batchUpdate(env, [{ addSheet: { properties: { title } } }]);
    const sheetId = result.replies[0].addSheet.properties.sheetId;
    const refreshed = await getSheetsMeta(env);
    return { sheetId, meta: refreshed };
  } catch (err) {
    if (!isAlreadyExistsError(err)) throw err;
    const refreshed = await getSheetsMeta(env);
    const nowFound = findSheet(refreshed, title);
    if (!nowFound) throw err;
    return { sheetId: nowFound.properties.sheetId, meta: refreshed };
  }
}

function headerStyleRequests(sheetId, startCol, endCol) {
  return [
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: startCol, endColumnIndex: endCol },
        cell: {
          userEnteredFormat: {
            backgroundColor: HEADER_BG,
            textFormat: { foregroundColor: HEADER_FG, bold: true, fontSize: 10 },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    },
  ];
}

// Ensures `sheetTitle` has all headers in `neededHeaders`, adding any missing ones
// to the right without disturbing existing columns/data. Returns the final header array.
export async function ensureHeaders(env, sheetId, sheetTitle, neededHeaders) {
  const existingRows = await valuesGet(env, `${a1Quote(sheetTitle)}!1:1`);
  const existingHeaders = (existingRows[0] || []).map(String);

  if (existingHeaders.length === 0) {
    await valuesUpdate(env, `${a1Quote(sheetTitle)}!A1`, [neededHeaders]);
    await batchUpdate(env, [
      ...headerStyleRequests(sheetId, 0, neededHeaders.length),
      {
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
          fields: 'gridProperties.frozenRowCount',
        },
      },
    ]);
    return neededHeaders;
  }

  const missing = neededHeaders.filter((h) => !existingHeaders.includes(h));
  if (missing.length > 0) {
    const startCol = existingHeaders.length;
    const range = `${a1Quote(sheetTitle)}!${colToLetter(startCol + 1)}1`;
    await valuesUpdate(env, range, [missing]);
    await batchUpdate(env, headerStyleRequests(sheetId, startCol, startCol + missing.length));
  }
  return existingHeaders.concat(missing);
}
