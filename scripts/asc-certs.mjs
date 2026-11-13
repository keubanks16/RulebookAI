// Before a cloud build: Apple allows only a few development certificates, and each fresh build Mac
// makes a new one when it signs. This revokes old DEVELOPMENT certificates (never distribution ones,
// which sign App Store builds) so the next one can be made. Uses the same App Store Connect API key.
import crypto from 'node:crypto';
import fs from 'node:fs';
const now = Math.floor(Date.now() / 1000);
const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const head = b({ alg: 'ES256', kid: process.env.ASC_KEY_ID, typ: 'JWT' });
const body = b({ iss: process.env.ASC_ISSUER_ID, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' });
const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key: fs.readFileSync(process.env.ASC_KEY_PATH), dsaEncoding: 'ieee-p1363' }).toString('base64url');
const H = { Authorization: 'Bearer ' + head + '.' + body + '.' + sig };
const r = await fetch('https://api.appstoreconnect.apple.com/v1/certificates?limit=200&fields[certificates]=certificateType,displayName,name,expirationDate', { headers: H });
if (!r.ok) { console.log('Could not list certificates: ' + r.status); process.exit(0); }
const certs = (await r.json()).data || [];
const dev = certs.filter((c) => ['DEVELOPMENT', 'IOS_DEVELOPMENT'].includes(c.attributes.certificateType));
console.log(certs.length + ' certificates, ' + dev.length + ' development');
for (const c of dev) {
  const d = await fetch('https://api.appstoreconnect.apple.com/v1/certificates/' + c.id, { method: 'DELETE', headers: H });
  console.log('revoke ' + c.attributes.certificateType + ' ' + (c.attributes.name || c.attributes.displayName || c.id) + ': ' + d.status);
}
