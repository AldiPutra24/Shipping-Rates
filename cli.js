#!/usr/bin/env node
/**
 * CLI cek ongkir + estimasi pengiriman (live dari provider).
 *
 * Contoh:
 *   node cli.js --origin BOO10000 --destination CGK10400 --weight 1
 *   node cli.js --provider jne --origin BOO10000 --destination CGK10400 --weight 1
 *   node cli.js --provider jne,lionparcel --origin BOO10000 --destination CGK10400 --weight 1 --json
 */
const { fetchAll, PROVIDERS } = require('./lib/index');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

function printUsage() {
  console.log(`Cek ongkir + estimasi pengiriman (data live dari provider)

Penggunaan:
  node cli.js --origin <kode> --destination <kode> --weight <kg> [opsi]

Opsi:
  --provider        jne | biteship | paxel | lionparcel | bosspack (pisahkan dengan koma; default: semua)
  --length/--width/--height  dimensi opsional (cm)
  --lion-captcha <token>     token reCAPTCHA v3 untuk Lion Parcel (opsional)
  --json            output JSON mentah
  --help            tampilkan bantuan

Contoh:
  node cli.js --origin BOO10000 --destination CGK10400 --weight 1
  node cli.js --provider jne --origin BOO10000 --destination CGK10400 --weight 1
  node cli.js --provider biteship --origin "bogor barat" --destination "jakarta pusat" --weight 1`);
}

function formatRupiah(n) {
  return 'Rp' + Number(n).toLocaleString('id-ID');
}

function pad(s, n) {
  s = String(s || '-');
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function printTable(results) {
  for (const { provider, rates } of results) {
    console.log(`\n=== ${provider.toUpperCase()} (${rates.length} layanan) ===`);
    console.log(
      pad('LAYANAN', 18) +
        pad('NAMA', 32) +
        pad('HARGA', 16) +
        pad('MATA UANG', 10) +
        'ETD'
    );
    for (const r of rates) {
      console.log(
        pad(r.service, 18) +
          pad(r.serviceName, 32) +
          pad(formatRupiah(r.price), 16) +
          pad(r.currency, 10) +
          (r.etd || '-')
      );
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const origin = args.origin;
  const destination = args.destination;
  const weight = parseFloat(args.weight);

  if (!origin || !destination || Number.isNaN(weight) || weight <= 0) {
    console.error('Error: --origin, --destination, dan --weight (> 0) wajib diisi.\n');
    printUsage();
    process.exit(1);
  }

  const opts = {
    origin,
    destination,
    weight,
    length: args.length ? parseFloat(args.length) : undefined,
    width: args.width ? parseFloat(args.width) : undefined,
    height: args.height ? parseFloat(args.height) : undefined,
    captchaToken: args['lion-captcha'] || undefined,
  };

  const only = args.provider
    ? String(args.provider)
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : null;

  if (only) {
    const unknown = only.filter((n) => !PROVIDERS[n]);
    if (unknown.length) {
      console.error(`Provider tidak dikenal: ${unknown.join(', ')}`);
      console.error(`Tersedia: ${Object.keys(PROVIDERS).join(', ')}`);
      process.exit(1);
    }
  }

  console.error(`Mengambil tarif live... (origin=${origin}, destination=${destination}, weight=${weight}kg)`);

  try {
    const { results, errors } = await fetchAll(opts, { only });

    const total = results.reduce((acc, r) => acc + r.rates.length, 0);

    if (args.json) {
      console.log(JSON.stringify({ success: total > 0, results, errors }, null, 2));
    } else {
      for (const e of errors) {
        console.error(`[gagal] ${e.provider}: ${e.error}`);
      }
      if (total === 0) {
        console.error('\nTidak ada tarif yang berhasil diambil dari provider manapun.');
        process.exit(2);
      }
      printTable(results);
      console.log(`\nTotal ${total} layanan dari ${results.length} provider.`);
      if (errors.length) {
        console.error(`(${errors.length} provider gagal, lihat log di atas)`);
      }
    }

    process.exit(total > 0 ? 0 : 2);
  } catch (err) {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  }
}

main();
