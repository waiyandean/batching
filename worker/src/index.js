import { getProducts } from './handlers/getProducts.js';
import { getPendingTemps } from './handlers/getPendingTemps.js';
import { saveBatchRecord } from './handlers/saveBatchRecord.js';
import { saveProduct } from './handlers/saveProduct.js';
import { deleteProduct } from './handlers/deleteProduct.js';
import { updateBatchTemp } from './handlers/updateBatchTemp.js';

export default {
  async fetch(request, env) {
    const corsHeaders = { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || 'https://waiyandean.github.io' };
    const json = (obj) =>
      new Response(JSON.stringify(obj), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });

    try {
      if (request.method === 'POST') {
        const body = JSON.parse(await request.text());
        if (body.action === 'saveBatchRecord') return json(await saveBatchRecord(env, body.record));
        if (body.action === 'saveProduct') return json(await saveProduct(env, body.product));
        if (body.action === 'deleteProduct') return json(await deleteProduct(env, body.id));
        if (body.action === 'updateBatchTemp') return json(await updateBatchTemp(env, body));
        return json({ result: 'error', message: 'Unknown action: ' + body.action });
      }

      const action = new URL(request.url).searchParams.get('action') || '';
      if (action === 'getProducts') return json(await getProducts(env));
      if (action === 'getPendingTemps') return json(await getPendingTemps(env));
      return json({ result: 'ok', message: 'Batch Apps Script running' });
    } catch (err) {
      return json({ result: 'error', message: err.message || String(err) });
    }
  },
};
