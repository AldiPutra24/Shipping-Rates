const fs = require("fs");
const path = require("path");

// Lokasi file input dan output
const inputPath = path.join(__dirname, "../result.json");
const outputPath = path.join(__dirname, "../result-normalized.json");

// Baca data hasil running sebelumnya
const data = JSON.parse(
  fs.readFileSync(inputPath, "utf8")
);

// Statistik hasil normalisasi
let totalDestination = 0;
let totalYES = 0;
let totalReguler = 0;
let totalTanpaLayanan = 0;

// Pastikan struktur data sesuai
if (!Array.isArray(data.results)) {
  throw new Error(
    'Format JSON tidak sesuai: properti "results" harus berupa array.'
  );
}

// Normalisasi setiap kecamatan
data.results = data.results.map((item) => {
  totalDestination++;

  // Pastikan rates berupa array
  const rates = Array.isArray(item.rates)
    ? item.rates
    : [];

  // Ambil layanan JNE saja
  const jneRates = rates.filter((rate) => {
    const courierCode = String(
      rate.courierCode || ""
    ).toLowerCase();

    const provider = String(
      rate.provider || ""
    ).toLowerCase();

    return (
      courierCode === "jne" ||
      (
        provider === "jne" &&
        !courierCode
      )
    );
  });

  // Identifikasi layanan YES dan Reguler
  const yesRates = jneRates.filter((rate) => {
    const service = String(
      rate.service || ""
    ).toLowerCase();

    const serviceName = String(
      rate.serviceName || ""
    ).toLowerCase();

    const combined = `${service} ${serviceName}`;

    return (
      /\byes\b/.test(combined) ||
      combined.includes("yakin esok sampai")
    );
  });

  const regulerRates = jneRates.filter((rate) => {
    const service = String(
      rate.service || ""
    ).toLowerCase();

    const serviceName = String(
      rate.serviceName || ""
    ).toLowerCase();

    const combined = `${service} ${serviceName}`;

    return (
      /\breguler\b/.test(combined) ||
      /\bregular\b/.test(combined)
    );
  });

  // Prioritas: YES > Reguler > kosong
  let selectedRates = [];

  if (yesRates.length > 0) {
    selectedRates = [yesRates[0]];
    totalYES++;
  } else if (regulerRates.length > 0) {
    selectedRates = [regulerRates[0]];
    totalReguler++;
  } else {
    totalTanpaLayanan++;
  }

  // Pertahankan data destination dan properti lainnya
  return {
    ...item,
    rates: selectedRates,
  };
});

// Simpan sebagai file baru, tanpa mengubah result.json
fs.writeFileSync(
  outputPath,
  JSON.stringify(data, null, 2),
  "utf8"
);

console.log("Normalisasi selesai!");
console.log(`Total kecamatan     : ${totalDestination}`);
console.log(`Menggunakan YES     : ${totalYES}`);
console.log(`Menggunakan Reguler : ${totalReguler}`);
console.log(`Tanpa layanan       : ${totalTanpaLayanan}`);
console.log(`File output         : ${outputPath}`);