/**
 * Interactive Guided Tour script, Page-Aware Contextual Manuals,
 * Feature Atlas, and Discovery Quests for the In-App Guide & Assistant.
 */

import type Ionicons from '@expo/vector-icons/Ionicons';

import type { MascotMood } from '@/constants/decor-meta';
import type { ThemeColor } from '@/constants/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

/* ---------- 7-Step Interactive Guided Tour ---------- */

export type TourStep = {
  id: string;
  route: string;
  title: string;
  badge: string;
  mood: MascotMood;
  description: string;
  teacherTip: string;
  studentTip: string;
  highlights: string[];
};

export const APP_TOUR_STEPS: TourStep[] = [
  {
    id: 'tour-home',
    route: '/',
    title: 'Trạm Chỉ Huy Lớp 10T4',
    badge: 'Bước 1/7 · Tổng quan',
    mood: 'waving',
    description:
      'Chào mừng bạn đến với Trang Tổng quan! Tại đây bạn xem ngay Tiết học đang diễn ra, Chỉ số Sức khoẻ lớp, Bảng xếp hạng Top 3, Sinh nhật sắp tới và Thanh truy cập nhanh 1 chạm.',
    teacherTip:
      'Mẹo GVCN: Chạm vào thanh Tìm kiếm (⌘K) để mở nhanh bất kỳ học sinh hay báo cáo Zalo nào trong 1 giây!',
    studentTip:
      'Mẹo Học sinh: Chạm vào từng sticker trên banner để thả hiệu ứng vui mắt và theo dõi hạng cá nhân của bạn!',
    highlights: ['Vòng tròn Sức khoẻ lớp', 'Thanh tiết học Live', 'Bục vinh quang Top 3'],
  },
  {
    id: 'tour-students',
    route: '/students',
    title: 'Danh Sách & Hồ Sơ Học Sinh',
    badge: 'Bước 2/7 · Học sinh',
    mood: 'happy',
    description:
      'Tra cứu toàn bộ thành viên lớp 10T4 theo Tổ, xem điểm thi đua, huy hiệu danh dự, vị trí chỗ ngồi và lời khen Kudos. Thông tin riêng tư (SĐT, Email) được bảo vệ nghiêm ngặt.',
    teacherTip:
      'Mẹo GVCN: Bạn có thể thêm nhanh cả lớp cùng lúc qua mục "Nhập nhanh cả lớp" hoặc chấm thưởng nhanh ngay trong hồ sơ!',
    studentTip:
      'Mẹo Học sinh: Bạn có thể bấm "Thêm học sinh" để thêm thành viên mới, hoặc chạm vào hồ sơ của mình để xem huy hiệu & cập nhật liên hệ bảo mật.',
    highlights: ['Lọc theo Tổ & tìm không dấu', 'Huy hiệu thành tích tự động', 'Bảo mật liên hệ RLS'],
  },
  {
    id: 'tour-feed',
    route: '/feed',
    title: 'Nhật Ký Thi Đua & Duyệt Điểm',
    badge: 'Bước 3/7 · Nhật ký',
    mood: 'excited',
    description:
      'Nơi lưu giữ mọi thành tích học tập, thể thao, văn nghệ và phong trào của lớp. Học sinh có thể tự gửi thành tích kèm link minh chứng để GVCN duyệt chỉ với 1 chạm.',
    teacherTip:
      'Mẹo GVCN: Nút "Duyệt hết" giúp xử lý toàn bộ mục chờ duyệt cùng lúc và cộng điểm ngay lập tức!',
    studentTip:
      'Mẹo Học sinh: Bấm "Ghi thành tích mới" để lưu lại giải thưởng hoặc hoạt động CLB của bạn nhé!',
    highlights: ['Ghi thành tích theo 6 lĩnh vực', 'Duyệt 1 chạm tức thì', 'Tự động tính chuỗi hoạt động'],
  },
  {
    id: 'tour-tools',
    route: '/tools',
    title: 'Hệ Sinh Thái 15+ Tiện Ích',
    badge: 'Bước 4/7 · Tiện ích',
    mood: 'happy',
    description:
      'Kho công cụ siêu đầy đủ: Sơ đồ chỗ ngồi kéo đổi, Điểm danh 1 chạm, Quỹ lớp minh bạch, Thời khóa biểu, Bình chọn, Nhiệm vụ Deadline, Kho Tài liệu, Phòng Pomodoro và Bức tường Kudos!',
    teacherTip:
      'Mẹo GVCN: Cuối tuần bấm "Xuất báo cáo tổng kết lớp" để có ngay tin nhắn đẹp mắt gửi nhóm Zalo phụ huynh!',
    studentTip:
      'Mẹo Học sinh: Đừng bỏ lỡ "Phòng Tập trung Pomodoro" và "Bức tường Kudos" để gửi lời khen ẩn danh cực vui!',
    highlights: ['Sơ đồ lớp & Điểm danh', 'Quỹ lớp & Bình chọn', 'Kudos & Phòng Pomodoro'],
  },
  {
    id: 'tour-studio',
    route: '/studio',
    title: 'Studio Trang Trí App Độc Quyền',
    badge: 'Bước 5/7 · Trang trí',
    mood: 'celebrating',
    description:
      'Biến chiếc app thành phong cách riêng của bạn! Chọn 10 bảng màu rực rỡ, họa tiết nền SVG, hiệu ứng hoa anh đào / tuyết rơi / đom đóm, kiểu thẻ Kính mờ / Neon, khung Avatar và chọn Linh vật đồng hành!',
    teacherTip:
      'Mọi tuỳ chỉnh trang trí được lưu riêng trên thiết bị của bạn — thoải mái sáng tạo mà không ảnh hưởng máy người khác!',
    studentTip:
      'Thử các Gói Chủ Đề 1 Chạm như "Mùa Hoa Anh Đào" hay "Neon Galaxy" để lột xác app trong nháy mắt nhé!',
    highlights: ['10 bảng màu & 6 họa tiết nền', '6 hiệu ứng hạt bay động', '7 khung Avatar & 4 Linh vật'],
  },
  {
    id: 'tour-creative',
    route: '/creative',
    title: 'Góc Sáng Tạo & Bảng Sticker',
    badge: 'Bước 6/7 · Sáng tạo',
    mood: 'excited',
    description:
      'Thỏa sức sáng tạo với 3 xưởng cực đỉnh: Bảng dán Sticker kéo-thả tự do (có giấy nhớ + xoay + phóng to), Xưởng thiết kế Thiệp/Poster 10T4 và Hộp Quà Sticker bí ẩn mở miễn phí mỗi ngày!',
    teacherTip:
      'Bạn có thể thiết kế Poster vinh danh Top 1 hoặc Thiệp sinh nhật rồi gửi thẳng lên Bức tường Kudos hay nhóm Zalo!',
    studentTip:
      'Nhớ ghim Bảng Sticker lên Trang chủ và mở Hộp Quà Sticker mỗi ngày để sưu tầm trọn bộ 24 mẫu độc quyền nha!',
    highlights: ['Bảng dán Sticker kéo-thả', 'Xưởng làm Thiệp & Poster', 'Hộp quà Sticker mỗi ngày 🎁'],
  },
  {
    id: 'tour-settings',
    route: '/settings',
    title: 'Trợ Lý & Cài Đặt Luôn Bên Bạn',
    badge: 'Bước 7/7 · Hoàn tất',
    mood: 'celebrating',
    description:
      'Chúc mừng bạn đã đi trọn vòng khám phá App 10T4! Bất cứ khi nào cần hỏi bài, tra điểm, đổi màu nền bằng chat hay xem hướng dẫn từng trang, chỉ cần chạm vào nút Linh vật ở góc dưới màn hình!',
    teacherTip:
      'Trong Cài đặt bạn còn có thể sao lưu/khôi phục JSON, đăng xuất khoá app và bật tắt Trợ lý nổi bất kỳ lúc nào.',
    studentTip:
      'Hoàn thành Tour ngay để mở khóa Sticker đặc biệt "Nhà Thám Hiểm 10T4" 🧭 và nhận pháo giấy chúc mừng nhé!',
    highlights: ['Chat hỏi đáp & ra lệnh đổi theme', 'Hướng dẫn thông minh theo trang', 'Mở khóa huy hiệu Nhà Thám Hiểm'],
  },
];

