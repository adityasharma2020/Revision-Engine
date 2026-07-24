import type { SupabaseClient } from '@supabase/supabase-js';
import type { Chapter } from '../../types';
import { parseChapter } from '../parser';

export type CommunityStatus =
  | 'private'
  | 'pending'
  | 'published'
  | 'changes_requested'
  | 'unpublished'
  | 'archived';

export interface CommunitySubmission {
  id: string;
  ownerId: string | null;
  chapterId: string;
  draft: Chapter;
  published: Chapter | null;
  status: CommunityStatus;
  reviewNote: string | null;
  submittedAt: string;
}

export interface ChapterAccess {
  ownerId: string | null;
  isOwner: boolean;
  isAdmin: boolean;
}

export interface EditSuggestion {
  id: string;
  chapterId: string;
  proposerId: string;
  proposed: Chapter;
  note: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  reviewNote: string | null;
  createdAt: string;
}

export interface AdminAuditEntry {
  id: number;
  actorId: string | null;
  chapterId: string;
  action: string;
  previousStatus: string | null;
  nextStatus: string | null;
  note: string | null;
  createdAt: string;
}

interface CommunityRow {
  id: string;
  owner_id: string | null;
  chapter_id: string;
  draft_content: unknown;
  published_content: unknown | null;
  status: CommunityStatus;
  review_note: string | null;
  submitted_at: string;
}

interface SuggestionRow {
  id: string;
  chapter_id: string;
  proposer_id: string;
  proposed_content: unknown;
  note: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  review_note: string | null;
  created_at: string;
}

interface AuditRow {
  id: number | string;
  actor_id: string | null;
  chapter_id: string;
  action: string;
  previous_status: string | null;
  next_status: string | null;
  note: string | null;
  created_at: string;
}

function mapRow(row: CommunityRow): CommunitySubmission {
  return {
    id: row.id,
    ownerId: row.owner_id,
    chapterId: row.chapter_id,
    draft: parseChapter(row.draft_content),
    published: row.published_content ? parseChapter(row.published_content) : null,
    status: row.status,
    reviewNote: row.review_note,
    submittedAt: row.submitted_at,
  };
}

function mapSuggestion(row: SuggestionRow): EditSuggestion {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    proposerId: row.proposer_id,
    proposed: parseChapter(row.proposed_content),
    note: row.note,
    status: row.status,
    reviewNote: row.review_note,
    createdAt: row.created_at,
  };
}

export async function loadPublishedChapters(client: SupabaseClient): Promise<Chapter[]> {
  const { data, error } = await client
    .from('community_chapters')
    .select('published_content')
    .not('published_content', 'is', null)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    try {
      return [parseChapter(row.published_content)];
    } catch (error) {
      console.warn('[community] skipped invalid published chapter:', error);
      return [];
    }
  });
}

export async function loadPublishedChapter(
  client: SupabaseClient,
  chapterId: string,
): Promise<Chapter | null> {
  const { data, error } = await client
    .from('community_chapters')
    .select('published_content')
    .eq('chapter_id', chapterId)
    .not('published_content', 'is', null)
    .maybeSingle();
  if (error) throw error;
  return data?.published_content ? parseChapter(data.published_content) : null;
}

export async function loadMySubmissions(
  client: SupabaseClient,
): Promise<CommunitySubmission[]> {
  const { data, error } = await client.rpc('get_my_community_submissions');
  if (error) throw error;
  return ((data ?? []) as CommunityRow[]).map(mapRow);
}

export async function submitCommunityChapter(
  client: SupabaseClient,
  chapter: Chapter,
): Promise<CommunitySubmission> {
  const { data, error } = await client.rpc('submit_community_chapter', { chapter });
  if (error) throw error;
  return mapRow(data as CommunityRow);
}

export async function isCommunityAdmin(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.rpc('is_admin');
  if (error) throw error;
  return data === true;
}

export async function loadReviewQueue(client: SupabaseClient): Promise<CommunitySubmission[]> {
  const { data, error } = await client.rpc('get_community_review_queue');
  if (error) throw error;
  return ((data ?? []) as CommunityRow[]).map(mapRow);
}

