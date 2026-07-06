// Port of the READ path of the shared stock-check Apps Script
// (appscripts/stockcheck-shared.gs doGet): getIngredients, getFinProducts,
// getSites. Data lives in the stock-check sheet (env.STOCKCHECK_SHEET_ID), not
// the batching sheet, so these use valuesGetFrom rather than valuesGet.
//
// Photo URLs are returned RAW here (original Drive/googleusercontent URLs);
// the router rewrites them to the image proxy at response time so the KV cache
// stays host-agnostic. Write actions stay on Apps Script until Phase 3 — see
// ./cache.js for why the TTL is short.
import { valuesGetFrom, isUnknownRangeError } from '../sheetsClient.js';
import { getCached, setCached, CATALOG_KEYS } from './cache.js';

// UNFORMATTED_VALUE makes the Sheets API return native types (numbers,
// booleans) the way Apps Script's Range.getValues() did — critical for
// trackUnits/trackLoose (checkbox booleans) and minStock (numbers) to match
// the live script byte-for-byte.
const RENDER = { valueRenderOption: 'UNFORMATTED_VALUE' };

async function readRows(env, range) {
  try {
    return await valuesGetFrom(env, env.STOCKCHECK_SHEET_ID, range, RENDER);
  } catch (err) {
    if (isUnknownRangeError(err)) return null; // missing tab → mirror AS's "no sheet" branch
    throw err;
  }
}

// Mirrors the Apps Script's truthiness checks exactly (e.g. `r[3] || null`,
// which turns 0 / '' into null, and the `=== 'true' || === true` booleans).
export async function getIngredients(env) {
  const cached = await getCached(env, CATALOG_KEYS.ingredients);
  if (cached) return { ingredients: cached };

  const rows = await readRows(env, 'Ingredients!A2:I');
  if (!rows || rows.length === 0) {
    await setCached(env, CATALOG_KEYS.ingredients, []);
    return { ingredients: [] };
  }
  const ingredients = rows
    .filter((r) => r[0])
    .map((r) => ({
      id: r[0],
      name: r[1],
      storage: r[2],
      minStock: r[3] || null,
      trackUnits: r[4] === 'true' || r[4] === true,
      unitLabel: r[5] || null,
      trackLoose: r[6] === 'true' || r[6] === true,
      looseUnit: r[7] || null,
      photo: r[8] || null,
    }));
  await setCached(env, CATALOG_KEYS.ingredients, ingredients);
  return { ingredients };
}

export async function getFinProducts(env) {
  const cached = await getCached(env, CATALOG_KEYS.finproducts);
  if (cached) return { products: cached };

  const rows = await readRows(env, 'FinishedProducts!A2:F');
  if (!rows || rows.length === 0) {
    await setCached(env, CATALOG_KEYS.finproducts, []);
    return { products: [] };
  }
  const products = rows
    .filter((r) => r[0])
    .map((r) => ({
      id: r[0],
      name: r[1],
      packetLabel: r[2],
      minStock: r[3] || null,
      photo: r[4] || null,
    }));
  await setCached(env, CATALOG_KEYS.finproducts, products);
  return { products };
}

export async function getSites(env) {
  const cached = await getCached(env, CATALOG_KEYS.sites);
  if (cached) return { sites: cached };

  // AS reads Sites from row 1 (no header row).
  const rows = await readRows(env, 'Sites!A1:A');
  const sites = (rows || []).map((r) => r[0]).filter((s) => s);
  await setCached(env, CATALOG_KEYS.sites, sites);
  return { sites };
}