/* ---------- Page-Aware Contextual Guides ---------- */

export type PageGuide = {
  title: string;
  emoji: string;
  summary: string;
  steps: string[];
  proTip: string;
  quickPrompts: string[];
};

const PAGE_GUIDES: Record<string, PageGuide> = {
  '/': {
    title: 'Trang Tổng quan 10T4',
    emoji: '🏠',
    summary: 'Trung tâm nắm bắt mọi chuyển động của lớp: tiết học live, sức khoẻ lớp, thi đua và thông báo ghim.',
    steps: [
      'Chạm thanh "Tìm nhanh" (hoặc Ctrl+K trên máy tính) để nhảy tới mọi tính năng.',
      'Vuốt thanh Tác vụ nhanh để mở Ghi điểm, Điểm danh, Trang trí App hay Góc Sáng tạo.',
      'Chạm vào Bục Top 3 hoặc Vòng tròn Sức khoẻ để xem chi tiết phân tích.',
    ],
    proTip: 'Bạn có thể ghim Sticker yêu thích và Bảng Sáng tạo ngay lên Trang chủ trong mục Studio Trang trí!',
    quickPrompts: ['Hôm nay học môn gì?', 'Bật hoa anh đào rơi 🌸', 'Ai dẫn đầu thi đua?', 'Soạn tin nhắc trực nhật'],
  },
  '/students': {
    title: 'Danh sách Học sinh',
    emoji: '👥',
    summary: 'Quản lý hồ sơ, thứ hạng thi đua, tổ nhóm và tra cứu nhanh toàn bộ thành viên lớp.',
    steps: [
      'Gõ tên hoặc mã học sinh (không cần gõ dấu) để lọc tức thì.',
      'Chọn chip Tổ 1–4 để so sánh và xem thành viên từng tổ.',
      'Chạm vào bất kỳ bạn nào để mở hồ sơ chi tiết, huy hiệu và phiếu thành tích.',
    ],
    proTip: 'Bạn có thể gõ thẳng tên một học sinh vào khung Chat Trợ lý để xem hồ sơ tóm tắt cực nhanh!',
    quickPrompts: ['Tổ nào đang đứng nhất?', 'Ai sắp sinh nhật?', 'Cách thêm nhiều học sinh?'],
  },
  '/feed': {
    title: 'Nhật ký Thành tích',
    emoji: '🏆',
    summary: 'Dòng thời gian ghi nhận thành tích, hoạt động CLB và phê duyệt cộng điểm thi đua.',
    steps: [
      'Bấm "Ghi thành tích mới" để thêm điểm học tập, thể thao, văn nghệ hoặc kỹ năng.',
      'Dùng bộ lọc trạng thái (Chờ duyệt / Đã duyệt) và 6 lĩnh vực để tra cứu.',
      'GVCN có thể bấm "Duyệt hết" để phê duyệt toàn bộ mục chờ trong 1 chạm.',
    ],
    proTip: 'Gửi thành tích đều đặn mỗi ngày giúp duy trì Chuỗi hoạt động (Streak) rực cháy của cả lớp!',
    quickPrompts: ['Sức khỏe lớp thế nào?', 'Ai dẫn đầu thi đua?', 'Động lực học tập'],
  },
  '/tools': {
    title: 'Kho Tiện ích 10T4',
    emoji: '🧩',
    summary: 'Hơn 15 công cụ từ học tập, điều hành lớp học, gắn kết cộng đồng cho đến trang trí & sáng tạo.',
    steps: [
      'Nhóm Sáng tạo & Trang trí: cá nhân hóa app, bảng sticker và thiết kế thiệp.',
      'Nhóm Điều hành: Sơ đồ chỗ ngồi, Điểm danh, Quỹ lớp, Thời khóa biểu.',
      'Kéo xuống cuối trang để Xuất báo cáo tổng kết lớp gửi nhóm Zalo.',
    ],
    proTip: 'Chạm "Chạy Tour Hướng dẫn" bất cứ lúc nào để linh vật dẫn bạn đi dạo qua các tính năng mới nhất!',
    quickPrompts: ['Quỹ lớp còn bao nhiêu?', 'Deadline sắp tới?', 'Gợi ý trò chơi đầu giờ'],
  },
  '/settings': {
    title: 'Cài đặt & Cá nhân hóa',
    emoji: '⚙️',
    summary: 'Quản lý tài khoản, mật khẩu truy cập, giao diện màu sắc và sao lưu dữ liệu.',
    steps: [
      'Mở "Studio Trang trí App" để tùy biến toàn diện hình nền, hiệu ứng hạt rơi & linh vật.',
      'Đổi nhanh chế độ Sáng/Tối và 10 bảng màu thương hiệu.',
      'Sao lưu JSON định kỳ hoặc xuất báo cáo tổng kết chỉ bằng 1 chạm.',
    ],
    proTip: 'Mọi hiệu ứng trang trí lưu riêng trên máy của bạn nên bạn thoải mái sáng tạo theo gu riêng!',
    quickPrompts: ['Bật chế độ tối Neon ⚡', 'Đổi sang trợ lý Mochi 🐱', 'Cách sao lưu dữ liệu?'],
  },
  '/studio': {
    title: 'Studio Trang Trí App',
    emoji: '🎨',
    summary: 'Xưởng cá nhân hóa giao diện xịn xò: 10 bảng màu, 6 họa tiết nền, 6 hiệu ứng bay, 5 kiểu thẻ và 4 linh vật.',
    steps: [
      'Thử 1 chạm vào "Gói Phong Cách" để biến hóa toàn bộ app ngay lập tức.',
      'Tự phối Màu sắc + Họa tiết nền + Hiệu ứng hạt rơi + Kiểu thẻ theo cá tính.',
      'Chọn Khung Avatar, Tâm trạng hôm nay và ghim Sticker yêu thích lên Trang chủ!',
    ],
    proTip: 'Bạn cũng có thể ra lệnh trực tiếp trong Chat Trợ lý như "Bật tuyết rơi" hay "Đổi màu Matcha"!',
    quickPrompts: ['Bật hoa anh đào rơi 🌸', 'Bật tuyết rơi ❄️', 'Bật hiệu ứng đom đóm 🌟', 'Tắt hiệu ứng bay'],
  },
  '/creative': {
    title: 'Góc Sáng Tạo & Sticker',
    emoji: '✂️',
    summary: 'Thế giới sáng tạo của 10T4 với Bảng dán Sticker kéo-thả, Xưởng làm Thiệp/Poster và Hộp quà Sticker mỗi ngày.',
    steps: [
      'Tab Bảng Sticker: Chọn phông nền, chạm Sticker để thả vào bảng rồi kéo di chuyển tự do!',
      'Chạm vào Sticker trên bảng để phóng to/thu nhỏ, xoay góc hoặc dán thêm Giấy nhớ.',
      'Tab Xưởng Thiệp: Tạo thiệp sinh nhật/vinh danh rồi gửi thẳng lên Kudos hoặc Zalo!',
    ],
    proTip: 'Đừng quên sang tab "Bộ sưu tập & Hộp quà" để mở hộp quà Sticker miễn phí mỗi ngày nhé 🎁',
    quickPrompts: ['Cách ghim bảng lên trang chủ?', 'Ai sắp sinh nhật?', 'Kể chuyện vui học đường'],
  },
  '/insights': {
    title: 'Trợ lý Phân tích Sức khoẻ Lớp',
    emoji: '✨',
    summary: 'Đánh giá sức khoẻ tập thể trên 4 trụ cột (Chuyên cần, Động lực, Tiến độ, Gắn kết) và phát hiện cảnh báo sớm.',
    steps: [
      'Theo dõi điểm tổng quan (0–100) và xếp hạng S/A+/A của lớp.',
      'Hỏi nhanh bất cứ thông tin nào về lớp hoặc tên học sinh.',
      'Xử lý các thẻ Cảnh báo ưu tiên để nâng điểm sức khoẻ lên hạng S!',
    ],
    proTip: 'Nút Linh vật ở góc màn hình cũng dùng chung bộ não thông minh này nhưng có thêm lệnh điều khiển App!',
    quickPrompts: ['Sức khỏe lớp thế nào?', 'Soạn báo cáo tổng kết tuần', 'Ai cần được động viên?'],
  },
  '/kudos': {
    title: 'Bức tường Kudos Vinh danh',
    emoji: '💖',
    summary: 'Không gian lan tỏa lời khen, cảm ơn và gửi thiệp cổ vũ nhau (có thể gửi ẩn danh cực thú vị).',
    steps: [
      'Bấm "Gửi khen" ở góc trên bên phải để mở khung tạo thiệp.',
      'Chọn người nhận, chọn huy hiệu sticker và viết lời chúc chân thành.',
      'Thả vỗ tay 👏 thật nhiều cho những lời khen hay trên bảng tin!',
    ],
    proTip: 'Bạn có thể thiết kế thiệp đẹp trong Góc Sáng Tạo rồi bấm gửi thẳng sang Bức tường Kudos!',
    quickPrompts: ['Kudos mới nhất có gì?', 'Ai sắp sinh nhật?', 'Gợi ý lời khen hay'],
  },
  '/seating': {
    title: 'Sơ đồ Chỗ ngồi Lớp học',
    emoji: '🪑',
    summary: 'Quản lý sơ đồ bàn ghế trực quan, đổi chỗ 2 chạm và tự động ghép cặp đôi bạn cùng tiến.',
    steps: [
      'Chạm 2 vị trí bàn bất kỳ để hoán đổi chỗ ngồi cho nhau.',
      'Thử các chế độ xếp tự động: Theo Tổ, Ngẫu nhiên hoặc Đôi bạn cùng tiến.',
      'Vị trí bàn của mỗi bạn sẽ tự động hiển thị trên Hồ sơ cá nhân.',
    ],
    proTip: 'Chế độ "Đôi bạn cùng tiến" tự động ghép bạn điểm cao ngồi cạnh bạn cần hỗ trợ — siêu thông minh!',
    quickPrompts: ['Tổ nào đang đứng nhất?', 'Ai dẫn đầu thi đua?', 'Gợi ý trò chơi đầu giờ'],
  },
  '/attendance': {
    title: 'Điểm danh Chuyên cần',
    emoji: '✅',
    summary: 'Chấm chuyên cần cực nhanh chỉ 1 chạm và xuất báo cáo gửi nhóm phụ huynh.',
    steps: [
      'Bấm "Tất cả có mặt" rồi chỉ cần chạm đổi trạng thái cho các bạn đi muộn/vắng.',
      'Ghi chú lý do nghỉ có phép để lưu lịch sử minh bạch.',
      'Chạm nút chia sẻ để gửi danh sách điểm danh hôm nay vào Zalo.',
    ],
    proTip: 'Tỷ lệ chuyên cần tự động cộng vào Điểm Sức khoẻ lớp và hiện trên thẻ học sinh.',
    quickPrompts: ['Tình hình điểm danh hôm nay?', 'Sức khỏe lớp thế nào?', 'Hôm nay học môn gì?'],
  },
  '/fund': {
    title: 'Sổ Quỹ Lớp Minh Bạch',
    emoji: '💰',
    summary: 'Ghi chép thu chi rõ ràng và đánh dấu danh sách thành viên đã đóng quỹ học kỳ.',
    steps: [
      'Ghi nhận từng khoản Thu hoặc Chi kèm ngày tháng và danh mục.',
      'Chạm vào tên học sinh ở danh sách đóng quỹ để đánh dấu đã nộp.',
      'Xem số dư hiện tại được tính toán tự động theo thời gian thực.',
    ],
    proTip: 'Hãy nhờ Trợ lý "Soạn tin nhắn nhắc đóng quỹ" để có mẫu thông báo lịch sự gửi nhóm lớp!',
    quickPrompts: ['Quỹ lớp còn bao nhiêu?', 'Soạn thông báo đóng quỹ', 'Sức khỏe lớp thế nào?'],
  },
  '/schedule': {
    title: 'Thời khóa biểu & Trực nhật',
    emoji: '📅',
    summary: 'Lịch học chi tiết từ Thứ 2 đến Thứ 7 và bảng phân công Tổ trực nhật hàng ngày.',
    steps: [
      'Chuyển đổi giữa các ngày trong tuần để xem tiết Sáng và Chiều.',
      'Kiểm tra Tổ trực nhật hôm nay ngay trên đầu trang.',
      'GVCN / Ban cán sự có thể thêm, sửa tiết học hoặc đổi lịch trực nhật.',
    ],
    proTip: 'Trang Chủ tự động đếm giờ và báo tiết học hiện tại dựa theo Thời khóa biểu này!',
    quickPrompts: ['Hôm nay học môn gì?', 'Ngày mai học gì?', 'Soạn tin nhắc trực nhật'],
  },
  '/focus': {
    title: 'Phòng Tập trung Pomodoro',
    emoji: '⏱️',
    summary: 'Đồng hồ đếm ngược 5p, 15p kiểm tra trên lớp hoặc 25p Pomodoro học sâu cực hiệu quả.',
    steps: [
      'Chọn mốc thời gian phù hợp: Thảo luận 5p, Kiểm tra 15p, Pomodoro 25p hoặc Ôn thi 45p.',
      'Bấm Bắt đầu và tập trung hoàn toàn cho đến khi hết giờ.',
      'Theo dõi tổng số phút tập trung hôm nay để chinh phục mục tiêu 90 phút/ngày!',
    ],
    proTip: 'Bật thêm hiệu ứng Đom đóm hoặc Mưa hoa nhẹ ở Studio Trang trí để phòng học thêm chill!',
    quickPrompts: ['Động lực học tập', 'Mẹo ôn thi hiệu quả', 'Deadline sắp tới?'],
  },
};

