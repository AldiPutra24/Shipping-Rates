/**
 * Bangun data/wilayah.json — daftar lengkap wilayah Indonesia (resmi Kemendagri) dari wilayah.id:
 *   - https://wilayah.id/api/provinces.json
 *   - https://wilayah.id/api/regencies/<PROVINCE_CODE>.json
 *   - https://wilayah.id/api/districts/<REGENCY_CODE>.json   (kode pakai titik, mis. 11.01)
 *
 * Tidak melakukan query ke Biteship — hanya sumber resmi wilayah.id.
 *
 * Format output:
 * {
 *   "provinces": [{ "code": "32", "name": "Jawa Barat" }, ...],
 *   "regencies": [{ "code": "32.01", "name": "Kabupaten Bogor", "provinceCode": "32" }, ...],
 *   "districts": [{ "code": "32.01.06", "name": "Kemang", "regencyCode": "32.01" }, ...]
 * }
 *
 * Pemakaian:
 *   node scripts/fetch-wilayah.js
 */
const fs = require('fs');
const path = require('path');
const { http } = require('../lib/http');

const OUT = path.join(__dirname, '..', 'data', 'wilayah.json');

(async () => {
  console.error('Ambil provinsi...');
  const pRes = await http('https://wilayah.id/api/provinces.json');
  const provinces = (pRes.json && pRes.json.data) || [];
  console.error(`${provinces.length} provinsi`);

  console.error('Ambil kota/kabupaten...');
  const regencies = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (i < provinces.length) {
        const p = provinces[i++];
        const r = await http(`https://wilayah.id/api/regencies/${p.code}.json`);
        for (const g of (r.json && r.json.data) || []) {
          regencies.push({ code: g.code, name: g.name, provinceCode: p.code });
        }
      }
    })
  );
  console.error(`${regencies.length} kota/kabupaten`);

  console.error('Ambil kecamatan...');
  const districts = [];
  let j = 0;
  let doneCount = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (j < regencies.length) {
        const g = regencies[j++];
        const r = await http(`https://wilayah.id/api/districts/${g.code}.json`);
        for (const d of (r.json && r.json.data) || []) {
          districts.push({ code: d.code, name: d.name, regencyCode: g.code });
        }
        doneCount++;
        if (doneCount % 50 === 0) console.error(`  ${doneCount}/${regencies.length} kota`);
      }
    })
  );
  console.error(`${districts.length} kecamatan`);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        source: 'wilayah.id',
        provinces,
        regencies,
        districts,
      },
      null,
      2
    )
  );
  console.error(`Tersimpan: ${OUT}`);
  process.exit(0);
})();
