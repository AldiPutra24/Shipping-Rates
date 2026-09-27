/**
 * Adapter Biteship (endpoint publik yang dipakai halaman cek-ongkir biteship.com).
 *
 * Alur:
 *  1. Cari kode area:  GET /v1/maps/areas?countries=ID&input=<nama>&type=single
 *  2. Tarif kurir:     POST /v1/rates/couriers?channel=biteship_landing_page
 *     body: { origin_area_id, destination_area_id, couriers, items:[{name, weight(gram), quantity}] }
 *
 * Auth publik Biteship (dari frontend biteship.com):
 *  - Header `Authorization: Public`
 *  - `x-biteship-public-request-timestamp`: unix detik
 *  - `x-biteship-public-request-signature`: HMAC-SHA256(secret, "<ts>|<METHOD>|<path>") — path TANPA query string
 *  - Secret public di-embed di bundle frontend biteship.com
 *
 * Opsi CLI:
 *  - --origin / --destination menerima kode area Biteship (IDNP...) ATAU nama wilayah ("bogor barat").
 *    Nama dicari via endpoint maps/areas dan di-cache di data/biteship-areas.json.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { http } = require('../http');

const BASE = 'https://api.biteship.com';
// Secret public request Biteship (embed di bundle frontend halaman cek-ongkir mereka)
const PUBLIC_SECRET = 'ICPHV3CQGPTk7pmiYWnrLAzxcX9n4kC236pjn6OL5UwNf0uC3p';
const AREA_CACHE = path.join(__dirname, '..', '..', 'data', 'biteship-areas.json');

function publicHeaders(method, apiPath) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', PUBLIC_SECRET).update(`${ts}|${method}|${apiPath}`).digest('hex');
  return {
    Authorization: 'Public',
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Origin: 'https://biteship.com',
    Referer: 'https://biteship.com/id/cek-ongkir/jne',
    'x-biteship-public-request-timestamp': String(ts),
    'x-biteship-public-request-signature': sig,
  };
}

// ---- cache kode area (nama -> area object) ----
function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(AREA_CACHE, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(AREA_CACHE), { recursive: true });
  fs.writeFileSync(AREA_CACHE, JSON.stringify(cache, null, 2));
}

function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Cari area Biteship by nama (atau terima langsung kode IDNP...). */
async function findArea(query) {
  const q = String(query || '').trim();
  if (/^IDNP/i.test(q)) return { id: q, name: q };

  const cache = loadCache();
  const key = normalizeName(q);
  if (cache[key]) return cache[key];

  const apiPath = '/v1/maps/areas';
  const res = await http(`${BASE}${apiPath}?countries=ID&input=${encodeURIComponent(q)}&type=single`, {
    headers: publicHeaders('GET', apiPath),
  });
  if (res.status !== 200 || !res.json || !res.json.success) {
    throw new Error(`Biteship: pencarian area "${q}" gagal (HTTP ${res.status})`);
  }
  const areas = res.json.areas || [];
  if (areas.length === 0) {
    throw new Error(`Biteship: area "${q}" tidak ditemukan`);
  }
  // pilih kecocokan terbaik: nama mulai dengan query
  const norm = (s) => normalizeName(String(s || '').split('.')[0]);
  const best =
    areas.find((a) => norm(a.name) === key) ||
    areas.find((a) => norm(a.name).startsWith(key)) ||
    areas[0];

  const entry = { id: best.id, name: best.name };
  cache[key] = entry;
  cache[normalizeName(best.name)] = entry;
  saveCache(cache);
  return entry;
}

/**
 * getRates({ origin, destination, weight, couriers })
 * weight dalam kg; origin/destination nama wilayah atau kode IDNP...
 */
async function getRates({ origin, destination, weight, couriers = 'jne' }) {
  const [originArea, destArea] = await Promise.all([findArea(origin), findArea(destination)]);

  const apiPath = '/v1/rates/couriers';
  const res = await http(`${BASE}${apiPath}?channel=biteship_landing_page`, {
    method: 'POST',
    headers: publicHeaders('POST', apiPath),
    body: JSON.stringify({
      origin_area_id: originArea.id,
      destination_area_id: destArea.id,
      couriers,
      items: [{ name: 'package', weight: Math.round(Number(weight) * 1000), quantity: 1 }],
    }),
  });

  if (res.status !== 200 || !res.json || !res.json.success) {
    throw new Error(`Biteship: gagal mengambil tarif (HTTP ${res.status}) ${res.json && res.json.error ? '- ' + res.json.error : ''}`);
  }

  const pricing = res.json.pricing || [];
  const rates = pricing.map((p) => ({
    provider: 'biteship',
    service: p.service_code || p.service || p.courier_service_name,
    serviceName: `${p.courier_name || p.courier_code} ${p.service_name || p.description || ''}`.trim(),
    price: Number(p.price) || 0,
    currency: 'IDR',
    etd: p.etd || p.duration || null,
    courierCode: p.courier_code,
  }));

  if (rates.length === 0) throw new Error('Biteship: tidak ada tarif ditemukan untuk rute ini');
  return rates;
}

module.exports = { getRates, findArea };
