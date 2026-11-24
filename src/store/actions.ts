/**
 * Store actions backed by functional state updates so every action is stable,
 * concurrency-safe and React Compiler friendly.
 */

import { GROUP_PRESETS } from '@/constants/entry-meta';
import { formatDate, todayIso } from '@/lib/date';
import { extractDriveFileIdFromUrl } from '@/lib/drive';
import {
  formatPositionsDisplay,
  normalizeCustomGrants,
  normalizePositionsList,
  type CustomOfficerGrantKey,
} from '@/lib/officer-roles';
import { createId, normalizeName } from '@/lib/utils';
import type { StudentPrivateData } from '@/types/auth';
import type {
  ActivityLogItem,
  Announcement,
  AttendanceStatus,
  ClassInfo,
  ClassResource,
  ClassTask,
  DriveAttachment,
  DutyCompletionStatus,
  DutyDayLog,
  DutyStudentRecord,
  Entry,
  EntryCategory,
  EntryKind,
  EntryLevel,
  FeedbackItem,
  FundTransaction,
  KudosItem,
  OfficerDepartmentKey,
  Poll,
  Role,
  ScheduleSlot,
  SeatingArrangeMode,
  Student,
  Weekday,
} from '@/types/models';

import { freshState, hydrateState } from './persist';
import { buildEntry, buildStudent, mergeEntry, mergeStudent } from './reducers';
import type {
  AnnouncementInput,
  EntryInput,
  FeedbackInput,
  FundTransactionInput,
  KudosInput,
  PersistedState,
  PollInput,
  ResourceInput,
  ScheduleSlotInput,
  StudentInput,
  TaskInput,
} from './types';

export type Mutator = (recipe: (prev: PersistedState) => PersistedState) => void;

function appendLog(
  prev: PersistedState,
  actor: string,
  action: string,
  actorStudentId?: string | null,
): ActivityLogItem[] {
  const item: ActivityLogItem = {
    id: createId('log'),
    actor,
    actorStudentId: actorStudentId ?? null,
    action,
    createdAt: new Date().toISOString(),
  };
  return [item, ...prev.activityLog].slice(0, 40);
}

