/** Cari cara halaman cek-ongkir Biteship memanggil API (endpoint + key). */
const { http } = require('../lib/http');

(async () => {
  const r = await http('https://biteship.com/id/cek-ongkir/jne');
  const chunks = [...new Set([...r.text.matchAll(/\/_next\/static\/chunks\/[^"']+?\.js/g)].map((m) => m[0]))];
  console.error('chunks:', chunks.length);

  const found = [];
  for (const ch of chunks) {
    const c = await http('https://biteship.com' + ch);
    // key pattern biteship_live_xxx / biteship_key_xxx
    for (const m of c.text.matchAll(/biteship_[a-z]+_[A-Za-z0-9_]{8,}/g)) {
      found.push([ch, m[0]]);
    }
    // endpoint api
    for (const m of c.text.matchAll(/https?:\/\/api\.biteship\.com[^"'`\s\\]*/g)) {
      found.push([ch, m[0]]);
    }
    // internal proxy
    for (const m of c.text.matchAll(/["'](\/api\/[a-z0-9\-/]+)["']/g)) {
      found.push([ch, m[1]]);
    }
  }
  for (const [ch, hit] of found) console.log(ch.split('/').pop(), '=>', hit);
  console.error('done');
  process.exit(0);
})();
