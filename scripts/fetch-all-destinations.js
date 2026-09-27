/**
 * Ambil tarif dari SATU --origin ke SEMUA destination (sesuai provider), simpan hasil ke result.json.
 *
 * Sumber daftar destination:
 *   - provider jne        : data/jne-codes.json (bagian destination)
 *   - provider biteship   : data/biteship-areas.json (semua area; gunakan --district-only untuk filter kecamatan)
 *
 * Pemakaian:
 *   node scripts/fetch-all-destinations.js --provider jne --origin BOO10000 --weight 1
 *   node scripts/fetch-all-destinations.js --provider biteship --origin "kemang bogor" --weight 1 --limit 50
 *   node scripts/fetch-all-destinations.js --provider biteship --origin "kemang bogor" --weight 1 --district-only --out result-biteship.json
 *
 * Opsi:
 *   --provider      jne (default) | biteship  (paxel/lionparcel tidak punya daftar destination lokal)
 *   --origin        kode origin (jne: BOO10000; biteship: nama area atau kode IDNP...)
 *   --weight        berat kg (default 1)
 *   --limit         batasi jumlah destination (default: semua)
 *   --offset        mulai dari index ke-n (untuk resume)
 *   --district-only (biteship) hanya entri yang punya field district (kecamatan)
 *   --out           file output (default result.json)
 *   --concurrency   jumlah request paralel (default 4; jangan terlalu besar agar tidak diblok)
 *
 * Catatan: skrip menulis progres berkala ke file output, sehingga bisa dihentikan (Ctrl+C)
 * dan hasil parsial tetap tersimpan. Jalankan ulang dengan --offset untuk melanjutkan.
 */
const fs = require('fs');
const path = require('path');
const { fetchAll, PROVIDERS } = require('../lib/index');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) args[key] = true;
      else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

function loadJneDestinations() {
  const file = path.join(__dirname, '..', 'data', 'jne-codes.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (data.destination || []).map((d) => ({ code: d.code, name: d.label }));
}

function loadBiteshipDestinations(districtOnly) {
  const file = path.join(__dirname, '..', 'data', 'biteship-areas.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  let entries = Object.values(data);
  if (districtOnly) entries = entries.filter((e) => e.district);
  return entries.map((e) => ({
    code: e.id,
    name: e.district ? `${e.district}, ${e.city}, ${e.province}` : e.name,
  }));
}

async function pool(items, worker, size) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await worker(items[idx], idx).catch((err) => ({
          __error: err.message,
        }));
      }
    })
  );
  return results;
}

(async () => {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(__doc__ || '');
    process.exit(0);
  }

  const provider = (args.provider || 'jne').toLowerCase();
  const origin = args.origin;
  const weight = parseFloat(args.weight || '1');
  const limit = args.limit ? parseInt(args.limit, 10) : Infinity;
  const offset = args.offset ? parseInt(args.offset, 10) : 0;
  const out = args.out || 'result.json';
  const concurrency = parseInt(args.concurrency || '4', 10);

  if (!origin || Number.isNaN(weight) || weight <= 0) {
    console.error('Error: --origin dan --weight (> 0) wajib diisi.');
    process.exit(1);
  }
  if (!PROVIDERS[provider]) {
    console.error(`Provider tidak dikenal: ${provider}. Tersedia: ${Object.keys(PROVIDERS).join(', ')}`);
    process.exit(1);
  }
  if (!['jne', 'biteship'].includes(provider)) {
    console.error(`Provider "${provider}" tidak punya daftar destination lokal. Gunakan jne atau biteship.`);
    process.exit(1);
  }

  const destinations =
    provider === 'jne' ? loadJneDestinations() : loadBiteshipDestinations(!!args['district-only']);

  const slice = destinations.slice(offset, offset + limit);
  console.error(
    `Provider: ${provider} | origin: ${origin} | weight: ${weight}kg | destination: ${slice.length}/${destinations.length} (offset=${offset})`
  );

  if (provider === 'biteship') {
    // origin bisa nama — resolve sekali via getRates internal (findArea di adapter).
    // Kita biarkan adapter menangani; tapi validasi dulu supaya gagal cepat:
    const bs = require('../lib/providers/biteship');
    try {
      const oa = await bs.findArea(origin);
      console.error(`Origin area: ${oa.name} (${oa.id})`);
    } catch (e) {
      console.error(`Fatal: ${e.message}`);
      process.exit(1);
    }
  }

  const rows = [];
  let done = 0;
  const startedAt = Date.now();

  function flush() {
    fs.writeFileSync(
      out,
      JSON.stringify(
        {
          provider,
          origin,
          weightKg: weight,
          fetchedAt: new Date().toISOString(),
          totalDestinations: destinations.length,
          offset,
          completed: rows.length,
          results: rows,
        },
        null,
        2
      )
    );
  }

  await pool(slice, async (dest) => {
    const { results, errors } = await fetchAll(
      { origin, destination: dest.code, weight },
      { only: [provider] }
    );
    done++;
    const rates = results[0] ? results[0].rates : null;
    const error = errors[0] ? errors[0].error : null;

    if (rates && rates.length) {
      rows.push({ destination: dest, rates });
      console.error(`  [${done}/${slice.length}] OK ${dest.name} -> ${rates.length} layanan`);
    } else {
      console.error(`  [${done}/${slice.length}] GAGAL ${dest.name}: ${error || 'kosong'}`);
      rows.push({ destination: dest, error: error || 'tidak ada tarif' });
    }

    if (done % 20 === 0) {
      const rate = done / ((Date.now() - startedAt) / 1000);
      const eta = Math.round((slice.length - done) / rate / 60);
      console.error(`  --- progres ${done}/${slice.length}, ETA ~${eta} menit (autosave)`);
      flush();
    }

    return { destination: dest, rates, error };
  }, concurrency);

  flush();
  const ok = rows.filter((r) => r.rates).length;
  console.error(`\nSelesai: ${ok} destination berhasil, ${rows.length - ok} gagal. Tersimpan: ${out}`);
  process.exit(0);
})();
