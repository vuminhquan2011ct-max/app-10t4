/**
 * Cloud Supabase data access & non-destructive merge layer.
 *
 * Works immediately out-of-the-box with the live `public.class_state` table
 * (no manual SQL migration or Google OAuth session required) while staying
 * cleanly compatible with optional RLS tables/RPCs if installed.
 *
 * Privacy guarantee:
 * - Sensitive contact fields (`phone`, `email`, `address`, `note`) are NEVER
 *   uploaded into `class_state`; pulling remote NEVER wipes local private values.
 * - Device-local view fields (`role`, `currentStudentId`) are NEVER synced.
 */

import { roundPoints } from '@/constants/entry-meta';
import { extractDriveFileIdFromUrl } from '@/lib/drive';
import {
  formatPositionsDisplay,
  normalizeCustomGrants,
  normalizePositionsList,
} from '@/lib/officer-roles';
import { emitLiveBroadcast } from '@/lib/realtime-bus';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { createId } from '@/lib/utils';
import type { StudentPrivateData } from '@/types/auth';
import type {
  ActivityLogItem,
  Announcement,
  AnnouncementReply,
  AnnouncementVisibility,
  AttendanceDay,
  ClassResource,
  ClassTask,
  DriveAttachment,
  DutyDayLog,
  DutyStudentRecord,
  Entry,
  FeedbackCategory,
  FeedbackItem,
  FundTransaction,
  KudosItem,
  Poll,
  RegisteredTeacherPublic,
  Student,
} from '@/types/models';

import { freshState, hydrateState } from './persist';
import type { PersistedState, StudentInput } from './types';

export const REMOTE_ROW_ID = 'class10t4';
export const AUTH_REGISTRY_ROW_ID = 'class10t4_accounts_v1';
/** Global account reset epoch — matches the exact `accountsResetAt` written to live Supabase. */
export const ACCOUNTS_RESET_EPOCH = '2026-11-24T01:54:00.000Z';

export function isRemoteEnabled(): boolean {
  return isSupabaseConfigured;
}

/* ---------- Serialization Queues (prevent same-device write races) ---------- */

let classStateWriteChain: Promise<unknown> = Promise.resolve();
let authRegistryWriteChain: Promise<unknown> = Promise.resolve();

