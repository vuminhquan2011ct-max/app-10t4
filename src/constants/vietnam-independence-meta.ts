export type IndependenceEpochId =
  | 'bach_dang'
  | 'ba_dinh_1945'
  | 'dien_bien_1954'
  | 'thong_nhat_1975'
  | 'ky_nguyen_moi';

export interface IndependenceEpoch {
  id: IndependenceEpochId;
  order: number;
  year: string;
  dateLabel: string;
  title: string;
  subtitle: string;
  heroQuote: string;
  quoteAuthor: string;
  summary: string;
  highlights: string[];
  spiritLessonFor10T4: string;
  skyGradient: readonly [string, string, string];
  accentColor: string;
  badgeLabel: string;
  soundEffectLabel: string;
}

export interface PatrioticPledge {
  id: string;
  label: string;
  emoji: string;
  commitment: string;
}

export const INDEPENDENCE_EPOCHS: readonly IndependenceEpoch[] = [
  {
    id: 'bach_dang',
    order: 1,
    year: '938 - 1288',
    dateLabel: 'Khởi nguyên tự chủ · 938 – 1288',
    title: 'Bạch Đằng Giang & Hào Khí Đông A',
    subtitle: 'Trống đồng Đông Sơn vọng ngàn năm — Cọc gỗ Bạch Đằng giữ non sông',
    heroQuote:
      'Nam quốc sơn hà nam đế cư, Tiệt nhiên định phận tại thiên thư.',
    quoteAuthor: 'Lý Thường Kiệt (1077) · Bản Tuyên ngôn Độc lập đầu tiên',
    summary:
      'Từ chiến thắng Bạch Đằng năm 938 của Đức Vương Ngô Quyền chấm dứt hơn một thiên niên kỷ Bắc thuộc, đến bài thơ thần trên sông Như Nguyệt và ba lần đại thắng quân Nguyên – Mông của Hưng Đạo Đại Vương Trần Quốc Tuấn năm 1288, dân tộc Việt Nam đã khẳng định chủ quyền thiêng liêng bất khả xâm phạm.',
    highlights: [
      'Năm 938: Ngô Quyền bày trận cọc gỗ bịt sắt trên sông Bạch Đằng, đập tan quân Nam Hán, mở ra kỷ nguyên độc lập lâu dài.',
      'Năm 1077: Lý Thường Kiệt vang đọc "Nam quốc sơn hà" bên phòng tuyến sông Như Nguyệt — bản Tuyên ngôn Độc lập đầu tiên của dân tộc.',
      'Năm 1288: Trần Hưng Đạo cùng quân dân nhà Trần tái lập trận địa cọc Bạch Đằng, nhấn chìm toàn bộ thủy quân Nguyên – Mông.',
    ],
    spiritLessonFor10T4:
      'Bản lĩnh tự cường và trí tuệ sáng tạo: Tập thể 10T4 đoàn kết như muôn cây cọc Bạch Đằng, vững vàng vượt qua mọi thử thách học tập.',
    skyGradient: ['#1A090D', '#4A121A', '#8F2D1E'] as const,
    accentColor: '#F59E0B',
    badgeLabel: 'Chương I · Hào Khí Ngàn Năm',
    soundEffectLabel: 'Tiếng trống đồng Đông Sơn & sóng vỗ Bạch Đằng Giang',
  },
  {
    id: 'ba_dinh_1945',
    order: 2,
    year: '02/09/1945',
    dateLabel: 'Mùa thu lịch sử · 02/09/1945',
    title: 'Cách Mạng Tháng Tám & Tuyên Ngôn Độc Lập',
    subtitle: 'Nắng Ba Đình rực rỡ cờ sao — Khai sinh nước Việt Nam Dân chủ Cộng hòa',
    heroQuote:
      'Nước Việt Nam có quyền hưởng tự do và độc lập, và sự thật đã thành một nước tự do, độc lập.',
    quoteAuthor: 'Chủ tịch Hồ Chí Minh · Quảng trường Ba Đình, 02/09/1945',
    summary:
      'Mùa thu tháng Tám năm 1945, toàn dân tộc Việt Nam nhất tề đứng lên tổng khởi nghĩa giành chính quyền. Ngày 2 tháng 9 năm 1945, tại Quảng trường Ba Đình lịch sử, Chủ tịch Hồ Chí Minh trịnh trọng đọc bản Tuyên ngôn Độc lập, khai sinh nước Việt Nam Dân chủ Cộng hòa — nhà nước công nông đầu tiên ở Đông Nam Á.',
    highlights: [
      'Tổng khởi nghĩa Tháng Tám 1945 thắng lợi thần tốc trong 15 ngày trên khắp ba miền Bắc – Trung – Nam.',
      'Chiều 02/09/1945: Hơn 50 vạn đồng bào tề tựu tại Quảng trường Ba Đình dưới rừng cờ đỏ sao vàng rực rỡ.',
      'Chủ tịch Hồ Chí Minh đọc Tuyên ngôn Độc lập, tuyên bố trước toàn thế giới quyền tự do, độc lập của dân tộc Việt Nam.',
    ],
    spiritLessonFor10T4:
      'Khát vọng tự chủ và tinh thần làm chủ tương lai: Mỗi học sinh 10T4 tự giác rèn luyện, dám ước mơ lớn và chịu trách nhiệm với chính mình.',
    skyGradient: ['#2B0908', '#7C1616', '#C83E1D'] as const,
    accentColor: '#FACC15',
    badgeLabel: 'Chương II · Khai Sinh Tổ Quốc',
    soundEffectLabel: 'Lời Bác vang vọng Ba Đình & tiếng reo hò độc lập',
  },
  {
    id: 'dien_bien_1954',
    order: 3,
    year: '07/05/1954',
    dateLabel: '56 ngày đêm máu lửa · 07/05/1954',
    title: 'Chiến Thắng Điện Biên Phủ',
    subtitle: 'Lừng lẫy năm châu, chấn động địa cầu — Cờ Quyết Chiến Quyết Thắng tung bay',
    heroQuote:
      'Chín năm làm một Điện Biên, Nên vành hoa đỏ, nên thiên sử vàng.',
    quoteAuthor: 'Tố Hữu · Hoan hô chiến sĩ Điện Biên (1954)',
    summary:
      'Sau 56 ngày đêm "khoét núi, ngủ hầm, mưa dầm, cơm vắt", quân và dân ta dưới sự chỉ huy của Đại tướng Võ Nguyên Giáp đã làm nên chiến thắng Điện Biên Phủ ngày 07/05/1954. Lá cờ "Quyết chiến Quyết thắng" tung bay trên nóc hầm tướng Đờ Cát kết thúc thắng lợi cuộc kháng chiến 9 năm chống thực dân Pháp.',
    highlights: [
      'Hàng vạn dân công hỏa tuyến với hơn 20.000 xe đạp thồ vượt đèo Pha Đin, chở hàng ngàn tấn lương thực, đạn dược ra tiền tuyến.',
      'Chiến thuật "Đánh chắc, tiến chắc" đầy bản lĩnh và trí tuệ của Đại tướng Võ Nguyên Giáp làm xoay chuyển cục diện chiến trường.',
      '17 giờ 30 ngày 07/05/1954: Lá cờ "Quyết chiến Quyết thắng" tung bay trên nóc hầm Đờ Cát, chấn động địa cầu.',
    ],
    spiritLessonFor10T4:
      'Ý chí bền bỉ, không lùi bước trước gian khó: Như đoàn xe đạp thồ vượt dốc Pha Đin, 10T4 kiên trì chinh phục từng đỉnh cao tri thức.',
    skyGradient: ['#0D192B', '#1E3A5F', '#4A5D23'] as const,
    accentColor: '#FB923C',
    badgeLabel: 'Chương III · Chấn Động Địa Cầu',
    soundEffectLabel: 'Pháo lệnh mở màn chiến dịch & khúc quân hành Điện Biên',
  },
  {
    id: 'thong_nhat_1975',
    order: 4,
    year: '30/04/1975',
    dateLabel: 'Đại thắng mùa Xuân · 30/04/1975',
    title: 'Giải Phóng Miền Nam — Thống Nhất Đất Nước',
    subtitle: 'Xe tăng 390 và 843 tiến vào Dinh Độc Lập — Non sông thu về một mối',
    heroQuote:
      'Đánh cho để dài tóc, đánh cho để đen răng... đánh cho sử tri Nam quốc anh hùng chi hữu chủ!',
    quoteAuthor: 'Quang Trung – Nguyễn Huệ · Tiếp nối bằng Đại thắng Mùa Xuân 1975',
    summary:
      'Với tinh thần "Thần tốc, thần tốc hơn nữa; táo bạo, táo bạo hơn nữa", Chiến dịch Hồ Chí Minh lịch sử toàn thắng trưa ngày 30/04/1975. Xe tăng 390 và 843 của quân giải phóng húc đổ cổng Dinh Độc Lập, lá cờ Mặt trận Dân tộc Giải phóng miền Nam Việt Nam tung bay trên nóc Dinh, Bắc – Nam sum họp một nhà.',
    highlights: [
      'Cuộc Tổng tiến công và nổi dậy mùa Xuân 1975 giải phóng hoàn toàn miền Nam sau 55 ngày đêm thần tốc.',
      '10 giờ 45 ngày 30/04/1975: Xe tăng 390 và 843 tiến vào cổng chính Dinh Độc Lập trong niềm vỡ òa của hàng triệu con tim.',
      '11 giờ 30 ngày 30/04/1975: Cờ giải phóng tung bay trên nóc Dinh Độc Lập — non sông Việt Nam liền một dải từ Lũng Cú đến Cà Mau.',
    ],
    spiritLessonFor10T4:
      'Tốc độ, hiệp đồng và khát khao chiến thắng: 10T4 đồng lòng bứt phá trong từng kỳ thi, gắn kết tập thể như một mái nhà chung.',
    skyGradient: ['#0A2239', '#14532D', '#CA8A04'] as const,
    accentColor: '#34D399',
    badgeLabel: 'Chương IV · Non Sông Một Dải',
    soundEffectLabel: 'Tiếng xích xe tăng tiến vào Dinh & khúc khải hoàn Như có Bác',
  },
  {
    id: 'ky_nguyen_moi',
    order: 5,
    year: '2026 · 10T4',
    dateLabel: 'Kỷ nguyên vươn mình · 2026 · Tập thể 10T4',
    title: 'Thế Hệ Trẻ 10T4 Tiếp Bước Cha Anh',
    subtitle: 'Giữ vững độc lập — Rèn đức luyện tài trong kỷ nguyên vươn mình của dân tộc',
    heroQuote:
      'Non sông Việt Nam có trở nên tươi đẹp hay không, dân tộc Việt Nam có bước tới đài vinh quang để sánh vai với các cường quốc năm châu được hay không, chính là nhờ một phần lớn ở công học tập của các em.',
    quoteAuthor: 'Chủ tịch Hồ Chí Minh · Thư gửi học sinh nhân ngày khai trường (09/1945)',
    summary:
      'Độc lập hôm nay được đổi bằng máu xương của biết bao thế hệ cha anh. Bước vào kỷ nguyên vươn mình của dân tộc năm 2026, tập thể lớp 10T4 viết tiếp bản hùng ca bằng tri thức khoa học, công nghệ số, kỷ luật học đường và lòng yêu nước nồng nàn trong từng tiết học, từng công việc hàng ngày.',
    highlights: [
      'Chuyển hóa lòng biết ơn lịch sử thành hành động cụ thể: Học tập chuyên cần, sáng tạo khoa học và làm chủ công nghệ mới.',
      'Xây dựng tập thể 10T4 đoàn kết – kỷ cương – nhân ái, mỗi thành viên là một đại sứ truyền cảm hứng tích cực.',
      'Sẵn sàng cống hiến sức trẻ đưa Việt Nam sánh vai cùng các cường quốc năm châu như lời Bác Hồ hằng mong ước.',
    ],
    spiritLessonFor10T4:
      'Tiếp lửa truyền thống bằng tri thức và kỷ luật: Mỗi điểm 10, mỗi giờ học tốt, mỗi việc tử tế của 10T4 là một đóa hoa dâng lên Tổ quốc.',
    skyGradient: ['#0F172A', '#1E3A8A', '#7C2D12'] as const,
    accentColor: '#38BDF8',
    badgeLabel: 'Chương V · Sứ Mệnh 10T4',
    soundEffectLabel: 'Nhạc hiệu thanh niên thế hệ mới & nhịp đập tương lai Việt Nam',
  },
];

