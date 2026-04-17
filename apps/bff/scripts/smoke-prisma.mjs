import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

try {
  const inserted = await p.eventCategory.createMany({
    data: [
      { categoryCode: 'festival', displayName: '축제', sortOrder: 1 },
      { categoryCode: 'expo', displayName: '박람회', sortOrder: 2 },
      { categoryCode: 'symposium', displayName: '심포지움', sortOrder: 3 },
      { categoryCode: 'conference', displayName: '컨퍼런스', sortOrder: 4 },
    ],
    skipDuplicates: true,
  });
  console.log('inserted:', inserted.count);

  const rows = await p.eventCategory.findMany({ orderBy: { sortOrder: 'asc' } });
  for (const r of rows) {
    console.log(r.categoryId.toString(), r.categoryCode, r.displayName);
  }
} finally {
  await p.$disconnect();
}
