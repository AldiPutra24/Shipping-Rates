/**
 * Adapter Lion Parcel / BOSSPACK.
 * Sumber data live: https://lionparcel.com/api/ongkir-v3 (proxy resmi website
 * Lion Parcel ke upstream /v3/tariff di api-internal-web.thelionparcel.com).
 *
 * Catatan teknis:
 * - Proxy menolak request non-browser dengan 403 "External access not allowed".
 *   Trik: kirim header 'Sec-Fetch-Site: same-origin' agar diperlakukan sebagai
 *   request internal website.
 * - Upstream /v3/tariff memvalidasi token reCAPTCHA v3. Tanpa token valid,
 *   upstream balas 401. Token bisa disuplai via env LION_PARCEL_CAPTCHA_TOKEN,
 *   opsi --lion-captcha, atau API resmi via LION_PARCEL_API_URL + LION_PARCEL_API_KEY.
 * - BOSSPACK adalah salah satu layanan dalam hasil tariff Lion Parcel, jadi
 *   adapter ini mengekspor dua provider: lionparcel (semua layanan) dan
 *   bosspack (filter layanan BOSSPACK saja).
 */
const { http } = require('../http');

const PROXY_HEADERS = {
  Accept: 'application/json',
  Referer: 'https://lionparcel.com/ongkir',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty',
};

const normalizeItem = (it) => ({
  service: it.service_name || it.product || null,
  price: Math.round(
    Number(it.total_tariff_after_discount ?? it.tariff_after_discount_per_kg ?? it.total_normal_tariff) || 0
  ),
  currency: it.currency_code || 'IDR',
  etd: it.ETD || null,
  isActive: it.is_active !== false && !it.is_embargo,
});

// Mode API resmi (opsional): jika LION_PARCEL_API_URL + LION_PARCEL_API_KEY diset,
// gunakan endpoint resmi sebagai sumber utama.
async function fetchViaOfficialApi({ origin, destination, weight, length, width, height }) {
  const base = process.env.LION_PARCEL_API_URL.replace(/\/+$/, '');
  const res = await http(`${base}/tariff`, {
    headers: { Authorization: `Bearer ${process.env.LION_PARCEL_API_KEY}` },
  });
  if (!res.ok || !res.json) {
    throw new Error(`Lion Parcel official API HTTP ${res.status}`);
  }
  const items = res.json.data || res.json.result || res.json;
  if (!Array.isArray(items)) throw new Error('Lion Parcel official API: format tidak dikenali');
  return items.map(normalizeItem);
}

async function fetchTariff(opts) {
  const { origin, destination, weight, length, width, height, captchaToken } = opts;

  // 1) API resmi jika dikonfigurasi
  if (process.env.LION_PARCEL_API_URL && process.env.LION_PARCEL_API_KEY) {
    return fetchViaOfficialApi(opts);
  }

  // 2) Proxy website (butuh Sec-Fetch-Site agar tidak 403; captcha_token opsional)
  const params = new URLSearchParams({ origin, destination, weight: String(weight) });
  if (length) params.set('length', String(length));
  if (width) params.set('width', String(width));
  if (height) params.set('height', String(height));

  const token = captchaToken || process.env.LION_PARCEL_CAPTCHA_TOKEN || '';
  if (token) params.set('captcha_token', token);

  const res = await http(`https://lionparcel.com/api/ongkir-v3?${params.toString()}`, {
    headers: PROXY_HEADERS,
  });

  if (res.status === 403 || (res.json && res.json.statusCode === 403)) {
    throw new Error('Lion Parcel: proxy menolak akses eksternal (403)');
  }
  if (res.json && res.json.error) {
    throw new Error(
      'Lion Parcel: upstream menolak request (butuh token reCAPTCHA v3 browser). ' +
        'Suplai token via env LION_PARCEL_CAPTCHA_TOKEN / --lion-captcha, ' +
        'atau gunakan API resmi via LION_PARCEL_API_URL + LION_PARCEL_API_KEY.'
    );
  }
  if (res.json && Array.isArray(res.json.result)) {
    return res.json.result.map(normalizeItem);
  }
  throw new Error('Lion Parcel: format respons tidak dikenali');
}

async function getRates(opts) {
  const items = await fetchTariff(opts);
  if (items.length === 0) throw new Error('Lion Parcel: tidak ada layanan tersedia');
  return items.map((it) => ({
    provider: 'lionparcel',
    service: it.service,
    serviceName: `Lion Parcel ${it.service}`,
    price: it.price,
    currency: it.currency,
    etd: it.etd,
  }));
}

async function getBosspackRates(opts) {
  const items = await fetchTariff(opts);
  const boss = items.filter((it) => (it.service || '').toUpperCase() === 'BOSSPACK');
  if (boss.length === 0) {
    throw new Error('BOSSPACK: layanan tidak tersedia untuk rute ini (BOSSPACK = layanan Lion Parcel)');
  }
  return boss.map((it) => ({
    provider: 'bosspack',
    service: 'BOSSPACK',
    serviceName: 'BOSSPACK (Lion Express)',
    price: it.price,
    currency: it.currency,
    etd: it.etd,
  }));
}

module.exports = { getRates, getBosspackRates };
