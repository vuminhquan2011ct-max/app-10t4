/**
 * Seed defaults for the extended classroom utilities (announcements, fund,
 * timetable, duty roster) plus quick achievement templates.
 */

import { createId } from '@/lib/utils';
import type {
  Announcement,
  ClassResource,
  ClassTask,
  DutyRoster,
  EntryCategory,
  EntryKind,
  EntryLevel,
  FeedbackItem,
  FundTransaction,
  KudosItem,
  Poll,
  ScheduleSlot,
  SeatingPlan,
  Student,
} from '@/types/models';

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function isoOffset(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const DEFAULT_DUTY_ROSTER: DutyRoster = {
  '2': 'Tổ 1',
  '3': 'Tổ 2',
  '4': 'Tổ 3',
  '5': 'Tổ 4',
  '6': 'Tổ 1',
  '7': 'Tổ 2',
};

export const DEFAULT_FUND_CYCLE_LABEL = 'Quỹ học kỳ I · 2026';
export const DEFAULT_FUND_CYCLE_AMOUNT = 100_000;

export function buildInitialAnnouncements(teacherName = 'Ngô Vũ Hảo'): Announcement[] {
  const now = new Date().toISOString();
  return [
    {
      id: createId('ann'),
      title: 'Chào mừng đến với Ứng dụng Quản lý Lớp 10T4',
      content:
        'Các bạn nhớ cập nhật thành tích, điểm danh nhận Xu & làm Nhiệm vụ mỗi ngày để mở khóa bộ Sticker Hiếm - Thần Thoại 10T4 nhé!',
      tag: 'important',
      eventDate: isoOffset(1),
      pinned: true,
      likes: 14,
      author: teacherName,
      authorRole: 'teacher',
      createdAt: now,
    },
    {
      id: createId('ann'),
      title: 'Dặn dò ôn tập kiểm tra 15 phút Hàm số bậc hai',
      content:
        'Các em lớp 10T4 ôn kỹ phần đỉnh parabol, trục đối xứng và bài tập ứng dụng thực tế trang 42–45 SGK. Chuẩn bị đầy đủ máy tính cầm tay cho tiết Toán thứ 4 nhé!',
      tag: 'subject',
      eventDate: isoOffset(3),
      pinned: false,
      likes: 11,
      author: 'Cô Nguyễn Minh Anh',
      subject: 'Toán học',
      authorRole: 'subject_teacher',
      createdAt: now,
    },
    {
      id: createId('ann'),
      title: 'Lịch nộp sản phẩm dự án Mini-Python & AI',
      content:
        'Mỗi nhóm hoàn thiện slide demo và mã nguồn Python trước tiết Lab thứ 4. Nhóm nào sáng tạo và trình bày tốt sẽ được cộng điểm thưởng trực tiếp vào cột thực hành!',
      tag: 'subject',
      eventDate: isoOffset(5),
      pinned: false,
      likes: 8,
      author: 'Thầy Trần Hoàng Nam',
      subject: 'Tin học & AI',
      authorRole: 'subject_teacher',
      createdAt: now,
    },
    {
      id: createId('ann'),
      title: 'Chuẩn bị tiết mục văn nghệ & làm báo tường',
      content:
        'Các tổ tập hợp ý tưởng và phân công tập luyện sau giờ học chiều thứ 4 tại phòng sinh hoạt chung. Bạn nào tham gia nhớ ghi hoạt động để được cộng điểm thi đua.',
      tag: 'event',
      eventDate: isoOffset(7),
      pinned: false,
      likes: 9,
      author: teacherName,
      authorRole: 'teacher',
      createdAt: now,
    },
    {
      id: createId('ann'),
      title: 'Ôn tập kiểm tra giữa kỳ môn Toán & Tin học',
      content:
        'Lớp phó học tập sẽ tổng hợp bộ đề cương ôn tập trong tuần này. Khuyến khích các nhóm học tập hỗ trợ nhau trước kỳ kiểm tra.',
      tag: 'exam',
      eventDate: isoOffset(12),
      pinned: false,
      likes: 7,
      author: teacherName,
      authorRole: 'teacher',
      createdAt: now,
    },
  ];
}

export function buildInitialFund(): FundTransaction[] {
  const now = new Date().toISOString();
  return [
    {
      id: createId('fnd'),
      title: 'Thu quỹ lớp đầu học kỳ',
      kind: 'income',
      category: 'dues',
      amount: 1_500_000,
      date: isoOffset(-14),
      note: 'Đợt thu đầu năm học 2026 - 2027',
      createdAt: now,
    },
    {
      id: createId('fnd'),
      title: 'Photo đề cương ôn tập giữa kỳ',
      kind: 'expense',
      category: 'printing',
      amount: 185_000,
      date: isoOffset(-6),
      note: 'Tài liệu môn Toán, Văn, Anh cho cả lớp',
      createdAt: now,
    },
    {
      id: createId('fnd'),
      title: 'Mua vật dụng trang trí bảng tin lớp',
      kind: 'expense',
      category: 'supplies',
      amount: 240_000,
      date: isoOffset(-3),
      note: 'Giấy màu, bút dạ, khung ảnh kỷ niệm 10T4',
      createdAt: now,
    },
    {
      id: createId('fnd'),
      title: 'Thưởng phong trào thi đua tháng',
      kind: 'income',
      category: 'activity',
      amount: 300_000,
      date: isoOffset(-1),
      note: 'Giải thưởng thi đua nền nếp từ Đoàn trường',
      createdAt: now,
    },
  ];
}

export function buildInitialSchedule(): ScheduleSlot[] {
  const slots: Omit<ScheduleSlot, 'id'>[] = [
    // Thứ 2
    { day: 2, period: 1, session: 'morning', subject: 'Chào cờ & Sinh hoạt đầu tuần', room: 'Sân trường' },
    { day: 2, period: 2, session: 'morning', subject: 'Toán học', room: 'P.304' },
    { day: 2, period: 3, session: 'morning', subject: 'Toán học', room: 'P.304' },
    { day: 2, period: 4, session: 'morning', subject: 'Tiếng Anh', room: 'P.304' },
    { day: 2, period: 5, session: 'afternoon', subject: 'Tin học & Lập trình', room: 'Lab 02' },
    { day: 2, period: 6, session: 'afternoon', subject: 'Vovinam / GDTC', room: 'Nhà thi đấu' },
    // Thứ 3
    { day: 3, period: 1, session: 'morning', subject: 'Ngữ văn', room: 'P.304' },
    { day: 3, period: 2, session: 'morning', subject: 'Ngữ văn', room: 'P.304' },
    { day: 3, period: 3, session: 'morning', subject: 'Vật lý', room: 'P.304' },
    { day: 3, period: 4, session: 'morning', subject: 'Hóa học', room: 'P.304' },
    { day: 3, period: 5, session: 'afternoon', subject: 'Tiếng Anh giao tiếp', room: 'P.304' },
    // Thứ 4
    { day: 4, period: 1, session: 'morning', subject: 'Toán học', room: 'P.304' },
    { day: 4, period: 2, session: 'morning', subject: 'Tin học & AI', room: 'Lab 02' },
    { day: 4, period: 3, session: 'morning', subject: 'Lịch sử', room: 'P.304' },
    { day: 4, period: 4, session: 'morning', subject: 'Địa lý', room: 'P.304' },
    { day: 4, period: 5, session: 'afternoon', subject: 'STEM & Dự án lớp', room: 'Maker Space' },
    // Thứ 5
    { day: 5, period: 1, session: 'morning', subject: 'Tiếng Anh', room: 'P.304' },
    { day: 5, period: 2, session: 'morning', subject: 'Tiếng Anh', room: 'P.304' },
    { day: 5, period: 3, session: 'morning', subject: 'Vật lý', room: 'Lab Lý' },
    { day: 5, period: 4, session: 'morning', subject: 'GDKT & Pháp luật', room: 'P.304' },
    { day: 5, period: 5, session: 'afternoon', subject: 'Âm nhạc / Nhạc cụ dân tộc', room: 'P.Nghệ thuật' },
    // Thứ 6
    { day: 6, period: 1, session: 'morning', subject: 'Toán học', room: 'P.304' },
    { day: 6, period: 2, session: 'morning', subject: 'Ngữ văn', room: 'P.304' },
    { day: 6, period: 3, session: 'morning', subject: 'Hóa học', room: 'Lab Hóa' },
    { day: 6, period: 4, session: 'morning', subject: 'Sinh hoạt lớp 10T4', teacher: 'Ngô Vũ Hảo', room: 'P.304' },
    { day: 6, period: 5, session: 'afternoon', subject: 'Câu lạc bộ tự chọn', room: 'Khuôn viên trường' },
    // Thứ 7
    { day: 7, period: 1, session: 'morning', subject: 'Tự học / Bồi dưỡng đội tuyển', room: 'Thư viện' },
    { day: 7, period: 2, session: 'morning', subject: 'Hoạt động trải nghiệm & Kỹ năng', room: 'Hội trường' },
  ];

  return slots.map((slot, index) => ({ ...slot, id: `sch_init_${index + 1}` }));
}

export type EntryTemplate = {
  label: string;
  title: string;
  kind: EntryKind;
  category: EntryCategory;
  level: EntryLevel;
  points: number;
};

/** One-tap presets shown in the entry form and quick-reward bar. */
export const ENTRY_TEMPLATES: EntryTemplate[] = [
  {
    label: 'Phát biểu tốt (+1)',
    title: 'Tích cực phát biểu xây dựng bài',
    kind: 'activity',
    category: 'study',
    level: 'class',
    points: 1,
  },
  {
    label: 'Điểm 10 (+2)',
    title: 'Đạt điểm 10 kiểm tra trên lớp',
    kind: 'achievement',
    category: 'study',
    level: 'class',
    points: 2,
  },
  {
    label: 'Trực nhật tốt (+1)',
    title: 'Hoàn thành xuất sắc nhiệm vụ trực nhật',
    kind: 'activity',
    category: 'volunteer',
    level: 'class',
    points: 1,
  },
  {
    label: 'Giúp bạn học (+2)',
    title: 'Hỗ trợ bạn cùng lớp ôn tập hiệu quả',
    kind: 'activity',
    category: 'skill',
    level: 'class',
    points: 2,
  },
  {
    label: 'Văn nghệ / CLB (+3)',
    title: 'Tham gia biểu diễn văn nghệ & hoạt động CLB',
    kind: 'activity',
    category: 'art',
    level: 'school',
    points: 3,
  },
  {
    label: 'Giải cấp trường (+5)',
    title: 'Đạt giải thi đua học thuật / thể thao cấp trường',
    kind: 'achievement',
    category: 'sport',
    level: 'school',
    points: 5,
  },
];

export function buildInitialPolls(teacherName = 'Ngô Vũ Hảo'): Poll[] {
  const now = new Date().toISOString();
  return [
    {
      id: createId('pol'),
      question: 'Chọn hoạt động ngoại khóa cuối kỳ cho lớp 10T4?',
      description: 'Mỗi thành viên bỏ 1 phiếu để ban cán sự chốt kế hoạch sớm.',
      options: [
        { id: 'opt_1', label: 'Dã ngoại & Team Building công viên' },
        { id: 'opt_2', label: 'Giải thể thao giao hữu + Liên hoan' },
        { id: 'opt_3', label: 'Workshop STEM & Xem phim cùng lớp' },
      ],
      votes: {},
      closed: false,
      deadline: isoOffset(10),
      author: teacherName,
      createdAt: now,
    },
    {
      id: createId('pol'),
      question: 'Khung giờ học nhóm ôn tập Toán & Tin học?',
      description: 'Đội ngũ học sinh khá giỏi sẽ hỗ trợ giải đề cương.',
      options: [
        { id: 'opt_a', label: 'Chiều Thứ 4 (16:30 – 18:00)' },
        { id: 'opt_b', label: 'Sáng Thứ 7 (08:30 – 10:30)' },
        { id: 'opt_c', label: 'Học online tối Chủ nhật' },
      ],
      votes: {},
      closed: false,
      deadline: isoOffset(5),
      author: teacherName,
      createdAt: now,
    },
  ];
}

export function buildInitialTasks(teacherName = 'Ngô Vũ Hảo'): ClassTask[] {
  const now = new Date().toISOString();
  return [
    {
      id: createId('tsk'),
      title: 'Hoàn thành bộ bài tập ôn tập Hàm số & Đồ thị',
      subject: 'Toán học',
      dueDate: isoOffset(2),
      priority: 'high',
      note: 'Nộp vở bài tập đầu giờ tiết 2 cho tổ trưởng kiểm tra.',
      author: teacherName,
      createdAt: now,
    },
    {
      id: createId('tsk'),
      title: 'Chuẩn bị slide thuyết trình dự án nhóm STEM',
      subject: 'Tin học & AI',
      dueDate: isoOffset(5),
      priority: 'medium',
      note: 'Mỗi tổ gửi link slide trước 20h ngày hôm trước.',
      author: teacherName,
      createdAt: now,
    },
    {
      id: createId('tsk'),
      title: 'Đăng ký tiết mục văn nghệ chào mừng sự kiện trường',
      subject: 'Hoạt động lớp',
      dueDate: isoOffset(8),
      priority: 'low',
      note: 'Liên hệ lớp phó văn thể để ghép nhóm luyện tập.',
      author: teacherName,
      createdAt: now,
    },
  ];
}

export function buildInitialFeedback(): FeedbackItem[] {
  const now = new Date().toISOString();
  return [
    {
      id: createId('fbk'),
      authorId: 'demo',
      authorName: 'Ẩn danh',
      anonymous: true,
      category: 'suggestion',
      content: 'Em đề xuất lớp mình lập thêm góc chia sẻ đề cương ôn thi theo từng môn để các bạn dễ tra cứu ạ!',
      reply: 'Ý tưởng rất hay! Thầy đã ra mắt Kho Tài liệu & Đề cương 10T4 rồi nhé.',
      resolved: true,
      createdAt: now,
    },
  ];
}

export function buildInitialKudos(students: Student[], teacherName = 'Ngô Vũ Hảo'): KudosItem[] {
  const now = new Date().toISOString();
  const first = students[0];
  if (!first) return [];
  return [
    {
      id: createId('kud'),
      toStudentId: first.id,
      fromName: teacherName,
      anonymous: false,
      sticker: 'team_carry',
      message: `Cảm ơn ${first.name} luôn chủ động hỗ trợ các bạn trong tổ và giữ tinh thần cực kỳ tích cực cho lớp 10T4!`,
      claps: 12,
      createdAt: now,
    },
  ];
}

export function buildInitialResources(teacherName = 'Ngô Vũ Hảo'): ClassResource[] {
  const now = new Date().toISOString();
  return [
    {
      id: createId('res'),
      title: 'Đề cương ôn tập Giữa kỳ — Hàm số, Mệnh đề & Tập hợp',
      subject: 'Toán học',
      type: 'outline',
      url: 'https://toanmath.com',
      description: 'Tổng hợp công thức cốt lõi và 30 bài tập tự luận + trắc nghiệm chuẩn chương trình mới.',
      pinned: true,
      author: teacherName,
      createdAt: now,
    },
    {
      id: createId('res'),
      title: 'Bộ Slide Nhập môn Python & Tư duy AI ứng dụng',
      subject: 'Tin học & AI',
      type: 'slide',
      url: 'https://docs.python.org/3/tutorial/',
      description: 'Tài liệu nền tảng cho dự án STEM & CLB Lập trình THPT FPT.',
      pinned: true,
      author: teacherName,
      createdAt: now,
    },
    {
      id: createId('res'),
      title: '300 Từ vựng & Ngữ pháp trọng tâm Tiếng Anh 10',
      subject: 'Tiếng Anh',
      type: 'exercise',
      url: 'https://dictionary.cambridge.org',
      description: 'Kèm ví dụ thực tế cho phần Reading & Speaking trên lớp.',
      pinned: false,
      author: 'Ban cán sự 10T4',
      createdAt: now,
    },
  ];
}

export function buildInitialSeating(students: Student[]): SeatingPlan {
  const cols = 4;
  const rows = Math.max(5, Math.ceil(students.length / cols));
  const seats: Record<string, string> = {};
  students.forEach((student, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    seats[`${r}-${c}`] = student.id;
  });
  return {
    rows,
    cols,
    seats,
    updatedAt: new Date().toISOString(),
  };
}


