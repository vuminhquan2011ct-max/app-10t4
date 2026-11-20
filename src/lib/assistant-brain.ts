/**
 * Conversational Assistant & Tour Guide Brain for Class 10T4.
 *
 * Extends `answerClassQuery` with:
 *  - Live App Control commands (change theme, ambient effects, mascot, start guided tour)
 *  - Copy-ready Zalo message drafting (duty reminder, fund reminder, weekly summary, kudos wishes)
 *  - Step-by-step How-To guides for app features
 *  - Mascot-flavored motivation, study tips, jokes, and classroom icebreakers
 */

import {
  MASCOTS,
  type AmbientEffect,
  type CardVisualStyle,
  type MascotId,
  type MascotMood,
} from '@/constants/decor-meta';
import type { AccentKey, ThemeMode } from '@/constants/theme';
import { formatVnd } from '@/lib/export';
import {
  answerClassQuery,
  computeClassHealth,
  stripVietnamese,
  type CopilotReply,
  type IntelligenceContext,
} from '@/lib/intelligence';

export type AssistantCommand =
  | { type: 'mode'; mode: ThemeMode }
  | { type: 'accent'; accent: AccentKey }
  | { type: 'effect'; effect: AmbientEffect }
  | { type: 'card-style'; cardStyle: CardVisualStyle }
  | { type: 'combo'; comboId: string }
  | { type: 'mascot'; mascotId: MascotId }
  | { type: 'start-tour' }
  | { type: 'celebrate' };