function resolveAttachmentDriveId(att: DriveAttachment): string | null {
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

function stampDeletedItems(
  prev: PersistedState,
  ids: string[],
  now: string,
): Record<string, string> {
  const next = { ...(prev.deletedItemIds ?? {}) };
  for (const id of ids) {
    if (id) next[id] = now;
  }
  return next;
}

function stampDeletedDriveFiles(
  prev: PersistedState,
  driveIds: (string | null | undefined)[],
  now: string,
): Record<string, string> {
  const next = { ...(prev.deletedDriveFileIds ?? {}) };
  for (const id of driveIds) {
    const clean = id?.trim();
    if (clean) next[clean] = now;
  }
  return next;
}

export function createActions(
  mutate: Mutator,
  actorName: () => string,
  actorStudentId: () => string | null = () => null,
) {
  return {
    setRole: (role: Role) =>
      mutate((prev) => ({
        ...prev,
        role,
        currentStudentId: role === 'teacher' ? null : prev.currentStudentId,
      })),

    signInAs: (studentId: string | null) =>
      mutate((prev) => ({ ...prev, currentStudentId: studentId })),

    updateClass: (patch: Partial<ClassInfo>) =>
      mutate((prev) => {
        const now = new Date().toISOString();
        const nextClassInfo: ClassInfo = {
          ...prev.classInfo,
          ...patch,
          customPositions:
            patch.customPositions !== undefined
              ? normalizePositionsList(patch.customPositions, null)
              : prev.classInfo.customPositions,
          semester1Start:
            patch.semester1Start !== undefined
              ? patch.semester1Start?.trim() || null
              : prev.classInfo.semester1Start,
          semester1End:
            patch.semester1End !== undefined
              ? patch.semester1End?.trim() || null
              : prev.classInfo.semester1End,
          updatedAt: now,
        };
        return {
          ...prev,
          classInfo: nextClassInfo,
          activityLog: appendLog(prev, actorName(), 'Cập nhật thông tin lớp'),
        };
      }),

    /** Adds a reusable GVCN custom position title preset on `classInfo.customPositions`. */
    addCustomPositionPresetLocal: (title: string) =>
      mutate((prev) => {
        const additions = normalizePositionsList([title], null);
        if (additions.length === 0) return prev;
        const current = prev.classInfo.customPositions ?? [];
        const nextList = normalizePositionsList([...current, ...additions], null);
        if (nextList.length === current.length) return prev;
        const now = new Date().toISOString();
        return {
          ...prev,
          classInfo: {
            ...prev.classInfo,
            customPositions: nextList,
            updatedAt: now,
          },
          activityLog: appendLog(prev, actorName(), `Thêm mẫu chức vụ "${additions.join(' · ')}"`),
        };
      }),

    /** Removes a reusable GVCN custom position title preset from `classInfo.customPositions`. */
    removeCustomPositionPresetLocal: (title: string) =>
      mutate((prev) => {
        const clean = title.trim().toLowerCase();
        if (!clean) return prev;
        const current = prev.classInfo.customPositions ?? [];
        const nextList = current.filter((item) => item.trim().toLowerCase() !== clean);
        if (nextList.length === current.length) return prev;
        const now = new Date().toISOString();
        return {
          ...prev,
          classInfo: {
            ...prev.classInfo,
            customPositions: nextList,
            updatedAt: now,
          },
          activityLog: appendLog(prev, actorName(), `Xoá mẫu chức vụ "${title.trim()}"`),
        };
      }),

    logActivity: (action: string) =>
      mutate((prev) => ({
        ...prev,
        activityLog: appendLog(prev, actorName(), action, actorStudentId()),
      })),

    addStudentLocal: (input: StudentInput) => {
      const id = input.id?.trim() || createId('stu');
      mutate((prev) => {
        const student = buildStudent(prev.students, prev.classInfo.name, { ...input, id });
        return {
          ...prev,
          students: [...prev.students, student],
          activityLog: appendLog(
            prev,
            actorName(),
            `Thêm học sinh ${student.name} (ID: ${student.code})`,
            actorStudentId(),
          ),
        };
      });
      return id;
    },

    /** Append pre-built students (used by bulk import so IDs match account credentials). */
    appendStudentsLocal: (newStudents: Student[], logMessage: string) =>
      mutate((prev) => {
        if (newStudents.length === 0) return prev;
        return {
          ...prev,
          students: [...prev.students, ...newStudents],
          activityLog: appendLog(prev, actorName(), logMessage, actorStudentId()),
        };
      }),

    /** Import multiple students at once from newline-separated names. */
    bulkAddStudentsLocal: (
      names: string[],
      options?: { group?: string | null; autoDistributeGroups?: boolean },
    ) =>
      mutate((prev) => {
        const cleanNames = names.map(normalizeName).filter(Boolean);
        if (cleanNames.length === 0) return prev;
        let working: Student[] = [...prev.students];
        const startIdx = working.length;
        for (let i = 0; i < cleanNames.length; i += 1) {
          const group = options?.autoDistributeGroups
            ? GROUP_PRESETS[(startIdx + i) % GROUP_PRESETS.length]
            : (options?.group ?? null);
          const created = buildStudent(working, prev.classInfo.name, {
            name: cleanNames[i],
            gender: 'male',
            group,
          });
          working = [...working, created];
        }
        return {
          ...prev,
          students: working,
          activityLog: appendLog(
            prev,
            actorName(),
            `Nhập nhanh ${cleanNames.length} học sinh`,
            actorStudentId(),
          ),
        };
      }),

    updateStudent: (id: string, patch: Partial<StudentInput>) =>
      mutate((prev) => ({
        ...prev,
        students: prev.students.map((s) => (s.id === id ? mergeStudent(s, patch) : s)),
        activityLog: appendLog(prev, actorName(), `Cập nhật hồ sơ học sinh`),
      })),

    /** Update only the private contact fields in memory (paired with `student_private`). */
    patchStudentPrivateLocal: (id: string, data: StudentPrivateData) =>
      mutate((prev) => ({
        ...prev,
        students: prev.students.map((s) =>
          s.id === id
            ? {
                ...s,
                phone: data.phone?.trim() || null,
                email: data.email?.trim() || null,
                address: data.address?.trim() || null,
                updatedAt: new Date().toISOString(),
              }
            : s,
        ),
      })),

    patchStudentNoteLocal: (id: string, note: string | null) =>
      mutate((prev) => ({
        ...prev,
        students: prev.students.map((s) =>
          s.id === id
            ? { ...s, note: note?.trim() || null, updatedAt: new Date().toISOString() }
            : s,
        ),
      })),

    /** Assigns multiple positions (built-in & custom) and optional explicit permissions (GVCN-only caller). */
    assignStudentPositionsLocal: (
      studentId: string,
      positions: string[],
      customPermissions?: CustomOfficerGrantKey[],
    ) =>
      mutate((prev) => {
        const target = prev.students.find((s) => s.id === studentId);
        if (!target) return prev;
        const cleanPositions = normalizePositionsList(positions, null);
        const displayPos = formatPositionsDisplay(cleanPositions);
        const cleanCustomPerms =
          customPermissions !== undefined
            ? normalizeCustomGrants(customPermissions)
            : cleanPositions.length === 0
              ? []
              : normalizeCustomGrants(target.customPermissions);
        const prevPos = target.position;
        const now = new Date().toISOString();
        const logText = displayPos
          ? `GVCN phân công chức vụ "${displayPos}" cho ${target.name}`
          : `GVCN đã hủy chức vụ${prevPos ? ` "${prevPos}"` : ''} của ${target.name}`;
        return {
          ...prev,
          students: prev.students.map((s) =>
            s.id === studentId
              ? {
                  ...s,
                  position: displayPos,
                  positions: cleanPositions,
                  customPermissions: cleanCustomPerms,
                  updatedAt: now,
                }
              : s,
          ),
          activityLog: appendLog(prev, actorName(), logText),
        };
      }),

    /** Backward-compatible single-position wrapper (GVCN-only caller). */
    assignStudentPositionLocal: (studentId: string, position: string | null) =>
      mutate((prev) => {
        const target = prev.students.find((s) => s.id === studentId);
        if (!target) return prev;
        const cleanPositions = position ? normalizePositionsList(null, position) : [];
        const displayPos = formatPositionsDisplay(cleanPositions);
        const cleanCustomPerms =
          cleanPositions.length === 0 ? [] : normalizeCustomGrants(target.customPermissions);
        const prevPos = target.position;
        const now = new Date().toISOString();
        const logText = displayPos
          ? `GVCN phân công chức vụ "${displayPos}" cho ${target.name}`
          : `GVCN đã hủy chức vụ${prevPos ? ` "${prevPos}"` : ''} của ${target.name}`;
        return {
          ...prev,
          students: prev.students.map((s) =>
            s.id === studentId
              ? {
                  ...s,
                  position: displayPos,
                  positions: cleanPositions,
                  customPermissions: cleanCustomPerms,
                  updatedAt: now,
                }
              : s,
          ),
          activityLog: appendLog(prev, actorName(), logText),
        };
      }),

    removeStudent: (id: string) =>
      mutate((prev) => {
        const now = new Date().toISOString();
        const target = prev.students.find((s) => s.id === id);
        const removedEntries = prev.entries.filter((e) => e.studentId === id);
        const removedKudos = prev.kudos.filter((k) => k.toStudentId === id);
        const removedDriveIds = removedEntries
          .map((e) => extractDriveFileIdFromUrl(e.proofUrl))
          .filter((fid): fid is string => Boolean(fid));
        const nextPaid = { ...prev.fundPaid };
        delete nextPaid[id];
        const nextSeats: Record<string, string> = {};
        for (const [key, sid] of Object.entries(prev.seating.seats)) {
          if (sid !== id) nextSeats[key] = sid;
        }
        let dutyLogsChanged = false;
        const nextDutyLogs: Record<string, DutyDayLog> = {};
        for (const [dateKey, day] of Object.entries(prev.dutyLogs ?? {})) {
          const hadAssigned = day.assignedStudentIds.includes(id);
          const hadRecord = Boolean(day.records?.[id]);
          if (!hadAssigned && !hadRecord) {
            nextDutyLogs[dateKey] = day;
            continue;
          }
          dutyLogsChanged = true;
          const nextRecords = { ...(day.records ?? {}) };
          delete nextRecords[id];
          nextDutyLogs[dateKey] = {
            ...day,
            assignedStudentIds: day.assignedStudentIds.filter((sid) => sid !== id),
            records: nextRecords,
            updatedAt: now,
          };
        }
        return {
          ...prev,
          students: prev.students.filter((s) => s.id !== id),
          entries: prev.entries.filter((e) => e.studentId !== id),
          kudos: prev.kudos.filter((k) => k.toStudentId !== id),
          dutyLogs: dutyLogsChanged ? nextDutyLogs : prev.dutyLogs,
          deletedItemIds: stampDeletedItems(
            prev,
            [...removedEntries.map((e) => e.id), ...removedKudos.map((k) => k.id)],
            now,
          ),
          deletedDriveFileIds:
            removedDriveIds.length > 0
              ? stampDeletedDriveFiles(prev, removedDriveIds, now)
              : prev.deletedDriveFileIds,
          fundPaid: nextPaid,
          seating: { ...prev.seating, seats: nextSeats, updatedAt: now },
          currentStudentId: prev.currentStudentId === id ? null : prev.currentStudentId,
          activityLog: appendLog(prev, actorName(), `Xoá học sinh ${target?.name ?? ''}`.trim()),
        };
      }),

    addEntry: (input: EntryInput) => {
      const entry = buildEntry(input);
      const signedPoints = `${entry.points > 0 ? '+' : ''}${entry.points}đ`;
      const logAction =
        entry.kind === 'study'
          ? `Ghi nhận ${entry.speechCount ?? 1} lượt phát biểu${entry.subject ? ` môn ${entry.subject}` : ''} (${signedPoints})`
          : `Ghi mục "${entry.title}" (${signedPoints})`;
      mutate((prev) => ({
        ...prev,
        entries: [entry, ...prev.entries],
        activityLog: appendLog(prev, actorName(), logAction, actorStudentId()),
      }));
      return entry;
    },

    quickReward: (
      studentId: string,
      title: string,
      points: number,
      category: EntryCategory = 'study',
      kind: EntryKind = 'activity',
      level: EntryLevel = 'class',
    ) =>
      mutate((prev) => {
        const entry = buildEntry({
          studentId,
          title,
          kind,
          category,
          level,
          date: todayIso(),
          points,
          submittedBy: 'teacher',
        });
        const studentName = prev.students.find((s) => s.id === studentId)?.name ?? 'học sinh';
        return {
          ...prev,
          entries: [entry, ...prev.entries],
          activityLog: appendLog(prev, actorName(), `Thưởng +${points}đ cho ${studentName}`),
        };
      }),

    updateEntry: (id: string, patch: Partial<EntryInput>) =>
      mutate((prev) => ({
        ...prev,
        entries: prev.entries.map((e) => (e.id === id ? mergeEntry(e, patch) : e)),
      })),

    removeEntry: (id: string) =>
      mutate((prev) => {
        const now = new Date().toISOString();
        const target = prev.entries.find((e) => e.id === id);
        const proofDriveId = extractDriveFileIdFromUrl(target?.proofUrl);
        return {
          ...prev,
          entries: prev.entries.filter((e) => e.id !== id),
          deletedItemIds: stampDeletedItems(prev, [id], now),
          deletedDriveFileIds: proofDriveId
            ? stampDeletedDriveFiles(prev, [proofDriveId], now)
            : prev.deletedDriveFileIds,
          activityLog: appendLog(prev, actorName(), 'Xoá một mục thành tích', actorStudentId()),
        };
      }),

    clearEntryProof: (entryId: string, driveFileId?: string | null) =>
      mutate((prev) => {
        const target = prev.entries.find((e) => e.id === entryId);
        if (!target) return prev;
        const now = new Date().toISOString();
        const resolvedDriveId =
          driveFileId?.trim() || extractDriveFileIdFromUrl(target.proofUrl);
        if (!target.proofUrl && !resolvedDriveId) return prev;
        return {
          ...prev,
          entries: prev.entries.map((e) =>
            e.id === entryId ? { ...e, proofUrl: null, updatedAt: now } : e,
          ),
          deletedDriveFileIds: resolvedDriveId
            ? stampDeletedDriveFiles(prev, [resolvedDriveId], now)
            : prev.deletedDriveFileIds,
          activityLog: appendLog(
            prev,
            actorName(),
            `Xoá tệp minh chứng của "${target.title}"`,
            actorStudentId(),
          ),
        };
      }),

    setEntryStatus: (id: string, status: Entry['status'], reviewNote?: string | null) =>
      mutate((prev) => {
        const target = prev.entries.find((e) => e.id === id);
        return {
          ...prev,
          entries: prev.entries.map((e) =>
            e.id === id
              ? {
                  ...e,
                  status,
                  reviewNote: reviewNote === undefined ? e.reviewNote : reviewNote,
                  updatedAt: new Date().toISOString(),
                }
              : e,
          ),
          activityLog: appendLog(
            prev,
            actorName(),
            `${status === 'approved' ? 'Duyệt' : status === 'rejected' ? 'Từ chối' : 'Cập nhật'} "${target?.title ?? 'mục'}"`,
          ),
        };
      }),

    approveAllPending: () =>
      mutate((prev) => {
        const count = prev.entries.filter((e) => e.status === 'pending').length;
        if (count === 0) return prev;
        const now = new Date().toISOString();
        return {
          ...prev,
          entries: prev.entries.map((e) =>
            e.status === 'pending' ? { ...e, status: 'approved', updatedAt: now } : e,
          ),
          activityLog: appendLog(prev, actorName(), `Duyệt nhanh ${count} mục chờ duyệt`),
        };
      }),

    /* ---------- Attendance ---------- */

    setAttendance: (
      date: string,
      studentId: string,
      status: AttendanceStatus,
      note?: string | null,
    ) =>
      mutate((prev) => {
        const existing = prev.attendance[date];
        const prevEntry = existing?.records[studentId];
        return {
          ...prev,
          attendance: {
            ...prev.attendance,
            [date]: {
              date,
              records: {
                ...(existing?.records ?? {}),
                [studentId]: {
                  status,
                  note: note === undefined ? (prevEntry?.note ?? null) : note,
                },
              },
              updatedAt: new Date().toISOString(),
            },
          },
        };
      }),

    markAllPresent: (date: string) =>
      mutate((prev) => {
        const records: Record<string, { status: AttendanceStatus; note?: string | null }> = {};
        for (const student of prev.students) {
          records[student.id] = { status: 'present', note: null };
        }
        return {
          ...prev,
          attendance: {
            ...prev.attendance,
            [date]: {
              date,
              records,
              updatedAt: new Date().toISOString(),
            },
          },
          activityLog: appendLog(prev, actorName(), `Điểm danh cả lớp ngày ${formatDate(date)}`),
        };
      }),

    /* ---------- Announcements ---------- */

    addAnnouncement: (
      input: AnnouncementInput & {
        department?: OfficerDepartmentKey | null;
        authorPosition?: string | null;
        eventId?: string | null;
      },
    ) =>
      mutate((prev) => {
        const cleanSubject = input.subject?.trim() || null;
        const cleanAuthorPos = input.authorPosition?.trim() || null;
        const resolvedRole =
          input.authorRole ??
          (cleanSubject ? 'subject_teacher' : cleanAuthorPos ? 'officer' : 'teacher');
        const item: Announcement = {
          id: createId('ann'),
          title: input.title.trim(),
          content: input.content.trim(),
          tag: input.tag,
          eventDate: input.eventDate?.trim() || null,
          pinned: Boolean(input.pinned),
          likes: 0,
          author: input.author?.trim() || actorName() || prev.classInfo.teacherName,
          subject: cleanSubject,
          authorRole: resolvedRole,
          ...(input.department !== undefined ? { department: input.department } : {}),
          ...(cleanAuthorPos ? { authorPosition: cleanAuthorPos } : {}),
          ...(input.eventId?.trim() ? { eventId: input.eventId.trim() } : {}),
          attachments: input.attachments && input.attachments.length > 0 ? input.attachments : undefined,
          createdAt: new Date().toISOString(),
        };
        const logPrefix = cleanSubject
          ? `GV ${cleanSubject} đăng thông báo`
          : cleanAuthorPos
            ? `${cleanAuthorPos} đăng thông báo`
            : 'Đăng thông báo';
        return {
          ...prev,
          announcements: [item, ...prev.announcements],
          activityLog: appendLog(
            prev,
            item.author,
            `${logPrefix} "${item.title}"`,
            actorStudentId(),
          ),
        };
      }),

    togglePinAnnouncement: (id: string) =>
      mutate((prev) => ({
        ...prev,
        announcements: prev.announcements.map((a) =>
          a.id === id ? { ...a, pinned: !a.pinned } : a,
        ),
      })),

    likeAnnouncementLocal: (id: string) =>
      mutate((prev) => ({
        ...prev,
        announcements: prev.announcements.map((a) =>
          a.id === id ? { ...a, likes: a.likes + 1 } : a,
        ),
      })),

    removeAnnouncement: (id: string) =>
      mutate((prev) => {
        const now = new Date().toISOString();
        const target = prev.announcements.find((a) => a.id === id);
        const driveIds = (target?.attachments ?? [])
          .map(resolveAttachmentDriveId)
          .filter((fid): fid is string => Boolean(fid));
        return {
          ...prev,
          announcements: prev.announcements.filter((a) => a.id !== id),
          deletedItemIds: stampDeletedItems(prev, [id], now),
          deletedDriveFileIds:
            driveIds.length > 0
              ? stampDeletedDriveFiles(prev, driveIds, now)
              : prev.deletedDriveFileIds,
        };
      }),

    removeAnnouncementAttachment: (
      announcementId: string,
      attachmentIdOrDriveId: string,
      driveFileId?: string | null,
    ) =>
      mutate((prev) => {
        const target = prev.announcements.find((a) => a.id === announcementId);
        if (!target) return prev;
        const now = new Date().toISOString();
        const targetDriveId = driveFileId?.trim() || null;
        const existing = target.attachments ?? [];
        const removedDriveIds: string[] = [];
        if (targetDriveId) removedDriveIds.push(targetDriveId);

        const nextAttachments = existing.filter((att) => {
          const attDriveId = resolveAttachmentDriveId(att);
          const isMatch =
            att.id === attachmentIdOrDriveId ||
            (targetDriveId !== null &&
              (att.id === targetDriveId || attDriveId === targetDriveId));
          if (isMatch && attDriveId) {
            removedDriveIds.push(attDriveId);
          }
          return !isMatch;
        });

        if (nextAttachments.length === existing.length && removedDriveIds.length === 0) {
          return prev;
        }

        return {
          ...prev,
          announcements: prev.announcements.map((a) =>
            a.id === announcementId
              ? {
                  ...a,
                  attachments: nextAttachments.length > 0 ? nextAttachments : undefined,
                }
              : a,
          ),
          deletedDriveFileIds:
            removedDriveIds.length > 0
              ? stampDeletedDriveFiles(prev, removedDriveIds, now)
              : prev.deletedDriveFileIds,
          activityLog: appendLog(
            prev,
            actorName(),
            `Xoá tệp đính kèm khỏi thông báo "${target.title}"`,
            actorStudentId(),
          ),
        };
      }),

    /* ---------- Class Fund ---------- */

    addFundTransaction: (input: FundTransactionInput) =>
      mutate((prev) => {
        const tx: FundTransaction = {
          id: createId('fnd'),
          title: input.title.trim(),
          kind: input.kind,
          category: input.category,
          amount: Math.max(0, Math.round(input.amount)),
          date: input.date,
          note: input.note?.trim() || null,
          createdAt: new Date().toISOString(),
        };
        return {
          ...prev,
          fundTransactions: [tx, ...prev.fundTransactions],
          activityLog: appendLog(
            prev,
            actorName(),
            `Ghi ${tx.kind === 'income' ? 'thu' : 'chi'} quỹ: "${tx.title}"`,
          ),
        };
      }),

    removeFundTransaction: (id: string) =>
      mutate((prev) => ({
        ...prev,
        fundTransactions: prev.fundTransactions.filter((tx) => tx.id !== id),
        deletedItemIds: stampDeletedItems(prev, [id], new Date().toISOString()),
      })),

    toggleFundPaid: (studentId: string) =>
      mutate((prev) => ({
        ...prev,
        fundPaid: {
          ...prev.fundPaid,
          [studentId]: !prev.fundPaid[studentId],
        },
      })),

    updateFundCycle: (label: string, amount: number) =>
      mutate((prev) => ({
        ...prev,
        fundCycleLabel: label.trim() || prev.fundCycleLabel,
        fundCycleAmount: Math.max(0, Math.round(amount)),
      })),

    /* ---------- Timetable & Duty Roster ---------- */

    addScheduleSlot: (input: ScheduleSlotInput) =>
      mutate((prev) => {
        const slot: ScheduleSlot = {
          id: createId('sch'),
          day: input.day,
          period: Math.max(1, input.period),
          subject: input.subject.trim(),
          session: input.session,
          teacher: input.teacher?.trim() || null,
          room: input.room?.trim() || null,
        };
        return { ...prev, schedule: [...prev.schedule, slot] };
      }),

    removeScheduleSlot: (id: string) =>
      mutate((prev) => ({
        ...prev,
        schedule: prev.schedule.filter((s) => s.id !== id),
      })),

    updateDutyRoster: (day: Weekday, group: string) =>
      mutate((prev) => ({
        ...prev,
        dutyRoster: {
          ...prev.dutyRoster,
          [String(day) as `${Weekday}`]: group,
        },
        activityLog: appendLog(
          prev,
          actorName(),
          `Đổi lịch trực nhật Thứ ${day} sang ${group}`,
          actorStudentId(),
        ),
      })),

    /** Assigns students & optional group for daily duty checkoff (`Lớp phó lao động` / `Lớp trưởng` / `GVCN`). */
    assignDutyForDateLocal: (input: {
      date: string;
      assignedGroup?: string | null;
      assignedStudentIds: string[];
      note?: string | null;
    }) =>
      mutate((prev) => {
        const cleanDate = input.date.trim();
        if (!cleanDate) return prev;
        const now = new Date().toISOString();
        const uniqueIds = Array.from(
          new Set(input.assignedStudentIds.map((sid) => sid.trim()).filter(Boolean)),
        );
        const assignedSet = new Set(uniqueIds);
        const existingDay = prev.dutyLogs?.[cleanDate];
        const prevRecords = existingDay?.records ?? {};

        const nextRecords: Record<string, DutyStudentRecord> = {};
        for (const sid of uniqueIds) {
          nextRecords[sid] = prevRecords[sid] ?? {
            studentId: sid,
            status: 'pending',
            note: null,
            evaluatedBy: null,
            evaluatedByPosition: null,
            evaluatedAt: null,
            entryId: null,
          };
        }

        const removedEntryIds: string[] = [];
        for (const [sid, rec] of Object.entries(prevRecords)) {
          if (!assignedSet.has(sid) && rec?.entryId) {
            removedEntryIds.push(rec.entryId);
          }
        }
        const removedSet = new Set(removedEntryIds);

        const nextDay: DutyDayLog = {
          date: cleanDate,
          assignedGroup:
            input.assignedGroup !== undefined
              ? input.assignedGroup?.trim() || null
              : (existingDay?.assignedGroup ?? null),
          assignedStudentIds: uniqueIds,
          records: nextRecords,
          note:
            input.note !== undefined ? input.note?.trim() || null : (existingDay?.note ?? null),
          assignedBy: actorName(),
          updatedAt: now,
        };

        return {
          ...prev,
          dutyLogs: {
            ...(prev.dutyLogs ?? {}),
            [cleanDate]: nextDay,
          },
          entries:
            removedEntryIds.length > 0
              ? prev.entries.filter((e) => !removedSet.has(e.id))
              : prev.entries,
          deletedItemIds:
            removedEntryIds.length > 0
              ? stampDeletedItems(prev, removedEntryIds, now)
              : prev.deletedItemIds,
          activityLog: appendLog(
            prev,
            actorName(),
            `Phân công trực nhật ngày ${formatDate(cleanDate)} (${uniqueIds.length} HS)`,
            actorStudentId(),
          ),
        };
      }),

    /**
     * Marks a student's duty completion (`completed` | `missed` | `pending`) and directly
     * syncs their Điểm chuyên cần evaluation entry without tombstone collisions.
     */
    markDutyCompletionLocal: (input: {
      date: string;
      studentId: string;
      status: DutyCompletionStatus;
      note?: string | null;
      evaluatorPosition?: string | null;
    }) =>
      mutate((prev) => {
        const cleanDate = input.date.trim();
        const sid = input.studentId.trim();
        if (!cleanDate || !sid) return prev;
        const now = new Date().toISOString();
        const existingDay = prev.dutyLogs?.[cleanDate];
        const existingRecord = existingDay?.records?.[sid];
        const assignedIds = existingDay?.assignedStudentIds.includes(sid)
          ? existingDay.assignedStudentIds
          : [...(existingDay?.assignedStudentIds ?? []), sid];
        const studentName = prev.students.find((s) => s.id === sid)?.name ?? 'học sinh';
        const evaluatorPos = input.evaluatorPosition?.trim() || 'Ban cán sự';
        const cleanNote = input.note?.trim() || null;

        let nextEntries = prev.entries;
        let nextDeletedItemIds = prev.deletedItemIds;
        let nextEntryId: string | null = null;

        if (input.status === 'pending') {
          if (existingRecord?.entryId) {
            const oldId = existingRecord.entryId;
            nextEntries = prev.entries.filter((e) => e.id !== oldId);
            nextDeletedItemIds = stampDeletedItems(prev, [oldId], now);
          }
          nextEntryId = null;
        } else {
          // Reuse existing live entry ID when toggling completed <-> missed; otherwise mint a fresh ID
          // so presence-only `deletedItemIds` tombstones on remote devices never kill re-marked entries.
          const candidateId = existingRecord?.entryId?.trim() || '';
          const canReuse = Boolean(candidateId && !prev.deletedItemIds?.[candidateId]);
          const entryId = canReuse ? candidateId : createId('duty');
          nextEntryId = entryId;

          const existingEntry = prev.entries.find((e) => e.id === entryId);
          const isCompleted = input.status === 'completed';
          const dutyEntry: Entry = {
            id: entryId,
            studentId: sid,
            title: isCompleted
              ? `Hoàn thành trực nhật lớp (${formatDate(cleanDate)})`
              : `Chưa hoàn thành trực nhật lớp (${formatDate(cleanDate)})`,
            kind: isCompleted ? 'activity' : 'violation',
            category: 'volunteer',
            level: 'class',
            date: cleanDate,
            description:
              cleanNote ||
              (isCompleted
                ? 'Lớp phó lao động / Ban cán sự ghi nhận hoàn thành trực nhật (Điểm chuyên cần)'
                : 'Chưa hoàn thành nhiệm vụ trực nhật lớp (Điểm chuyên cần)'),
            proofUrl: null,
            points: isCompleted ? 5 : -5,
            status: 'approved',
            submittedBy: 'teacher',
            reviewNote: null,
            recordedByName: actorName(),
            recordedByPosition: evaluatorPos,
            recordedByStudentId: actorStudentId(),
            source: 'duty_diligence',
            createdAt: existingEntry?.createdAt ?? now,
            updatedAt: now,
          };

          nextEntries = existingEntry
            ? prev.entries.map((e) => (e.id === entryId ? dutyEntry : e))
            : [dutyEntry, ...prev.entries];
        }

        const nextRecord: DutyStudentRecord = {
          studentId: sid,
          status: input.status,
          note: cleanNote,
          evaluatedBy: actorName(),
          evaluatedByPosition: evaluatorPos,
          evaluatedAt: now,
          entryId: nextEntryId,
        };

        const nextDay: DutyDayLog = {
          date: cleanDate,
          assignedGroup: existingDay?.assignedGroup ?? null,
          assignedStudentIds: assignedIds,
          records: {
            ...(existingDay?.records ?? {}),
            [sid]: nextRecord,
          },
          note: existingDay?.note ?? null,
          assignedBy: existingDay?.assignedBy ?? actorName(),
          updatedAt: now,
        };

        const statusText =
          input.status === 'completed'
            ? 'Hoàn thành (+5đ chuyên cần)'
            : input.status === 'missed'
              ? 'Chưa hoàn thành (-5đ chuyên cần)'
              : 'Đặt lại chờ chấm';

        return {
          ...prev,
          dutyLogs: {
            ...(prev.dutyLogs ?? {}),
            [cleanDate]: nextDay,
          },
          entries: nextEntries,
          deletedItemIds: nextDeletedItemIds,
          activityLog: appendLog(
            prev,
            actorName(),
            `Trực nhật ${studentName} (${formatDate(cleanDate)}): ${statusText}`,
            actorStudentId(),
          ),
        };
      }),

    /* ---------- Polls ---------- */

    addPoll: (input: PollInput) =>
      mutate((prev) => {
        const cleanOptions = input.options.map((o) => o.trim()).filter(Boolean);
        if (!input.question.trim() || cleanOptions.length < 2) return prev;
        const poll: Poll = {
          id: createId('pol'),
          question: input.question.trim(),
          description: input.description?.trim() || null,
          options: cleanOptions.map((label, i) => ({ id: `opt_${Date.now()}_${i}`, label })),
          votes: {},
          closed: false,
          deadline: input.deadline?.trim() || null,
          author: input.author?.trim() || actorName() || prev.classInfo.teacherName,
          createdAt: new Date().toISOString(),
        };
        return {
          ...prev,
          polls: [poll, ...prev.polls],
          activityLog: appendLog(prev, actorName(), `Tạo bình chọn "${poll.question}"`),
        };
      }),

    votePollLocal: (pollId: string, optionId: string, voterKey: string) =>
      mutate((prev) => ({
        ...prev,
        polls: prev.polls.map((p) =>
          p.id === pollId && !p.closed
            ? { ...p, votes: { ...p.votes, [voterKey]: optionId } }
            : p,
        ),
      })),

    togglePollClosed: (pollId: string) =>
      mutate((prev) => ({
        ...prev,
        polls: prev.polls.map((p) => (p.id === pollId ? { ...p, closed: !p.closed } : p)),
      })),

    removePoll: (pollId: string) =>
      mutate((prev) => ({
        ...prev,
        polls: prev.polls.filter((p) => p.id !== pollId),
        deletedItemIds: stampDeletedItems(prev, [pollId], new Date().toISOString()),
      })),

    /* ---------- Class Tasks & Deadlines ---------- */

    addTask: (
      input: TaskInput & {
        department?: OfficerDepartmentKey | null;
        itemKind?: 'task' | 'event';
        eventDate?: string | null;
        location?: string | null;
        assignedOfficerRole?: string | null;
        authorName?: string | null;
        authorPosition?: string | null;
      },
    ) =>
      mutate((prev) => {
        const cleanAuthor =
          input.author?.trim() ||
          input.authorName?.trim() ||
          actorName() ||
          prev.classInfo.teacherName;
        const cleanAuthorPos = input.authorPosition?.trim() || null;
        const resolvedKind = input.itemKind ?? 'task';
        const task: ClassTask = {
          id: createId('tsk'),
          title: input.title.trim(),
          subject: input.subject.trim() || 'Chung',
          dueDate: input.dueDate,
          priority: input.priority,
          note: input.note?.trim() || null,
          author: cleanAuthor,
          ...(input.department !== undefined ? { department: input.department } : {}),
          ...(input.itemKind !== undefined ? { itemKind: resolvedKind } : {}),
          ...(input.eventDate?.trim() ? { eventDate: input.eventDate.trim() } : {}),
          ...(input.location?.trim() ? { location: input.location.trim() } : {}),
          ...(input.assignedOfficerRole?.trim()
            ? { assignedOfficerRole: input.assignedOfficerRole.trim() }
            : {}),
          ...(input.authorName?.trim() ? { authorName: input.authorName.trim() } : {}),
          ...(cleanAuthorPos ? { authorPosition: cleanAuthorPos } : {}),
          attachments: input.attachments && input.attachments.length > 0 ? input.attachments : undefined,
          createdAt: new Date().toISOString(),
        };
        const logPrefix = resolvedKind === 'event' ? 'Tạo sự kiện' : 'Giao nhiệm vụ';
        return {
          ...prev,
          tasks: [task, ...prev.tasks],
          activityLog: appendLog(
            prev,
            cleanAuthor,
            `${logPrefix} "${task.title}"`,
            actorStudentId(),
          ),
        };
      }),

    removeTask: (taskId: string) =>
      mutate((prev) => {
        const now = new Date().toISOString();
        const target = prev.tasks.find((t) => t.id === taskId);
        const driveIds = (target?.attachments ?? [])
          .map(resolveAttachmentDriveId)
          .filter((fid): fid is string => Boolean(fid));
        return {
          ...prev,
          tasks: prev.tasks.filter((t) => t.id !== taskId),
          deletedItemIds: stampDeletedItems(prev, [taskId], now),
          deletedDriveFileIds:
            driveIds.length > 0
              ? stampDeletedDriveFiles(prev, driveIds, now)
              : prev.deletedDriveFileIds,
        };
      }),

    removeTaskAttachment: (
      taskId: string,
      attachmentIdOrDriveId: string,
      driveFileId?: string | null,
    ) =>
      mutate((prev) => {
        const target = prev.tasks.find((t) => t.id === taskId);
        if (!target) return prev;
        const now = new Date().toISOString();
        const targetDriveId = driveFileId?.trim() || null;
        const existing = target.attachments ?? [];
        const removedDriveIds: string[] = [];
        if (targetDriveId) removedDriveIds.push(targetDriveId);

        const nextAttachments = existing.filter((att) => {
          const attDriveId = resolveAttachmentDriveId(att);
          const isMatch =
            att.id === attachmentIdOrDriveId ||
            (targetDriveId !== null &&
              (att.id === targetDriveId || attDriveId === targetDriveId));
          if (isMatch && attDriveId) {
            removedDriveIds.push(attDriveId);
          }
          return !isMatch;
        });

        if (nextAttachments.length === existing.length && removedDriveIds.length === 0) {
          return prev;
        }

        return {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  attachments: nextAttachments.length > 0 ? nextAttachments : undefined,
                }
              : t,
          ),
          deletedDriveFileIds:
            removedDriveIds.length > 0
              ? stampDeletedDriveFiles(prev, removedDriveIds, now)
              : prev.deletedDriveFileIds,
          activityLog: appendLog(
            prev,
            actorName(),
            `Xoá tệp đính kèm khỏi nhiệm vụ "${target.title}"`,
            actorStudentId(),
          ),
        };
      }),

    /* ---------- Private Feedback (Local / Optimistic) ---------- */

    addFeedbackLocal: (input: FeedbackInput) => {
      const item: FeedbackItem = {
        id: createId('fbk'),
        authorId: input.authorId,
        authorName: input.anonymous ? 'Ẩn danh' : input.authorName,
        anonymous: input.anonymous,
        category: input.category,
        content: input.content.trim(),
        reply: null,
        resolved: false,
        createdAt: new Date().toISOString(),
      };
      mutate((prev) => ({ ...prev, feedback: [item, ...prev.feedback] }));
      return item;
    },

    replyFeedbackLocal: (id: string, reply: string | null, resolved: boolean) =>
      mutate((prev) => ({
        ...prev,
        feedback: prev.feedback.map((f) =>
          f.id === id ? { ...f, reply: reply?.trim() || null, resolved } : f,
        ),
      })),

    removeFeedbackLocal: (id: string) =>
      mutate((prev) => ({
        ...prev,
        feedback: prev.feedback.filter((f) => f.id !== id),
        deletedItemIds: stampDeletedItems(prev, [id], new Date().toISOString()),
      })),

    setFeedbackList: (items: FeedbackItem[]) =>
      mutate((prev) => ({ ...prev, feedback: items })),

    /* ---------- Kudos & Peer Recognition ---------- */

    addKudosLocal: (input: KudosInput) => {
      const item: KudosItem = {
        id: createId('kud'),
        toStudentId: input.toStudentId,
        authorStudentId: input.authorStudentId ?? null,
        fromName: input.anonymous ? 'Bạn giấu tên' : input.fromName?.trim() || actorName(),
        anonymous: input.anonymous,
        sticker: input.sticker,
        message: input.message.trim(),
        claps: 1,
        createdAt: new Date().toISOString(),
      };
      mutate((prev) => {
        const targetName = prev.students.find((s) => s.id === input.toStudentId)?.name ?? 'bạn cùng lớp';
        return {
          ...prev,
          kudos: [item, ...prev.kudos].slice(0, 120),
          activityLog: appendLog(
            prev,
            actorName(),
            `Gửi lời khen tới ${targetName}`,
            actorStudentId(),
          ),
        };
      });
      return item;
    },

    clapKudosLocal: (id: string) =>
      mutate((prev) => ({
        ...prev,
        kudos: prev.kudos.map((k) => (k.id === id ? { ...k, claps: k.claps + 1 } : k)),
      })),

    removeKudos: (id: string) =>
      mutate((prev) => ({
        ...prev,
        kudos: prev.kudos.filter((k) => k.id !== id),
        deletedItemIds: stampDeletedItems(prev, [id], new Date().toISOString()),
      })),

    /* ---------- Study Resources Vault ---------- */

    addResourceLocal: (input: ResourceInput) => {
      const item: ClassResource = {
        id: createId('res'),
        title: input.title.trim(),
        subject: input.subject.trim() || 'Chung',
        type: input.type,
        url: input.url.trim(),
        description: input.description?.trim() || null,
        pinned: Boolean(input.pinned),
        author: input.author?.trim() || actorName(),
        ownerStudentId: input.ownerStudentId ?? null,
        createdAt: new Date().toISOString(),
      };
      mutate((prev) => ({
        ...prev,
        resources: [item, ...prev.resources],
        activityLog: appendLog(
          prev,
          actorName(),
          `Thêm tài liệu "${item.title}"`,
          actorStudentId(),
        ),
      }));
      return item;
    },

    togglePinResource: (id: string) =>
      mutate((prev) => ({
        ...prev,
        resources: prev.resources.map((r) => (r.id === id ? { ...r, pinned: !r.pinned } : r)),
      })),

    removeResource: (id: string) =>
      mutate((prev) => {
        const now = new Date().toISOString();
        const target = prev.resources.find((r) => r.id === id);
        const driveId = extractDriveFileIdFromUrl(target?.url);
        return {
          ...prev,
          resources: prev.resources.filter((r) => r.id !== id),
          deletedItemIds: stampDeletedItems(prev, [id], now),
          deletedDriveFileIds: driveId
            ? stampDeletedDriveFiles(prev, [driveId], now)
            : prev.deletedDriveFileIds,
        };
      }),

    /**
     * Stamps a deleted Drive file ID tombstone (unless `recordTombstone === false`
     * or already tombstoned) and scrubs every reference across announcements,
     * tasks, entry proofs, and Drive-linked resources cleanly.
     */
    purgeDriveFileReferences: (
      driveFileId: string,
      options?: { recordTombstone?: boolean },
    ) =>
      mutate((prev) => {
        const cleanId = driveFileId.trim();
        if (!cleanId) return prev;
        const now = new Date().toISOString();
        const shouldRecordTombstone = options?.recordTombstone !== false;
        const alreadyTombstoned = Boolean(prev.deletedDriveFileIds?.[cleanId]);

        let announcementsChanged = false;
        const nextAnnouncements = prev.announcements.map((ann) => {
          if (!ann.attachments || ann.attachments.length === 0) return ann;
          const filtered = ann.attachments.filter(
            (att) => att.id !== cleanId && resolveAttachmentDriveId(att) !== cleanId,
          );
          if (filtered.length === ann.attachments.length) return ann;
          announcementsChanged = true;
          return {
            ...ann,
            attachments: filtered.length > 0 ? filtered : undefined,
          };
        });

        let tasksChanged = false;
        const nextTasks = prev.tasks.map((task) => {
          if (!task.attachments || task.attachments.length === 0) return task;
          const filtered = task.attachments.filter(
            (att) => att.id !== cleanId && resolveAttachmentDriveId(att) !== cleanId,
          );
          if (filtered.length === task.attachments.length) return task;
          tasksChanged = true;
          return {
            ...task,
            attachments: filtered.length > 0 ? filtered : undefined,
          };
        });

        let entriesChanged = false;
        const nextEntries = prev.entries.map((entry) => {
          if (!entry.proofUrl || extractDriveFileIdFromUrl(entry.proofUrl) !== cleanId) {
            return entry;
          }
          entriesChanged = true;
          return {
            ...entry,
            proofUrl: null,
            updatedAt: now,
          };
        });

        const removedResourceIds: string[] = [];
        const nextResources = prev.resources.filter((res) => {
          if (extractDriveFileIdFromUrl(res.url) === cleanId) {
            removedResourceIds.push(res.id);
            return false;
          }
          return true;
        });
        const resourcesChanged = removedResourceIds.length > 0;
        const needsTombstoneWrite = shouldRecordTombstone && !alreadyTombstoned;

        if (
          !needsTombstoneWrite &&
          !announcementsChanged &&
          !tasksChanged &&
          !entriesChanged &&
          !resourcesChanged
        ) {
          return prev;
        }

        return {
          ...prev,
          announcements: announcementsChanged ? nextAnnouncements : prev.announcements,
          tasks: tasksChanged ? nextTasks : prev.tasks,
          entries: entriesChanged ? nextEntries : prev.entries,
          resources: resourcesChanged ? nextResources : prev.resources,
          deletedDriveFileIds: needsTombstoneWrite
            ? stampDeletedDriveFiles(prev, [cleanId], now)
            : prev.deletedDriveFileIds,
          deletedItemIds: resourcesChanged
            ? stampDeletedItems(prev, removedResourceIds, now)
            : prev.deletedItemIds,
        };
      }),

    /* ---------- Interactive Seating Chart ---------- */

    setSeat: (seatKey: string, studentId: string | null) =>
      mutate((prev) => {
        const nextSeats = { ...prev.seating.seats };
        if (studentId) {
          for (const [k, sid] of Object.entries(nextSeats)) {
            if (sid === studentId) delete nextSeats[k];
          }
          nextSeats[seatKey] = studentId;
        } else {
          delete nextSeats[seatKey];
        }
        return {
          ...prev,
          seating: { ...prev.seating, seats: nextSeats, updatedAt: new Date().toISOString() },
        };
      }),

    swapSeats: (seatA: string, seatB: string) =>
      mutate((prev) => {
        if (seatA === seatB) return prev;
        const nextSeats = { ...prev.seating.seats };
        const a = nextSeats[seatA];
        const b = nextSeats[seatB];
        if (b) nextSeats[seatA] = b;
        else delete nextSeats[seatA];
        if (a) nextSeats[seatB] = a;
        else delete nextSeats[seatB];
        return {
          ...prev,
          seating: { ...prev.seating, seats: nextSeats, updatedAt: new Date().toISOString() },
          activityLog: appendLog(prev, actorName(), 'Cập nhật sơ đồ chỗ ngồi lớp'),
        };
      }),

    setSeatingSize: (rows: number, cols: number) =>
      mutate((prev) => {
        const safeRows = Math.max(3, Math.min(8, rows));
        const safeCols = Math.max(2, Math.min(8, cols));
        const nextSeats: Record<string, string> = {};
        for (const [key, sid] of Object.entries(prev.seating.seats)) {
          const [r, c] = key.split('-').map(Number);
          if (r < safeRows && c < safeCols) nextSeats[key] = sid;
        }
        return {
          ...prev,
          seating: { rows: safeRows, cols: safeCols, seats: nextSeats, updatedAt: new Date().toISOString() },
        };
      }),

    autoArrangeSeats: (mode: SeatingArrangeMode, orderedStudentIds?: string[]) =>
      mutate((prev) => {
        const cols = prev.seating.cols;
        const rows = Math.max(prev.seating.rows, Math.ceil(prev.students.length / cols));
        let list = [...prev.students];

        if (mode === 'by-group') {
          list.sort(
            (a, b) =>
              (a.group ?? 'ZZ').localeCompare(b.group ?? 'ZZ', 'vi') ||
              a.name.localeCompare(b.name, 'vi'),
          );
        } else if (mode === 'shuffle') {
          for (let i = list.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
          }
        } else if (mode === 'mentoring' && orderedStudentIds && orderedStudentIds.length > 0) {
          const map = new Map(list.map((s) => [s.id, s]));
          const ranked = orderedStudentIds.map((id) => map.get(id)).filter((s): s is Student => Boolean(s));
          const paired: Student[] = [];
          let left = 0;
          let right = ranked.length - 1;
          while (left <= right) {
            paired.push(ranked[left]);
            if (left !== right) paired.push(ranked[right]);
            left += 1;
            right -= 1;
          }
          list = paired;
        }

        const seats: Record<string, string> = {};
        list.forEach((student, idx) => {
          const r = Math.floor(idx / cols);
          const c = idx % cols;
          if (r < rows && c < cols) {
            seats[`${r}-${c}`] = student.id;
          }
        });

        const modeLabel =
          mode === 'by-group'
            ? 'Xếp chỗ theo Tổ'
            : mode === 'shuffle'
              ? 'Đảo chỗ ngẫu nhiên'
              : 'Xếp đôi bạn cùng tiến';

        return {
          ...prev,
          seating: { rows, cols, seats, updatedAt: new Date().toISOString() },
          activityLog: appendLog(prev, actorName(), modeLabel),
        };
      }),

    clearSeating: () =>
      mutate((prev) => ({
        ...prev,
        seating: { ...prev.seating, seats: {}, updatedAt: new Date().toISOString() },
        activityLog: appendLog(prev, actorName(), 'Xoá trắng sơ đồ chỗ ngồi'),
      })),

    /* ---------- Data Management ---------- */

    importStateJson: (raw: string): boolean => {
      try {
        const parsed = JSON.parse(raw) as Partial<PersistedState> | null;
        if (!parsed || !Array.isArray(parsed.students) || !Array.isArray(parsed.entries)) {
          return false;
        }
        const hydrated = hydrateState({ ...parsed, version: 1 });
        mutate(() => hydrated);
        return true;
      } catch {
        return false;
      }
    },

    resetDemoData: () => mutate(() => freshState()),

    clearAll: () =>
      mutate((prev) => ({
        ...prev,
        students: [],
        entries: [],
        attendance: {},
        fundPaid: {},
        kudos: [],
        seating: { ...prev.seating, seats: {}, updatedAt: new Date().toISOString() },
        currentStudentId: null,
      })),
  };
}
