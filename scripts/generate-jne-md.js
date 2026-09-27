/** Ubah data/jne-codes.json menjadi file markdown daftar kode JNE. */
const fs = require('fs');
const path = require('path');

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'jne-codes.json'), 'utf8'));

function mdTable(items) {
  const lines = ['| Kode | Wilayah |', '|------|---------|'];
  for (const { code, label } of items) lines.push(`| \`${code}\` | ${label} |`);
  return lines.join('\n');
}

let out = `# Daftar Kode Origin & Destination JNE

> Sumber: endpoint resmi situs JNE (\`jne.co.id/api-origin\` & \`jne.co.id/api-destination\`),
> ditarik otomatis via \`node scripts/fetch-jne-codes.js\` (data di-cache di \`data/jne-codes.json\`).
> Format kode: 3 huruf kode kota + 5 digit nomor station, contoh \`BOO10000\` = Bogor.

## Origin (${(raw.origin || []).length} kode)

${mdTable(raw.origin || [])}

## Destination (${(raw.destination || []).length} kode)

${mdTable(raw.destination || [])}
`;

const file = path.join(__dirname, '..', 'KODE-JNE.md');
fs.writeFileSync(file, out);
console.error('Tersimpan:', file, `(${out.length} karakter)`);
