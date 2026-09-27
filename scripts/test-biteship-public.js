/**
 * Test endpoint publik Biteship (dipakai halaman cek-ongkir biteship.com):
 *  - GET  https://api.biteship.com/v1/maps/areas?countries=ID&input=..&type=single
 *  - POST https://api.biteship.com/v1/rates/couriers?channel=biteship_landing_page
 * Auth: Authorization: Public + x-biteship-public-request-timestamp + HMAC-SHA256(secret, "ts|METHOD|path")
 */
const crypto = require('crypto');
const { http } = require('../lib/http');

const SECRET = 'ICPHV3CQGPTk7pmiYWnrLAzxcX9n4kC236pjn6OL5UwNf0uC3p';
const BASE = 'https://api.biteship.com';

function sign(method, path, ts) {
  return crypto.createHmac('sha256', SECRET).update(`${ts}|${method}|${path}`).digest('hex');
}

function publicHeaders(method, path) {
  const ts = Math.floor(Date.now() / 1000);
  return {
    Authorization: 'Public',
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Origin: 'https://biteship.com',
    Referer: 'https://biteship.com/id/cek-ongkir/jne',
    'x-biteship-public-request-signature': sign(method, path, ts),
    'x-biteship-public-request-timestamp': String(ts),
  };
}

(async () => {
  // 1) cari area
  const p1 = '/v1/maps/areas?countries=ID&input=bogor&type=single';
  let r = await http(BASE + p1, { headers: publicHeaders('GET', p1) });
  console.log('areas:', r.status, (r.text || '').slice(0, 400));

  // 2) tarif JNE (contoh: Bogor -> Jakarta Pusat)
  const p2 = '/v1/rates/couriers?channel=biteship_landing_page';
  r = await http(BASE + p2, {
    method: 'POST',
    headers: publicHeaders('POST', p2),
    body: JSON.stringify({
      origin_area_id: 'IDNP90',
      destination_area_id: 'IDNP10',
      couriers: 'jne',
      items: [{ name: 'paket', weight: 1000, quantity: 1 }],
    }),
  });
  console.log('rates:', r.status, (r.text || '').slice(0, 800));
  process.exit(0);
})();