export async function reviewCommunityChapter(
  client: SupabaseClient,
  submissionId: string,
  decision: 'published' | 'changes_requested',
  note?: string,
): Promise<CommunitySubmission> {
  const { data, error } = await client.rpc('review_community_chapter', {
    submission_id: submissionId,
    decision,
    note: note ?? null,
  });
  if (error) throw error;
  return mapRow(data as CommunityRow);
}

export async function getPublicChapterAccess(
  client: SupabaseClient,
  chapterId: string,
): Promise<ChapterAccess | null> {
  const { data, error } = await client.rpc('get_public_chapter_access', {
    target_chapter_id: chapterId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? {
    ownerId: row.owner_id as string | null,
    isOwner: row.is_owner === true,
    isAdmin: row.admin_access === true,
  } : null;
}

export async function savePublicChapterEdit(
  client: SupabaseClient,
  chapter: Chapter,
  note?: string,
): Promise<'published' | 'pending' | 'suggested'> {
  const { data, error } = await client.rpc('save_public_chapter_edit', {
    target_chapter_id: chapter.id,
    chapter,
    edit_note: note ?? null,
  });
  if (error) throw error;
  return data as 'published' | 'pending' | 'suggested';
}

export async function loadSuggestionQueue(client: SupabaseClient): Promise<EditSuggestion[]> {
  const { data, error } = await client.rpc('get_edit_suggestion_queue');
  if (error) throw error;
  return ((data ?? []) as SuggestionRow[]).map(mapSuggestion);
}

export async function reviewEditSuggestion(
  client: SupabaseClient,
  suggestionId: string,
  decision: 'accepted' | 'rejected',
  note?: string,
): Promise<void> {
  const { error } = await client.rpc('review_edit_suggestion', {
    suggestion_id: suggestionId,
    decision,
    note: note ?? null,
  });
  if (error) throw error;
}

export async function makePublicChapterPrivate(
  client: SupabaseClient,
  chapter: Chapter,
): Promise<Chapter> {
  const { data, error } = await client.rpc('make_public_chapter_private', {
    target_chapter_id: chapter.id,
    chapter,
  });
  if (error) throw error;
  return parseChapter(data);
}

export async function loadAdminChapterCatalog(
  client: SupabaseClient,
): Promise<CommunitySubmission[]> {
  const { data, error } = await client.rpc('get_admin_chapter_catalog');
  if (error) throw error;
  return ((data ?? []) as CommunityRow[]).map(mapRow);
}

export async function adminSetChapterState(
  client: SupabaseClient,
  recordId: string,
  action: 'publish' | 'unpublish' | 'archive',
  note?: string,
): Promise<CommunitySubmission> {
  const { data, error } = await client.rpc('admin_set_chapter_state', {
    p_record_id: recordId,
    p_action: action,
    p_note: note ?? null,
  });
  if (error) throw error;
  return mapRow(data as CommunityRow);
}

export async function adminUpdateChapter(
  client: SupabaseClient,
  recordId: string,
  chapter: Chapter,
  publish: boolean,
  note?: string,
): Promise<CommunitySubmission> {
  const { data, error } = await client.rpc('admin_update_chapter', {
    p_record_id: recordId,
    p_chapter: chapter,
    p_publish: publish,
    p_note: note ?? null,
  });
  if (error) throw error;
  return mapRow(data as CommunityRow);
}

export async function loadAdminChapterAudit(
  client: SupabaseClient,
  limit = 100,
): Promise<AdminAuditEntry[]> {
  const { data, error } = await client.rpc('get_admin_chapter_audit', { p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as AuditRow[]).map((row) => ({
    id: Number(row.id),
    actorId: row.actor_id as string | null,
    chapterId: row.chapter_id as string,
    action: row.action as string,
    previousStatus: row.previous_status as string | null,
    nextStatus: row.next_status as string | null,
    note: row.note as string | null,
    createdAt: row.created_at as string,
  }));
}
