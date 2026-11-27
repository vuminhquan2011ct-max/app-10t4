import { AnnouncementsHub } from '@/components/announcements-hub';

/** Backward-compatible standalone route (`/announcements`) sharing `AnnouncementsHub`. */
export default function AnnouncementsScreen() {
  return <AnnouncementsHub withTabBar={false} showBackButton />;
}