export const INDEPENDENCE_EPOCH_MAP: Record<IndependenceEpochId, IndependenceEpoch> = {
  bach_dang: INDEPENDENCE_EPOCHS[0],
  ba_dinh_1945: INDEPENDENCE_EPOCHS[1],
  dien_bien_1954: INDEPENDENCE_EPOCHS[2],
  thong_nhat_1975: INDEPENDENCE_EPOCHS[3],
  ky_nguyen_moi: INDEPENDENCE_EPOCHS[4],
};

export const HEROIC_QUOTES: readonly { quote: string; author: string; year: string }[] = [
  {
    quote: 'Không có gì quý hơn độc lập, tự do!',
    author: 'Chủ tịch Hồ Chí Minh',
    year: '1966',
  },
  {
    quote:
      'Các vua Hùng đã có công dựng nước, Bác cháu ta phải cùng nhau giữ lấy nước.',
    author: 'Chủ tịch Hồ Chí Minh · Đền Hùng, Phú Thọ',
    year: '19/09/1954',
  },
  {
    quote:
      'Nam quốc sơn hà nam đế cư, Tiệt nhiên định phận tại thiên thư. Như hà nghịch lỗ lai xâm phạm, Nhữ đẳng hành khan thủ bại hư.',
    author: 'Lý Thường Kiệt',
    year: '1077',
  },
  {
    quote:
      'Nước Việt Nam là một, dân tộc Việt Nam là một. Sông có thể cạn, núi có thể mòn, song chân lý ấy không bao giờ thay đổi.',
    author: 'Chủ tịch Hồ Chí Minh',
    year: '02/1946',
  },
  {
    quote:
      'Khoan thư sức dân để làm kế sâu rễ bền gốc, đó là thượng sách giữ nước vậy.',
    author: 'Hưng Đạo Đại Vương Trần Quốc Tuấn',
    year: '1300',
  },
  {
    quote:
      'Việc nhân nghĩa cốt ở yên dân, Quân điếu phạt trước lo trừ bạo. Như nước Đại Việt ta từ trước, Vốn xưng nền văn hiến đã lâu.',
    author: 'Nguyễn Trãi · Bình Ngô Đại Cáo',
    year: '1428',
  },
];

