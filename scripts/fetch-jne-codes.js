/**
 * Tarik seluruh kode wilayah JNE (origin & destination).
 * Endpoint: https://jne.co.id/api-origin?search=XXX  dan /api-destination
 * Kueri minimal 3 huruf (prefix, case-insensitive).
 *
 * Pemakaian:
 *   node scripts/fetch-jne-codes.js            # tulis ke data/jne-codes.json
 *   node scripts/fetch-jne-codes.js origin     # hanya origin
 */
const fs = require('fs');
const path = require('path');
const { http } = require('../lib/http');

const LETTERS = 'abcdefghijklmnoprstuvwz'; // tanpa q,x (jarang di nama kota)
const CONCURRENCY = 24;

function prefixes() {
  const out = [];
  for (const a of LETTERS) for (const b of LETTERS) for (const c of LETTERS) out.push(a + b + c);
  return out;
}

async function pool(items, worker, size) {
  const results = [];
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      try {
        results.push(await worker(items[idx]));
      } catch {
        /* lewati kegagalan satuan */
      }
    }
  }
  await Promise.all(Array.from({ length: size }, run));
  return results;
}

async function sweep(endpoint) {
  const map = new Map();
  await pool(prefixes(), async (q) => {
    const r = await http(`${endpoint}?search=${q}`);
    if (r.json && r.json.status && Array.isArray(r.json.data)) {
      for (const it of r.json.data) {
        if (it.code && it.label) map.set(it.code, it.label);
      }
    }
  }, CONCURRENCY);
  return map;
}

(async () => {
  const only = process.argv[2];
  const out = {};

  if (!only || only === 'origin') {
    console.error('Sweep origin...');
    out.origin = [...(await sweep('https://jne.co.id/api-origin')).entries()]
      .map(([code, label]) => ({ code, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    console.error('origin:', out.origin.length);
  }
  if (!only || only === 'destination') {
    console.error('Sweep destination...');
    out.destination = [...(await sweep('https://jne.co.id/api-destination')).entries()]
      .map(([code, label]) => ({ code, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    console.error('destination:', out.destination.length);
  }

  const dir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'jne-codes.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.error('Tersimpan:', file);
  process.exit(0);
})();
