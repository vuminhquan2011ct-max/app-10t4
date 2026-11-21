/**
 * Store actions backed by functional state updates so every action is stable,
 * concurrency-safe and React Compiler friendly.
 */

import { GROUP_PRESETS } from '@/constants/entry-meta';
import { formatDate, todayIso } from '@/lib/date';
import { createId, normalizeName } from '@/lib/utils';
import type { StudentPrivateData } from '@/types/auth';
import type {
  ActivityLogItem,
  Announcement,
  AttendanceStatus,
  ClassInfo,
  ClassResource,
  ClassTask,
  Entry,
  EntryCategory,
  EntryKind,
  EntryLevel,
  FeedbackItem,
  FundTransaction,
  KudosItem,
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
      mutate((prev) => ({
        ...prev,
        classInfo: { ...prev.classInfo, ...patch },
        activityLog: appendLog(prev, actorName(), 'Cập nhật thông tin lớp'),
      })),

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

    removeStudent: (id: string) =>
      mutate((prev) => {
        const target = prev.students.find((s) => s.id === id);
        const nextPaid = { ...prev.fundPaid };
        delete nextPaid[id];
        const nextSeats: Record<string, string> = {};
        for (const [key, sid] of Object.entries(prev.seating.seats)) {
          if (sid !== id) nextSeats[key] = sid;
        }
        return {
          ...prev,
          students: prev.students.filter((s) => s.id !== id),
          entries: prev.entries.filter((e) => e.studentId !== id),
          kudos: prev.kudos.filter((k) => k.toStudentId !== id),
          fundPaid: nextPaid,
          seating: { ...prev.seating, seats: nextSeats, updatedAt: new Date().toISOString() },
          currentStudentId: prev.currentStudentId === id ? null : prev.currentStudentId,
          activityLog: appendLog(prev, actorName(), `Xoá học sinh ${target?.name ?? ''}`.trim()),
        };
      }),

    addEntry: (input: EntryInput) => {
      const entry = buildEntry(input);
      mutate((prev) => ({
        ...prev,
        entries: [entry, ...prev.entries],
        activityLog: appendLog(
          prev,
          actorName(),
          `Ghi mục "${entry.title}" (+${entry.points}đ)`,
          actorStudentId(),
        ),
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
      mutate((prev) => ({
        ...prev,
        entries: prev.entries.filter((e) => e.id !== id),
        activityLog: appendLog(prev, actorName(), 'Xoá một mục thành tích'),
      })),

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

    addAnnouncement: (input: AnnouncementInput) =>
      mutate((prev) => {
        const cleanSubject = input.subject?.trim() || null;
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
          authorRole: input.authorRole ?? (cleanSubject ? 'subject_teacher' : 'teacher'),
          attachments: input.attachments && input.attachments.length > 0 ? input.attachments : undefined,
          createdAt: new Date().toISOString(),
        };
        const logPrefix = cleanSubject ? `GV ${cleanSubject} đăng thông báo` : 'Đăng thông báo';
        return {
          ...prev,
          announcements: [item, ...prev.announcements],
          activityLog: appendLog(prev, item.author, `${logPrefix} "${item.title}"`),
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
      mutate((prev) => ({
        ...prev,
        announcements: prev.announcements.filter((a) => a.id !== id),
      })),

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
      })),

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
      })),

    /* ---------- Class Tasks & Deadlines ---------- */

    addTask: (input: TaskInput) =>
      mutate((prev) => {
        const task: ClassTask = {
          id: createId('tsk'),
          title: input.title.trim(),
          subject: input.subject.trim() || 'Chung',
          dueDate: input.dueDate,
          priority: input.priority,
          note: input.note?.trim() || null,
          author: input.author?.trim() || actorName() || prev.classInfo.teacherName,
          attachments: input.attachments && input.attachments.length > 0 ? input.attachments : undefined,
          createdAt: new Date().toISOString(),
        };
        return {
          ...prev,
          tasks: [task, ...prev.tasks],
          activityLog: appendLog(prev, actorName(), `Giao nhiệm vụ "${task.title}"`),
        };
      }),

    removeTask: (taskId: string) =>
      mutate((prev) => ({
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== taskId),
      })),

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
      mutate((prev) => ({
        ...prev,
        resources: prev.resources.filter((r) => r.id !== id),
      })),

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
