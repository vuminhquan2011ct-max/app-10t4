/**
 * Authenticated Supabase data access layer.
 *
 * Uses the signed-in user's JWT automatically via `supabase` so every read,
 * write and RPC is strictly enforced by PostgreSQL Row Level Security (RLS).
 *
 * Sensitive fields (`phone`, `email`, `address`, `note`) are NEVER sent to
 * `class_state`; they live in `student_private` and `student_notes`.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { StudentPrivateData } from '@/types/auth';
import type { ClassResource, Entry, FeedbackCategory, FeedbackItem, KudosItem } from '@/types/models';

import type { PersistedState } from './types';

export const REMOTE_ROW_ID = 'class10t4';

export function isRemoteEnabled(): boolean {
  return isSupabaseConfigured;
}

/** Remove device-local & private fields before uploading `class_state`. */
export function stripForSharedSync(state: PersistedState): Record<string, unknown> {
  const { role: _r, currentStudentId: _s, feedback: _f, ...rest } = state;
  return {
    ...rest,
    students: state.students.map((s) => ({
      ...s,
      phone: null,
      email: null,
      address: null,
      note: null,
    })),
  };
}

/** Pull the shared class JSON document (requires approved member). */
export async function fetchState(): Promise<Partial<PersistedState> | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('class_state')
    .select('data')
    .eq('id', REMOTE_ROW_ID)
    .maybeSingle<{ data: Partial<PersistedState> }>();

  if (error) throw error;
  return data?.data ?? null;
}

/** Upsert the shared class document (allowed only for teacher & editor). */
export async function pushState(state: PersistedState): Promise<void> {
  if (!isSupabaseConfigured) return;
  const payload = stripForSharedSync(state);
  const { error } = await supabase
    .from('class_state')
    .upsert({ id: REMOTE_ROW_ID, data: payload }, { onConflict: 'id' });
  if (error) throw error;
}

/* ---------- Student / Member Safe RPCs ---------- */

export async function submitEntryRemote(entry: Entry): Promise<void> {
  const { error } = await supabase.rpc('app_submit_entry', { entry });
  if (error) throw error;
}

export async function likeAnnouncementRemote(annId: string): Promise<void> {
  const { error } = await supabase.rpc('app_like_announcement', { ann_id: annId });
  if (error) throw error;
}

export async function votePollRemote(pollId: string, optionId: string): Promise<void> {
  const { error } = await supabase.rpc('app_vote_poll', { poll_id: pollId, option_id: optionId });
  if (error) throw error;
}

export async function sendKudosRemote(kudos: KudosItem): Promise<void> {
  const { error } = await supabase.rpc('app_send_kudos', { kudos });
  if (error) throw error;
}

export async function clapKudosRemote(kudosId: string): Promise<void> {
  const { error } = await supabase.rpc('app_clap_kudos', { kudos_id: kudosId });
  if (error) throw error;
}

export async function addResourceRemote(resource: ClassResource): Promise<void> {
  const { error } = await supabase.rpc('app_add_resource', { resource });
  if (error) throw error;
}

/* ---------- Protected Private Data (`student_private` & `student_notes`) ---------- */

export type PrivateBundle = {
  contacts: Record<string, StudentPrivateData>;
  notes: Record<string, string>;
};

export async function fetchPrivateBundle(): Promise<PrivateBundle> {
  if (!isSupabaseConfigured) return { contacts: {}, notes: {} };
  const [privRes, notesRes] = await Promise.all([
    supabase.from('student_private').select('student_id, phone, email, address'),
    supabase.from('student_notes').select('student_id, note'),
  ]);

  const contacts: Record<string, StudentPrivateData> = {};
  if (!privRes.error && Array.isArray(privRes.data)) {
    for (const row of privRes.data as {
      student_id: string;
      phone: string | null;
      email: string | null;
      address: string | null;
    }[]) {
      contacts[row.student_id] = {
        phone: row.phone ?? null,
        email: row.email ?? null,
        address: row.address ?? null,
      };
    }
  }

  const notes: Record<string, string> = {};
  if (!notesRes.error && Array.isArray(notesRes.data)) {
    for (const row of notesRes.data as { student_id: string; note: string | null }[]) {
      if (row.note) notes[row.student_id] = row.note;
    }
  }

  return { contacts, notes };
}

export async function upsertStudentPrivateRemote(
  studentId: string,
  data: StudentPrivateData,
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('student_private').upsert(
    {
      student_id: studentId,
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      address: data.address?.trim() || null,
    },
    { onConflict: 'student_id' },
  );
  if (error) throw error;
}

export async function upsertStudentNoteRemote(
  studentId: string,
  note: string | null,
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('student_notes').upsert(
    {
      student_id: studentId,
      note: note?.trim() || null,
    },
    { onConflict: 'student_id' },
  );
  if (error) throw error;
}

export async function deleteStudentPrivateRemote(studentId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  await Promise.all([
    supabase.from('student_private').delete().eq('student_id', studentId),
    supabase.from('student_notes').delete().eq('student_id', studentId),
  ]);
}

/* ---------- Private Feedback Box (`public.class_feedback`) ---------- */

type FeedbackRow = {
  id: string;
  author_id: string;
  author_name: string;
  anonymous: boolean;
  category: FeedbackCategory;
  content: string;
  reply: string | null;
  resolved: boolean;
  created_at: string;
};

function toFeedback(row: FeedbackRow): FeedbackItem {
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name,
    anonymous: Boolean(row.anonymous),
    category: row.category,
    content: row.content,
    reply: row.reply ?? null,
    resolved: Boolean(row.resolved),
    createdAt: row.created_at,
  };
}

export async function fetchFeedbackRemote(): Promise<FeedbackItem[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('class_feedback')
    .select('id, author_id, author_name, anonymous, category, content, reply, resolved, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data as FeedbackRow[] | null) ?? []).map(toFeedback);
}

export async function sendFeedbackRemote(item: {
  id: string;
  authorName: string;
  anonymous: boolean;
  category: FeedbackCategory;
  content: string;
}): Promise<void> {
  const { error } = await supabase.from('class_feedback').insert({
    id: item.id,
    author_name: item.anonymous ? 'Ẩn danh' : item.authorName,
    anonymous: item.anonymous,
    category: item.category,
    content: item.content.trim(),
  });
  if (error) throw error;
}

export async function replyFeedbackRemote(
  id: string,
  reply: string | null,
  resolved: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('class_feedback')
    .update({ reply: reply?.trim() || null, resolved })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteFeedbackRemote(id: string): Promise<void> {
  const { error } = await supabase.from('class_feedback').delete().eq('id', id);
  if (error) throw error;
}
