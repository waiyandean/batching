import { valuesGet, isUnknownRangeError } from '../sheetsClient.js';
import { a1Quote } from '../sheetUtils.js';
import { SHEET_PRODUCTS } from '../constants.js';

export async function getProducts(env) {
  let values;
  try {
    values = await valuesGet(env, `${a1Quote(SHEET_PRODUCTS)}!1:100000`);
  } catch (err) {
    if (isUnknownRangeError(err)) return { result: 'success', products: [] };
    throw err;
  }
  if (values.length <= 1) return { result: 'success', products: [] };

  const headers = values[0].map(String);
  const rows = values.slice(1);

  function val(row, name) {
    const i = headers.indexOf(name);
    return i >= 0 && row[i] !== undefined ? row[i] : '';
  }

  const products = [];
  for (const row of rows) {
    const id = val(row, 'ID');
    if (!id) continue;
    let ingredients = [];
    try {
      ingredients = JSON.parse(val(row, 'Ingredients') || '[]');
    } catch (_) {
      // matches original: swallow parse errors, keep empty array
    }
    const cat = String(val(row, 'Category') || '').trim();
    products.push({
      id: String(id),
      name: String(val(row, 'Name')),
      category: cat === 'cooked' ? 'cooked' : 'standard',
      pkgType: String(val(row, 'Packaging Type') || 'standard'),
      labelUrl: String(val(row, 'Label URL') || ''),
      ingredients,
    });
  }
  return { result: 'success', products };
}
