import type { PrelimsQuestion, QuizResult } from '../../types';
import { getSupabase } from './client';

const TABLE = 'shared_quiz_results';

export interface SharedQuizSnapshot {
  shareToken: string;
  result: QuizResult;
  questions: readonly PrelimsQuestion[];
  createdAt: string;
}

async function requireUser() {
  const client = getSupabase();
  if (!client) throw new Error('Supabase is not configured.');
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Sign in before sharing a result.');
  return { client, user: data.user };
}

export async function getActiveQuizShare(resultId: string): Promise<string | null> {
  const { client, user } = await requireUser();
  const { data, error } = await client
    .from(TABLE)
    .select('share_token')
    .eq('owner_id', user.id)
    .eq('result_id', resultId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.share_token as string | undefined) ?? null;
}

export async function createQuizShare(
  result: QuizResult,
  questions: readonly PrelimsQuestion[],
): Promise<string> {
  const existing = await getActiveQuizShare(result.id);
  if (existing) return existing;
  const { client, user } = await requireUser();
  const { data, error } = await client
    .from(TABLE)
    .insert({
      owner_id: user.id,
      result_id: result.id,
      result,
      questions,
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
    .select('share_token, result, questions, created_at')
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
  };
}
