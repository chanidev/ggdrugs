import { prisma } from '../prisma.js';

/**
 * admin_profiles 시드 CLI.
 *
 * 사용:
 *   pnpm seed:admin --userId 1                # userId 지정
 *   pnpm seed:admin --email dev@local         # 이메일(=dev-login socialUid) 로 찾기
 *   pnpm seed:admin --nickname chan           # nickname 으로 찾기 (유일성 주의)
 *   pnpm seed:admin --list                    # 현재 admin 리스트만 보여주기
 *
 * 옵션:
 *   --scope full|content_only|uploader_review_only  (기본 full)
 *   --deactivate                              (기존 admin 비활성화)
 *
 * 안전:
 *   - 기존 admin_profile 이 있으면 scope/isActive 만 업데이트 (id 유지).
 *   - 없으면 insert.
 */

interface Args {
  userId: bigint | undefined;
  email: string | undefined;
  nickname: string | undefined;
  scope: string;
  list: boolean;
  deactivate: boolean;
}

function parseArgs(argv: string[]): Args {
  const a = argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const userIdRaw = get('--userId');
  let userId: bigint | undefined;
  if (userIdRaw) {
    try {
      userId = BigInt(userIdRaw);
    } catch {
      throw new Error(`--userId 값이 정수가 아닙니다: ${userIdRaw}`);
    }
  }
  return {
    userId,
    email: get('--email'),
    nickname: get('--nickname'),
    scope: get('--scope') ?? 'full',
    list: a.includes('--list'),
    deactivate: a.includes('--deactivate'),
  };
}

async function resolveUserId(a: Args): Promise<bigint> {
  if (a.userId) return a.userId;
  if (a.email) {
    const row = await prisma.user.findFirst({
      where: { socialUid: a.email, isDeleted: false },
      select: { userId: true },
    });
    if (!row) throw new Error(`사용자 찾을 수 없음: socialUid=${a.email}`);
    return row.userId;
  }
  if (a.nickname) {
    const rows = await prisma.user.findMany({
      where: { nickname: a.nickname, isDeleted: false },
      select: { userId: true },
    });
    if (rows.length === 0) throw new Error(`nickname=${a.nickname} 으로 찾은 사용자 없음`);
    if (rows.length > 1) throw new Error(`nickname=${a.nickname} 중복 ${rows.length}건 — --userId 로 지정`);
    return rows[0]!.userId;
  }
  throw new Error('--userId / --email / --nickname 중 하나는 필요');
}

async function listAdmins(): Promise<void> {
  const rows = await prisma.adminProfile.findMany({
    select: {
      adminId: true,
      scope: true,
      isActive: true,
      createdAt: true,
      user: { select: { userId: true, nickname: true, authProvider: true, socialUid: true } },
    },
    orderBy: { adminId: 'asc' },
  });
  if (rows.length === 0) {
    console.log('[seed:admin] 현재 admin_profiles 비어있음.');
    return;
  }
  console.log(`[seed:admin] ${rows.length}명 admin:`);
  for (const r of rows) {
    const flag = r.isActive ? 'ACTIVE' : 'disabled';
    console.log(
      `  admin_id=${r.adminId} user_id=${r.user.userId} ` +
        `provider=${r.user.authProvider} nickname=${r.user.nickname} ` +
        `scope=${r.scope} [${flag}]`,
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.list) {
    await listAdmins();
    return;
  }

  const userId = await resolveUserId(args);
  const existing = await prisma.adminProfile.findUnique({
    where: { userId },
    select: { adminId: true, scope: true, isActive: true },
  });

  if (existing) {
    const next = {
      scope: args.scope,
      isActive: !args.deactivate,
    };
    await prisma.adminProfile.update({
      where: { userId },
      data: next,
    });
    console.log(
      `[seed:admin] updated admin_id=${existing.adminId} user_id=${userId} ` +
        `scope=${next.scope} isActive=${next.isActive}`,
    );
    return;
  }

  if (args.deactivate) {
    console.log(`[seed:admin] user_id=${userId} 에 admin_profile 없음 — 비활성화 대상 없음.`);
    return;
  }

  const created = await prisma.adminProfile.create({
    data: {
      userId,
      scope: args.scope,
      isActive: true,
    },
    select: { adminId: true, scope: true, isActive: true },
  });
  console.log(
    `[seed:admin] created admin_id=${created.adminId} user_id=${userId} ` +
      `scope=${created.scope}`,
  );
}

const isCliRun =
  process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('seed-admin.ts');
if (isCliRun) {
  main()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      await prisma.$disconnect().catch(() => {});
      console.error('[seed:admin] error:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
