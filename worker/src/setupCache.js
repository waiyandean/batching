const PRODUCTS_KEY = 'products-v1';
const TTL_SECONDS = 3600; // safety net in case an invalidation is ever missed

export async function getCachedProducts(env) {
  const cached = await env.SETUP_CACHE.get(PRODUCTS_KEY, { type: 'json' });
  return cached; // null if missing/expired
}

export async function setCachedProducts(env, products) {
  await env.SETUP_CACHE.put(PRODUCTS_KEY, JSON.stringify(products), { expirationTtl: TTL_SECONDS });
}

export async function invalidateProductsCache(env) {
  await env.SETUP_CACHE.delete(PRODUCTS_KEY);
}
