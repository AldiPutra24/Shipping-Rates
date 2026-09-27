/**
 * Tarik seluruh kode area Biteship (kelurahan/kecamatan seluruh Indonesia) ke data/biteship-areas.json.
 *
 * Endpoint publik: GET /v1/maps/areas?countries=ID&input=<q>&type=single
 * (auth publik sama dengan lib/providers/biteship.js)
 *
 * Karena hasil per query dibatasi ~10 item, data disweep dengan semua kombinasi
 * prefix 4 huruf (26^4 = 456.976 query) secara paralel. Ini memakan waktu
 * cukup lama dan banyak request — jalankan sesekali saja untuk refresh.
 *
 * Pemakaian:
 *   node scripts/fetch-biteship-areas.js            # sweep 4 huruf (lengkap, lama)
 *   node scripts/fetch-biteship-areas.js --fast     # sweep 3 huruf (lebih cepat, tidak 100% lengkap)
 *   node scripts/fetch-biteship-areas.js --merge    # gabung dengan cache yang sudah ada
 *
 * Format output (kompatibel dengan cache adapter):
 *   { "<nama-normalized>": { "id": "IDNP...", "name": "..." }, ... }
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { http } = require('../lib/http');

const SECRET = 'ICPHV3CQGPTk7pmiYWnrLAzxcX9n4kC236pjn6OL5UwNf0uC3p';
const BASE = 'https://api.biteship.com';
const OUT = path.join(__dirname, '..', 'data', 'biteship-areas.json');
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '32', 10);
const PREFIX_LEN = process.argv.includes('--fast') ? 3 : 4;
const MERGE = process.argv.includes('--merge');

function publicHeaders() {
  const ts = Math.floor(Date.now() / 1000);
  return {
    Authorization: 'Public',
    Accept: 'application/json',
    Origin: 'https://biteship.com',
    'x-biteship-public-request-timestamp': String(ts),
    'x-biteship-public-request-signature': crypto
      .createHmac('sha256', SECRET)
      .update(`${ts}|GET|/v1/maps/areas`)
      .digest('hex'),
  };
}

function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
function prefixes(len) {
  const out = [];
  const rec = (cur, depth) => {
    if (depth === len) {
      out.push(cur);
      return;
    }
    for (const ch of LETTERS) rec(cur + ch, depth + 1);
  };
  rec('', 0);
  return out;
}

async function pool(items, worker, size) {
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) {
        const idx = i++;
        try {
          await worker(items[idx]);
        } catch {
          /* lewati kegagalan satuan */
        }
      }
    })
  );
}

(async () => {
  // mulai dari cache yang ada bila --merge
  const areas = new Map(); // id -> area
  if (MERGE) {
    try {
      const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
      for (const [key, val] of Object.entries(prev)) {
        if (val && val.id) areas.set(val.id, val);
      }
    } catch {
      /* cache kosong */
    }
  }
  console.error(`Awal: ${areas.size} area (merge=${MERGE})`);

  const list = prefixes(PREFIX_LEN);
  console.error(`Sweep ${list.length} prefix (${PREFIX_LEN} huruf), concurrency=${CONCURRENCY}...`);

  let done = 0;
  let hits = 0;
  const startedAt = Date.now();

  await pool(list, async (q) => {
    const res = await http(`${BASE}/v1/maps/areas?countries=ID&input=${q}&type=single`, {
      headers: publicHeaders(),
    });
    done++;
    if (res.status === 200 && res.json && res.json.success) {
      for (const a of res.json.areas || []) {
        if (a.id && a.name && !areas.has(a.id)) {
          areas.set(a.id, { id: a.id, name: a.name });
          hits++;
        }
      }
    }
    if (done % 500 === 0) {
      const rate = done / ((Date.now() - startedAt) / 1000);
      const eta = Math.round((list.length - done) / rate / 60);
      console.error(`  ${done}/${list.length} query, +${hits} area baru, ETA ~${eta} menit`);
      // simpan progres berkala
      flush(areas);
    }
  }, CONCURRENCY);

  flush(areas);
  console.error(`Selesai: ${areas.size} area unik tersimpan di ${OUT}`);
  process.exit(0);
})();

function flush(areas) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const cache = {};
  for (const { id, name } of areas.values()) {
    cache[normalizeName(name)] = { id, name };
  }
  fs.writeFileSync(OUT, JSON.stringify(cache, null, 2));
}
