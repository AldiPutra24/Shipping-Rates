/**
 * Aggregator: jalankan semua provider secara paralel.
 * Provider yang gagal dikembalikan sebagai entry errors, bukan menggagalkan semuanya.
 */
const jne = require('./providers/jne');
const paxel = require('./providers/paxel');
const lion = require('./providers/lionparcel');
const biteship = require('./providers/biteship');

const PROVIDERS = {
  jne: { label: 'JNE', fn: jne.getRates },
  biteship: { label: 'Biteship (JNE & kurir lain)', fn: biteship.getRates },
  paxel: { label: 'Paxel', fn: paxel.getRates },
  lionparcel: { label: 'Lion Parcel', fn: lion.getRates },
  bosspack: { label: 'BOSSPACK', fn: lion.getBosspackRates },
};

async function fetchAll(opts, { only } = {}) {
  const names = only && only.length ? only : Object.keys(PROVIDERS);
  const results = [];
  const errors = [];

  await Promise.all(
    names.map(async (name) => {
      const p = PROVIDERS[name];
      if (!p) {
        errors.push({ provider: name, error: `Provider tidak dikenal: ${name}` });
        return;
      }
      try {
        const rates = await p.fn(opts);
        results.push({ provider: name, rates });
      } catch (err) {
        errors.push({ provider: name, error: err.message });
      }
    })
  );

  return { results, errors };
}

module.exports = { PROVIDERS, fetchAll };
