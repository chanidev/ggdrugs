import { BFF_URL, withCredentials } from './client.js';

// ============================================================
// 내 프로필 수정 (PATCH /me/profile)
// ============================================================

export interface UpdateMyProfileBody {
  nickname?: string;
}

/**
 * PATCH /me/profile — 닉네임 등 프로필 수정 (A_807).
 */
export async function updateMyProfile(body: UpdateMyProfileBody): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/me/profile`,
    withCredentials({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 400) {
    const t = await res.text().catch(() => '');
    throw new Error(`VALIDATION: ${t.slice(0, 200)}`);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`PATCH /me/profile ${res.status}: ${t.slice(0, 200)}`);
  }
}
