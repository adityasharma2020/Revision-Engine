export type MotivationTone = 'soft' | 'balanced' | 'firm' | 'brutal';
export type MotivationTime = 'morning' | 'afternoon' | 'evening' | 'any';

export type MotivationMessage = {
  id: string;
  category: string;
  tone: MotivationTone;
  title: string;
  message: string;
  imageUrl?: string | null;
  imageCategory?: string;
  author?: string | null;
  preferredTime?: MotivationTime;
  weight?: number;
  enabled?: boolean;
};

type ImageEntry = string | { url: string; alt?: string; source?: string };
type MotivationFeed = {
  imagePools: Record<string, ImageEntry[]>;
  notifications: MotivationMessage[];
};

const DEFAULT_FEED_URL = 'https://revision-engine.vercel.app/motivation/notifications.json';
const FALLBACK_FEED: MotivationFeed = {
  imagePools: {},
  notifications: [
    { id: 'fallback-recall', category: 'strategy', tone: 'balanced', title: 'Recall before reading again', message: 'Close the notes, retrieve what you know, then study the gaps your memory actually revealed.', preferredTime: 'any', weight: 1, enabled: true },
    { id: 'fallback-consistency', category: 'consistency', tone: 'firm', title: 'Return to the syllabus', message: 'One honest revision today is worth more than another elaborate plan you will not follow.', preferredTime: 'any', weight: 1, enabled: true },
  ],
};
let cached: { feed: MotivationFeed; expiresAt: number } | null = null;

function validMessage(value: unknown): value is MotivationMessage {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.title === 'string' && typeof item.message === 'string'
    && typeof item.category === 'string' && ['soft', 'balanced', 'firm', 'brutal'].includes(String(item.tone));
}

function normalizeFeed(value: unknown): MotivationFeed {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const notifications = Array.isArray(record.notifications) ? record.notifications.filter(validMessage) : [];
  const rawPools = record.imagePools && typeof record.imagePools === 'object' ? record.imagePools as Record<string, unknown> : {};
  const imagePools = Object.fromEntries(Object.entries(rawPools).map(([key, entries]) => [key, Array.isArray(entries) ? entries : []]));
  return { notifications, imagePools };
}

export async function loadMotivationFeed(): Promise<MotivationFeed> {
  if (cached && cached.expiresAt > Date.now()) return cached.feed;
  const url = Deno.env.get('MOTIVATION_FEED_URL') || DEFAULT_FEED_URL;
  let feed = FALLBACK_FEED;
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const remote = normalizeFeed(await response.json());
    if (!remote.notifications.some((item) => item.enabled !== false)) throw new Error('no enabled messages');
    feed = remote;
  } catch (error) {
    console.warn(`[motivation] Using the built-in text fallback because the content feed is unavailable: ${String(error)}`);
  }
  cached = { feed, expiresAt: Date.now() + 5 * 60_000 };
  return feed;
}

function timeBucket(localTime: string): MotivationTime {
  const hour = Number(localTime.split(':')[0] ?? 12);
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function weightedPick(items: MotivationMessage[]): MotivationMessage | null {
  if (!items.length) return null;
  const total = items.reduce((sum, item) => sum + Math.max(1, Math.min(5, Number(item.weight ?? 3))), 0);
  let cursor = Math.random() * total;
  for (const item of items) {
    cursor -= Math.max(1, Math.min(5, Number(item.weight ?? 3)));
    if (cursor <= 0) return item;
  }
  return items.at(-1) ?? null;
}

export function chooseMotivation(
  feed: MotivationFeed,
  tone: MotivationTone | 'mixed',
  localTime: string,
  recentIds: readonly string[] = [],
): MotivationMessage | null {
  const enabled = feed.notifications.filter((item) => item.enabled !== false);
  const fresh = enabled.filter((item) => !recentIds.includes(item.id));
  const base = fresh.length ? fresh : enabled;
  const toneMatches = tone === 'mixed' ? base : base.filter((item) => item.tone === tone);
  const byTone = toneMatches.length ? toneMatches : base;
  const bucket = timeBucket(localTime);
  const timeMatches = byTone.filter((item) => !item.preferredTime || item.preferredTime === 'any' || item.preferredTime === bucket);
  return weightedPick(timeMatches.length ? timeMatches : byTone);
}

function imageUrl(entry: ImageEntry): string | null {
  const value = typeof entry === 'string' ? entry : entry?.url;
  if (!value || !/^https:\/\//i.test(value)) return null;
  return value;
}

async function reachableImage(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-1023' }, signal: controller.signal });
    return response.ok && (response.headers.get('content-type') ?? '').toLowerCase().startsWith('image/');
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveMotivationImage(feed: MotivationFeed, message: MotivationMessage): Promise<string | undefined> {
  const category = message.imageCategory || message.category;
  const pool = [...(feed.imagePools[category] ?? [])].sort(() => Math.random() - .5);
  const fallback = [...(feed.imagePools.default ?? [])].sort(() => Math.random() - .5);
  const candidates = [message.imageUrl ?? null, ...pool.map(imageUrl), ...fallback.map(imageUrl)]
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
    .slice(0, 5);
  for (const candidate of candidates) if (await reachableImage(candidate)) return candidate;
  return undefined;
}
