/**
 * Adapter Paxel.
 * Sumber data live:
 *  - https://paxel.co/id/check-rates (form POST, butuh CSRF token dari halaman)
 *  - Validasi wilayah: https://paxel.co/api/v1/zipcode-by-address (POST lat/lng, terbuka)
 *
 * Catatan: form check-rates web Paxel memakai slider captcha + sesi browser.
 * Adapter ini mencoba alur GET halaman -> ambil CSRF -> POST form. Jika server
 * menolak (captcha wajib), adapter melempar error dan CLI tetap menampilkan
 * provider lain. Tidak ada bypass captcha.
 */
const { http } = require('../http');

function parsePrice(str) {
  const m = String(str || '').replace(/[^0-9]/g, '');
  return m ? parseInt(m, 10) : null;
}

async function getCsrfToken() {
  const res = await http('https://paxel.co/id/check-rates');
  if (res.status !== 200) throw new Error(`Paxel: GET halaman HTTP ${res.status}`);
  const m = res.text.match(/name="csrf-token" content="([^"]+)"/);
  if (!m) throw new Error('Paxel: CSRF token tidak ditemukan');
  const cookie = (res.headers && res.headers.get && res.headers.get('set-cookie')) || '';
  return { token: m[1], cookie };
}

async function getRates({ origin, destination, weight }) {
  const { token, cookie } = await getCsrfToken();

  const body = new URLSearchParams({
    _token: token,
    pickup: origin,
    destination,
    weight: String(weight),
    validation_value: 'pass',
  }).toString();

  const res = await http('https://paxel.co/id/check-rates', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: 'https://paxel.co/id/check-rates',
      ...(cookie ? { Cookie: cookie.split(';')[0] } : {}),
    },
    body,
  });

  if (res.status !== 200) {
    throw new Error(
      `Paxel: form check-rates menolak request (HTTP ${res.status}). ` +
        'Web Paxel mewajibkan slider captcha di browser sehingga data tarif tidak bisa diambil otomatis.'
    );
  }

  // Jika sukses, parse semua baris tarif dari hasil render.
  const rates = [];
  const re = /Rp\s?([\d.,]+)[\s\S]{0,200}?(SAMEDAY|NEXTDAY|REGULAR|INSTANT|CARGO)/gi;
  let m;
  while ((m = re.exec(res.text)) !== null) {
    const price = parsePrice(m[1]);
    const service = m[2].toUpperCase();
    if (price === null) continue;
    rates.push({
      provider: 'paxel',
      service,
      serviceName: `Paxel ${service}`,
      price,
      currency: 'IDR',
      etd: service === 'SAMEDAY' ? 'Hari yang sama' : service === 'NEXTDAY' ? '1 hari' : null,
    });
  }

  if (rates.length === 0) {
    throw new Error('Paxel: tarif tidak ditemukan (kemungkinan captcha/sesi browser wajib)');
  }
  return rates;
}

module.exports = { getRates };