export const PATRIOTIC_PLEDGES: readonly PatrioticPledge[] = [
  {
    id: 'tri_thuc_vuon_minh',
    label: 'Chinh phục tri thức',
    emoji: '📚',
    commitment:
      'Nỗ lực học tập, làm chủ khoa học – công nghệ để góp sức đưa Việt Nam sánh vai cùng các cường quốc năm châu.',
  },
  {
    id: 'doan_ket_10t4',
    label: 'Đoàn kết tập thể 10T4',
    emoji: '🤝',
    commitment:
      'Giữ vững tinh thần tương thân tương ái, cùng nhau tiến bộ, không để bất kỳ thành viên nào của 10T4 bị bỏ lại phía sau.',
  },
  {
    id: 'ky_luat_ban_linh',
    label: 'Rèn đức – Luyện bản lĩnh',
    emoji: '🔥',
    commitment:
      'Sống trung thực, trách nhiệm, giữ nghiêm kỷ cương học đường và kiên cường vượt qua mọi thử thách.',
  },
  {
    id: 'tri_an_nguon_coi',
    label: 'Uống nước nhớ nguồn',
    emoji: '🇻🇳',
    commitment:
      'Trân trọng lịch sử hào hùng của cha anh, tự hào khoác lên mình màu cờ Tổ quốc qua từng việc làm tử tế mỗi ngày.',
  },
];
