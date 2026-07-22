import type { PrelimsQuestion, QuizResult } from '../../types';
import { getSupabase } from './client';

const TABLE = 'shared_quiz_results';

export interface SharedQuizSnapshot {
  shareToken: string;
  result: QuizResult;
  questions: readonly PrelimsQuestion[];
  createdAt: string;
  owner: { name: string | null; avatarUrl: string | null } | null;
}

export interface ActiveQuizShare {
  shareToken: string;
  showOwner: boolean;
}

async function requireUser() {
  const client = getSupabase();
  if (!client) throw new Error('Supabase is not configured.');
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Sign in before sharing a result.');
  return { client, user: data.user };
}

export async function getActiveQuizShare(resultId: string): Promise<ActiveQuizShare | null> {
  const { client, user } = await requireUser();
  const { data, error } = await client
    .from(TABLE)
    .select('share_token, show_owner')
    .eq('owner_id', user.id)
    .eq('result_id', resultId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? {
    shareToken: data.share_token as string,
    showOwner: data.show_owner as boolean,
  } : null;
}

export async function createQuizShare(
  result: QuizResult,
  questions: readonly PrelimsQuestion[],
  showOwner: boolean,
): Promise<string> {
  const existing = await getActiveQuizShare(result.id);
  const { client, user } = await requireUser();
  const metadata = user.user_metadata ?? {};
  const ownerName = (metadata.full_name as string | undefined)
    ?? (metadata.name as string | undefined)
    ?? null;
  const ownerAvatarUrl = (metadata.avatar_url as string | undefined)
    ?? (metadata.picture as string | undefined)
    ?? null;
  if (existing) {
    const { error } = await client
      .from(TABLE)
      .update({
        show_owner: showOwner,
        owner_name: showOwner ? ownerName : null,
        owner_avatar_url: showOwner ? ownerAvatarUrl : null,
      })
      .eq('owner_id', user.id)
      .eq('share_token', existing.shareToken);
    if (error) throw new Error(error.message);
    return existing.shareToken;
  }
  const { data, error } = await client
    .from(TABLE)
    .insert({
      owner_id: user.id,
      result_id: result.id,
      result,
      questions,
      show_owner: showOwner,
      owner_name: showOwner ? ownerName : null,
      owner_avatar_url: showOwner ? ownerAvatarUrl : null,
      is_active: true,
    })
    .select('share_token')
    .single();
  if (error) throw new Error(error.message);
  return data.share_token as string;
}

export async function revokeQuizShare(shareToken: string): Promise<void> {
  const { client, user } = await requireUser();
  const { error } = await client
    .from(TABLE)
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('owner_id', user.id)
    .eq('share_token', shareToken);
  if (error) throw new Error(error.message);
}

export async function loadSharedQuiz(shareToken: string): Promise<SharedQuizSnapshot | null> {
  const client = getSupabase();
  if (!client) return null;
  const { data, error } = await client
    .from(TABLE)
    .select('share_token, result, questions, created_at, show_owner, owner_name, owner_avatar_url')
    .eq('share_token', shareToken)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    shareToken: data.share_token as string,
    result: data.result as QuizResult,
    questions: data.questions as PrelimsQuestion[],
    createdAt: data.created_at as string,
    owner: data.show_owner ? {
      name: (data.owner_name as string | null) ?? null,
      avatarUrl: (data.owner_avatar_url as string | null) ?? null,
    } : null,
  };
}
