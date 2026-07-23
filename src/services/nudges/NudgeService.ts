import { DEFAULT_NUDGE_PREFERENCES, type MemoryNudge, type NudgeFeedback, type NudgeKind, type NudgePreferences } from '../../types';
import { getSupabase } from '../supabase/client';

type NudgeInput = Pick<MemoryNudge, 'title' | 'content' | 'kind' | 'context' | 'source' | 'sourceUrl' | 'tags' | 'priority' | 'cooldownHours'>;

const client = () => {
  const value = getSupabase();
  if (!value) throw new Error('Sign in with Supabase to use Memory Nudges.');
  return value;
};

function mapNudge(row: Record<string, unknown>): MemoryNudge {
  return { id: String(row.id), kind: row.kind as NudgeKind, title: String(row.title), content: String(row.content), context: String(row.context ?? ''), source: String(row.source ?? ''), sourceUrl: String(row.source_url ?? ''), tags: (row.tags ?? []) as string[], priority: Number(row.priority), cooldownHours: Number(row.cooldown_hours), active: Boolean(row.active), archived: Boolean(row.archived), nextEligibleAt: row.next_eligible_at as string | null, lastSentAt: row.last_sent_at as string | null, sendCount: Number(row.send_count), rememberedCount: Number(row.remembered_count), forgottenCount: Number(row.forgotten_count), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

const toRow = (input: NudgeInput) => ({ kind: input.kind, title: input.title.trim(), content: input.content.trim(), context: input.context.trim(), source: input.source.trim(), source_url: input.sourceUrl.trim(), tags: input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean), priority: input.priority, cooldown_hours: input.cooldownHours });

export async function listNudges(): Promise<MemoryNudge[]> {
  const { data, error } = await client().from('memory_nudges').select('*').eq('archived', false).order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapNudge(row));
}
export async function getNudge(id: string): Promise<MemoryNudge | null> {
  const { data, error } = await client().from('memory_nudges').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapNudge(data) : null;
}
export async function createNudge(input: NudgeInput): Promise<MemoryNudge> {
  const { data: auth } = await client().auth.getUser();
  if (!auth.user) throw new Error('Sign in to create a nudge.');
  const { data, error } = await client().from('memory_nudges').insert({ user_id: auth.user.id, ...toRow(input) }).select().single();
  if (error) throw error;
  return mapNudge(data);
}
export async function updateNudge(id: string, input: NudgeInput): Promise<MemoryNudge> {
  const { data, error } = await client().from('memory_nudges').update(toRow(input)).eq('id', id).select().single();
  if (error) throw error;
  return mapNudge(data);
}
export async function setNudgeActive(id: string, active: boolean) { const { error } = await client().from('memory_nudges').update({ active }).eq('id', id); if (error) throw error; }
export async function recordNudgeOpen(nudgeId: string) { const { data: auth } = await client().auth.getUser(); if (auth.user) await client().from('nudge_interactions').insert({ user_id: auth.user.id, nudge_id: nudgeId, action: 'opened' }); }
export async function recordNudgeFeedback(nudge: MemoryNudge, action: NudgeFeedback, snoozeHours = 24) {
  const { data: auth } = await client().auth.getUser(); if (!auth.user) throw new Error('Sign in required.');
  const hours = action === 'remembered' ? Math.max(nudge.cooldownHours * 2, 48) : action === 'forgot' ? 6 : snoozeHours;
  const patch: Record<string, unknown> = { next_eligible_at: new Date(Date.now() + hours * 3_600_000).toISOString() };
  if (action === 'remembered') patch.remembered_count = nudge.rememberedCount + 1;
  if (action === 'forgot') patch.forgotten_count = nudge.forgottenCount + 1;
  if (action === 'archive') { patch.archived = true; patch.active = false; }
  const { error } = await client().from('memory_nudges').update(patch).eq('id', nudge.id); if (error) throw error;
  await client().from('nudge_interactions').insert({ user_id: auth.user.id, nudge_id: nudge.id, action, metadata: action === 'snooze' ? { hours: snoozeHours } : {} });
}

export async function loadNudgePreferences(): Promise<NudgePreferences> {
  const { data } = await client().from('nudge_preferences').select('*').maybeSingle();
  if (!data) return { ...DEFAULT_NUDGE_PREFERENCES, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' };
  return { enabled: data.enabled, maxPerDay: data.max_per_day, deliveryDays: data.delivery_days, windows: data.windows, quietStart: String(data.quiet_start).slice(0, 5), quietEnd: String(data.quiet_end).slice(0, 5), privacyMode: data.privacy_mode, adaptiveScheduling: data.adaptive_scheduling, minimumCooldownHours: data.minimum_cooldown_hours, defaultPriority: data.default_priority, avoidRepeatsUntilCycle: data.avoid_repeats_until_cycle, timezone: data.timezone };
}
export async function saveNudgePreferences(value: NudgePreferences): Promise<void> {
  const { data: auth } = await client().auth.getUser(); if (!auth.user) throw new Error('Sign in required.');
  const { error } = await client().from('nudge_preferences').upsert({ user_id: auth.user.id, enabled: value.enabled, max_per_day: value.maxPerDay, delivery_days: value.deliveryDays, windows: value.windows, quiet_start: value.quietStart, quiet_end: value.quietEnd, privacy_mode: value.privacyMode, adaptive_scheduling: value.adaptiveScheduling, minimum_cooldown_hours: value.minimumCooldownHours, default_priority: value.defaultPriority, avoid_repeats_until_cycle: value.avoidRepeatsUntilCycle, timezone: value.timezone });
  if (error) throw error;
}
