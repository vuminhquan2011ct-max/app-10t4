/**
 * Auto-computed honour titles & achievement badges for a student based on
 * their real entries, rank and attendance.
 */

import type { Ionicons } from '@expo/vector-icons';

import type { ThemeColor } from '@/constants/theme';
import type { AttendanceStats, Entry, StudentStats } from '@/types/models';

type IoniconName = keyof typeof Ionicons.glyphMap;

export type HonourBadge = {
  id: string;
  label: string;
  description: string;
  icon: IoniconName;
  color: ThemeColor;
  soft: ThemeColor;
};

export function badgesForStudent(
  entries: Entry[],
  stats: StudentStats,
  attendance: AttendanceStats,
  rank?: number,
): HonourBadge[] {
  const badges: HonourBadge[] = [];
  const approved = entries.filter((e) => e.status === 'approved');

  if (rank && rank <= 3 && stats.points > 0) {
    badges.push({
      id: 'top3',
      label: rank === 1 ? 'Thủ lĩnh Thi đua' : `Top ${rank} Lớp`,
      description: 'Dẫn đầu bảng xếp hạng điểm thi đua của lớp',
      icon: 'trophy',
      color: 'gold',
      soft: 'goldSoft',
    });
  } else if (stats.points >= 20) {
    badges.push({
      id: 'star',
      label: 'Ngôi sao 10T4',
      description: 'Đạt từ 20 điểm thi đua được duyệt trở lên',
      icon: 'star',
      color: 'gold',
      soft: 'goldSoft',
    });
  }

  const studyCount = approved.filter((e) => e.category === 'study').length;
  if (studyCount >= 2) {
    badges.push({
      id: 'scholar',
      label: 'Chiến thần Học tập',
      description: `Có ${studyCount} thành tích học tập nổi bật`,
      icon: 'school',
      color: 'accent',
      soft: 'accentSoft',
    });
  }

  const sportArtCount = approved.filter((e) => e.category === 'sport' || e.category === 'art').length;
  if (sportArtCount >= 1) {
    badges.push({
      id: 'talent',
      label: 'Đa tài Năng động',
      description: 'Tích cực thể thao, văn nghệ & câu lạc bộ',
      icon: 'sparkles',
      color: 'purple',
      soft: 'purpleSoft',
    });
  }

  const volunteerCount = approved.filter((e) => e.category === 'volunteer').length;
  if (volunteerCount >= 1) {
    badges.push({
      id: 'heart',
      label: 'Trái tim Tình nguyện',
      description: 'Đóng góp vì tập thể và cộng đồng',
      icon: 'heart',
      color: 'danger',
      soft: 'dangerSoft',
    });
  }

  if (attendance.total >= 1 && (attendance.rate ?? 0) >= 95) {
    badges.push({
      id: 'diligent',
      label: 'Chuyên cần Vàng',
      description: `Tỉ lệ đi học đạt ${attendance.rate}%`,
      icon: 'shield-checkmark',
      color: 'success',
      soft: 'successSoft',
    });
  }

  if (badges.length === 0) {
    badges.push({
      id: 'rising',
      label: 'Thành viên 10T4',
      description: 'Sẵn sàng bứt phá thành tích mới',
      icon: 'rocket',
      color: 'accent',
      soft: 'accentSoft',
    });
  }

  return badges;
}
