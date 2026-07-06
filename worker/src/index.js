import { getProducts } from './handlers/getProducts.js';
import { getPendingTemps } from './handlers/getPendingTemps.js';
import { saveBatchRecord } from './handlers/saveBatchRecord.js';
import { saveProduct } from './handlers/saveProduct.js';
import { deleteProduct } from './handlers/deleteProduct.js';
import { updateBatchTemp } from './handlers/updateBatchTemp.js';
import { getIngredients, getFinProducts, getSites } from './catalog/handlers.js';
import { rewritePhotos, handleCatalogImage } from './catalog/images.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const allowedOrigins = (env.ALLOWED_ORIGIN || 'https://waiyandean.github.io')
      .split(',')
      .map((o) => o.trim());
    const requestOrigin = request.headers.get('Origin') || '';
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0],
    };
    const json = (obj) =>
      new Response(JSON.stringify(obj), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });

    try {
      // ── Catalog READ path (replaces the shared stock-check Apps Script) ──
      // Image proxy: /catalog/image/<fileId> — served from the edge Cache API,
      // no CORS needed (loaded via <img>). Kept before the JSON branch so it
      // isn't wrapped in a JSON response.
      if (path.startsWith('/catalog/image/')) {
        const fileId = decodeURIComponent(path.slice('/catalog/image/'.length));
        return handleCatalogImage(request, ctx, fileId);
      }
      // Catalog JSON: GET /catalog?action=getIngredients|getFinProducts|getSites.
      // Same query shape the frontends already send the Apps Script, so the
      // frontend cutover is a one-line base-URL swap. Photo URLs are rewritten
      // to the image proxy on the way out (origin taken from this request).
      if (path === '/catalog' || path.startsWith('/catalog?') || path.startsWith('/catalog/')) {
        const action = url.searchParams.get('action') || '';
        // Photo rewrite is OFF by default: it points photos at /catalog/image/*,
        // but that proxy can't yet read the Workspace-hosted Drive files (see
        // catalog/images.js + PLAN.md). With it off we return the ORIGINAL Drive
        // URLs unchanged, so photos behave exactly as today — the only change is
        // the (KV-cached, fast) JSON. Flip CATALOG_IMAGE_PROXY="true" once the SA
        // can read the photos.
        const photos = (items) =>
          env.CATALOG_IMAGE_PROXY === 'true' ? rewritePhotos(items, url.origin) : items;
        if (action === 'getIngredients') {
          const { ingredients } = await getIngredients(env);
          return json({ ingredients: photos(ingredients) });
        }
        if (action === 'getFinProducts') {
          const { products } = await getFinProducts(env);
          return json({ products: photos(products) });
        }
        if (action === 'getSites') {
          return json(await getSites(env));
        }
        return json({ status: 'ok' });
      }

      // ── Batching backend (unchanged) ──
      if (request.method === 'POST') {
        const body = JSON.parse(await request.text());
        if (body.action === 'saveBatchRecord') return json(await saveBatchRecord(env, body.record));
        if (body.action === 'saveProduct') return json(await saveProduct(env, body.product));
        if (body.action === 'deleteProduct') return json(await deleteProduct(env, body.id));
        if (body.action === 'updateBatchTemp') return json(await updateBatchTemp(env, body));
        return json({ result: 'error', message: 'Unknown action: ' + body.action });
      }

      const action = url.searchParams.get('action') || '';
      if (action === 'getProducts') return json(await getProducts(env));
      if (action === 'getPendingTemps') return json(await getPendingTemps(env));
      return json({ result: 'ok', message: 'Batch Apps Script running' });
    } catch (err) {
      return json({ result: 'error', message: err.message || String(err) });
    }
  },
};
