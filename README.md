# Cek Ongkir CLI

CLI sederhana untuk cek ongkir + estimasi waktu pengiriman secara **live** dari beberapa provider ekspedisi Indonesia. Tanpa frontend, database, cache, atau framework — cukup Node.js 18+ (built-in `fetch`).

## Provider

| Provider    | Sumber data live | Catatan |
|-------------|------------------|---------|
| **JNE**     | `jne.co.id/shipping-fee?origin=..&destination=..&weight=..` (GET, server-rendered) | REG, YES, SPS, JTR, dll — semua layanan yang tersedia di halaman |
| **Paxel**   | `paxel.co/id/check-rates` (form POST + CSRF) | Web Paxel mewajibkan slider captcha di browser; adapter gagal gracefully jika ditolak |
| **Lion Parcel** | `lionparcel.com/api/ongkir-v3` (proxy resmi website ke `/v3/tariff`) | Upstream memvalidasi reCAPTCHA v3; token bisa disuplai via `LION_PARCEL_CAPTCHA_TOKEN` |
| **BOSSPACK**| Sama dengan Lion Parcel (BOSSPACK = layanan Lion Parcel/Lion Express) | Filter layanan BOSSPACK dari hasil tariff |

Tidak ada tarif/ETA yang di-hardcode — semuanya diambil live saat dijalankan. Tidak ada bypass CAPTCHA/Cloudflare.

## Penggunaan

```bash
# Semua provider sekaligus
node cli.js --origin BOO10000 --destination CGK10400 --weight 1

# Satu provider saja
node cli.js --provider jne --origin BOO10000 --destination CGK10400 --weight 1

# Beberapa provider
node cli.js --provider jne,lionparcel --origin BOO10000 --destination CGK10400 --weight 1

# Dengan dimensi
node cli.js --origin BOO10000 --destination CGK10400 --weight 1 --length 10 --width 10 --height 10

# Output JSON
node cli.js --origin BOO10000 --destination CGK10400 --weight 1 --json
```

## Environment variable

| Variabel | Default | Keterangan |
|----------|---------|------------|
| `TIMEOUT_MS` | `15000` | Timeout HTTP per request |
| `LION_PARCEL_CAPTCHA_TOKEN` | (kosong) | Token reCAPTCHA v3 browser untuk endpoint tariff Lion Parcel |

## Struktur

```
cli.js                    # entry point CLI (arg parsing, validasi, output)
lib/http.js               # helper fetch + timeout + UA
lib/index.js              # aggregator paralel, error per-provider
lib/providers/jne.js      # adapter JNE
lib/providers/paxel.js    # adapter Paxel
lib/providers/lionparcel.js # adapter Lion Parcel + BOSSPACK
```

## Format hasil (dinormalisasi)

Setiap layanan dinormalisasi ke:

```json
{
  "provider": "jne",
  "service": "REG",
  "serviceName": "JNE REG",
  "price": 10000,
  "currency": "IDR",
  "etd": "1-2 hari"
}
```

## Cara testing

```bash
npm run jne   # test JNE saja (BOO10000 -> CGK10400, 1kg)
npm run all   # test semua provider
```

Exit code: `0` sukses minimal satu provider, `1` error fatal/argument salah, `2` semua provider gagal.

## Catatan penting

- **Lion Parcel / BOSSPACK**: endpoint resmi website (`/api/ongkir-v3`) memvalidasi token reCAPTCHA v3 yang hanya bisa dihasilkan browser asli. Tanpa token, provider ini akan gagal — sesuai instruksi, tidak dilakukan bypass. Solusi yang benar untuk production adalah mendaftar API resmi Lion Parcel.
- **Paxel**: form check-rates web memakai slider captcha; adapter mencoba alur CSRF + POST dan gagal gracefully jika ditolak.
- **JNE** saat ini provider yang paling reliable untuk di-scrape live (GET publik tanpa captcha).
