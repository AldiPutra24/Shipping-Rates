/**
 * Adapter JNE.
 * Sumber data live: https://jne.co.id/shipping-fee?origin=..&destination=..&weight=..
 * Halaman ini merender tabel tarif (REG, YES, SPS, JTR, dst) secara server-side
 * via GET tanpa captcha, jadi data di-parse langsung dari HTML tabel hasil.
 */
const { http } = require('../http');

// Parse "IDR 10.000" -> 10000
function parsePrice(str) {
  const m = String(str || '').replace(/[^0-9]/g, '');
  return m ? parseInt(m, 10) : null;
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim();
}

// Normalisasi "1-2 D" / "0-24 H" -> "1-2 hari" / "0-24 jam"
function normalizeEtd(str) {
  const s = String(str || '').trim();
  if (!s) return null;
  if (/H$/i.test(s)) return s.replace(/\s*H$/i, ' jam');
  return s.replace(/\s*D$/i, ' hari');
}

function extractRows(html) {
  const rows = [];
  const re = /<tr>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
      decodeEntities(c[1].replace(/<[^>]+>/g, ''))
    );
    if (cells.length >= 4) rows.push(cells);
  }
  return rows;
}

async function getRates({ origin, destination, weight }) {
  const url = `https://jne.co.id/shipping-fee?origin=${encodeURIComponent(
    origin
  )}&destination=${encodeURIComponent(destination)}&weight=${weight}`;

  const res = await http(url);
  if (res.status !== 200) {
    throw new Error(`JNE HTTP ${res.status}`);
  }

  const rates = [];
  for (const cells of extractRows(res.text)) {
    const [service, type, price, etd] = cells;
    const parsed = parsePrice(price);
    if (!service || parsed === null) continue;
    rates.push({
      provider: 'jne',
      service: service.trim(),
      serviceName: `JNE ${service.trim()}`,
      price: parsed,
      currency: 'IDR',
      etd: normalizeEtd(etd) || null,
      shipmentType: type || null,
    });
  }

  if (rates.length === 0) {
    throw new Error('JNE: tidak ada tarif ditemukan (cek kode origin/destination)');
  }
  return rates;
}

module.exports = { getRates };