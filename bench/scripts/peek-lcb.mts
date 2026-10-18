import { parquetReadObjects } from 'hyparquet';
import { readFileSync } from 'node:fs';
const path = process.argv[2];
const buf = readFileSync(path);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const rows = await parquetReadObjects({ file: ab });
console.log('rows', rows.length, 'cols', Object.keys(rows[0]));
const r = rows[Number(process.argv[3] ?? 0)];
for (const [k, v] of Object.entries(r)) console.log(`--- ${k}:\n${String(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, 1500)}`);
