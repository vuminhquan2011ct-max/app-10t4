import { AnnouncementsHub } from '@/components/announcements-hub';

/** Dedicated "Thông tin" bottom tab right next to "Tổng quan". */
export default function BulletinTabScreen() {
  return <AnnouncementsHub withTabBar showBackButton={false} />;
}
