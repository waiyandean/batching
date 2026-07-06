// Photo handling for the catalog: (1) parse a Google Drive file id out of the
// URLs stored in the sheet, (2) rewrite catalog photo fields to point at this
// Worker's own image proxy, (3) serve that proxy with a long-lived Cache API
// entry so warm photo grids render in well under 500ms instead of the ~5s the
// direct Drive thumbnail requests cost today.

// Stored photo URLs come in (at least) two shapes, both seen live in the sheet:
//   https://drive.google.com/thumbnail?id=<ID>&sz=w200
//   https://lh3.googleusercontent.com/d/<ID>
// Anything we can't parse a file id from is passed through untouched.
export function driveFileId(url) {
  if (typeof url !== 'string' || !url) return null;
  let m = url.match(/[?&]id=([^&]+)/); // drive.google.com/thumbnail?id=ID&sz=...
  if (m) return decodeURIComponent(m[1]);
  m = url.match(/googleusercontent\.com\/d\/([^/?#]+)/); // lh3.googleusercontent.com/d/ID
  if (m) return m[1];
  m = url.match(/\/d\/([^/?#]+)/); // generic drive /d/ID share links
  if (m) return m[1];
  return null;
}

// Rewrite each item's `.photo` to the Worker proxy URL (absolute, so it works
// from the cross-origin frontends). Non-Drive / unparseable URLs are left as-is.
// `origin` comes from the incoming request, keeping this host-agnostic
// (workers.dev, forms.deanops.uk, localhost) so the KV cache can stay raw.
export function rewritePhotos(items, origin) {
  return items.map((it) => {
    const id = driveFileId(it.photo);
    return id ? { ...it, photo: `${origin}/catalog/image/${id}` } : it;
  });
}

const IMAGE_TTL_SECONDS = 604800; // 7 days — Drive thumbnails are effectively immutable per file id

// GET /catalog/image/<fileId>[?sz=w200]
//
// KNOWN LIMITATION (verified 2026-07-06): the stock-check photos live in a
// Google WORKSPACE Drive, and Google redirects cookieless / datacenter-IP
// fetches of `drive.google.com/thumbnail?id=...` to an accounts.google.com
// sign-in page — so a naive server-side fetch gets HTML, not JPEG bytes. The
// service account can't read them via the Drive API either (Drive API is
// disabled on the SA's GCP project AND the StockCheckPhotos folder isn't
// shared with the SA). Until that's unblocked (see PLAN.md Gotcha), this proxy
// DETECTS the non-image response and 302-redirects the browser back to the
// Drive thumbnail, which the browser loads exactly as it does today — i.e. it
// degrades gracefully to current behaviour and never serves a broken image.
export async function handleCatalogImage(request, ctx, fileId) {
  if (!fileId || !/^[A-Za-z0-9_-]+$/.test(fileId)) {
    return new Response('bad file id', { status: 400 });
  }
  const sz = new URL(request.url).searchParams.get('sz') || 'w200';
  const driveUrl = `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=${encodeURIComponent(sz)}`;

  const cache = caches.default;
  // Normalise the cache key to just method+URL so it hits regardless of
  // per-request headers (Referer, etc.).
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let upstream;
  try {
    upstream = await fetch(driveUrl, { redirect: 'follow' });
  } catch (_) {
    return Response.redirect(driveUrl, 302);
  }
  const ct = upstream.headers.get('Content-Type') || '';
  if (!upstream.ok || !ct.startsWith('image/')) {
    // Got the sign-in interstitial (or an error) — fall back to letting the
    // browser fetch Drive directly. Not cached (this is the failure path).
    return Response.redirect(driveUrl, 302);
  }

  const body = await upstream.arrayBuffer();
  const resp = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': ct,
      'Cache-Control': `public, max-age=${IMAGE_TTL_SECONDS}, immutable`,
    },
  });
  // Store a clone in the edge cache without blocking the response.
  ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}