export function getPageGuide(pathname: string): PageGuide {
  if (pathname.startsWith('/student/')) {
    return {
      title: 'Hồ sơ Học sinh',
      emoji: '🎓',
      summary: 'Toàn bộ điểm thi đua, huy hiệu danh dự, lịch sử chuyên cần, vị trí ngồi và Kudos của học sinh.',
      steps: [
        'Bấm "Phiếu điểm" góc trên để xuất phiếu thành tích gửi phụ huynh.',
        'Xem các huy hiệu vinh danh được hệ thống trao tự động.',
        'GVCN/Ban cán sự có thể thưởng điểm nhanh 1 chạm ngay trong hồ sơ.',
      ],
      proTip: 'Thông tin SĐT/Email cá nhân chỉ hiển thị cho GVCN và chính chủ tài khoản học sinh đó.',
      quickPrompts: ['Ai dẫn đầu thi đua?', 'Kudos mới nhất có gì?', 'Động lực học tập'],
    };
  }
  return (
    PAGE_GUIDES[pathname] ?? {
      title: 'Trợ lý & Hướng dẫn viên 10T4',
      emoji: '✨',
      summary: 'Mình luôn sẵn sàng giải đáp dữ liệu lớp, hướng dẫn thao tác và trang trí app cùng bạn!',
      steps: [
        'Hỏi bất cứ thông tin nào về lớp ở tab Trợ lý Chat.',
        'Bấm "Bắt đầu Tour 7 bước" để khám phá toàn bộ ứng dụng.',
        'Thử Studio Trang trí và Góc Sáng tạo để tạo dấu ấn riêng!',
      ],
      proTip: 'Bạn có thể nói "Bật hoa anh đào" hoặc "Đổi màu Cyber" ngay trong khung chat đấy!',
      quickPrompts: ['Hôm nay học môn gì?', 'Bật hoa anh đào rơi 🌸', 'Sức khỏe lớp thế nào?', 'Mẹo ôn thi hiệu quả'],
    }
  );
}

