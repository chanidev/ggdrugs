import { BFF_URL, withCredentials } from './client.js';

// =============================================================
// A_203 구독
// =============================================================

export interface MySubscription {
  subscriptionId: string;
  regionIds: string[];
  companions: string[];
  eventTypes: string[];
  vibeIds: string[];
  periodMonths: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function fetchMySubscriptions(signal?: AbortSignal): Promise<MySubscription[]> {
  const init = withCredentials(signal ? { signal } : {});
  const res = await fetch(`${BFF_URL}/me/subscriptions`, init);
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`GET /me/subscriptions ${res.status}`);
  const data = (await res.json()) as { items: MySubscription[] };
  return data.items;
}

export interface NewSubscriptionBody {
  regionIds?: string[];
  companions?: Array<'solo' | 'couple' | 'friend' | 'family'>;
  eventTypes?: string[];
  vibeIds?: string[];
  periodMonths?: number | null;
}

export async function createSubscription(body: NewSubscriptionBody): Promise<MySubscription> {
  const res = await fetch(
    `${BFF_URL}/me/subscriptions`,
    withCredentials({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (res.status === 409) throw new Error('MAX_SUBSCRIPTIONS_REACHED');
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`POST /me/subscriptions ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as { subscription: MySubscription };
  return data.subscription;
}

export async function toggleSubscription(
  subscriptionId: string,
  isActive: boolean,
): Promise<MySubscription> {
  const res = await fetch(
    `${BFF_URL}/me/subscriptions/${encodeURIComponent(subscriptionId)}`,
    withCredentials({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`PATCH /me/subscriptions/${subscriptionId} ${res.status}`);
  const data = (await res.json()) as { subscription: MySubscription };
  return data.subscription;
}

export async function deleteSubscription(subscriptionId: string): Promise<void> {
  const res = await fetch(
    `${BFF_URL}/me/subscriptions/${encodeURIComponent(subscriptionId)}`,
    withCredentials({ method: 'DELETE' }),
  );
  if (res.status === 401) throw new Error('UNAUTHENTICATED');
  if (!res.ok) throw new Error(`DELETE /me/subscriptions/${subscriptionId} ${res.status}`);
}
