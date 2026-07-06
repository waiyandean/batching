import { getAccessToken } from '../auth.js';

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

const IMAGE_TTL_SECONDS = 604800; // 7 days — a photo per file id is effectively immutable
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
// Bump to invalidate every cached image at once (edge Cache API entries live up
// to IMAGE_TTL_SECONDS). v2: switched from full-res alt=media originals to
// small thumbnailLink thumbnails — v1 entries must not be served.
const CACHE_VERSION = 'v2';

// GET /catalog/image/<fileId>[?sz=w200]
//
// Fetches a small photo THUMBNAIL via the Drive API using the service account
// and caches it long-TTL in the edge Cache API, so warm photo grids render well
// under 500ms instead of the ~5s the direct Drive thumbnail requests cost. This
// needs the SA to have Drive read access (Drive API enabled on the SA project +
// the StockCheckPhotos folder shared with it).
//
// We use the Drive `thumbnailLink` (a short-lived signed URL Google serves at
// ~200px, tens of KB) rather than `alt=media` — the originals are full-res (one
// product PNG is 15 MB!), so serving originals would be far slower than today.
// We fetch the link's BYTES server-side and cache those, so link expiry never
// matters for cached entries.
//
// GRACEFUL FALLBACK: a browser can load `drive.google.com/thumbnail?id=...`
// directly (with its own Google cookies) even for files the SA can't read, but
// a cookieless server-side fetch of that URL just gets a sign-in page. So for
// any file the SA can't read (404/403) — e.g. photos that live outside the
// shared folder — we 302-redirect the browser back to the Drive thumbnail,
// which loads exactly as it does today. Never a broken image, never a
// regression; those files just don't get the speed-up until they're shared.
export async function handleCatalogImage(request, env, ctx, fileId) {
  if (!fileId || !/^[A-Za-z0-9_-]+$/.test(fileId)) {
    return new Response('bad file id', { status: 400 });
  }
  const sz = new URL(request.url).searchParams.get('sz') || 'w200';
  const driveThumb = `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=${encodeURIComponent(sz)}`;

  const cache = caches.default;
  // Synthetic, versioned cache key: independent of request host/headers/sz so it
  // hits consistently, and CACHE_VERSION lets us purge all entries at once.
  const cacheKey = new Request(`https://catalog-image-cache.internal/${CACHE_VERSION}/${fileId}`, { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  // Step 1: ask the Drive API (as the SA) for this file's thumbnailLink.
  let thumbUrl;
  try {
    const token = await getAccessToken(env, DRIVE_SCOPE);
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=thumbnailLink&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!metaRes.ok) return Response.redirect(driveThumb, 302); // 404/403 — SA can't read it
    thumbUrl = (await metaRes.json()).thumbnailLink;
    if (!thumbUrl) return Response.redirect(driveThumb, 302);
    // thumbnailLink defaults to =s220; ask for ~200px wide to match the sheet's
    // original sz=w200 (keeps the file to tens of KB).
    thumbUrl = thumbUrl.replace(/=s\d+$/, '=w200');
  } catch (_) {
    return Response.redirect(driveThumb, 302);
  }

  // Step 2: fetch the thumbnail bytes (the signed link needs no auth header).
  let upstream;
  try {
    upstream = await fetch(thumbUrl);
  } catch (_) {
    return Response.redirect(driveThumb, 302);
  }
  const ct = upstream.headers.get('Content-Type') || '';
  if (!upstream.ok || !ct.startsWith('image/')) {
    return Response.redirect(driveThumb, 302);
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