export type AssistantResponse = CopilotReply & {
  mood: MascotMood;
  commands?: AssistantCommand[];
  copyText?: string;
  copyLabel?: string;
};

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function answerAssistantMessage(
  rawQuery: string,
  ctx: IntelligenceContext,
  mascotId: MascotId,
): AssistantResponse {
  const q = stripVietnamese(rawQuery);
  const mascot = MASCOTS[mascotId] ?? MASCOTS.foxy;

  // 1. Start Interactive Tour
  if (
    q.includes('bat dau tour') ||
    q.includes('tham quan') ||
    q.includes('gioi thieu app') ||
    q.includes('huong dan toan app') ||
    q === 'tour'
  ) {
    return {
      title: 'Khởi động Tour Hướng dẫn viên 7 bước! 🧭',
      badge: mascot.name,
      summary: `${mascot.name} sẽ trực tiếp dẫn bạn đi dạo qua từng khu vực xịn nhất của App 10T4 nhé!`,
      bullets: [
        'Đi trọn 7 trạm từ Tổng quan, Tiện ích đến Studio Trang trí & Góc Sáng tạo.',
        'Hoàn thành Tour sẽ mở khóa ngay Sticker độc quyền "Nhà Thám Hiểm" 🧭!',
      ],
      mood: 'celebrating',
      commands: [{ type: 'start-tour' }],
    };
  }

  // 2. Live Mascot Switch Commands
  if (
    (q.includes('doi sang') || q.includes('chon tro ly') || q.includes('goi ')) &&
    (q.includes('mochi') || q.includes('nova') || q.includes('hoo') || q.includes('foxy'))
  ) {
    const target: MascotId = q.includes('mochi')
      ? 'mochi'
      : q.includes('nova')
        ? 'nova'
        : q.includes('hoo')
          ? 'hoo'
          : 'foxy';
    const nextM = MASCOTS[target];
    return {
      title: `Xin chào! ${nextM.name} đã có mặt ${nextM.emoji}`,
      badge: nextM.roleTitle,
      summary: nextM.greetings[0],
      bullets: [nextM.tagline, 'Bạn có thể đổi linh vật bất cứ lúc nào trong Studio hoặc ngay tại đây!'],
      mood: 'celebrating',
      commands: [{ type: 'mascot', mascotId: target }, { type: 'celebrate' }],
    };
  }

  // 3. Live Ambient Effects & Theme Commands
  if (q.includes('hoa anh dao') || q.includes('sakura')) {
    return {
      title: 'Đã bật phong cách Mùa Hoa Anh Đào! 🌸',
      badge: 'Trang trí tức thì',
      summary: 'Mình vừa rắc những cánh hoa anh đào rơi nhẹ và phủ sắc hồng ngọt ngào lên app cho bạn rồi đó!',
      bullets: [
        'Hiệu ứng: Cánh hoa anh đào rơi nhẹ 🌸',
        'Bảng màu: Hoa Anh Đào (Sakura) + Thẻ Kính mờ Glass',
      ],
      mood: 'celebrating',
      commands: [{ type: 'combo', comboId: 'sakura-dream' }],
      actionLabel: 'Mở Studio Trang trí',
      actionRoute: '/studio',
    };
  }

  if (q.includes('tuyet roi') || q.includes('mua dong') || q.includes('snow')) {
    return {
      title: 'Đã bật hiệu ứng Tuyết rơi lung linh! ❄️',
      badge: 'Hiệu ứng bay',
      summary: 'Không khí mùa đông cực chill đã xuất hiện trên mọi màn hình của bạn!',
      bullets: ['Bạn có thể đổi thêm nền Sóng mềm hoặc màu Cực quang trong Studio Trang trí nhé.'],
      mood: 'excited',
      commands: [{ type: 'effect', effect: 'snow' }],
      actionLabel: 'Tùy chỉnh thêm',
      actionRoute: '/studio',
    };
  }

  if (q.includes('dom dom') || q.includes('firefl')) {
    return {
      title: 'Đã thắp sáng đàn Đom đóm huyền ảo! 🌟',
      badge: 'Hiệu ứng bay',
      summary: 'Những đốm sáng đom đóm lấp lánh sẽ bay nhẹ nhàng khi bạn học bài buổi tối.',
      bullets: ['Kết hợp với Chế độ Tối (Dark Mode) sẽ siêu đẹp luôn!'],
      mood: 'excited',
      commands: [{ type: 'effect', effect: 'fireflies' }],
      actionLabel: 'Mở Studio Trang trí',
      actionRoute: '/studio',
    };
  }

  if (q.includes('kim tuyen') || q.includes('lap lanh') || q.includes('sparkle')) {
    return {
      title: 'Đã bật hiệu ứng Kim tuyến lấp lánh! ✨',
      badge: 'Hiệu ứng bay',
      summary: 'Màn hình của bạn đã ngập tràn ánh sao kim tuyến cực xịn!',
      bullets: ['Mẹo: Nói "Tắt hiệu ứng" bất cứ lúc nào nếu bạn muốn giao diện tối giản lại.'],
      mood: 'celebrating',
      commands: [{ type: 'effect', effect: 'sparkles' }],
    };
  }

  if (q.includes('phao giay') || q.includes('le hoi') || q.includes('confetti')) {
    return {
      title: 'Lên nhạc nào! Đã bật chế độ Lễ hội 🎊',
      badge: 'Party Mode',
      summary: 'Pháo giấy rực rỡ sắc màu cho một ngày thật vui tại lớp 10T4!',
      bullets: ['Chúc cả lớp hôm nay thật nhiều điểm 10 và lời khen Kudos!'],
      mood: 'celebrating',
      commands: [{ type: 'effect', effect: 'confetti' }, { type: 'celebrate' }],
    };
  }

  if (q.includes('tat hieu ung') || q.includes('khong roi') || q.includes('tat hat')) {
    return {
      title: 'Đã tắt hiệu ứng hạt bay',
      badge: 'Tối giản',
      summary: 'Giao diện đã quay về trạng thái gọn nhẹ, tiết kiệm pin tối đa.',
      bullets: ['Khi nào thích không khí mới, chỉ cần nhắn "Bật hoa anh đào" hoặc "Bật tuyết rơi" nhé!'],
      mood: 'happy',
      commands: [{ type: 'effect', effect: 'none' }],
    };
  }

  if (
    q.includes('che do toi') ||
    q.includes('giao dien toi') ||
    q.includes('dark mode') ||
    q.includes('neon') ||
    q.includes('cyber')
  ) {
    const isNeon = q.includes('neon') || q.includes('cyber');
    return {
      title: isNeon ? 'Kích hoạt Neon Galaxy Cyber! ⚡' : 'Đã chuyển sang Chế độ Tối 🌙',
      badge: isNeon ? 'Tech Combo' : 'Dark Mode',
      summary: isNeon
        ? 'Mình đã bật chế độ tối Cyber với viền Neon phát sáng và bầu trời đom đóm siêu ngầu!'
        : 'Chế độ tối giúp dịu mắt hơn khi ôn bài buổi tối đó bạn!',
      bullets: ['Bạn có thể đổi lại Chế độ Sáng bất kỳ lúc nào chỉ bằng 1 câu nhắn.'],
      mood: 'excited',
      commands: isNeon ? [{ type: 'combo', comboId: 'cyber-galaxy' }] : [{ type: 'mode', mode: 'dark' }],
    };
  }

  if (q.includes('che do sang') || q.includes('giao dien sang') || q.includes('light mode')) {
    return {
      title: 'Đã chuyển sang Chế độ Sáng ☀️',
      badge: 'Light Mode',
      summary: 'Giao diện sáng rực rỡ, rõ nét đã sẵn sàng cho ngày học mới!',
      bullets: ['Thử kết hợp với họa tiết Kẻ ô vở hoặc Chấm bi trong Studio nhé.'],
      mood: 'happy',
      commands: [{ type: 'mode', mode: 'light' }],
    };
  }

  if (q.includes('matcha') || q.includes('so tay') || q.includes('hoc ba')) {
    return {
      title: 'Đã bật chủ đề Sổ Tay Matcha Học Bá! 📓',
      badge: 'Study Combo',
      summary: 'Tông xanh Matcha dịu mắt kèm giấy kẻ ô vở giúp tăng sự tập trung tối đa!',
      bullets: ['Kết hợp với Phòng Tập trung Pomodoro để ôn thi cực hiệu quả nhé!'],
      mood: 'happy',
      commands: [{ type: 'combo', comboId: 'study-notebook' }],
      actionLabel: 'Vào Phòng Tập trung',
      actionRoute: '/focus',
    };
  }

  if (q.includes('fpt cam') || q.includes('mau cam') || q.includes('cam fpt')) {
    return {
      title: 'Lên màu FPT Cam cháy rực! 🦊🔥',
      badge: 'Đặc trưng 10T4',
      summary: 'Đúng chuẩn tinh thần K8T4 THPT FPT — năng động, nổi bật và đầy nhiệt huyết!',
      bullets: ['Màu chủ đạo, khung avatar và sticker Cáo 10T4 đã sẵn sàng.'],
      mood: 'celebrating',
      commands: [{ type: 'combo', comboId: 'fpt-vibe' }],
    };
  }

  // 4. Ready-to-Copy Zalo Drafts
  if (q.includes('soan') && (q.includes('truc nhat') || q.includes('lich'))) {
    const draft = [
      `📢 NHẮC LỊCH TRỰC NHẬT LỚP ${ctx.classInfo.name}`,
      `Chào cả lớp! Hôm nay đến lượt ${ctx.todayDutyGroup} trực nhật nhé 🧹✨`,
      `Các bạn nhớ đến sớm 10 phút để lau bảng, quét lớp và sắp xếp bàn ghế gọn gàng nha.`,
      `Chúc lớp ${ctx.classInfo.name} một ngày học tập thật năng lượng! 💪`,
    ].join('\n');
    return {
      title: 'Mẫu tin nhắn nhắc trực nhật Zalo 🧹',
      badge: ctx.todayDutyGroup,
      summary: 'Mình đã soạn sẵn nội dung gọn gàng, lịch sự — bạn chỉ cần bấm Sao chép rồi dán vào nhóm lớp!',
      bullets: draft.split('\n'),
      mood: 'happy',
      copyText: draft,
      copyLabel: 'Sao chép gửi Zalo',
      actionLabel: 'Xem TKB & Trực nhật',
      actionRoute: '/schedule',
    };
  }

  if (q.includes('soan') && (q.includes('quy') || q.includes('dong tien'))) {
    const unpaid = ctx.students.filter((s) => !ctx.fundPaid[s.id]);
    const draft = [
      `💰 THÔNG BÁO QUỸ LỚP ${ctx.classInfo.name}`,
      `Hiện tại đã có ${ctx.fundSummary.paidCount}/${ctx.students.length} bạn hoàn thành đóng quỹ (Số dư hiện tại: ${formatVnd(ctx.fundSummary.balance)}).`,
      unpaid.length > 0
        ? `Còn ${unpaid.length} bạn chưa đóng — các bạn nhớ hoàn tất trong tuần này để thủ quỹ chốt sổ minh bạch nhé!`
        : `Tuyệt vời! Cả lớp đã hoàn thành 100% quỹ học kỳ rồi! 🎉`,
      `Cảm ơn cả nhà rất nhiều 💖`,
    ].join('\n');
    return {
      title: 'Mẫu thông báo đóng Quỹ lớp 💰',
      badge: `${ctx.fundSummary.paidCount}/${ctx.students.length} đã đóng`,
      summary: 'Tin nhắn nhẹ nhàng, rõ ràng dựa theo số liệu quỹ thực tế của lớp:',
      bullets: draft.split('\n'),
      mood: 'happy',
      copyText: draft,
      copyLabel: 'Sao chép gửi Zalo',
      actionLabel: 'Mở Quỹ lớp',
      actionRoute: '/fund',
    };
  }

  if (q.includes('soan') && (q.includes('tong ket') || q.includes('bao cao') || q.includes('tuan'))) {
    const health = computeClassHealth(ctx);
    const top3 = ctx.ranking.slice(0, 3);
    const draft = [
      `🌟 TỔNG KẾT PHONG ĐỘ LỚP ${ctx.classInfo.name} (${ctx.classInfo.school})`,
      `• Chỉ số sức khỏe lớp: Hạng ${health.grade} (${health.score}/100 điểm)`,
      `• Tổng điểm thi đua: ${ctx.totals.points}/${ctx.classInfo.goalPoints ?? 200} điểm · Chuỗi hoạt động ${ctx.classStreak} ngày 🔥`,
      top3.length > 0
        ? `• Top 3 dẫn đầu: ${top3.map((r) => `#${r.rank} ${r.student.name} (${r.points}đ)`).join(' · ')}`
        : `• Hãy tiếp tục ghi nhận thành tích mới trong tuần tới nhé!`,
      `• Quỹ lớp hiện tại: ${formatVnd(ctx.fundSummary.balance)}`,
      `Chúc cả lớp và quý phụ huynh cuối tuần thật nhiều niềm vui! 💙`,
    ].join('\n');
    return {
      title: 'Bản tin Tổng kết Tuần sẵn sàng gửi Zalo 📋',
      badge: `Hạng ${health.grade}`,
      summary: 'Đã tổng hợp tự động số liệu mới nhất của lớp:',
      bullets: draft.split('\n'),
      mood: 'celebrating',
      copyText: draft,
      copyLabel: 'Sao chép báo cáo',
    };
  }

  if (q.includes('goi y loi khen') || q.includes('viet loi chuc') || q.includes('loi khen hay')) {
    const sample =
      'Cảm ơn bạn đã luôn nhiệt tình giúp đỡ mình trong giờ học hôm nay! Năng lượng tích cực của bạn làm lớp 10T4 vui lên rất nhiều 💖✨';
    return {
      title: '3 gợi ý lời khen Kudos siêu ấm áp 💖',
      badge: 'Bức tường Kudos',
      summary: 'Chọn một câu hoặc sửa thêm tên bạn bè để gửi ngay nhé:',
      bullets: [
        '“Cảm ơn bạn đã giảng lại bài cực dễ hiểu — cứu tinh deadline của mình hôm nay!”',
        '“Ngưỡng mộ tinh thần gánh team cực đỉnh của bạn trong buổi thuyết trình vừa rồi 🚀”',
        '“Chúc bạn luôn giữ nụ cười rạng rỡ và mang thật nhiều tiếng cười cho lớp 10T4 nhé ☀️”',
      ],
      mood: 'happy',
      copyText: sample,
      copyLabel: 'Chép mẫu #1',
      actionLabel: 'Mở Bức tường Kudos',
      actionRoute: '/kudos',
    };
  }

  // 5. Feature How-To Guides
  if (q.includes('cach ') || q.includes('lam sao') || q.includes('huong dan') || q.includes('phim tat')) {
    if (q.includes('ghim bang') || q.includes('sticker') || q.includes('thiep')) {
      return {
        title: 'Hướng dẫn dùng Bảng Sticker & Xưởng Thiệp ✂️',
        badge: 'Hướng dẫn',
        summary: 'Chỉ 3 bước cực dễ để trang trí góc sáng tạo riêng:',
        bullets: [
          'Bước 1: Mở "Góc Sáng Tạo" → chọn phông nền bảng (Bảng gỗ, Sổ tay, Ngân hà...).',
          'Bước 2: Chạm Sticker bên dưới để thả vào bảng, kéo di chuyển tự do và chạm vào sticker để phóng to / xoay.',
          'Bước 3: Bật nút "Ghim lên Trang chủ" để khoe bảng sáng tạo ngay ở màn hình chính!',
        ],
        mood: 'excited',
        actionLabel: 'Mở Góc Sáng tạo',
        actionRoute: '/creative',
      };
    }
    if (q.includes('trang tri') || q.includes('giao dien') || q.includes('hieu ung')) {
      return {
        title: 'Hướng dẫn Trang trí App xịn xò 🎨',
        badge: 'Hướng dẫn',
        summary: 'Mọi tùy biến đều hiển thị trực tiếp trên toàn bộ app:',
        bullets: [
          'Vào "Studio Trang Trí App" để chọn 1 trong 5 Gói Phong Cách 1 chạm.',
          'Tự do phối 10 bảng màu, 6 họa tiết nền, 6 hiệu ứng bay, 5 kiểu thẻ và 7 khung Avatar.',
          'Hoặc đơn giản hơn: Nhắn trực tiếp cho mình "Bật hoa anh đào" hay "Bật tuyết rơi"!',
        ],
        mood: 'happy',
        actionLabel: 'Mở Studio Trang trí',
        actionRoute: '/studio',
      };
    }
    if (q.includes('nhieu hoc sinh') || q.includes('nhap nhanh') || q.includes('them hoc sinh')) {
      return {
        title: 'Cách thêm học sinh vào lớp 👥',
        badge: 'Mọi thành viên',
        summary: 'Cả GVCN và học sinh đều có thể thêm học sinh mới hoặc nhập nhanh cả danh sách:',
        bullets: [
          'Mở tab Học sinh → bấm "Thêm học sinh" để tạo từng hồ sơ hoặc "Nhập nhanh DS" để thêm nhiều bạn cùng lúc.',
          'Dán danh sách tên học sinh (mỗi dòng 1 tên từ Excel/Zalo).',
          'Hệ thống tự động tạo mã số 10T4 và chia đều vào 4 Tổ chỉ trong 1 giây!',
        ],
        mood: 'happy',
        actionLabel: 'Mở Thêm học sinh',
        actionRoute: '/student-form',
      };
    }
    if (q.includes('sao luu') || q.includes('backup') || q.includes('json')) {
      return {
        title: 'Hướng dẫn Sao lưu & Khôi phục dữ liệu 🔒',
        badge: 'An toàn dữ liệu',
        summary: 'Dữ liệu lớp vừa đồng bộ Cloud vừa có thể xuất file JSON dự phòng:',
        bullets: [
          'Mở tab Cài đặt → kéo xuống mục "Báo cáo & Sao lưu dữ liệu".',
          'Bấm "Sao lưu JSON" để tải xuống hoặc sao chép toàn bộ dữ liệu lớp.',
          'Khi cần khôi phục, GVCN chỉ cần dán nội dung JSON vào khung Khôi phục là xong!',
        ],
        mood: 'happy',
        actionLabel: 'Mở Cài đặt',
        actionRoute: '/settings',
      };
    }
    if (q.includes('phim tat') || q.includes('tim nhanh')) {
      return {
        title: 'Mẹo dùng Tìm kiếm nhanh (Spotlight) ⚡',
        badge: 'Pro Tip',
        summary: 'Nhảy tới bất kỳ học sinh hoặc tiện ích nào trong 1 giây:',
        bullets: [
          'Trên máy tính/Web: Nhấn tổ hợp phím Ctrl + K (hoặc ⌘ + K trên Mac).',
          'Trên điện thoại: Chạm thanh tìm kiếm ngay đầu Trang Tổng quan.',
          'Hỗ trợ tìm tiếng Việt không dấu (ví dụ gõ "so do", "quy lop" hoặc tên học sinh).',
        ],
        mood: 'excited',
      };
    }
  }

  // 6. Classroom Icebreakers & Study Tips & Motivation & Jokes
  if (q.includes('tro choi') || q.includes('khoi dong') || q.includes('icebreaker')) {
    return {
      title: '3 Mini-game khuấy động lớp 10T4 siêu vui 🎮',
      badge: 'Hoạt náo',
      summary: 'Kết hợp ngay các công cụ có sẵn trên App 10T4 để cả lớp bùng nổ tiếng cười:',
      bullets: [
        '1. "Vòng quay Nhân phẩm": Mở Gọi tên ngẫu nhiên, quay trúng bạn nào sẽ trả lời nhanh 1 câu đố vui trong 15 giây (cộng ngay +2 điểm!).',
        '2. "Đấu trí 5 phút": Chia 4 nhóm bằng tính năng Chia nhóm + bật đồng hồ Thảo luận 5p trong Phòng Tập trung.',
        '3. "Cơn mưa Kudos": Mỗi bạn gửi 1 thiệp Kudos ẩn danh cho bạn ngồi bàn trên — đọc to 3 thiệp hài hước nhất!',
      ],
      mood: 'celebrating',
      actionLabel: 'Mở Vòng quay Gọi tên',
      actionRoute: '/randomizer',
    };
  }

  if (q.includes('meo on thi') || q.includes('hoc hieu qua') || q.includes('bi kip')) {
    return {
      title: '4 Bí kíp ôn thi điểm cao chuẩn học bá 📚',
      badge: 'Study Hacks',
      summary: `${mascot.name} tổng hợp 4 phương pháp khoa học giúp nhớ lâu gấp đôi:`,
      bullets: [
        'Pomodoro 25/5: Bật Phòng Tập trung 25 phút không chạm điện thoại, sau đó nghỉ 5 phút cho não nạp lại.',
        'Active Recall: Gấp vở lại và tự viết ra 3 ý chính vừa học thay vì chỉ đọc lướt nhiều lần.',
        'Kỹ thuật Feynman: Giảng lại bài cho bạn cùng bàn — chỗ nào bạn thấy ngập ngừng chính là chỗ cần ôn thêm!',
        'Kiểm tra Kho Tài liệu & Đề cương 10T4 để không bỏ sót dạng bài quan trọng.',
      ],
      mood: 'happy',
      actionLabel: 'Vào Phòng Tập trung',
      actionRoute: '/focus',
    };
  }

  if (
    q.includes('dong luc') ||
    q.includes('co vu') ||
    q.includes('met') ||
    q.includes('buon') ||
    q.includes('ap luc') ||
    q.includes('cham chi')
  ) {
    return {
      title: `Gửi bạn liều Vitamin tích cực từ ${mascot.name} ${mascot.emoji}`,
      badge: 'Cố lên nhé!',
      summary: pickRandom(mascot.motivation),
      bullets: [
        'Uống một ngụm nước mát, thả lỏng vai trong 10 giây.',
        'Mọi nỗ lực nhỏ bé hôm nay đều đang xây nên phiên bản rực rỡ của bạn ngày mai ✨',
      ],
      mood: 'celebrating',
      commands: [{ type: 'celebrate' }],
    };
  }

  if (q.includes('chuyen vui') || q.includes('chuyen cuoi') || q.includes('hai huoc') || q.includes('giai tri')) {
    return {
      title: `Góc giải trí cùng ${mascot.name} 😄`,
      badge: 'Cười chút nào',
      summary: pickRandom(mascot.jokes),
      bullets: ['Cần thêm tiếng cười hoặc trò chơi đầu giờ thì cứ nhắn mình nhé!'],
      mood: 'excited',
    };
  }

  // 7. Quick navigation to Creative / Studio
  if (q.includes('studio') || q.includes('trang tri')) {
    return {
      title: 'Studio Trang Trí App 10T4 🎨',
      badge: 'Cá nhân hóa',
      summary: 'Biến hóa giao diện theo đúng cá tính của bạn với 10 bảng màu, họa tiết nền, hiệu ứng hạt bay và 4 linh vật!',
      bullets: [
        'Có sẵn 5 Gói Phong Cách 1 chạm cực đẹp.',
        'Hỗ trợ ghim tối đa 6 Sticker lên Trang Tổng quan.',
      ],
      mood: 'excited',
      actionLabel: 'Mở Studio Trang trí',
      actionRoute: '/studio',
    };
  }

  if (q.includes('sang tao') || q.includes('bang sticker') || q.includes('hop qua')) {
    return {
      title: 'Góc Sáng Tạo & Bộ Sưu Tập Sticker ✂️',
      badge: '24 mẫu độc quyền',
      summary: 'Kéo-thả dán Sticker, viết giấy nhớ, thiết kế Thiệp/Poster 10T4 và mở Hộp quà mỗi ngày!',
      bullets: [
        '24 mẫu Sticker vẽ tay độc quyền chia 4 bộ sưu tập.',
        'Xuất thiệp gửi thẳng sang Bức tường Kudos hoặc Zalo.',
      ],
      mood: 'excited',
      actionLabel: 'Mở Góc Sáng tạo',
      actionRoute: '/creative',
    };
  }

  // 8. Delegate to live Class Intelligence Engine
  const base = answerClassQuery(rawQuery, ctx);
  return {
    ...base,
    mood: 'happy',
  };
}
