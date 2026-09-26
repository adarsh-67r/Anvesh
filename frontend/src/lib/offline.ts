import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

export type Card = {
  id: string;
  front: string;
  back: string;
  skill_id: string | null;
  easiness: number;
  interval: number;
  repetitions: number;
  next_review: string | null;
};

type QueuedReview = { card_id: string; quality: number; at: string };

const DUE_KEY = "offline:flashcards:due";
const TOTAL_KEY = "offline:flashcards:total";
const QUEUE_KEY = "offline:flashcards:reviews";

// fetch() rejects with a TypeError when there is no connection; HTTP errors come back as Error(body).
const isNetworkError = (e: unknown) => e instanceof TypeError;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const writeJson = (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});

export async function pendingReviewCount(): Promise<number> {
  return (await readJson<QueuedReview[]>(QUEUE_KEY, [])).length;
}

/** Send queued offline reviews in order. Stops at the first network failure. */
export async function syncReviews(): Promise<number> {
  const queue = await readJson<QueuedReview[]>(QUEUE_KEY, []);
  let sent = 0;
  for (const r of queue) {
    try {
      await api.post(`/api/flashcards/${r.card_id}/review`, { quality: r.quality });
    } catch (e) {
      if (isNetworkError(e)) break;
      // Card was deleted or the review was rejected: drop it rather than block the queue.
    }
    sent++;
  }
  await writeJson(QUEUE_KEY, queue.slice(sent));
  return sent;
}

/** Due cards from the server when online (and cache them); otherwise the cached copy. */
export async function loadDueCards(): Promise<{ due: Card[]; total: number; offline: boolean; pending: number }> {
  try {
    await syncReviews();
    const [due, all] = await Promise.all([api.get<Card[]>("/api/flashcards/due"), api.get<Card[]>("/api/flashcards")]);
    await Promise.all([writeJson(DUE_KEY, due), writeJson(TOTAL_KEY, all.length)]);
    return { due, total: all.length, offline: false, pending: await pendingReviewCount() };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const queued = new Set((await readJson<QueuedReview[]>(QUEUE_KEY, [])).map((r) => r.card_id));
    const due = (await readJson<Card[]>(DUE_KEY, [])).filter((c) => !queued.has(c.id));
    return { due, total: await readJson<number>(TOTAL_KEY, 0), offline: true, pending: queued.size };
  }
}

/** Review a card now, or queue it if offline. Returns true when it was queued. */
export async function reviewCard(cardId: string, quality: number): Promise<boolean> {
  try {
    await api.post(`/api/flashcards/${cardId}/review`, { quality });
    return false;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const queue = await readJson<QueuedReview[]>(QUEUE_KEY, []);
    queue.push({ card_id: cardId, quality, at: new Date().toISOString() });
    await writeJson(QUEUE_KEY, queue);
    return true;
  }
}

export async function clearOfflineCache() {
  await AsyncStorage.multiRemove([DUE_KEY, TOTAL_KEY, QUEUE_KEY]).catch(() => {});
}
