// One cached token per scope (Sheets for batching/catalog reads, Drive for the
// catalog image proxy). Keyed by scope string so adding Drive doesn't disturb
// the existing Sheets token.
const tokenCache = new Map(); // scope -> { token, exp }
// In-flight mint per scope so a cold burst (e.g. ~20 photo requests hitting the
// image proxy at once) shares ONE token fetch + JWT sign instead of each doing
// its own — the concurrent crypto.subtle signing was spiking CPU and 503-ing
// individual requests.
const inflight = new Map(); // scope -> Promise<token>
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

function b64url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pem) {
  const clean = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const der = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

export async function getAccessToken(env, scope = SHEETS_SCOPE) {
  const now = Math.floor(Date.now() / 1000);
  const hit = tokenCache.get(scope);
  if (hit && hit.exp - 60 > now) return hit.token;

  const pending = inflight.get(scope);
  if (pending) return pending; // a concurrent caller is already minting this scope

  const promise = (async () => {
    try {
      const header = { alg: 'RS256', typ: 'JWT' };
      const claims = {
        iss: env.GOOGLE_CLIENT_EMAIL,
        scope,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      };
      const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
      const key = await importPrivateKey(env.GOOGLE_PRIVATE_KEY);
      const signature = await crypto.subtle.sign(
        { name: 'RSASSA-PKCS1-v1_5' },
        key,
        new TextEncoder().encode(signingInput)
      );
      const jwt = `${signingInput}.${b64url(signature)}`;

      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt,
        }),
      });
      if (!res.ok) throw new Error('Google token exchange failed: ' + (await res.text()));
      const data = await res.json();
      tokenCache.set(scope, { token: data.access_token, exp: now + data.expires_in });
      return data.access_token;
    } finally {
      inflight.delete(scope);
    }
  })();
  inflight.set(scope, promise);
  return promise;
}
