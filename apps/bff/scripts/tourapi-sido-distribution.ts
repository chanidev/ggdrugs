import { prisma } from '../src/prisma.js';

const rows = await prisma.$queryRawUnsafe<Array<{ sido_name: string; cnt: number }>>(
  `SELECT r.sido_name, COUNT(*)::int AS cnt
   FROM events e JOIN regions r ON e.region_id = r.region_id
   WHERE e.crawl_origin = $1
   GROUP BY r.sido_name
   ORDER BY cnt DESC`,
  'tourapi-festival',
);

console.log('| sido | events |');
console.log('|---|---|');
for (const r of rows) console.log(`| ${r.sido_name} | ${r.cnt} |`);
const total = rows.reduce((s, r) => s + r.cnt, 0);
console.log(`\nTotal tourapi-festival rows: ${total}, sido distinct: ${rows.length}`);

await prisma.$disconnect();