function enqueueClassStateWrite<T>(task: () => Promise<T>): Promise<T> {
  const next = classStateWriteChain.then(task, task);
  classStateWriteChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function enqueueAuthRegistryWrite<T>(task: () => Promise<T>): Promise<T> {
  const next = authRegistryWriteChain.then(task, task);
  authRegistryWriteChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/* ---------- Deterministic Legacy Backfill Cache ---------- */

// Older remote `class_state` rows only store `{version, classInfo, students, entries}`.
// Memoize the initial backfill once per session so repeated pulls don't generate
// fresh random seed IDs and trigger spurious diff/push loops.
let cachedLegacyTemplate: PersistedState | null = null;

function getLegacyTemplate(): PersistedState {
  if (!cachedLegacyTemplate) {
    const base = freshState();
    cachedLegacyTemplate = {
      ...base,
      students: [],
      entries: [],
      attendance: {},
      dutyLogs: {},
      fundPaid: {},
      kudos: [],
      activityLog: [],
      registeredTeachers: [],
      deletedStudentIds: {},
      deletedTeacherIds: {},
      deletedDriveFileIds: {},
      deletedItemIds: {},
      accountsResetAt: null,
      seating: { ...base.seating, seats: {}, updatedAt: '' },
    };
  }
  return cachedLegacyTemplate;
}

function hydrateRemotePayload(raw: Partial<PersistedState>): PersistedState {
  const tpl = getLegacyTemplate();
  const filled: Partial<PersistedState> = {
    ...raw,
    announcements: Array.isArray(raw.announcements) ? raw.announcements : tpl.announcements,
    fundTransactions: Array.isArray(raw.fundTransactions)
      ? raw.fundTransactions
      : tpl.fundTransactions,
    schedule: Array.isArray(raw.schedule) ? raw.schedule : tpl.schedule,
    polls: Array.isArray(raw.polls) ? raw.polls : tpl.polls,
    tasks: Array.isArray(raw.tasks) ? raw.tasks : tpl.tasks,
    feedback: Array.isArray(raw.feedback) ? raw.feedback : tpl.feedback,
    kudos: Array.isArray(raw.kudos) ? raw.kudos : tpl.kudos,
    resources: Array.isArray(raw.resources) ? raw.resources : tpl.resources,
    seating:
      raw.seating &&
      typeof raw.seating === 'object' &&
      typeof raw.seating.rows === 'number' &&
      typeof raw.seating.cols === 'number' &&
      raw.seating.seats &&
      typeof raw.seating.seats === 'object'
        ? raw.seating
        : tpl.seating,
  };
  return hydrateState(filled);
}

/* ---------- Shared Payload Sanitization & Stable Signature ---------- */

/** Remove device-local & sensitive contact fields before uploading `class_state`. */
export function stripForSharedSync(state: PersistedState): Record<string, unknown> {
  const { role: _r, currentStudentId: _s, ...rest } = state;
  return {
    ...rest,
    students: state.students.map((s) => ({
      ...s,
      phone: null,
      email: null,
      address: null,
      note: null,
    })),
    registeredTeachers: state.registeredTeachers ?? [],
    dutyLogs: state.dutyLogs ?? {},
    deletedStudentIds: state.deletedStudentIds ?? {},
    deletedTeacherIds: state.deletedTeacherIds ?? {},
    deletedDriveFileIds: state.deletedDriveFileIds ?? {},
    deletedItemIds: state.deletedItemIds ?? {},
    accountsResetAt: state.accountsResetAt ?? null,
  };
}

/** Stable comparison signature for shared synced fields. */
export function sharedSyncSignature(state: PersistedState): string {
  return JSON.stringify(stripForSharedSync(state));
}

/* ---------- Non-Destructive State Merge ---------- */

function ts(iso?: string | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function normText(value?: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function mergeTombstones(
  a?: Record<string, string>,
  b?: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (a) {
    for (const [k, v] of Object.entries(a)) {
      if (k && v) out[k] = v;
    }
  }
  if (b) {
    for (const [k, v] of Object.entries(b)) {
      if (!k || !v) continue;
      if (!out[k] || ts(v) >= ts(out[k])) {
        out[k] = v;
      }
    }
  }
  return out;
}

function isTombstoned(
  tombstones: Record<string, string>,
  id: string,
  itemTimestampIso?: string | null,
  fallbackIso?: string | null,
): boolean {
  const tombIso = tombstones[id];
  if (!tombIso) return false;
  const tombMs = ts(tombIso);
  if (tombMs <= 0) return false;
  const itemMs = Math.max(ts(itemTimestampIso), ts(fallbackIso));
  return tombMs >= itemMs;
}

function isItemTombstoned(deletedItemIds: Record<string, string>, id: string): boolean {
  return Boolean(id && deletedItemIds[id]);
}

function resolveAttachmentDriveId(att: DriveAttachment): string | null {
  const withDrive = att as DriveAttachment & { driveFileId?: string | null };
  if (typeof withDrive.driveFileId === 'string' && withDrive.driveFileId.trim()) {
    return withDrive.driveFileId.trim();
  }
  const fromUrl =
    extractDriveFileIdFromUrl(att.url) ??
    extractDriveFileIdFromUrl(att.thumbnailUrl) ??
    extractDriveFileIdFromUrl(att.downloadUrl);
  if (fromUrl) return fromUrl;
  const trimmedId = att.id?.trim() ?? '';
  if (trimmedId && !/^(att|local|opt|res|ann|tsk|ent)_/i.test(trimmedId)) {
    return trimmedId;
  }
  return null;
}

function isDriveFileTombstoned(
  deletedDriveFileIds: Record<string, string>,
  fileId: string | null | undefined,
): boolean {
  if (!fileId) return false;
  return Boolean(deletedDriveFileIds[fileId.trim()]);
}

function filterLiveAttachments(
  list: DriveAttachment[] | undefined,
  deletedDriveFileIds: Record<string, string>,
): DriveAttachment[] | undefined {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const kept = list.filter((att) => {
    if (!att?.id) return false;
    if (deletedDriveFileIds[att.id]) return false;
    const driveId = resolveAttachmentDriveId(att);
    if (driveId && deletedDriveFileIds[driveId]) return false;
    return true;
  });
  return kept.length > 0 ? kept : undefined;
}

function mergeAttachments(
  a: DriveAttachment[] | undefined,
  b: DriveAttachment[] | undefined,
  deletedDriveFileIds: Record<string, string>,
): DriveAttachment[] | undefined {
  const listA = Array.isArray(a) ? a : [];
  const listB = Array.isArray(b) ? b : [];
  if (listA.length === 0 && listB.length === 0) return undefined;
  const map = new Map<string, DriveAttachment>();
  for (const att of [...listA, ...listB]) {
    if (!att?.id) continue;
    if (deletedDriveFileIds[att.id]) continue;
    const driveId = resolveAttachmentDriveId(att);
    if (driveId && deletedDriveFileIds[driveId]) continue;
    map.set(att.id, att);
  }
  const values = Array.from(map.values());
  return values.length > 0 ? values : undefined;
}

function mergeStudents(
  remoteList: Student[],
  localList: Student[],
  deletedIds: Record<string, string>,
  prefer: 'local' | 'remote',
): Student[] {
  const map = new Map<string, Student>();

  for (const s of remoteList) {
    if (!s?.id) continue;
    map.set(s.id, s);
  }

  for (const lStu of localList) {
    if (!lStu?.id) continue;
    const rStu = map.get(lStu.id);
    if (!rStu) {
      map.set(lStu.id, lStu);
      continue;
    }

    const lTime = ts(lStu.updatedAt);
    const rTime = ts(rStu.updatedAt);
    const isStrictlyNewer = lTime !== rTime;
    const chooseLocal = lTime > rTime || (lTime === rTime && prefer === 'local');
    const primary = chooseLocal ? lStu : rStu;
    const secondary = chooseLocal ? rStu : lStu;

    const primaryPositions = normalizePositionsList(primary.positions, primary.position);
    const secondaryPositions = normalizePositionsList(secondary.positions, secondary.position);
    const resolvedPositions = isStrictlyNewer
      ? primaryPositions
      : primaryPositions.length > 0
        ? primaryPositions
        : secondaryPositions;

    const primaryPerms = normalizeCustomGrants(primary.customPermissions);
    const secondaryPerms = normalizeCustomGrants(secondary.customPermissions);
    const resolvedPerms = isStrictlyNewer
      ? primaryPerms
      : primaryPerms.length > 0
        ? primaryPerms
        : secondaryPerms;

    map.set(lStu.id, {
      ...secondary,
      ...primary,
      birthDate: isStrictlyNewer
        ? primary.birthDate
        : (primary.birthDate ?? secondary.birthDate ?? null),
      group: isStrictlyNewer ? primary.group : (primary.group ?? secondary.group ?? null),
      position: formatPositionsDisplay(resolvedPositions),
      positions: resolvedPositions,
      customPermissions: resolvedPerms,
      // Always preserve local private contact/note data because remote strips them.
      phone: lStu.phone ?? rStu.phone ?? null,
      email: lStu.email ?? rStu.email ?? null,
      address: lStu.address ?? rStu.address ?? null,
      note: lStu.note ?? rStu.note ?? null,
    });
  }

  return Array.from(map.values()).filter(
    (s) => !isTombstoned(deletedIds, s.id, s.updatedAt, s.createdAt),
  );
}

function mergeRegisteredTeachers(
  remoteList: RegisteredTeacherPublic[],
  localList: RegisteredTeacherPublic[],
  deletedIds: Record<string, string>,
  prefer: 'local' | 'remote',
): RegisteredTeacherPublic[] {
  const map = new Map<string, RegisteredTeacherPublic>();

  for (const t of remoteList) {
    if (!t?.id) continue;
    map.set(t.id, t);
  }

  for (const lT of localList) {
    if (!lT?.id) continue;
    const rT = map.get(lT.id);
    if (!rT) {
      map.set(lT.id, lT);
      continue;
    }
    const lTime = ts(lT.updatedAt);
    const rTime = ts(rT.updatedAt);
    const chooseLocal = lTime > rTime || (lTime === rTime && prefer === 'local');
    map.set(lT.id, chooseLocal ? lT : rT);
  }

  return Array.from(map.values()).filter(
    (t) => !isTombstoned(deletedIds, t.id, t.updatedAt, t.createdAt),
  );
}

function mergeEntries(
  remoteList: Entry[],
  localList: Entry[],
  deletedStudentIds: Record<string, string>,
  deletedItemIds: Record<string, string>,
  deletedDriveFileIds: Record<string, string>,
  prefer: 'local' | 'remote',
): Entry[] {
  const map = new Map<string, Entry>();
  for (const e of remoteList) {
    if (e?.id) map.set(e.id, e);
  }
  for (const lE of localList) {
    if (!lE?.id) continue;
    const rE = map.get(lE.id);
    if (!rE) {
      map.set(lE.id, lE);
      continue;
    }
    const lTime = ts(lE.updatedAt);
    const rTime = ts(rE.updatedAt);
    const chooseLocal = lTime > rTime || (lTime === rTime && prefer === 'local');
    map.set(lE.id, chooseLocal ? lE : rE);
  }

  return Array.from(map.values())
    .filter(
      (e) =>
        !isItemTombstoned(deletedItemIds, e.id) &&
        !isTombstoned(deletedStudentIds, e.studentId, e.updatedAt, e.createdAt),
    )
    .map((e) => {
      const safePoints = roundPoints(e.points);
      let nextEntry = safePoints !== e.points ? { ...e, points: safePoints } : e;
      if (nextEntry.proofUrl) {
        const proofDriveId = extractDriveFileIdFromUrl(nextEntry.proofUrl);
        if (isDriveFileTombstoned(deletedDriveFileIds, proofDriveId)) {
          nextEntry = { ...nextEntry, proofUrl: null };
        }
      }
      return nextEntry;
    })
    .sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
}

function normalizeAnnouncementVisibility(value: unknown): AnnouncementVisibility {
  return value === 'private' || value === 'selected' ? value : 'public';
}

function dedupeStringIds(values?: readonly string[] | null): string[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const val of values) {
    if (typeof val !== 'string') continue;
    const trimmed = val.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function mergeAnnouncementReplies(
  secondaryReplies: AnnouncementReply[] | undefined,
  primaryReplies: AnnouncementReply[] | undefined,
  deletedItemIds: Record<string, string>,
): AnnouncementReply[] {
  const byId = new Map<string, AnnouncementReply>();
  const push = (list?: AnnouncementReply[]) => {
    if (!Array.isArray(list)) return;
    for (const r of list) {
      if (!r?.id || !r.content?.trim()) continue;
      if (
        isItemTombstoned(deletedItemIds, r.id) ||
        isItemTombstoned(deletedItemIds, `reply:${r.id}`)
      ) {
        continue;
      }
      if (!byId.has(r.id)) {
        byId.set(r.id, r);
      }
    }
  };
  // Primary inserted first so primary metadata wins on duplicate reply IDs.
  push(primaryReplies);
  push(secondaryReplies);
  return Array.from(byId.values()).sort((a, b) => ts(a.createdAt) - ts(b.createdAt));
}

function latestIso(a?: string | null, b?: string | null): string | undefined {
  const cleanA = typeof a === 'string' && a.trim() ? a.trim() : undefined;
  const cleanB = typeof b === 'string' && b.trim() ? b.trim() : undefined;
  if (!cleanA) return cleanB;
  if (!cleanB) return cleanA;
  return ts(cleanA) >= ts(cleanB) ? cleanA : cleanB;
}

function normalizeSingleAnnouncement(
  item: Announcement,
  deletedItemIds: Record<string, string>,
  deletedDriveFileIds: Record<string, string>,
): Announcement {
  const visibility = normalizeAnnouncementVisibility(item.visibility);
  return {
    ...item,
    visibility,
    visibleToStudentIds: visibility === 'selected' ? dedupeStringIds(item.visibleToStudentIds) : [],
    authorStudentId:
      typeof item.authorStudentId === 'string' && item.authorStudentId.trim()
        ? item.authorStudentId.trim()
        : null,
    acknowledgedBy: dedupeStringIds(item.acknowledgedBy),
    replies: mergeAnnouncementReplies(undefined, item.replies, deletedItemIds),
    attachments: filterLiveAttachments(item.attachments, deletedDriveFileIds),
    ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
  };
}

function mergeTwoAnnouncements(
  secondary: Announcement,
  primary: Announcement,
  deletedItemIds: Record<string, string>,
  deletedDriveFileIds: Record<string, string>,
): Announcement {
  const primaryTs = ts(primary.updatedAt ?? primary.createdAt);
  const secondaryTs = ts(secondary.updatedAt ?? secondary.createdAt);
  const audienceWinner = secondaryTs > primaryTs ? secondary : primary;
  const visibility = normalizeAnnouncementVisibility(audienceWinner.visibility);
  const visibleToStudentIds =
    visibility === 'selected' ? dedupeStringIds(audienceWinner.visibleToStudentIds) : [];
  const updatedAt = latestIso(primary.updatedAt, secondary.updatedAt);

  return {
    ...secondary,
    ...primary,
    pinned: audienceWinner.pinned,
    department: primary.department ?? secondary.department ?? null,
    authorPosition: primary.authorPosition ?? secondary.authorPosition ?? null,
    authorStudentId: primary.authorStudentId ?? secondary.authorStudentId ?? null,
    eventId: primary.eventId ?? secondary.eventId ?? null,
    visibility,
    visibleToStudentIds,
    acknowledgedBy: dedupeStringIds([
      ...(secondary.acknowledgedBy ?? []),
      ...(primary.acknowledgedBy ?? []),
    ]),
    replies: mergeAnnouncementReplies(secondary.replies, primary.replies, deletedItemIds),
    likes: Math.max(primary.likes ?? 0, secondary.likes ?? 0),
    attachments: mergeAttachments(secondary.attachments, primary.attachments, deletedDriveFileIds),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

function mergeAnnouncements(
  remoteList: Announcement[],
  localList: Announcement[],
  deletedItemIds: Record<string, string>,
  deletedDriveFileIds: Record<string, string>,
  prefer: 'local' | 'remote',
): Announcement[] {
  const byId = new Map<string, Announcement>();
  const primaryList = prefer === 'local' ? localList : remoteList;
  const secondaryList = prefer === 'local' ? remoteList : localList;

  for (const item of primaryList) {
    if (item?.id) {
      byId.set(item.id, normalizeSingleAnnouncement(item, deletedItemIds, deletedDriveFileIds));
    }
  }
  for (const item of secondaryList) {
    if (!item?.id) continue;
    const primary = byId.get(item.id);
    if (!primary) {
      byId.set(item.id, normalizeSingleAnnouncement(item, deletedItemIds, deletedDriveFileIds));
    } else {
      byId.set(
        item.id,
        mergeTwoAnnouncements(item, primary, deletedItemIds, deletedDriveFileIds),
      );
    }
  }

  // Deduplicate identical seed announcements that received random IDs on fresh devices.
  // Preserve distinct user posts that carry attachments, authorStudentId, or non-public visibility.
  const byContent = new Map<string, Announcement>();
  for (const item of byId.values()) {
    if (isItemTombstoned(deletedItemIds, item.id)) continue;
    const isSeedLike =
      (!item.attachments || item.attachments.length === 0) &&
      !item.authorStudentId &&
      (!item.visibility || item.visibility === 'public');
    const key = isSeedLike
      ? `${normText(item.title)}|${normText(item.content)}|${normText(item.author)}`
      : `id:${item.id}`;
    const existing = byContent.get(key);
    if (!existing) {
      byContent.set(key, item);
    } else {
      byContent.set(
        key,
        mergeTwoAnnouncements(item, existing, deletedItemIds, deletedDriveFileIds),
      );
    }
  }

  return Array.from(byContent.values()).sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
}

function mergePolls(
  remoteList: Poll[],
  localList: Poll[],
  deletedItemIds: Record<string, string>,
  prefer: 'local' | 'remote',
): Poll[] {
  const byId = new Map<string, Poll>();
  const primaryList = prefer === 'local' ? localList : remoteList;
  const secondaryList = prefer === 'local' ? remoteList : localList;

  for (const item of primaryList) {
    if (item?.id) byId.set(item.id, item);
  }
  for (const item of secondaryList) {
    if (!item?.id) continue;
    const primary = byId.get(item.id);
    if (!primary) {
      byId.set(item.id, item);
    } else {
      byId.set(item.id, {
        ...item,
        ...primary,
        votes: { ...(item.votes ?? {}), ...(primary.votes ?? {}) },
      });
    }
  }

  // Deduplicate identical seed polls (preserving primary ID/timestamp & all votes).
  const byContent = new Map<string, Poll>();
  for (const item of byId.values()) {
    if (isItemTombstoned(deletedItemIds, item.id)) continue;
    const key = `${normText(item.question)}|${normText(item.author)}`;
    const existing = byContent.get(key);
    if (!existing) {
      byContent.set(key, item);
    } else {
      byContent.set(key, {
        ...existing,
        closed: existing.closed || item.closed,
        votes: { ...(item.votes ?? {}), ...(existing.votes ?? {}) },
      });
    }
  }

  return Array.from(byContent.values()).sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
}

function mergeTasks(
  remoteList: ClassTask[],
  localList: ClassTask[],
  deletedItemIds: Record<string, string>,
  deletedDriveFileIds: Record<string, string>,
  prefer: 'local' | 'remote',
): ClassTask[] {
  const byId = new Map<string, ClassTask>();
  const primaryList = prefer === 'local' ? localList : remoteList;
  const secondaryList = prefer === 'local' ? remoteList : localList;

  for (const item of primaryList) {
    if (item?.id) {
      byId.set(item.id, {
        ...item,
        attachments: filterLiveAttachments(item.attachments, deletedDriveFileIds),
      });
    }
  }
  for (const item of secondaryList) {
    if (!item?.id) continue;
    const primary = byId.get(item.id);
    byId.set(
      item.id,
      primary
        ? {
            ...item,
            ...primary,
            attachments: mergeAttachments(item.attachments, primary.attachments, deletedDriveFileIds),
          }
        : {
            ...item,
            attachments: filterLiveAttachments(item.attachments, deletedDriveFileIds),
          },
    );
  }

  const byContent = new Map<string, ClassTask>();
  for (const item of byId.values()) {
    if (isItemTombstoned(deletedItemIds, item.id)) continue;
    const key = `${item.itemKind ?? 'task'}|${item.department ?? ''}|${normText(item.title)}|${normText(item.subject)}|${normText(item.author)}`;
    const existing = byContent.get(key);
    if (!existing) {
      byContent.set(key, item);
    } else {
      byContent.set(key, {
        ...existing,
        department: existing.department ?? item.department ?? null,
        itemKind: existing.itemKind ?? item.itemKind,
        eventDate: existing.eventDate ?? item.eventDate ?? null,
        location: existing.location ?? item.location ?? null,
        assignedOfficerRole: existing.assignedOfficerRole ?? item.assignedOfficerRole ?? null,
        authorName: existing.authorName ?? item.authorName ?? null,
        authorPosition: existing.authorPosition ?? item.authorPosition ?? null,
        attachments: mergeAttachments(existing.attachments, item.attachments, deletedDriveFileIds),
      });
    }
  }

  return Array.from(byContent.values()).sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
}

function mergeKudos(
  remoteList: KudosItem[],
  localList: KudosItem[],
  deletedStudentIds: Record<string, string>,
  deletedItemIds: Record<string, string>,
  prefer: 'local' | 'remote',
): KudosItem[] {
  const byId = new Map<string, KudosItem>();
  const primaryList = prefer === 'local' ? localList : remoteList;
  const secondaryList = prefer === 'local' ? remoteList : localList;

  for (const item of primaryList) {
    if (item?.id) byId.set(item.id, item);
  }
  for (const item of secondaryList) {
    if (!item?.id) continue;
    const primary = byId.get(item.id);
    byId.set(
      item.id,
      primary
        ? { ...item, ...primary, claps: Math.max(primary.claps ?? 0, item.claps ?? 0) }
        : item,
    );
  }

  const byContent = new Map<string, KudosItem>();
  for (const item of byId.values()) {
    if (isItemTombstoned(deletedItemIds, item.id)) continue;
    if (isTombstoned(deletedStudentIds, item.toStudentId, item.createdAt)) continue;
    const key = `${item.toStudentId}|${normText(item.fromName)}|${normText(item.message)}`;
    const existing = byContent.get(key);
    if (!existing) {
      byContent.set(key, item);
    } else {
      byContent.set(key, {
        ...existing,
        claps: Math.max(existing.claps ?? 0, item.claps ?? 0),
      });
    }
  }

  return Array.from(byContent.values())
    .sort((a, b) => ts(b.createdAt) - ts(a.createdAt))
    .slice(0, 120);
}

function mergeResources(
  remoteList: ClassResource[],
  localList: ClassResource[],
  deletedItemIds: Record<string, string>,
  deletedDriveFileIds: Record<string, string>,
  prefer: 'local' | 'remote',
): ClassResource[] {
  const byId = new Map<string, ClassResource>();
  const primaryList = prefer === 'local' ? localList : remoteList;
  const secondaryList = prefer === 'local' ? remoteList : localList;

  for (const item of primaryList) {
    if (item?.id) byId.set(item.id, item);
  }
  for (const item of secondaryList) {
    if (item?.id && !byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }

  const byContent = new Map<string, ClassResource>();
  for (const item of byId.values()) {
    if (isItemTombstoned(deletedItemIds, item.id)) continue;
    const urlDriveId = extractDriveFileIdFromUrl(item.url);
    if (isDriveFileTombstoned(deletedDriveFileIds, urlDriveId)) continue;
    const key = `${normText(item.title)}|${normText(item.url)}`;
    if (!byContent.has(key)) {
      byContent.set(key, item);
    }
  }

  return Array.from(byContent.values()).sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
}

function mergeFeedback(
  remoteList: FeedbackItem[],
  localList: FeedbackItem[],
  deletedItemIds: Record<string, string>,
  prefer: 'local' | 'remote',
): FeedbackItem[] {
  const byId = new Map<string, FeedbackItem>();
  const primaryList = prefer === 'local' ? localList : remoteList;
  const secondaryList = prefer === 'local' ? remoteList : localList;

  for (const item of primaryList) {
    if (item?.id) byId.set(item.id, item);
  }
  for (const item of secondaryList) {
    if (!item?.id) continue;
    const primary = byId.get(item.id);
    if (!primary) {
      byId.set(item.id, item);
    } else {
      byId.set(item.id, {
        ...item,
        ...primary,
        reply: primary.reply ?? item.reply ?? null,
        resolved: primary.resolved || item.resolved,
      });
    }
  }

  const byContent = new Map<string, FeedbackItem>();
  for (const item of byId.values()) {
    if (isItemTombstoned(deletedItemIds, item.id)) continue;
    const key = `${item.authorId}|${normText(item.content)}`;
    const existing = byContent.get(key);
    if (!existing) {
      byContent.set(key, item);
    } else {
      byContent.set(key, {
        ...existing,
        reply: existing.reply ?? item.reply ?? null,
        resolved: existing.resolved || item.resolved,
      });
    }
  }

  return Array.from(byContent.values()).sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
}

function mergeFundTransactions(
  remoteList: FundTransaction[],
  localList: FundTransaction[],
  deletedItemIds: Record<string, string>,
  prefer: 'local' | 'remote',
): FundTransaction[] {
  const byId = new Map<string, FundTransaction>();
  const primaryList = prefer === 'local' ? localList : remoteList;
  const secondaryList = prefer === 'local' ? remoteList : localList;

  for (const item of primaryList) {
    if (item?.id) byId.set(item.id, item);
  }
  for (const item of secondaryList) {
    if (item?.id && !byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }

  // Exclude relative `item.date` so fresh devices opened on different days
  // don't duplicate initial seed transactions created via `isoOffset(...)`.
  const byContent = new Map<string, FundTransaction>();
  for (const item of byId.values()) {
    if (isItemTombstoned(deletedItemIds, item.id)) continue;
    const key = `${normText(item.title)}|${item.kind}|${item.category}|${item.amount}|${normText(item.note)}`;
    if (!byContent.has(key)) {
      byContent.set(key, item);
    }
  }

  return Array.from(byContent.values()).sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
}

function mergeActivityLog(
  remoteList: ActivityLogItem[],
  localList: ActivityLogItem[],
): ActivityLogItem[] {
  const byId = new Map<string, ActivityLogItem>();
  for (const item of [...remoteList, ...localList]) {
    if (item?.id) byId.set(item.id, item);
  }
  return Array.from(byId.values())
    .sort((a, b) => ts(b.createdAt) - ts(a.createdAt))
    .slice(0, 40);
}

function mergeAttendance(
  remoteMap: Record<string, AttendanceDay>,
  localMap: Record<string, AttendanceDay>,
  deletedStudentIds: Record<string, string>,
  prefer: 'local' | 'remote',
): Record<string, AttendanceDay> {
  const out: Record<string, AttendanceDay> = {};
  const dates = new Set([...Object.keys(remoteMap), ...Object.keys(localMap)]);

  for (const date of dates) {
    const rDay = remoteMap[date];
    const lDay = localMap[date];
    let mergedRecords: AttendanceDay['records'];
    let updatedAt: string;

    if (rDay && lDay) {
      const lTime = ts(lDay.updatedAt);
      const rTime = ts(rDay.updatedAt);
      const localNewer = lTime > rTime || (lTime === rTime && prefer === 'local');
      mergedRecords = localNewer
        ? { ...rDay.records, ...lDay.records }
        : { ...lDay.records, ...rDay.records };
      updatedAt = localNewer ? lDay.updatedAt : rDay.updatedAt;
    } else {
      const only = (lDay ?? rDay)!;
      mergedRecords = { ...only.records };
      updatedAt = only.updatedAt;
    }

    for (const sid of Object.keys(mergedRecords)) {
      if (isTombstoned(deletedStudentIds, sid, updatedAt)) {
        delete mergedRecords[sid];
      }
    }

    out[date] = { date, records: mergedRecords, updatedAt };
  }

  return out;
}

function mergeDutyLogs(
  remoteLogs: Record<string, DutyDayLog>,
  localLogs: Record<string, DutyDayLog>,
  deletedStudentIds: Record<string, string>,
  prefer: 'local' | 'remote',
): Record<string, DutyDayLog> {
  const out: Record<string, DutyDayLog> = {};
  const dates = new Set([...Object.keys(remoteLogs), ...Object.keys(localLogs)]);

  for (const date of dates) {
    const rDay = remoteLogs[date];
    const lDay = localLogs[date];
    if (!rDay && !lDay) continue;

    let assignedGroup: string | null;
    let note: string | null;
    let assignedBy: string | null;
    let updatedAt: string;
    let candidateIds: string[];
    const mergedRecords: Record<string, DutyStudentRecord> = {};

    if (rDay && lDay) {
      const lTime = ts(lDay.updatedAt);
      const rTime = ts(rDay.updatedAt);
      const isStrictlyDifferent = lTime !== rTime;
      const localDayNewer = lTime > rTime || (lTime === rTime && prefer === 'local');
      const primaryDay = localDayNewer ? lDay : rDay;
      const secondaryDay = localDayNewer ? rDay : lDay;
      const primaryTime = localDayNewer ? lTime : rTime;

      updatedAt = primaryDay.updatedAt || secondaryDay.updatedAt;
      assignedGroup = isStrictlyDifferent
        ? (primaryDay.assignedGroup ?? null)
        : (primaryDay.assignedGroup ?? secondaryDay.assignedGroup ?? null);
      note = isStrictlyDifferent
        ? (primaryDay.note ?? null)
        : (primaryDay.note ?? secondaryDay.note ?? null);
      assignedBy = primaryDay.assignedBy ?? secondaryDay.assignedBy ?? null;

      const idSet = new Set<string>(primaryDay.assignedStudentIds ?? []);
      if (!isStrictlyDifferent) {
        for (const sid of secondaryDay.assignedStudentIds ?? []) {
          if (sid) idSet.add(sid);
        }
      } else {
        // Retain any student from secondaryDay whose evaluation happened strictly after primaryDay.updatedAt.
        for (const [sid, rec] of Object.entries(secondaryDay.records ?? {})) {
          if (sid && ts(rec.evaluatedAt) > primaryTime) {
            idSet.add(sid);
          }
        }
      }
      candidateIds = Array.from(idSet);

      for (const sid of candidateIds) {
        const lRec = lDay.records?.[sid];
        const rRec = rDay.records?.[sid];
        if (lRec && rRec) {
          const lRecTime = ts(lRec.evaluatedAt) || lTime;
          const rRecTime = ts(rRec.evaluatedAt) || rTime;
          const pickLocal = lRecTime > rRecTime || (lRecTime === rRecTime && prefer === 'local');
          mergedRecords[sid] = pickLocal ? lRec : rRec;
        } else if (lRec || rRec) {
          mergedRecords[sid] = (lRec ?? rRec)!;
        }
      }
    } else {
      const only = (lDay ?? rDay)!;
      updatedAt = only.updatedAt;
      assignedGroup = only.assignedGroup ?? null;
      note = only.note ?? null;
      assignedBy = only.assignedBy ?? null;
      candidateIds = Array.from(new Set(only.assignedStudentIds ?? []));
      for (const [sid, rec] of Object.entries(only.records ?? {})) {
        if (!candidateIds.includes(sid)) candidateIds.push(sid);
        mergedRecords[sid] = rec;
      }
    }

    const liveIds = candidateIds.filter((sid) => !isTombstoned(deletedStudentIds, sid, updatedAt));
    const liveIdSet = new Set(liveIds);
    const liveRecords: Record<string, DutyStudentRecord> = {};
    for (const [sid, rec] of Object.entries(mergedRecords)) {
      if (!liveIdSet.has(sid)) continue;
      if (isTombstoned(deletedStudentIds, sid, rec.evaluatedAt || updatedAt)) continue;
      liveRecords[sid] = rec;
    }

    out[date] = {
      date,
      assignedGroup,
      assignedStudentIds: liveIds,
      records: liveRecords,
      note,
      assignedBy,
      updatedAt,
    };
  }

  return out;
}

/**
 * Deterministic, non-destructive merge of remote and local `PersistedState`.
 *
 * - A fresh device with empty `students: []` NEVER wipes remote students/entries/teachers.
 * - Tombstones (`deletedStudentIds` / `deletedTeacherIds`) ensure explicit removals stick.
 * - Device-local fields (`role`, `currentStudentId`) always stay local.
 */
export function mergeClassStates(
  remote: PersistedState | null,
  local: PersistedState,
  options?: { prefer?: 'local' | 'remote' },
): PersistedState {
  const l = hydrateState(local);
  if (!remote) return l;

  const r = hydrateState(remote);
  const prefer = options?.prefer ?? 'remote';

  const remoteResetMs = ts(r.accountsResetAt);
  const localResetMs = ts(l.accountsResetAt);
  const effectiveResetMs = Math.max(remoteResetMs, localResetMs);
  const effectiveResetAt =
    effectiveResetMs > 0
      ? remoteResetMs >= localResetMs
        ? (r.accountsResetAt ?? null)
        : (l.accountsResetAt ?? null)
      : null;

  const remoteResetNewer = remoteResetMs > localResetMs;
  const localResetNewer = localResetMs > remoteResetMs;

  const deletedStudentIds = mergeTombstones(r.deletedStudentIds, l.deletedStudentIds);
  const deletedTeacherIds = mergeTombstones(r.deletedTeacherIds, l.deletedTeacherIds);
  const deletedDriveFileIds = mergeTombstones(r.deletedDriveFileIds, l.deletedDriveFileIds);
  const deletedItemIds = mergeTombstones(r.deletedItemIds, l.deletedItemIds);

  // When one side has a strictly newer `accountsResetAt`, discard the older side's
  // stale account-scoped slices so pre-reset accounts/entries/votes can NEVER resurrect.
  const rStudentsIn = localResetNewer ? [] : r.students;
  const lStudentsIn = remoteResetNewer ? [] : l.students;
  const rTeachersIn = localResetNewer ? [] : (r.registeredTeachers ?? []);
  const lTeachersIn = remoteResetNewer ? [] : (l.registeredTeachers ?? []);
  const rEntriesIn = localResetNewer ? [] : r.entries;
  const lEntriesIn = remoteResetNewer ? [] : l.entries;
  const rAttendanceIn = localResetNewer ? {} : r.attendance;
  const lAttendanceIn = remoteResetNewer ? {} : l.attendance;
  const rDutyLogsIn = localResetNewer ? {} : (r.dutyLogs ?? {});
  const lDutyLogsIn = remoteResetNewer ? {} : (l.dutyLogs ?? {});
  const rFundPaidIn = localResetNewer ? {} : r.fundPaid;
  const lFundPaidIn = remoteResetNewer ? {} : l.fundPaid;
  const rKudosIn = localResetNewer ? [] : r.kudos;
  const lKudosIn = remoteResetNewer ? [] : l.kudos;
  const rPollsIn = localResetNewer ? r.polls.map((p) => ({ ...p, votes: {} })) : r.polls;
  const lPollsIn = remoteResetNewer ? l.polls.map((p) => ({ ...p, votes: {} })) : l.polls;

  const mergedStudents = mergeStudents(rStudentsIn, lStudentsIn, deletedStudentIds, prefer);
  const students =
    effectiveResetMs > 0
      ? mergedStudents.filter(
          (s) => Math.max(ts(s.updatedAt), ts(s.createdAt)) >= effectiveResetMs,
        )
      : mergedStudents;

  const mergedTeachers = mergeRegisteredTeachers(
    rTeachersIn,
    lTeachersIn,
    deletedTeacherIds,
    prefer,
  );
  const registeredTeachers =
    effectiveResetMs > 0
      ? mergedTeachers.filter(
          (t) => Math.max(ts(t.updatedAt), ts(t.createdAt)) >= effectiveResetMs,
        )
      : mergedTeachers;

  const mergedEntries = mergeEntries(
    rEntriesIn,
    lEntriesIn,
    deletedStudentIds,
    deletedItemIds,
    deletedDriveFileIds,
    prefer,
  );
  const entries =
    effectiveResetMs > 0
      ? mergedEntries.filter(
          (e) => Math.max(ts(e.updatedAt), ts(e.createdAt)) >= effectiveResetMs,
        )
      : mergedEntries;

  const announcements = mergeAnnouncements(
    r.announcements,
    l.announcements,
    deletedItemIds,
    deletedDriveFileIds,
    prefer,
  );
  const polls = mergePolls(rPollsIn, lPollsIn, deletedItemIds, prefer);
  const tasks = mergeTasks(r.tasks, l.tasks, deletedItemIds, deletedDriveFileIds, prefer);
  const mergedKudos = mergeKudos(rKudosIn, lKudosIn, deletedStudentIds, deletedItemIds, prefer);
  const kudos =
    effectiveResetMs > 0
      ? mergedKudos.filter((k) => ts(k.createdAt) >= effectiveResetMs)
      : mergedKudos;
  const resources = mergeResources(
    r.resources,
    l.resources,
    deletedItemIds,
    deletedDriveFileIds,
    prefer,
  );
  const feedback = mergeFeedback(r.feedback, l.feedback, deletedItemIds, prefer);
  const fundTransactions = mergeFundTransactions(
    r.fundTransactions,
    l.fundTransactions,
    deletedItemIds,
    prefer,
  );
  const mergedActivityLog = mergeActivityLog(
    localResetNewer ? [] : r.activityLog,
    remoteResetNewer ? [] : l.activityLog,
  );
  const activityLog =
    effectiveResetMs > 0
      ? mergedActivityLog.filter((item) => ts(item.createdAt) >= effectiveResetMs)
      : mergedActivityLog;
  const attendance = mergeAttendance(rAttendanceIn, lAttendanceIn, deletedStudentIds, prefer);
  const dutyLogs = mergeDutyLogs(rDutyLogsIn, lDutyLogsIn, deletedStudentIds, prefer);

  // Reconcile duty_diligence entries against the winning `dutyLogs` so concurrent
  // grading on two devices never leaves an orphaned duplicate entry, and unassigning
  // or resetting a student to `pending` drops any stale duty_diligence entry.
  const reconciledEntries = entries.filter((entry) => {
    if (entry.source !== 'duty_diligence') return true;
    const dayLog = dutyLogs[entry.date];
    if (!dayLog) return true;
    const rec = dayLog.records?.[entry.studentId];
    if (!rec || rec.status === 'pending' || !rec.entryId) return false;
    return rec.entryId === entry.id;
  });

  const fundPaidRaw = remoteResetNewer
    ? { ...rFundPaidIn }
    : localResetNewer
      ? { ...lFundPaidIn }
      : prefer === 'local'
        ? { ...rFundPaidIn, ...lFundPaidIn }
        : { ...lFundPaidIn, ...rFundPaidIn };
  const fundPaid: Record<string, boolean> = {};
  for (const [sid, paid] of Object.entries(fundPaidRaw)) {
    if (paid && !deletedStudentIds[sid]) {
      fundPaid[sid] = true;
    }
  }

  const lSeatCount = Object.keys(l.seating.seats).length;
  const rSeatCount = Object.keys(r.seating.seats).length;
  const lSeatTime = ts(l.seating.updatedAt);
  const rSeatTime = ts(r.seating.updatedAt);
  const keepRemoteSeating = remoteResetNewer
    ? true
    : localResetNewer
      ? false
      : (lSeatCount === 0 && rSeatCount > 0 && (lSeatTime <= 0 || prefer === 'remote')) ||
        rSeatTime > lSeatTime ||
        (rSeatTime === lSeatTime && prefer === 'remote');
  const chosenSeating = keepRemoteSeating ? r.seating : l.seating;
  const cleanSeats: Record<string, string> = {};
  for (const [seatKey, sid] of Object.entries(chosenSeating.seats)) {
    if (!isTombstoned(deletedStudentIds, sid, chosenSeating.updatedAt)) {
      cleanSeats[seatKey] = sid;
    }
  }

  const schedule =
    prefer === 'local'
      ? l.schedule.length > 0
        ? l.schedule
        : r.schedule
      : r.schedule.length > 0
        ? r.schedule
        : l.schedule;

  const lClassTime = ts(l.classInfo.updatedAt);
  const rClassTime = ts(r.classInfo.updatedAt);
  const isStrictlyDifferentClassTime = lClassTime !== rClassTime;
  const chooseLocalClass =
    lClassTime > rClassTime || (lClassTime === rClassTime && prefer === 'local');
  const primaryClassInfo = chooseLocalClass ? l.classInfo : r.classInfo;
  const secondaryClassInfo = chooseLocalClass ? r.classInfo : l.classInfo;

  const primaryCustomPositions =
    primaryClassInfo.customPositions !== undefined
      ? normalizePositionsList(primaryClassInfo.customPositions)
      : undefined;
  const secondaryCustomPositions =
    secondaryClassInfo.customPositions !== undefined
      ? normalizePositionsList(secondaryClassInfo.customPositions)
      : undefined;

  let mergedCustomPositions: string[] | undefined;
  if (isStrictlyDifferentClassTime) {
    mergedCustomPositions = primaryCustomPositions ?? secondaryCustomPositions;
  } else if (primaryCustomPositions && primaryCustomPositions.length > 0) {
    mergedCustomPositions = primaryCustomPositions;
  } else if (secondaryCustomPositions && secondaryCustomPositions.length > 0) {
    mergedCustomPositions = secondaryCustomPositions;
  } else {
    mergedCustomPositions = primaryCustomPositions ?? secondaryCustomPositions;
  }

  const classInfo = {
    ...secondaryClassInfo,
    ...primaryClassInfo,
    ...(mergedCustomPositions !== undefined ? { customPositions: mergedCustomPositions } : {}),
    semester1Start: isStrictlyDifferentClassTime
      ? (primaryClassInfo.semester1Start ?? null)
      : (primaryClassInfo.semester1Start ?? secondaryClassInfo.semester1Start ?? null),
    semester1End: isStrictlyDifferentClassTime
      ? (primaryClassInfo.semester1End ?? null)
      : (primaryClassInfo.semester1End ?? secondaryClassInfo.semester1End ?? null),
    ...(primaryClassInfo.updatedAt || secondaryClassInfo.updatedAt
      ? { updatedAt: primaryClassInfo.updatedAt ?? secondaryClassInfo.updatedAt ?? null }
      : {}),
  };
  const dutyRoster = prefer === 'local' ? { ...r.dutyRoster, ...l.dutyRoster } : { ...l.dutyRoster, ...r.dutyRoster };
  const fundCycleLabel =
    prefer === 'local'
      ? l.fundCycleLabel || r.fundCycleLabel
      : r.fundCycleLabel || l.fundCycleLabel;
  const fundCycleAmount =
    prefer === 'local'
      ? l.fundCycleAmount || r.fundCycleAmount
      : r.fundCycleAmount || l.fundCycleAmount;

  return {
    version: 1,
    classInfo,
    students,
    entries: reconciledEntries,
    role: l.role,
    currentStudentId: remoteResetNewer ? null : l.currentStudentId,
    attendance,
    announcements,
    fundTransactions,
    fundPaid,
    fundCycleLabel,
    fundCycleAmount,
    schedule,
    dutyRoster,
    dutyLogs,
    polls,
    tasks,
    feedback,
    activityLog,
    kudos,
    resources,
    seating: {
      ...chosenSeating,
      seats: cleanSeats,
    },
    registeredTeachers,
    deletedStudentIds,
    deletedTeacherIds,
    deletedDriveFileIds,
    deletedItemIds,
    accountsResetAt: effectiveResetAt,
  };
}

/* ---------- Core Live Cloud Sync API (`public.class_state`) ---------- */

type ClassStateRow = {
  data: Partial<PersistedState> | null;
  updated_at?: string | null;
};

/** Lightweight (~48-byte) check for the latest `updated_at` of `class10t4` in `public.class_state`. */
export async function fetchClassStateUpdatedAtRemote(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('class_state')
    .select('updated_at')
    .eq('id', REMOTE_ROW_ID)
    .maybeSingle<{ updated_at?: string | null }>();

  if (error) throw error;
  return data?.updated_at ?? null;
}

/** Pull the shared `class10t4` state directly from `public.class_state`. */
export async function fetchClassStateRemote(): Promise<{
  state: PersistedState;
  updatedAt: string;
} | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('class_state')
    .select('data, updated_at')
    .eq('id', REMOTE_ROW_ID)
    .maybeSingle<ClassStateRow>();

  if (error) throw error;
  if (!data?.data) return null;

  return {
    state: hydrateRemotePayload(data.data),
    updatedAt: data.updated_at || new Date().toISOString(),
  };
}

/**
 * Atomic fetch -> merge -> upsert into `public.class_state` (`id = 'class10t4'`),
 * followed by an immediate cross-device Realtime Broadcast.
 */
export async function pushClassStateMerged(
  localState: PersistedState,
  options?: { reason?: string },
): Promise<{ state: PersistedState; updatedAt: string } | null> {
  if (!isSupabaseConfigured) return null;

  return enqueueClassStateWrite(async () => {
    // Do NOT swallow read errors: aborting prevents wiping cloud state on transient network failure.
    const remote = await fetchClassStateRemote();
    const merged = mergeClassStates(remote?.state ?? null, localState, { prefer: 'local' });
    const now = new Date().toISOString();
    const payload = stripForSharedSync(merged);

    const { data, error } = await supabase
      .from('class_state')
      .upsert(
        { id: REMOTE_ROW_ID, data: payload, updated_at: now },
        { onConflict: 'id' },
      )
      .select('updated_at')
      .maybeSingle<{ updated_at?: string | null }>();

    if (error) throw error;

    const updatedAt = data?.updated_at || now;
    emitLiveBroadcast({
      type: 'state-updated',
      updatedAt,
      reason: options?.reason,
    });

    return { state: merged, updatedAt };
  });
}

/**
 * Immediately pull-merge-upsert a newly registered or renamed student/teacher
 * into `public.class_state` and broadcast both `member-registered` and
 * `state-updated` so every open device reflects the new name within <1s.
 */
export async function upsertRegisteredMemberToCloud(
  member:
    | { kind: 'student'; student: Student }
    | { kind: 'teacher'; teacher: RegisteredTeacherPublic },
): Promise<PersistedState | null> {
  if (!isSupabaseConfigured) return null;

  try {
    return await enqueueClassStateWrite(async () => {
      // Do NOT swallow read errors: abort cleanly (outer catch returns null) instead of overwriting cloud state.
      const remote = await fetchClassStateRemote();
      const base = remote?.state ?? getLegacyTemplate();
      const now = new Date().toISOString();
      const effectiveResetMs = Math.max(ts(ACCOUNTS_RESET_EPOCH), ts(base.accountsResetAt));

      let nextState: PersistedState;
      let memberId: string;
      let memberName: string;

      if (member.kind === 'student') {
        const incomingTime = Math.max(ts(member.student.updatedAt), ts(member.student.createdAt));
        if (effectiveResetMs > 0 && incomingTime > 0 && incomingTime < effectiveResetMs) {
          return base;
        }
        const stu: Student = {
          ...member.student,
          updatedAt: member.student.updatedAt || now,
          createdAt: member.student.createdAt || now,
        };
        memberId = stu.id;
        memberName = stu.name;

        const nextDeletedStudents = { ...(base.deletedStudentIds ?? {}) };
        delete nextDeletedStudents[stu.id];

        const existsIdx = base.students.findIndex((s) => s.id === stu.id);
        const nextStudents =
          existsIdx >= 0
            ? base.students.map((s, idx) =>
                idx === existsIdx
                  ? {
                      ...s,
                      ...stu,
                      phone: s.phone ?? stu.phone ?? null,
                      email: s.email ?? stu.email ?? null,
                      address: s.address ?? stu.address ?? null,
                      note: s.note ?? stu.note ?? null,
                    }
                  : s,
              )
            : [...base.students, stu];

        const logAction =
          existsIdx >= 0
            ? `Cập nhật học sinh ${stu.name} (ID: ${stu.code})`
            : `Đăng ký tài khoản học sinh ${stu.name} (ID: ${stu.code})`;
        const logItem: ActivityLogItem = {
          id: createId('log'),
          actor: stu.name,
          actorStudentId: stu.id,
          action: logAction,
          createdAt: now,
        };

        nextState = {
          ...base,
          students: nextStudents,
          deletedStudentIds: nextDeletedStudents,
          activityLog: [logItem, ...base.activityLog].slice(0, 40),
        };
      } else {
        const incomingTime = Math.max(ts(member.teacher.updatedAt), ts(member.teacher.createdAt));
        if (effectiveResetMs > 0 && incomingTime > 0 && incomingTime < effectiveResetMs) {
          return base;
        }
        const teacher: RegisteredTeacherPublic = {
          ...member.teacher,
          updatedAt: member.teacher.updatedAt || now,
          createdAt: member.teacher.createdAt || now,
        };
        memberId = teacher.id;
        memberName = teacher.name;

        const nextDeletedTeachers = { ...(base.deletedTeacherIds ?? {}) };
        delete nextDeletedTeachers[teacher.id];

        const existingTeachers = base.registeredTeachers ?? [];
        const existsIdx = existingTeachers.findIndex((t) => t.id === teacher.id);
        const nextTeachers =
          existsIdx >= 0
            ? existingTeachers.map((t, idx) => (idx === existsIdx ? teacher : t))
            : [...existingTeachers, teacher];

        const roleLabel =
          teacher.role === 'teacher'
            ? 'GV Chủ nhiệm'
            : `GV Bộ môn${teacher.subject ? ` (${teacher.subject})` : ''}`;
        const logAction =
          existsIdx >= 0
            ? `Cập nhật ${roleLabel} ${teacher.name} (ID: ${teacher.loginId})`
            : `Đăng ký tài khoản ${roleLabel} ${teacher.name} (ID: ${teacher.loginId})`;
        const logItem: ActivityLogItem = {
          id: createId('log'),
          actor: teacher.name,
          actorStudentId: null,
          action: logAction,
          createdAt: now,
        };

        nextState = {
          ...base,
          registeredTeachers: nextTeachers,
          deletedTeacherIds: nextDeletedTeachers,
          activityLog: [logItem, ...base.activityLog].slice(0, 40),
        };
      }

      const payload = stripForSharedSync(nextState);
      const { data, error } = await supabase
        .from('class_state')
        .upsert(
          { id: REMOTE_ROW_ID, data: payload, updated_at: now },
          { onConflict: 'id' },
        )
        .select('updated_at')
        .maybeSingle<{ updated_at?: string | null }>();

      if (error) throw error;

      const updatedAt = data?.updated_at || now;
      emitLiveBroadcast({
        type: 'member-registered',
        kind: member.kind,
        id: memberId,
        name: memberName,
      });
      emitLiveBroadcast({
        type: 'state-updated',
        updatedAt,
        reason: member.kind === 'student' ? 'student-registered' : 'teacher-registered',
      });

      return nextState;
    });
  } catch {
    return null;
  }
}

/** Record tombstone and remove a student or teacher from cloud `class_state`. */
export async function removeRegisteredMemberFromCloud(
  kind: 'student' | 'teacher',
  id: string,
): Promise<void> {
  if (!isSupabaseConfigured || !id) return;

  try {
    await enqueueClassStateWrite(async () => {
      const remote = await fetchClassStateRemote();
      if (!remote) return;

      const base = remote.state;
      const now = new Date().toISOString();
      let nextState: PersistedState;

      if (kind === 'student') {
        const nextPaid = { ...base.fundPaid };
        delete nextPaid[id];
        const nextSeats: Record<string, string> = {};
        for (const [k, sid] of Object.entries(base.seating.seats)) {
          if (sid !== id) nextSeats[k] = sid;
        }
        const nextDutyLogs: Record<string, DutyDayLog> = {};
        for (const [dateKey, dayLog] of Object.entries(base.dutyLogs ?? {})) {
          const nextRecords = { ...dayLog.records };
          delete nextRecords[id];
          nextDutyLogs[dateKey] = {
            ...dayLog,
            assignedStudentIds: dayLog.assignedStudentIds.filter((sid) => sid !== id),
            records: nextRecords,
          };
        }
        nextState = {
          ...base,
          students: base.students.filter((s) => s.id !== id),
          entries: base.entries.filter((e) => e.studentId !== id),
          kudos: base.kudos.filter((k) => k.toStudentId !== id),
          dutyLogs: nextDutyLogs,
          fundPaid: nextPaid,
          seating: { ...base.seating, seats: nextSeats, updatedAt: now },
          deletedStudentIds: { ...(base.deletedStudentIds ?? {}), [id]: now },
        };
      } else {
        nextState = {
          ...base,
          registeredTeachers: (base.registeredTeachers ?? []).filter((t) => t.id !== id),
          deletedTeacherIds: { ...(base.deletedTeacherIds ?? {}), [id]: now },
        };
      }

      const payload = stripForSharedSync(nextState);
      const { data, error } = await supabase
        .from('class_state')
        .upsert(
          { id: REMOTE_ROW_ID, data: payload, updated_at: now },
          { onConflict: 'id' },
        )
        .select('updated_at')
        .maybeSingle<{ updated_at?: string | null }>();

      if (error) throw error;

      emitLiveBroadcast({
        type: 'state-updated',
        updatedAt: data?.updated_at || now,
        reason: kind === 'student' ? 'student-removed' : 'teacher-removed',
      });
    });
  } catch {
    // Non-blocking on offline devices.
  }
}

/* ---------- Cross-Device Auth Registry (`id = 'class10t4_accounts_v1'`) ---------- */

type AuthRegistryDoc = {
  students?: Record<string, unknown>[];
  teachers?: Record<string, unknown>[];
  deletedStudentIds?: Record<string, string>;
  deletedTeacherIds?: Record<string, string>;
  accountsResetAt?: string | null;
  updatedAt?: string;
};

function recordIdOf(rec: Record<string, unknown>, primaryField: string): string {
  const primary = rec[primaryField];
  if (typeof primary === 'string' && primary.trim()) return primary.trim();
  const fallback = rec.id;
  return typeof fallback === 'string' ? fallback.trim() : '';
}

function recordUpdatedAtOf(rec: Record<string, unknown>): number {
  const u = typeof rec.updatedAt === 'string' ? ts(rec.updatedAt) : 0;
  const c = typeof rec.createdAt === 'string' ? ts(rec.createdAt) : 0;
  return Math.max(u, c);
}

function nonEmptyStr(val: unknown): string | null {
  return typeof val === 'string' && val.trim() ? val.trim() : null;
}

function unionAuthProviders(prevVal: unknown, incomingVal: unknown): string[] | undefined {
  const set = new Set<string>();
  const addList = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (item === 'google' || item === 'github' || item === 'email' || item === 'local') {
        set.add(item);
      }
    }
  };
  addList(prevVal);
  addList(incomingVal);
  return set.size > 0 ? Array.from(set) : undefined;
}

/**
 * Merge an incoming account registry record with an existing cloud record:
 * - Unions `authProviders` arrays so concurrent Google/GitHub/Email links never drop each other.
 * - Preserves non-empty `passwordHash`, `email`, `emailKey`, `authUserId`, `avatarUrl`
 *   when partial/OAuth updates merge concurrently.
 */
function mergeAuthAccountRecord(
  prev: Record<string, unknown> | undefined,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  if (!prev) return incoming;

  const incomingNewer = recordUpdatedAtOf(incoming) >= recordUpdatedAtOf(prev);
  const primary = incomingNewer ? incoming : prev;
  const secondary = incomingNewer ? prev : incoming;

  const mergedProviders = unionAuthProviders(prev.authProviders, incoming.authProviders);
  const passwordHash =
    nonEmptyStr(primary.passwordHash) ?? nonEmptyStr(secondary.passwordHash) ?? '';
  const email = nonEmptyStr(primary.email) ?? nonEmptyStr(secondary.email);
  const emailKey =
    nonEmptyStr(primary.emailKey) ??
    nonEmptyStr(secondary.emailKey) ??
    (email ? email.toLowerCase() : null);
  const authUserId = nonEmptyStr(primary.authUserId) ?? nonEmptyStr(secondary.authUserId);
  const avatarUrl = nonEmptyStr(primary.avatarUrl) ?? nonEmptyStr(secondary.avatarUrl);

  const merged: Record<string, unknown> = {
    ...secondary,
    ...primary,
    passwordHash,
  };

  if (primary.positions !== undefined || primary.position !== undefined) {
    const normalizedPositions = normalizePositionsList(
      Array.isArray(primary.positions) ? (primary.positions as string[]) : undefined,
      typeof primary.position === 'string' ? primary.position : null,
    );
    merged.positions = normalizedPositions;
    merged.position = formatPositionsDisplay(normalizedPositions);
  }
  if (primary.customPermissions !== undefined) {
    merged.customPermissions = normalizeCustomGrants(
      Array.isArray(primary.customPermissions) ? (primary.customPermissions as string[]) : [],
    );
  }

  if (email !== null) merged.email = email;
  if (emailKey !== null) merged.emailKey = emailKey;
  if (authUserId !== null) merged.authUserId = authUserId;
  if (avatarUrl !== null) merged.avatarUrl = avatarUrl;
  if (mergedProviders) merged.authProviders = mergedProviders;

  return merged;
}

/** Fast remote lookup for 1-tap returning Google/GitHub/Email users in `class10t4_accounts_v1`. */
export async function findAuthRegistryAccountRemote(query: {
  authUserId?: string | null;
  email?: string | null;
}): Promise<{ kind: 'student' | 'teacher'; record: Record<string, unknown> } | null> {
  const cleanAuthId = query.authUserId?.trim() ?? '';
  const cleanEmailKey = query.email?.trim().toLowerCase() ?? '';
  if (!cleanAuthId && !cleanEmailKey) return null;

  const registry = await fetchAuthRegistryRemote();
  if (!registry) return null;

  const matchesAuthId = (rec: Record<string, unknown>) =>
    Boolean(cleanAuthId) && nonEmptyStr(rec.authUserId) === cleanAuthId;

  const matchesEmail = (rec: Record<string, unknown>) => {
    if (!cleanEmailKey) return false;
    const key = nonEmptyStr(rec.emailKey)?.toLowerCase() ?? nonEmptyStr(rec.email)?.toLowerCase();
    return key === cleanEmailKey;
  };

  // Priority 1: Exact Supabase authUserId match across teachers & students.
  if (cleanAuthId) {
    const teacherByUid = registry.teachers.find(matchesAuthId);
    if (teacherByUid) return { kind: 'teacher', record: teacherByUid };
    const studentByUid = registry.students.find(matchesAuthId);
    if (studentByUid) return { kind: 'student', record: studentByUid };
  }

  // Priority 2: Exact normalized email match across teachers & students.
  if (cleanEmailKey) {
    const teacherByEmail = registry.teachers.find(matchesEmail);
    if (teacherByEmail) return { kind: 'teacher', record: teacherByEmail };
    const studentByEmail = registry.students.find(matchesEmail);
    if (studentByEmail) return { kind: 'student', record: studentByEmail };
  }

  return null;
}

/** Read cross-device account registry from `public.class_state` (`id = 'class10t4_accounts_v1'`). */
export async function fetchAuthRegistryRemote(): Promise<{
  students: Record<string, unknown>[];
  teachers: Record<string, unknown>[];
  deletedStudentIds: Record<string, string>;
  deletedTeacherIds: Record<string, string>;
  accountsResetAt: string | null;
  updatedAt: string;
} | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const { data, error } = await supabase
      .from('class_state')
      .select('data, updated_at')
      .eq('id', AUTH_REGISTRY_ROW_ID)
      .maybeSingle<{ data: AuthRegistryDoc | null; updated_at?: string | null }>();

    if (error || !data?.data) return null;

    const doc = data.data;
    const delStudents = mergeTombstones(doc.deletedStudentIds, undefined);
    const delTeachers = mergeTombstones(doc.deletedTeacherIds, undefined);
    const accountsResetAt = nonEmptyStr(doc.accountsResetAt);
    const effectiveResetMs = Math.max(ts(ACCOUNTS_RESET_EPOCH), ts(accountsResetAt));

    const students = Array.isArray(doc.students)
      ? doc.students.filter((item): item is Record<string, unknown> => {
          if (!item || typeof item !== 'object') return false;
          const id = recordIdOf(item, 'studentId');
          if (!id) return false;
          if (effectiveResetMs > 0 && recordUpdatedAtOf(item) < effectiveResetMs) return false;
          return !isTombstoned(
            delStudents,
            id,
            item.updatedAt as string | undefined,
            item.createdAt as string | undefined,
          );
        })
      : [];

    const teachers = Array.isArray(doc.teachers)
      ? doc.teachers.filter((item): item is Record<string, unknown> => {
          if (!item || typeof item !== 'object') return false;
          const id = recordIdOf(item, 'teacherId');
          if (!id) return false;
          if (effectiveResetMs > 0 && recordUpdatedAtOf(item) < effectiveResetMs) return false;
          return !isTombstoned(
            delTeachers,
            id,
            item.updatedAt as string | undefined,
            item.createdAt as string | undefined,
          );
        })
      : [];

    return {
      students,
      teachers,
      deletedStudentIds: delStudents,
      deletedTeacherIds: delTeachers,
      accountsResetAt,
      updatedAt: data.updated_at || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Pull-merge-upsert student/teacher account records into `id = 'class10t4_accounts_v1'`. */
export async function upsertAuthRegistryRemote(patch: {
  student?: Record<string, unknown>;
  removeStudentId?: string;
  removeStudentIds?: string[];
  teacher?: Record<string, unknown>;
  removeTeacherId?: string;
  bulkStudents?: Record<string, unknown>[];
}): Promise<boolean> {
  if (!isSupabaseConfigured) return false;

  try {
    return await enqueueAuthRegistryWrite(async () => {
      const { data: existingRow, error: readErr } = await supabase
        .from('class_state')
        .select('data')
        .eq('id', AUTH_REGISTRY_ROW_ID)
        .maybeSingle<{ data: AuthRegistryDoc | null }>();

      if (readErr) return false;

      const existing = existingRow?.data ?? {};
      const now = new Date().toISOString();
      const existingResetAt = nonEmptyStr(existing.accountsResetAt);
      const existingResetMs = ts(existingResetAt);
      const epochResetMs = ts(ACCOUNTS_RESET_EPOCH);
      const effectiveResetMs = Math.max(epochResetMs, existingResetMs);
      const accountsResetAt =
        existingResetAt && existingResetMs >= epochResetMs ? existingResetAt : ACCOUNTS_RESET_EPOCH;

      const delStudents: Record<string, string> = { ...(existing.deletedStudentIds ?? {}) };
      const delTeachers: Record<string, string> = { ...(existing.deletedTeacherIds ?? {}) };

      const studentMap = new Map<string, Record<string, unknown>>();
      for (const item of Array.isArray(existing.students) ? existing.students : []) {
        if (!item || typeof item !== 'object') continue;
        if (effectiveResetMs > 0 && recordUpdatedAtOf(item) < effectiveResetMs) continue;
        const id = recordIdOf(item, 'studentId');
        if (id) studentMap.set(id, item);
      }

      const teacherMap = new Map<string, Record<string, unknown>>();
      for (const item of Array.isArray(existing.teachers) ? existing.teachers : []) {
        if (!item || typeof item !== 'object') continue;
        if (effectiveResetMs > 0 && recordUpdatedAtOf(item) < effectiveResetMs) continue;
        const id = recordIdOf(item, 'teacherId');
        if (id) teacherMap.set(id, item);
      }

      if (patch.removeStudentId) {
        delStudents[patch.removeStudentId] = now;
        studentMap.delete(patch.removeStudentId);
      }
      if (Array.isArray(patch.removeStudentIds)) {
        for (const id of patch.removeStudentIds) {
          if (typeof id === 'string' && id.trim()) {
            const cleanId = id.trim();
            delStudents[cleanId] = now;
            studentMap.delete(cleanId);
          }
        }
      }

      const applyStudentUpsert = (incoming: Record<string, unknown>) => {
        const id = recordIdOf(incoming, 'studentId');
        if (!id) return;
        if (effectiveResetMs > 0 && recordUpdatedAtOf(incoming) < effectiveResetMs) return;
        delete delStudents[id];
        const prev = studentMap.get(id);
        studentMap.set(id, mergeAuthAccountRecord(prev, incoming));
      };

      if (patch.student) {
        applyStudentUpsert(patch.student);
      }
      if (Array.isArray(patch.bulkStudents)) {
        for (const stu of patch.bulkStudents) {
          if (stu && typeof stu === 'object') applyStudentUpsert(stu);
        }
      }

      if (patch.removeTeacherId) {
        delTeachers[patch.removeTeacherId] = now;
        teacherMap.delete(patch.removeTeacherId);
      }

      if (patch.teacher) {
        const id = recordIdOf(patch.teacher, 'teacherId');
        if (id && (effectiveResetMs <= 0 || recordUpdatedAtOf(patch.teacher) >= effectiveResetMs)) {
          delete delTeachers[id];
          const prev = teacherMap.get(id);
          teacherMap.set(id, mergeAuthAccountRecord(prev, patch.teacher));
        }
      }

      const nextDoc: AuthRegistryDoc = {
        students: Array.from(studentMap.values()).filter((item) => {
          const id = recordIdOf(item, 'studentId');
          if (effectiveResetMs > 0 && recordUpdatedAtOf(item) < effectiveResetMs) return false;
          return !isTombstoned(
            delStudents,
            id,
            item.updatedAt as string | undefined,
            item.createdAt as string | undefined,
          );
        }),
        teachers: Array.from(teacherMap.values()).filter((item) => {
          const id = recordIdOf(item, 'teacherId');
          if (effectiveResetMs > 0 && recordUpdatedAtOf(item) < effectiveResetMs) return false;
          return !isTombstoned(
            delTeachers,
            id,
            item.updatedAt as string | undefined,
            item.createdAt as string | undefined,
          );
        }),
        deletedStudentIds: delStudents,
        deletedTeacherIds: delTeachers,
        accountsResetAt,
        updatedAt: now,
      };

      const { error: writeErr } = await supabase
        .from('class_state')
        .upsert(
          { id: AUTH_REGISTRY_ROW_ID, data: nextDoc, updated_at: now },
          { onConflict: 'id' },
        );

      return !writeErr;
    });
  } catch {
    return false;
  }
}

/**
 * Wipe all registered student & teacher accounts and account-bound class data
 * across both `class10t4_accounts_v1` and `class10t4`, stamp tombstones +
 * `accountsResetAt` so offline devices can never resurrect old accounts, and
 * broadcast an immediate `accounts-reset` event across all connected devices.
 */
export async function resetAllAccountsRemote(customResetAt?: string): Promise<{
  ok: boolean;
  resetAt: string;
  clearedStudents: number;
  clearedTeachers: number;
  error?: string;
}> {
  const resetAt = customResetAt?.trim() || new Date().toISOString();
  if (!isSupabaseConfigured) {
    return { ok: true, resetAt, clearedStudents: 0, clearedTeachers: 0 };
  }

  try {
    return await enqueueAuthRegistryWrite(() =>
      enqueueClassStateWrite(async () => {
        const [registryRes, classRes] = await Promise.all([
          supabase
            .from('class_state')
            .select('data')
            .eq('id', AUTH_REGISTRY_ROW_ID)
            .maybeSingle<{ data: AuthRegistryDoc | null }>(),
          supabase
            .from('class_state')
            .select('data')
            .eq('id', REMOTE_ROW_ID)
            .maybeSingle<ClassStateRow>(),
        ]);

        if (registryRes.error) {
          return {
            ok: false,
            resetAt,
            clearedStudents: 0,
            clearedTeachers: 0,
            error: registryRes.error.message,
          };
        }
        if (classRes.error) {
          return {
            ok: false,
            resetAt,
            clearedStudents: 0,
            clearedTeachers: 0,
            error: classRes.error.message,
          };
        }

        const existingRegistry = registryRes.data?.data ?? {};
        const baseState = classRes.data?.data
          ? hydrateRemotePayload(classRes.data.data)
          : getLegacyTemplate();

        const clearedStudentIds = new Set<string>();
        const clearedTeacherIds = new Set<string>();

        for (const item of Array.isArray(existingRegistry.students)
          ? existingRegistry.students
          : []) {
          if (!item || typeof item !== 'object') continue;
          const id = recordIdOf(item, 'studentId');
          if (id) clearedStudentIds.add(id);
        }
        for (const s of baseState.students) {
          if (s?.id) clearedStudentIds.add(s.id);
        }

        for (const item of Array.isArray(existingRegistry.teachers)
          ? existingRegistry.teachers
          : []) {
          if (!item || typeof item !== 'object') continue;
          const id = recordIdOf(item, 'teacherId');
          if (id) clearedTeacherIds.add(id);
        }
        for (const t of baseState.registeredTeachers ?? []) {
          if (t?.id) clearedTeacherIds.add(t.id);
        }

        const deletedStudentIds = mergeTombstones(
          existingRegistry.deletedStudentIds,
          baseState.deletedStudentIds,
        );
        for (const id of clearedStudentIds) {
          deletedStudentIds[id] = resetAt;
        }

        const deletedTeacherIds = mergeTombstones(
          existingRegistry.deletedTeacherIds,
          baseState.deletedTeacherIds,
        );
        for (const id of clearedTeacherIds) {
          deletedTeacherIds[id] = resetAt;
        }

        const nextRegistryDoc: AuthRegistryDoc = {
          students: [],
          teachers: [],
          deletedStudentIds,
          deletedTeacherIds,
          accountsResetAt: resetAt,
          updatedAt: resetAt,
        };

        const { error: regWriteErr } = await supabase
          .from('class_state')
          .upsert(
            { id: AUTH_REGISTRY_ROW_ID, data: nextRegistryDoc, updated_at: resetAt },
            { onConflict: 'id' },
          );

        if (regWriteErr) {
          return {
            ok: false,
            resetAt,
            clearedStudents: 0,
            clearedTeachers: 0,
            error: regWriteErr.message,
          };
        }

        const resetLog: ActivityLogItem = {
          id: createId('log'),
          actor: 'Hệ thống',
          actorStudentId: null,
          action: 'Đã reset và xóa toàn bộ tài khoản về trạng thái ban đầu',
          createdAt: resetAt,
        };

        const nextClassState: PersistedState = {
          ...baseState,
          students: [],
          registeredTeachers: [],
          entries: [],
          attendance: {},
          dutyLogs: {},
          fundPaid: {},
          kudos: [],
          polls: baseState.polls.map((poll) => ({ ...poll, votes: {} })),
          seating: { ...baseState.seating, seats: {}, updatedAt: resetAt },
          currentStudentId: null,
          activityLog: [resetLog],
          deletedStudentIds,
          deletedTeacherIds,
          accountsResetAt: resetAt,
        };

        const { error: stateWriteErr } = await supabase
          .from('class_state')
          .upsert(
            { id: REMOTE_ROW_ID, data: stripForSharedSync(nextClassState), updated_at: resetAt },
            { onConflict: 'id' },
          );

        if (stateWriteErr) {
          return {
            ok: false,
            resetAt,
            clearedStudents: 0,
            clearedTeachers: 0,
            error: stateWriteErr.message,
          };
        }

        emitLiveBroadcast({
          type: 'accounts-reset',
          resetAt,
        });
        emitLiveBroadcast({
          type: 'state-updated',
          updatedAt: resetAt,
          reason: 'accounts-reset',
        });

        return {
          ok: true,
          resetAt,
          clearedStudents: clearedStudentIds.size,
          clearedTeachers: clearedTeacherIds.size,
        };
      }),
    );
  } catch (err) {
    return {
      ok: false,
      resetAt,
      clearedStudents: 0,
      clearedTeachers: 0,
      error: err instanceof Error ? err.message : 'Không thể reset tài khoản trên đám mây.',
    };
  }
}

/* ---------- Legacy / Optional-RLS Adapted Wrappers ---------- */

function isMissingSchemaObject(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST202' ||
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    error.code === '42883' ||
    /schema cache|does not exist|Could not find/i.test(error.message ?? '')
  );
}

/** Pull raw shared class JSON document. */
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

/** Upsert the shared class document safely using non-destructive merge. */
export async function pushState(state: PersistedState): Promise<void> {
  await pushClassStateMerged(state);
}

export async function submitEntryRemote(entry: Entry): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.rpc('app_submit_entry', { entry });
  if (error && !isMissingSchemaObject(error)) throw error;
}

export async function likeAnnouncementRemote(annId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.rpc('app_like_announcement', { ann_id: annId });
  if (error && !isMissingSchemaObject(error)) throw error;
}

export async function votePollRemote(pollId: string, optionId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.rpc('app_vote_poll', { poll_id: pollId, option_id: optionId });
  if (error && !isMissingSchemaObject(error)) throw error;
}

export async function sendKudosRemote(kudos: KudosItem): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.rpc('app_send_kudos', { kudos });
  if (error && !isMissingSchemaObject(error)) throw error;
}

export async function clapKudosRemote(kudosId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.rpc('app_clap_kudos', { kudos_id: kudosId });
  if (error && !isMissingSchemaObject(error)) throw error;
}

export async function addResourceRemote(resource: ClassResource): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.rpc('app_add_resource', { resource });
  if (error && !isMissingSchemaObject(error)) throw error;
}

export async function addStudentRemote(student: StudentInput): Promise<void> {
  if (!isSupabaseConfigured) return;
  const normalizedPositions = normalizePositionsList(student.positions, student.position);
  const payload = {
    id: student.id,
    name: student.name,
    code: student.code,
    gender: student.gender,
    birthDate: student.birthDate ?? null,
    group: student.group ?? null,
    position: formatPositionsDisplay(normalizedPositions),
    positions: normalizedPositions,
    customPermissions: normalizeCustomGrants(student.customPermissions),
  };
  const { error } = await supabase.rpc('app_add_student', { student: payload });
  if (error && !isMissingSchemaObject(error)) throw error;
}

export async function bulkAddStudentsRemote(
  names: string[],
  options?: { group?: string | null; autoDistributeGroups?: boolean },
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.rpc('app_bulk_add_students', {
    names,
    group_name: options?.group ?? null,
    auto_distribute_groups: Boolean(options?.autoDistributeGroups),
  });
  if (error && !isMissingSchemaObject(error)) throw error;
}

export type PrivateBundle = {
  contacts: Record<string, StudentPrivateData>;
  notes: Record<string, string>;
};

export async function fetchPrivateBundle(): Promise<PrivateBundle> {
  if (!isSupabaseConfigured) return { contacts: {}, notes: {} };
  try {
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
  } catch {
    return { contacts: {}, notes: {} };
  }
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
  if (error && !isMissingSchemaObject(error)) throw error;
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
  if (error && !isMissingSchemaObject(error)) throw error;
}

export async function deleteStudentPrivateRemote(studentId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  await Promise.all([
    supabase.from('student_private').delete().eq('student_id', studentId),
    supabase.from('student_notes').delete().eq('student_id', studentId),
  ]).catch(() => {});
}

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
  try {
    const { data, error } = await supabase
      .from('class_feedback')
      .select('id, author_id, author_name, anonymous, category, content, reply, resolved, created_at')
      .order('created_at', { ascending: false });
    if (error) return [];
    return ((data as FeedbackRow[] | null) ?? []).map(toFeedback);
  } catch {
    return [];
  }
}

export async function sendFeedbackRemote(item: {
  id: string;
  authorName: string;
  anonymous: boolean;
  category: FeedbackCategory;
  content: string;
}): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('class_feedback').insert({
    id: item.id,
    author_name: item.anonymous ? 'Ẩn danh' : item.authorName,
    anonymous: item.anonymous,
    category: item.category,
    content: item.content.trim(),
  });
  if (error && !isMissingSchemaObject(error)) throw error;
}

export async function replyFeedbackRemote(
  id: string,
  reply: string | null,
  resolved: boolean,
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from('class_feedback')
    .update({ reply: reply?.trim() || null, resolved })
    .eq('id', id);
  if (error && !isMissingSchemaObject(error)) throw error;
}

export async function deleteFeedbackRemote(id: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('class_feedback').delete().eq('id', id);
  if (error && !isMissingSchemaObject(error)) throw error;
}