/* ---------- Searchable Feature Atlas ---------- */

export type FeatureAtlasItem = {
  id: string;
  category: 'Sáng tạo & Trang trí' | 'Học tập & Trợ lý' | 'Quản lý & Lớp học' | 'Cộng đồng';
  title: string;
  desc: string;
  route: string;
  icon: IoniconName;
  color: ThemeColor;
  soft: ThemeColor;
};

export const FEATURE_ATLAS: FeatureAtlasItem[] = [
  {
    id: 'atlas-studio',
    category: 'Sáng tạo & Trang trí',
    title: 'Studio Trang Trí App',
    desc: '10 bảng màu, họa tiết nền, hiệu ứng hạt bay, kiểu thẻ, khung avatar & linh vật',
    route: '/studio',
    icon: 'color-wand',
    color: 'purple',
    soft: 'purpleSoft',
  },
  {
    id: 'atlas-creative',
    category: 'Sáng tạo & Trang trí',
    title: 'Góc Sáng Tạo & Sticker',
    desc: 'Bảng dán Sticker kéo-thả, Xưởng thiết kế Thiệp/Poster & Hộp quà Sticker mỗi ngày',
    route: '/creative',
    icon: 'sparkles',
    color: 'danger',
    soft: 'dangerSoft',
  },
  {
    id: 'atlas-insights',
    category: 'Học tập & Trợ lý',
    title: 'Trợ lý Sức Khoẻ Lớp',
    desc: 'Chấm điểm sức khoẻ 4 trụ cột, phát hiện cảnh báo sớm & hỏi đáp lớp học',
    route: '/insights',
    icon: 'analytics',
    color: 'accent',
    soft: 'accentSoft',
  },
  {
    id: 'atlas-resources',
    category: 'Học tập & Trợ lý',
    title: 'Kho Tài liệu & Đề cương',
    desc: 'Lưu trữ đề cương ôn thi, slide bài giảng, bài tập và video học chung',
    route: '/resources',
    icon: 'library',
    color: 'success',
    soft: 'successSoft',
  },
  {
    id: 'atlas-focus',
    category: 'Học tập & Trợ lý',
    title: 'Phòng Tập trung Pomodoro',
    desc: 'Đồng hồ đếm ngược 5p/15p/25p/45p theo dõi mục tiêu học tập mỗi ngày',
    route: '/focus',
    icon: 'timer',
    color: 'warning',
    soft: 'warningSoft',
  },
  {
    id: 'atlas-tasks',
    category: 'Học tập & Trợ lý',
    title: 'Nhiệm vụ & Deadline',
    desc: 'Quản lý bài tập, dự án nhóm và tích hoàn thành cá nhân theo hạn nộp',
    route: '/tasks',
    icon: 'list-circle',
    color: 'purple',
    soft: 'purpleSoft',
  },
  {
    id: 'atlas-seating',
    category: 'Quản lý & Lớp học',
    title: 'Sơ đồ Chỗ ngồi',
    desc: 'Đổi bàn 2 chạm, xếp theo tổ, ngẫu nhiên hoặc ghép đôi bạn cùng tiến',
    route: '/seating',
    icon: 'grid',
    color: 'accent',
    soft: 'accentSoft',
  },
  {
    id: 'atlas-attendance',
    category: 'Quản lý & Lớp học',
    title: 'Điểm danh Chuyên cần',
    desc: 'Điểm danh 1 chạm cho cả lớp, ghi lý do vắng & xuất báo cáo Zalo',
    route: '/attendance',
    icon: 'checkbox',
    color: 'success',
    soft: 'successSoft',
  },
  {
    id: 'atlas-schedule',
    category: 'Quản lý & Lớp học',
    title: 'Thời khóa biểu & Trực nhật',
    desc: 'Lịch học Sáng/Chiều T2–T7 và phân công tổ trực nhật tự động',
    route: '/schedule',
    icon: 'calendar',
    color: 'accent',
    soft: 'accentSoft',
  },
  {
    id: 'atlas-fund',
    category: 'Quản lý & Lớp học',
    title: 'Quỹ lớp Minh bạch',
    desc: 'Sổ thu chi công khai và tích danh sách các bạn đã hoàn thành đóng quỹ',
    route: '/fund',
    icon: 'wallet',
    color: 'warning',
    soft: 'warningSoft',
  },
  {
    id: 'atlas-kudos',
    category: 'Cộng đồng',
    title: 'Bức tường Kudos',
    desc: 'Gửi thiệp khen, cảm ơn (hỗ trợ ẩn danh) và vỗ tay cổ vũ bạn cùng lớp',
    route: '/kudos',
    icon: 'heart',
    color: 'danger',
    soft: 'dangerSoft',
  },
  {
    id: 'atlas-randomizer',
    category: 'Cộng đồng',
    title: 'Gọi tên & Chia nhóm',
    desc: 'Vòng quay gọi tên kiểm tra bài cũ công bằng và chia nhóm ngẫu nhiên',
    route: '/randomizer',
    icon: 'shuffle',
    color: 'purple',
    soft: 'purpleSoft',
  },
  {
    id: 'atlas-polls',
    category: 'Cộng đồng',
    title: 'Bình chọn & Khảo sát',
    desc: 'Tạo biểu quyết nhanh để lấy ý kiến chung của cả tập thể lớp 10T4',
    route: '/polls',
    icon: 'bar-chart',
    color: 'accent',
    soft: 'accentSoft',
  },
  {
    id: 'atlas-announcements',
    category: 'Cộng đồng',
    title: 'Bảng tin & Sự kiện',
    desc: 'Thông báo ghim quan trọng, lịch kiểm tra và đếm ngược ngày sự kiện',
    route: '/announcements',
    icon: 'megaphone',
    color: 'warning',
    soft: 'warningSoft',
  },
  {
    id: 'atlas-feedback',
    category: 'Cộng đồng',
    title: 'Hộp thư Góp ý Bảo mật',
    desc: 'Nhắn riêng hoặc gửi tâm sự ẩn danh an toàn trực tiếp tới GVCN',
    route: '/feedback',
    icon: 'mail-unread',
    color: 'danger',
    soft: 'dangerSoft',
  },
];

