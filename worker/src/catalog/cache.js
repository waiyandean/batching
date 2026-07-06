// KV read-through cache for the shared catalog READ path (ingredients /
// finished products / sites), mirroring ../setupCache.js.
//
// IMPORTANT — why the TTL is SHORT (5 min), unlike batching's 1h:
// The catalog's WRITE actions (saveIngredient, deleteIngredient,
// saveFinProduct, deleteFinProduct, uploadPhoto) still run on the original
// Apps Script until stockcheck's Phase 3 migration. Those writes go straight
// to the Google Sheet and CANNOT invalidate this Worker's KV cache. A short
// TTL bounds how long a staff edit in the stockcheck app can be invisible to
// the four catalog readers. Do NOT lengthen it while writes live in Apps
// Script.
//
// WHEN TO LENGTHEN: once the stockcheck write actions move into this Worker
// (Phase 3), have each write call invalidateCatalog(env, key) right after a
// successful Sheets write — exactly as batching's saveProduct/deleteProduct
// do via setupCache.js — then this TTL can safely go up to 1h+.
const TTL_SECONDS = 300; // 5 minutes

export const CATALOG_KEYS = {
  ingredients: 'catalog-ingredients-v1',
  finproducts: 'catalog-finproducts-v1',
  sites: 'catalog-sites-v1',
};

export async function getCached(env, key) {
  return env.SETUP_CACHE.get(key, { type: 'json' }); // null if missing/expired
}

export async function setCached(env, key, value) {
  await env.SETUP_CACHE.put(key, JSON.stringify(value), { expirationTtl: TTL_SECONDS });
}

// For Phase 3: call after a successful catalog write to drop the stale entry.
export async function invalidateCatalog(env, key) {
  await env.SETUP_CACHE.delete(key);
}
