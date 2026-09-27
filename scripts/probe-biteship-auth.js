/** Cari di semua chunk Next.js Biteship: base URL API (o.bl), auth publik (c.c), dan API key. */
const { http } = require('../lib/http');

(async () => {
  const page = await http('https://biteship.com/id/cek-ongkir/jne');
  const chunks = [...new Set([...page.text.matchAll(/\/_next\/static\/chunks\/[^"']+?\.js/g)].map((m) => m[0]))];

  for (const ch of chunks) {
    const c = await http('https://biteship.com' + ch);
    const t = c.text;

    // base url api: properti bl (mis. bl:"https://api.biteship.com")
    for (const m of t.matchAll(/bl\s*:\s*"([^"]*biteship[^"]*)"/g)) console.log('BASE', ch.split('/').pop(), '=>', m[1]);

    // fungsi auth: teks di dekat 'Authorization:"Public"' atau pembentukan header key
    for (const m of t.matchAll(/Authorization\s*:\s*[^,}]{1,60}/g)) console.log('AUTH', ch.split('/').pop(), '=>', m[0]);

    // api key literal
    for (const m of t.matchAll(/biteship_(?:live|test|key)_[A-Za-z0-9_]+/g)) console.log('KEY', ch.split('/').pop(), '=>', m[0]);
  }
  console.error('done');
  process.exit(0);
})();