/* ---------- Fun Discovery Quests ---------- */

export type DiscoveryQuest = {
  id: string;
  title: string;
  desc: string;
  emoji: string;
  rewardText: string;
  route?: string;
};

export const DISCOVERY_QUESTS: DiscoveryQuest[] = [
  {
    id: 'tour',
    title: 'Hoàn thành Tour Hướng dẫn viên',
    desc: 'Đi trọn 7 trạm khám phá App 10T4 cùng Linh vật',
    emoji: '🧭',
    rewardText: 'Mở khóa Sticker Nhà Thám Hiểm',
  },
  {
    id: 'decorate',
    title: 'Lột xác giao diện App',
    desc: 'Thử đổi họa tiết nền, hiệu ứng hạt bay hoặc gói chủ đề trong Studio',
    emoji: '🎨',
    rewardText: '+50 XP Sáng tạo',
    route: '/studio',
  },
  {
    id: 'board',
    title: 'Nghệ sĩ Bảng Sticker',
    desc: 'Dán thêm Sticker hoặc Giấy nhớ lên Bảng Sáng tạo của riêng bạn',
    emoji: '✂️',
    rewardText: '+50 XP Nghệ sĩ',
    route: '/creative',
  },
  {
    id: 'gacha',
    title: 'Mở Hộp Quà Sticker hôm nay',
    desc: 'Sưu tầm 1 mẫu Sticker độc quyền từ hộp quà bí ẩn mỗi ngày',
    emoji: '🎁',
    rewardText: '+1 Sticker mới',
    route: '/creative',
  },
  {
    id: 'card',
    title: 'Thiết kế Thiệp / Poster 10T4',
    desc: 'Tạo một tấm thiệp chúc mừng hoặc poster vinh danh siêu xịn',
    emoji: '💌',
    rewardText: '+50 XP Thiết kế',
    route: '/creative',
  },
  {
    id: 'chat',
    title: 'Trò chuyện cùng Trợ lý 10T4',
    desc: 'Hỏi dữ liệu lớp hoặc ra lệnh đổi giao diện ngay trong khung Chat',
    emoji: '💬',
    rewardText: '+50 XP Thông thái',
  },
];
