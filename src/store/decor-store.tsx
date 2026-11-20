/**
 * Local per-device personalization, sticker board, creative album,
 * mascot companion, interactive guided tour, Coin economy (`Xu 10T4`),
 * 7-Day Login Rewards, Mystery Chests & Student Missions store.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  MASCOTS,
  STICKER_CATALOG,
  STICKER_MAP,
  STICKY_NOTE_COLORS,
  type AestheticCombo,
  type AmbientEffect,
  type AvatarFrame,
  type BoardBackdropId,
  type CardVisualStyle,
  type MascotId,
  type WallpaperPattern,
} from '@/constants/decor-meta';
import { APP_TOUR_STEPS } from '@/constants/guide-data';
import {
  LOGIN_STREAK_REWARDS,
  RARITY_META,
  STICKER_CHESTS,
  STUDENT_MISSIONS,
  WELCOME_BONUS_COINS,
  type ChestId,
  type MissionActionKey,
  type StickerRarity,
} from '@/constants/rewards-meta';
import { shiftIsoDate, todayIso } from '@/lib/date';
import { useAuth } from '@/store/auth-store';
import { useThemePreference } from '@/store/theme-store';

const DECOR_STORAGE_PREFIX = 'class10t4:decor:v2:';

export type AssistantTabKey = 'chat' | 'guide' | 'actions';

export type CanvasItem = {
  id: string;
  kind: 'sticker' | 'note' | 'ribbon';
  stickerId?: string;
  text?: string;
  noteColorId?: string;
  /** Relative position 0..100 (% of canvas width / height) for cross-device responsiveness. */
  x: number;
  y: number;
  scale: number;
  rotation: number;
  zIndex: number;
};

type StoredDecor = {
  wallpaper: WallpaperPattern;
  ambientEffect: AmbientEffect;
  cardStyle: CardVisualStyle;
  avatarFrame: AvatarFrame;
  moodEmoji: string;
  moodText: string;
  heroStickerIds: string[];
  mascotId: MascotId;
  assistantVisible: boolean;
  assistantMinimized: boolean;
  tourCompleted: boolean;
  tourDismissed: boolean;
  canvasBackdrop: BoardBackdropId;
  canvasItems: CanvasItem[];
  pinBoardToHome: boolean;
  unlockedStickers: string[];
  lastGachaDate: string | null;
  completedQuests: string[];
  /* --- Coins, Login Rewards & Student Missions --- */
  coins: number;
  totalCoinsEarned: number;
  loginStreak: number;
  lastLoginRewardDate: string | null;
  welcomeRewardClaimed: boolean;
  missionProgress: Record<string, number>;
  claimedMissions: string[];
};

const STARTER_UNLOCKED_STICKERS = [
  'fox_fpt',
  'k8t4_star',
  'rocket_top',
  'mochi_cat',
  'boba_tea',
  'heart_boom',
  'chill_cloud',
  'party_cake',
  'a_plus',
  'lofi_music',
  'spark_idea',
  'fire_energy',
];

const DEFAULT_CANVAS_ITEMS: CanvasItem[] = [
  {
    id: 'starter-1',
    kind: 'sticker',
    stickerId: 'fox_fpt',
    x: 20,
    y: 28,
    scale: 1.05,
    rotation: -8,
    zIndex: 1,
  },
  {
    id: 'starter-2',
    kind: 'note',
    text: 'K8T4 Mãi Đĩnh!\nHọc hết sức · Chơi hết mình ✨',
    noteColorId: 'yellow',
    x: 56,
    y: 30,
    scale: 1,
    rotation: 4,
    zIndex: 2,
  },
  {
    id: 'starter-3',
    kind: 'sticker',
    stickerId: 'k8t4_star',
    x: 78,
    y: 68,
    scale: 0.95,
    rotation: 7,
    zIndex: 3,
  },
  {
    id: 'starter-4',
    kind: 'sticker',
    stickerId: 'boba_tea',
    x: 25,
    y: 72,
    scale: 0.92,
    rotation: -6,
    zIndex: 4,
  },
];

const DEFAULT_DECOR: StoredDecor = {
  wallpaper: 'dots',
  ambientEffect: 'none',
  cardStyle: 'classic',
  avatarFrame: 'halo',
  moodEmoji: '✨',
  moodText: 'Năng lượng tràn đầy',
  heroStickerIds: ['fox_fpt', 'k8t4_star', 'spark_idea'],
  mascotId: 'foxy',
  assistantVisible: true,
  assistantMinimized: false,
  tourCompleted: false,
  tourDismissed: false,
  canvasBackdrop: 'notebook',
  canvasItems: DEFAULT_CANVAS_ITEMS,
  pinBoardToHome: false,
  unlockedStickers: STARTER_UNLOCKED_STICKERS,
  lastGachaDate: null,
  completedQuests: [],
  coins: 0,
  totalCoinsEarned: 0,
  loginStreak: 0,
  lastLoginRewardDate: null,
  welcomeRewardClaimed: false,
  missionProgress: {},
  claimedMissions: [],
};

export type LoginRewardClaimResult = {
  coins: number;
  bonusWelcomeCoins: number;
  stickerId: string | null;
  isNewSticker: boolean;
  duplicateCoins: number;
  streakDay: number;
  isWelcome: boolean;
};

export type MissionProgressStatus = {
  current: number;
  target: number;
  completed: boolean;
  claimed: boolean;
  readyToClaim: boolean;
};

export type ClaimMissionResult = {
  ok: boolean;
  coins: number;
  stickerId: string | null;
  isNewSticker: boolean;
};

export type ChestOpenResult = {
  ok: boolean;
  error?: string;
  stickerId?: string;
  isNew?: boolean;
  duplicateCoins?: number;
};

export type DecorContextValue = StoredDecor & {
  loaded: boolean;
  /* Ephemeral UI states */
  assistantOpen: boolean;
  assistantTab: AssistantTabKey;
  activeTourStep: number | null;
  celebrationTrigger: number;
  loginRewardModalOpen: boolean;
  /* Appearance & Decoration setters */
  setWallpaper: (w: WallpaperPattern) => void;
  setAmbientEffect: (e: AmbientEffect) => void;
  setCardStyle: (s: CardVisualStyle) => void;
  setAvatarFrame: (f: AvatarFrame) => void;
  setMood: (emoji: string, text: string) => void;
  toggleHeroSticker: (stickerId: string) => void;
  setMascotId: (id: MascotId) => void;
  setAssistantVisible: (visible: boolean) => void;
  setAssistantMinimized: (minimized: boolean) => void;
  applyCombo: (combo: AestheticCombo) => void;
  /* Creative Board actions */
  setCanvasBackdrop: (b: BoardBackdropId) => void;
  setPinBoardToHome: (pin: boolean) => void;
  addStickerToCanvas: (stickerId: string) => string;
  addNoteToCanvas: (text: string, noteColorId?: string) => string;
  addRibbonToCanvas: (text: string) => string;
  updateCanvasItem: (id: string, patch: Partial<Omit<CanvasItem, 'id'>>) => void;
  removeCanvasItem: (id: string) => void;
  duplicateCanvasItem: (id: string) => string | null;
  bringCanvasItemToFront: (id: string) => void;
  shuffleCanvasBoard: () => void;
  clearCanvasBoard: () => void;
  /* Sticker Album, Daily Mystery Gift & Coin Chests */
  canClaimDailySticker: boolean;
  claimDailySticker: () => { stickerId: string; isNew: boolean; coins: number };
  unlockSticker: (stickerId: string) => void;
  openStickerChest: (chestId: ChestId) => ChestOpenResult;
  /* Daily Login Rewards & Streak */
  canClaimLoginReward: boolean;
  nextLoginStreakDay: number;
  claimLoginReward: () => LoginRewardClaimResult;
  openLoginRewardModal: () => void;
  closeLoginRewardModal: () => void;
  /* Real Tracked Student Missions */
  recordMissionProgress: (actionKey: MissionActionKey, delta?: number) => void;
  getMissionStatus: (missionId: string) => MissionProgressStatus;
  claimableMissionCount: number;
  claimMissionReward: (missionId: string) => ClaimMissionResult;
  /* Legacy Quests & Celebrations */
  completeQuest: (questId: string) => void;
  triggerCelebration: () => void;
  /* Assistant Sheet & Guided Tour */
  openAssistant: (tab?: AssistantTabKey) => void;
  closeAssistant: () => void;
  setAssistantTab: (tab: AssistantTabKey) => void;
  startTour: () => void;
  nextTourStep: () => void;
  prevTourStep: () => void;
  endTour: (completed?: boolean) => void;
  dismissTourPrompt: () => void;
  resetDecor: () => void;
};

const DecorContext = createContext<DecorContextValue | null>(null);

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Pick a non-mission-exclusive sticker matching the desired rarity tier (preferring unowned). */
function pickGachaSticker(
  unlocked: string[],
  preferredRarity?: StickerRarity | null,
): { stickerId: string; isNew: boolean } {
  const nonMission = STICKER_CATALOG.filter((s) => !s.missionOnly);
  const byRarity = preferredRarity
    ? nonMission.filter((s) => s.rarity === preferredRarity)
    : nonMission;

  const lockedInTier = byRarity.filter((s) => !unlocked.includes(s.id));
  if (lockedInTier.length > 0) {
    const picked = lockedInTier[Math.floor(Math.random() * lockedInTier.length)];
    return { stickerId: picked.id, isNew: true };
  }

  // If preferred tier is fully owned, try any unowned non-mission sticker of equal or higher/other tier
  const anyLocked = nonMission.filter((s) => !unlocked.includes(s.id));
  if (byRarity.length > 0) {
    const picked = byRarity[Math.floor(Math.random() * byRarity.length)];
    return { stickerId: picked.id, isNew: !unlocked.includes(picked.id) };
  }

  const fallbackPool = anyLocked.length > 0 ? anyLocked : nonMission;
  const picked = fallbackPool[Math.floor(Math.random() * fallbackPool.length)] ?? STICKER_CATALOG[0];
  return { stickerId: picked.id, isNew: !unlocked.includes(picked.id) };
}

function rollWeightedRarity(weights: Partial<Record<StickerRarity, number>>): StickerRarity {
  const entries = Object.entries(weights) as [StickerRarity, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [rarity, weight] of entries) {
    r -= weight;
    if (r <= 0) return rarity;
  }
  return entries[0]?.[0] ?? 'rare';
}

export function DecorProvider({ children }: { children: ReactNode }) {
  const { accountScopeKey } = useAuth();
  const { setMode, setAccentKey } = useThemePreference();
  const [state, setState] = useState<StoredDecor>(DEFAULT_DECOR);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const loaded = loadedScope === accountScopeKey;

  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantTab, setAssistantTab] = useState<AssistantTabKey>('chat');
  const [activeTourStep, setActiveTourStep] = useState<number | null>(null);
  const [celebrationTrigger, setCelebrationTrigger] = useState(0);
  const [loginRewardModalOpen, setLoginRewardModalOpen] = useState(false);

  // Hydrate isolated per-account decor, coins, stickers & missions from AsyncStorage
  useEffect(() => {
    let active = true;

    if (accountScopeKey === 'guest') {
      Promise.resolve().then(() => {
        if (!active) return;
        setState(DEFAULT_DECOR);
        setAssistantOpen(false);
        setActiveTourStep(null);
        setLoginRewardModalOpen(false);
        setLoadedScope('guest');
      });
      return () => {
        active = false;
      };
    }

    const storageKey = `${DECOR_STORAGE_PREFIX}${accountScopeKey}`;
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!active) return;
        setAssistantOpen(false);
        setActiveTourStep(null);
        setLoginRewardModalOpen(false);

        if (!raw) {
          setState(DEFAULT_DECOR);
          return;
        }
        const parsed = JSON.parse(raw) as Partial<StoredDecor> | null;
        if (!parsed || typeof parsed !== 'object') {
          setState(DEFAULT_DECOR);
          return;
        }
        setState({
          ...DEFAULT_DECOR,
          ...parsed,
          mascotId:
            parsed.mascotId && parsed.mascotId in MASCOTS ? parsed.mascotId : DEFAULT_DECOR.mascotId,
          heroStickerIds: Array.isArray(parsed.heroStickerIds)
            ? parsed.heroStickerIds.slice(0, 6)
            : DEFAULT_DECOR.heroStickerIds,
          canvasItems: Array.isArray(parsed.canvasItems)
            ? parsed.canvasItems
            : DEFAULT_DECOR.canvasItems,
          unlockedStickers: Array.isArray(parsed.unlockedStickers)
            ? Array.from(new Set([...STARTER_UNLOCKED_STICKERS, ...parsed.unlockedStickers]))
            : DEFAULT_DECOR.unlockedStickers,
          completedQuests: Array.isArray(parsed.completedQuests)
            ? parsed.completedQuests
            : DEFAULT_DECOR.completedQuests,
          coins: typeof parsed.coins === 'number' && Number.isFinite(parsed.coins) ? parsed.coins : 0,
          totalCoinsEarned:
            typeof parsed.totalCoinsEarned === 'number' && Number.isFinite(parsed.totalCoinsEarned)
              ? parsed.totalCoinsEarned
              : typeof parsed.coins === 'number'
                ? parsed.coins
                : 0,
          loginStreak:
            typeof parsed.loginStreak === 'number' && Number.isFinite(parsed.loginStreak)
              ? parsed.loginStreak
              : 0,
          lastLoginRewardDate:
            typeof parsed.lastLoginRewardDate === 'string' ? parsed.lastLoginRewardDate : null,
          welcomeRewardClaimed: Boolean(parsed.welcomeRewardClaimed),
          missionProgress:
            parsed.missionProgress && typeof parsed.missionProgress === 'object'
              ? parsed.missionProgress
              : {},
          claimedMissions: Array.isArray(parsed.claimedMissions) ? parsed.claimedMissions : [],
        });
      })
      .catch(() => {
        if (active) setState(DEFAULT_DECOR);
      })
      .finally(() => {
        if (active) setLoadedScope(accountScopeKey);
      });
    return () => {
      active = false;
    };
  }, [accountScopeKey]);

  // Persist changes ONLY to the currently hydrated account scope
  useEffect(() => {
    if (!loaded || accountScopeKey === 'guest') return;
    AsyncStorage.setItem(`${DECOR_STORAGE_PREFIX}${accountScopeKey}`, JSON.stringify(state)).catch(
      () => {},
    );
  }, [state, loaded, accountScopeKey]);

  const triggerCelebration = useCallback(() => {
    setCelebrationTrigger((n) => n + 1);
  }, []);

  const openLoginRewardModal = useCallback(() => {
    setLoginRewardModalOpen(true);
  }, []);

  const closeLoginRewardModal = useCallback(() => {
    setLoginRewardModalOpen(false);
  }, []);

  const recordMissionProgress = useCallback((actionKey: MissionActionKey, delta = 1) => {
    if (delta <= 0) return;
    setState((prev) => ({
      ...prev,
      missionProgress: {
        ...prev.missionProgress,
        [actionKey]: (prev.missionProgress[actionKey] ?? 0) + delta,
      },
    }));
  }, []);

  const completeQuest = useCallback((questId: string) => {
    setState((prev) => {
      const nextQuests = prev.completedQuests.includes(questId)
        ? prev.completedQuests
        : [...prev.completedQuests, questId];
      const nextProg = { ...prev.missionProgress };
      if (questId === 'decorate') nextProg.decorate = Math.max(nextProg.decorate ?? 0, 1);
      if (questId === 'card') nextProg.design_card = (nextProg.design_card ?? 0) + 1;
      if (questId === 'chat') nextProg.chat_assistant = (nextProg.chat_assistant ?? 0) + 1;
      if (questId === 'tour') nextProg.tour_complete = Math.max(nextProg.tour_complete ?? 0, 1);
      return {
        ...prev,
        completedQuests: nextQuests,
        missionProgress: nextProg,
      };
    });
  }, []);

  const unlockSticker = useCallback((stickerId: string) => {
    setState((prev) => {
      if (prev.unlockedStickers.includes(stickerId)) return prev;
      return { ...prev, unlockedStickers: [...prev.unlockedStickers, stickerId] };
    });
  }, []);

  const setWallpaper = useCallback((wallpaper: WallpaperPattern) => {
    setState((prev) => ({
      ...prev,
      wallpaper,
      completedQuests: prev.completedQuests.includes('decorate')
        ? prev.completedQuests
        : [...prev.completedQuests, 'decorate'],
      missionProgress: {
        ...prev.missionProgress,
        decorate: Math.max(prev.missionProgress.decorate ?? 0, 1),
      },
    }));
  }, []);

  const setAmbientEffect = useCallback((ambientEffect: AmbientEffect) => {
    setState((prev) => ({
      ...prev,
      ambientEffect,
      completedQuests: prev.completedQuests.includes('decorate')
        ? prev.completedQuests
        : [...prev.completedQuests, 'decorate'],
      missionProgress: {
        ...prev.missionProgress,
        decorate: Math.max(prev.missionProgress.decorate ?? 0, 1),
      },
    }));
  }, []);

  const setCardStyle = useCallback((cardStyle: CardVisualStyle) => {
    setState((prev) => ({
      ...prev,
      cardStyle,
      completedQuests: prev.completedQuests.includes('decorate')
        ? prev.completedQuests
        : [...prev.completedQuests, 'decorate'],
      missionProgress: {
        ...prev.missionProgress,
        decorate: Math.max(prev.missionProgress.decorate ?? 0, 1),
      },
    }));
  }, []);

  const setAvatarFrame = useCallback((avatarFrame: AvatarFrame) => {
    setState((prev) => ({ ...prev, avatarFrame }));
  }, []);

  const setMood = useCallback((moodEmoji: string, moodText: string) => {
    setState((prev) => ({ ...prev, moodEmoji, moodText }));
  }, []);

  const toggleHeroSticker = useCallback((stickerId: string) => {
    setState((prev) => {
      const exists = prev.heroStickerIds.includes(stickerId);
      const next = exists
        ? prev.heroStickerIds.filter((id) => id !== stickerId)
        : [...prev.heroStickerIds, stickerId].slice(-6);
      return { ...prev, heroStickerIds: next };
    });
  }, []);

  const setMascotId = useCallback((mascotId: MascotId) => {
    setState((prev) => ({ ...prev, mascotId }));
  }, []);

  const setAssistantVisible = useCallback((assistantVisible: boolean) => {
    setState((prev) => ({ ...prev, assistantVisible }));
  }, []);

  const setAssistantMinimized = useCallback((assistantMinimized: boolean) => {
    setState((prev) => ({ ...prev, assistantMinimized }));
  }, []);

  const applyCombo = useCallback(
    (combo: AestheticCombo) => {
      setMode(combo.mode);
      setAccentKey(combo.accent);
      setState((prev) => {
        const safeHero = combo.heroStickers.filter((id) => !STICKER_MAP[id]?.missionOnly);
        return {
          ...prev,
          wallpaper: combo.wallpaper,
          ambientEffect: combo.ambientEffect,
          cardStyle: combo.cardStyle,
          avatarFrame: combo.avatarFrame,
          mascotId: combo.mascotId,
          heroStickerIds: safeHero,
          unlockedStickers: Array.from(new Set([...prev.unlockedStickers, ...safeHero])),
          completedQuests: prev.completedQuests.includes('decorate')
            ? prev.completedQuests
            : [...prev.completedQuests, 'decorate'],
          missionProgress: {
            ...prev.missionProgress,
            decorate: Math.max(prev.missionProgress.decorate ?? 0, 1),
          },
        };
      });
      triggerCelebration();
    },
    [setMode, setAccentKey, triggerCelebration],
  );

  /* ---------- Creative Board Actions ---------- */

  const setCanvasBackdrop = useCallback((canvasBackdrop: BoardBackdropId) => {
    setState((prev) => ({ ...prev, canvasBackdrop }));
  }, []);

  const setPinBoardToHome = useCallback((pinBoardToHome: boolean) => {
    setState((prev) => ({ ...prev, pinBoardToHome }));
  }, []);

  const addStickerToCanvas = useCallback((stickerId: string) => {
    const id = makeId('stk');
    setState((prev) => {
      const maxZ = prev.canvasItems.reduce((m, it) => Math.max(m, it.zIndex), 0);
      const item: CanvasItem = {
        id,
        kind: 'sticker',
        stickerId,
        x: 24 + Math.round(Math.random() * 52),
        y: 22 + Math.round(Math.random() * 56),
        scale: 1,
        rotation: Math.round((Math.random() - 0.5) * 18),
        zIndex: maxZ + 1,
      };
      return {
        ...prev,
        canvasItems: [...prev.canvasItems.slice(-24), item],
        completedQuests: prev.completedQuests.includes('board')
          ? prev.completedQuests
          : [...prev.completedQuests, 'board'],
        missionProgress: {
          ...prev.missionProgress,
          board_add: (prev.missionProgress.board_add ?? 0) + 1,
        },
      };
    });
    return id;
  }, []);

  const addNoteToCanvas = useCallback((text: string, noteColorId = 'yellow') => {
    const id = makeId('note');
    setState((prev) => {
      const maxZ = prev.canvasItems.reduce((m, it) => Math.max(m, it.zIndex), 0);
      const item: CanvasItem = {
        id,
        kind: 'note',
        text: text.trim() || 'Ghi chú 10T4 ✨',
        noteColorId,
        x: 30 + Math.round(Math.random() * 40),
        y: 25 + Math.round(Math.random() * 48),
        scale: 1,
        rotation: Math.round((Math.random() - 0.5) * 12),
        zIndex: maxZ + 1,
      };
      return {
        ...prev,
        canvasItems: [...prev.canvasItems.slice(-24), item],
        completedQuests: prev.completedQuests.includes('board')
          ? prev.completedQuests
          : [...prev.completedQuests, 'board'],
        missionProgress: {
          ...prev.missionProgress,
          board_add: (prev.missionProgress.board_add ?? 0) + 1,
        },
      };
    });
    return id;
  }, []);

  const addRibbonToCanvas = useCallback((text: string) => {
    const id = makeId('rib');
    setState((prev) => {
      const maxZ = prev.canvasItems.reduce((m, it) => Math.max(m, it.zIndex), 0);
      const item: CanvasItem = {
        id,
        kind: 'ribbon',
        text: text.trim() || 'Lớp 10T4 · Mãi Đĩnh!',
        x: 50,
        y: 18 + Math.round(Math.random() * 60),
        scale: 1,
        rotation: Math.round((Math.random() - 0.5) * 8),
        zIndex: maxZ + 1,
      };
      return {
        ...prev,
        canvasItems: [...prev.canvasItems.slice(-24), item],
        completedQuests: prev.completedQuests.includes('board')
          ? prev.completedQuests
          : [...prev.completedQuests, 'board'],
        missionProgress: {
          ...prev.missionProgress,
          board_add: (prev.missionProgress.board_add ?? 0) + 1,
        },
      };
    });
    return id;
  }, []);

  const updateCanvasItem = useCallback((id: string, patch: Partial<Omit<CanvasItem, 'id'>>) => {
    setState((prev) => ({
      ...prev,
      canvasItems: prev.canvasItems.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));
  }, []);

  const removeCanvasItem = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      canvasItems: prev.canvasItems.filter((it) => it.id !== id),
    }));
  }, []);

  const duplicateCanvasItem = useCallback((id: string) => {
    let createdId: string | null = null;
    setState((prev) => {
      const target = prev.canvasItems.find((it) => it.id === id);
      if (!target) return prev;
      const maxZ = prev.canvasItems.reduce((m, it) => Math.max(m, it.zIndex), 0);
      createdId = makeId(target.kind);
      const copy: CanvasItem = {
        ...target,
        id: createdId,
        x: Math.min(88, target.x + 8),
        y: Math.min(86, target.y + 8),
        zIndex: maxZ + 1,
      };
      return { ...prev, canvasItems: [...prev.canvasItems.slice(-24), copy] };
    });
    return createdId;
  }, []);

  const bringCanvasItemToFront = useCallback((id: string) => {
    setState((prev) => {
      const maxZ = prev.canvasItems.reduce((m, it) => Math.max(m, it.zIndex), 0);
      return {
        ...prev,
        canvasItems: prev.canvasItems.map((it) =>
          it.id === id ? { ...it, zIndex: maxZ + 1 } : it,
        ),
      };
    });
  }, []);

  const shuffleCanvasBoard = useCallback(() => {
    setState((prev) => {
      const pool = prev.unlockedStickers.length > 0 ? prev.unlockedStickers : STARTER_UNLOCKED_STICKERS;
      const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, 4);
      const noteColor = STICKY_NOTE_COLORS[Math.floor(Math.random() * STICKY_NOTE_COLORS.length)].id;
      const notes = [
        'Lớp 10T4 quyết tâm\nHạng S học kỳ này! 🚀',
        'K8T4 Mãi Đĩnh!\nĐoàn kết · Sáng tạo ✨',
        'Đừng quên gửi Kudos\ncho bạn cùng bàn nhé 💖',
        'Tập trung 25 phút\nChinh phục điểm 10! 📚',
      ];
      const noteText = notes[Math.floor(Math.random() * notes.length)];
      const positions = [
        { x: 20, y: 26, r: -10 },
        { x: 80, y: 24, r: 9 },
        { x: 22, y: 74, r: 7 },
        { x: 78, y: 76, r: -8 },
      ];
      const nextItems: CanvasItem[] = [
        ...picked.map((stickerId, idx) => ({
          id: makeId('stk'),
          kind: 'sticker' as const,
          stickerId,
          x: positions[idx].x,
          y: positions[idx].y,
          scale: 0.96 + (idx % 2) * 0.1,
          rotation: positions[idx].r,
          zIndex: idx + 1,
        })),
        {
          id: makeId('note'),
          kind: 'note' as const,
          text: noteText,
          noteColorId: noteColor,
          x: 50,
          y: 50,
          scale: 1.05,
          rotation: Math.round((Math.random() - 0.5) * 8),
          zIndex: 10,
        },
      ];
      return {
        ...prev,
        canvasItems: nextItems,
        completedQuests: prev.completedQuests.includes('board')
          ? prev.completedQuests
          : [...prev.completedQuests, 'board'],
        missionProgress: {
          ...prev.missionProgress,
          board_add: (prev.missionProgress.board_add ?? 0) + 1,
        },
      };
    });
    triggerCelebration();
  }, [triggerCelebration]);

  const clearCanvasBoard = useCallback(() => {
    setState((prev) => ({ ...prev, canvasItems: [] }));
  }, []);

  /* ---------- Daily Login Rewards & 7-Day Streak ---------- */

  const today = todayIso();
  const yesterday = shiftIsoDate(today, -1);
  const canClaimLoginReward = state.lastLoginRewardDate !== today;

  const nextLoginStreakDay = useMemo(() => {
    if (!canClaimLoginReward) {
      return Math.max(1, ((state.loginStreak - 1) % 7) + 1);
    }
    if (state.lastLoginRewardDate === yesterday && state.loginStreak > 0) {
      return (state.loginStreak % 7) + 1;
    }
    return 1;
  }, [canClaimLoginReward, state.lastLoginRewardDate, state.loginStreak, yesterday]);

  const claimLoginReward = useCallback((): LoginRewardClaimResult => {
    const nowDay = todayIso();
    const yest = shiftIsoDate(nowDay, -1);
    const isWelcome = !state.welcomeRewardClaimed;
    const nextStreakTotal =
      state.lastLoginRewardDate === yest ? state.loginStreak + 1 : 1;
    const cycleDay = ((nextStreakTotal - 1) % 7) + 1;
    const rewardDef = LOGIN_STREAK_REWARDS[cycleDay - 1] ?? LOGIN_STREAK_REWARDS[0];

    const bonusWelcomeCoins = isWelcome ? WELCOME_BONUS_COINS : 0;
    const baseCoins = rewardDef.coins + bonusWelcomeCoins;

    let stickerId: string | null = null;
    let isNewSticker = false;
    let duplicateCoins = 0;

    // Grant a welcome Rare/Common sticker on first login, or the scheduled streak tier sticker.
    const tierToAward: StickerRarity | null = isWelcome
      ? 'rare'
      : rewardDef.stickerTier;

    if (tierToAward) {
      const picked = pickGachaSticker(state.unlockedStickers, tierToAward);
      stickerId = picked.stickerId;
      isNewSticker = picked.isNew;
      if (!isNewSticker) {
        const meta = STICKER_MAP[stickerId];
        duplicateCoins = RARITY_META[meta?.rarity ?? 'common'].duplicateCoins;
      }
    }

    const totalCoinsGained = baseCoins + duplicateCoins;

    setState((prev) => ({
      ...prev,
      coins: prev.coins + totalCoinsGained,
      totalCoinsEarned: prev.totalCoinsEarned + totalCoinsGained,
      loginStreak: nextStreakTotal,
      lastLoginRewardDate: nowDay,
      welcomeRewardClaimed: true,
      unlockedStickers:
        stickerId && !prev.unlockedStickers.includes(stickerId)
          ? [...prev.unlockedStickers, stickerId]
          : prev.unlockedStickers,
    }));

    triggerCelebration();
    return {
      coins: totalCoinsGained,
      bonusWelcomeCoins,
      stickerId,
      isNewSticker,
      duplicateCoins,
      streakDay: cycleDay,
      isWelcome,
    };
  }, [
    state.welcomeRewardClaimed,
    state.lastLoginRewardDate,
    state.loginStreak,
    state.unlockedStickers,
    triggerCelebration,
  ]);

  /* ---------- Daily Free Mystery Sticker Gacha ---------- */

  const canClaimDailySticker = state.lastGachaDate !== today;

  const claimDailySticker = useCallback(() => {
    const rolledRarity = rollWeightedRarity({ common: 55, rare: 33, epic: 10, legendary: 2 });
    const { stickerId, isNew } = pickGachaSticker(state.unlockedStickers, rolledRarity);
    const meta = STICKER_MAP[stickerId];
    const bonusCoins = 25 + (isNew ? 0 : RARITY_META[meta?.rarity ?? 'common'].duplicateCoins);

    setState((prev) => ({
      ...prev,
      lastGachaDate: todayIso(),
      coins: prev.coins + bonusCoins,
      totalCoinsEarned: prev.totalCoinsEarned + bonusCoins,
      unlockedStickers: isNew ? [...prev.unlockedStickers, stickerId] : prev.unlockedStickers,
      completedQuests: prev.completedQuests.includes('gacha')
        ? prev.completedQuests
        : [...prev.completedQuests, 'gacha'],
    }));
    triggerCelebration();
    return { stickerId, isNew, coins: bonusCoins };
  }, [state.unlockedStickers, triggerCelebration]);

  /* ---------- Coin Mystery Chests ---------- */

  const openStickerChest = useCallback(
    (chestId: ChestId): ChestOpenResult => {
      const chest = STICKER_CHESTS.find((c) => c.id === chestId);
      if (!chest) return { ok: false, error: 'Không tìm thấy rương quà.' };
      if (state.coins < chest.cost) {
        return {
          ok: false,
          error: `Cần ${chest.cost} Xu (bạn đang có ${state.coins} Xu). Hãy làm Nhiệm vụ hoặc điểm danh để nhận thêm Xu!`,
        };
      }

      const rolledRarity = rollWeightedRarity(chest.weights);
      const { stickerId, isNew } = pickGachaSticker(state.unlockedStickers, rolledRarity);
      const meta = STICKER_MAP[stickerId];
      const duplicateCoins = isNew ? 0 : RARITY_META[meta?.rarity ?? 'common'].duplicateCoins;

      setState((prev) => ({
        ...prev,
        coins: prev.coins - chest.cost + duplicateCoins,
        totalCoinsEarned: prev.totalCoinsEarned + duplicateCoins,
        unlockedStickers: isNew ? [...prev.unlockedStickers, stickerId] : prev.unlockedStickers,
      }));
      triggerCelebration();

      return { ok: true, stickerId, isNew, duplicateCoins };
    },
    [state.coins, state.unlockedStickers, triggerCelebration],
  );

  /* ---------- Real Tracked Student Missions ---------- */

  const getMissionStatus = useCallback(
    (missionId: string): MissionProgressStatus => {
      const mission = STUDENT_MISSIONS.find((m) => m.id === missionId);
      if (!mission) {
        return { current: 0, target: 1, completed: false, claimed: false, readyToClaim: false };
      }

      let rawCurrent = state.missionProgress[mission.actionKey] ?? 0;
      if (mission.actionKey === 'missions_claimed') {
        rawCurrent = state.claimedMissions.length;
      } else if (mission.actionKey === 'total_coins') {
        rawCurrent = state.totalCoinsEarned;
      } else if (mission.actionKey === 'tour_complete') {
        rawCurrent = Math.max(rawCurrent, state.tourCompleted ? 1 : 0);
      }

      const current = Math.min(rawCurrent, mission.target);
      const completed = rawCurrent >= mission.target;
      const claimed = state.claimedMissions.includes(mission.id);
      return {
        current,
        target: mission.target,
        completed,
        claimed,
        readyToClaim: completed && !claimed,
      };
    },
    [state.missionProgress, state.claimedMissions, state.totalCoinsEarned, state.tourCompleted],
  );

  const claimableMissionCount = useMemo(
    () => STUDENT_MISSIONS.filter((m) => getMissionStatus(m.id).readyToClaim).length,
    [getMissionStatus],
  );

  const claimMissionReward = useCallback(
    (missionId: string): ClaimMissionResult => {
      const mission = STUDENT_MISSIONS.find((m) => m.id === missionId);
      const status = getMissionStatus(missionId);
      if (!mission || !status.readyToClaim) {
        return { ok: false, coins: 0, stickerId: null, isNewSticker: false };
      }

      const isNewSticker = !state.unlockedStickers.includes(mission.stickerId);

      setState((prev) => ({
        ...prev,
        coins: prev.coins + mission.coinReward,
        totalCoinsEarned: prev.totalCoinsEarned + mission.coinReward,
        claimedMissions: prev.claimedMissions.includes(mission.id)
          ? prev.claimedMissions
          : [...prev.claimedMissions, mission.id],
        unlockedStickers: prev.unlockedStickers.includes(mission.stickerId)
          ? prev.unlockedStickers
          : [...prev.unlockedStickers, mission.stickerId],
      }));
      triggerCelebration();

      return {
        ok: true,
        coins: mission.coinReward,
        stickerId: mission.stickerId,
        isNewSticker,
      };
    },
    [getMissionStatus, state.unlockedStickers, triggerCelebration],
  );

  /* ---------- Assistant Sheet & Guided Tour ---------- */

  const openAssistant = useCallback((tab: AssistantTabKey = 'chat') => {
    setAssistantTab(tab);
    setAssistantOpen(true);
  }, []);

  const closeAssistant = useCallback(() => {
    setAssistantOpen(false);
  }, []);

  const startTour = useCallback(() => {
    setAssistantOpen(false);
    setActiveTourStep(0);
    const first = APP_TOUR_STEPS[0];
    if (first) router.navigate(first.route as never);
  }, []);

  const endTour = useCallback(
    (completed = false) => {
      setActiveTourStep(null);
      if (completed) {
        setState((prev) => ({
          ...prev,
          tourCompleted: true,
          tourDismissed: true,
          unlockedStickers: prev.unlockedStickers.includes('explorer_compass')
            ? prev.unlockedStickers
            : [...prev.unlockedStickers, 'explorer_compass'],
          completedQuests: prev.completedQuests.includes('tour')
            ? prev.completedQuests
            : [...prev.completedQuests, 'tour'],
          missionProgress: {
            ...prev.missionProgress,
            tour_complete: Math.max(prev.missionProgress.tour_complete ?? 0, 1),
          },
        }));
        triggerCelebration();
      }
    },
    [triggerCelebration],
  );

  const nextTourStep = useCallback(() => {
    setActiveTourStep((prev) => {
      if (prev === null) return null;
      const next = prev + 1;
      if (next >= APP_TOUR_STEPS.length) {
        setTimeout(() => endTour(true), 0);
        return null;
      }
      router.navigate(APP_TOUR_STEPS[next].route as never);
      return next;
    });
  }, [endTour]);

  const prevTourStep = useCallback(() => {
    setActiveTourStep((prev) => {
      if (prev === null || prev <= 0) return prev;
      const target = prev - 1;
      router.navigate(APP_TOUR_STEPS[target].route as never);
      return target;
    });
  }, []);

  const dismissTourPrompt = useCallback(() => {
    setState((prev) => ({ ...prev, tourDismissed: true }));
  }, []);

  const resetDecor = useCallback(() => {
    setState((prev) => ({
      ...DEFAULT_DECOR,
      tourCompleted: prev.tourCompleted,
      tourDismissed: prev.tourDismissed,
      unlockedStickers: prev.unlockedStickers,
      completedQuests: prev.completedQuests,
      coins: prev.coins,
      totalCoinsEarned: prev.totalCoinsEarned,
      loginStreak: prev.loginStreak,
      lastLoginRewardDate: prev.lastLoginRewardDate,
      welcomeRewardClaimed: prev.welcomeRewardClaimed,
      missionProgress: prev.missionProgress,
      claimedMissions: prev.claimedMissions,
    }));
  }, []);

  const value = useMemo<DecorContextValue>(
    () => ({
      ...state,
      loaded,
      assistantOpen,
      assistantTab,
      activeTourStep,
      celebrationTrigger,
      loginRewardModalOpen,
      setWallpaper,
      setAmbientEffect,
      setCardStyle,
      setAvatarFrame,
      setMood,
      toggleHeroSticker,
      setMascotId,
      setAssistantVisible,
      setAssistantMinimized,
      applyCombo,
      setCanvasBackdrop,
      setPinBoardToHome,
      addStickerToCanvas,
      addNoteToCanvas,
      addRibbonToCanvas,
      updateCanvasItem,
      removeCanvasItem,
      duplicateCanvasItem,
      bringCanvasItemToFront,
      shuffleCanvasBoard,
      clearCanvasBoard,
      canClaimDailySticker,
      claimDailySticker,
      unlockSticker,
      openStickerChest,
      canClaimLoginReward,
      nextLoginStreakDay,
      claimLoginReward,
      openLoginRewardModal,
      closeLoginRewardModal,
      recordMissionProgress,
      getMissionStatus,
      claimableMissionCount,
      claimMissionReward,
      completeQuest,
      triggerCelebration,
      openAssistant,
      closeAssistant,
      setAssistantTab,
      startTour,
      nextTourStep,
      prevTourStep,
      endTour,
      dismissTourPrompt,
      resetDecor,
    }),
    [
      state,
      loaded,
      assistantOpen,
      assistantTab,
      activeTourStep,
      celebrationTrigger,
      loginRewardModalOpen,
      setWallpaper,
      setAmbientEffect,
      setCardStyle,
      setAvatarFrame,
      setMood,
      toggleHeroSticker,
      setMascotId,
      setAssistantVisible,
      setAssistantMinimized,
      applyCombo,
      setCanvasBackdrop,
      setPinBoardToHome,
      addStickerToCanvas,
      addNoteToCanvas,
      addRibbonToCanvas,
      updateCanvasItem,
      removeCanvasItem,
      duplicateCanvasItem,
      bringCanvasItemToFront,
      shuffleCanvasBoard,
      clearCanvasBoard,
      canClaimDailySticker,
      claimDailySticker,
      unlockSticker,
      openStickerChest,
      canClaimLoginReward,
      nextLoginStreakDay,
      claimLoginReward,
      openLoginRewardModal,
      closeLoginRewardModal,
      recordMissionProgress,
      getMissionStatus,
      claimableMissionCount,
      claimMissionReward,
      completeQuest,
      triggerCelebration,
      openAssistant,
      closeAssistant,
      startTour,
      nextTourStep,
      prevTourStep,
      endTour,
      dismissTourPrompt,
      resetDecor,
    ],
  );

  return <DecorContext.Provider value={value}>{children}</DecorContext.Provider>;
}

export function useDecor(): DecorContextValue {
  const ctx = useContext(DecorContext);
  if (ctx) return ctx;
  return {
    ...DEFAULT_DECOR,
    loaded: true,
    assistantOpen: false,
    assistantTab: 'chat',
    activeTourStep: null,
    celebrationTrigger: 0,
    loginRewardModalOpen: false,
    setWallpaper: () => {},
    setAmbientEffect: () => {},
    setCardStyle: () => {},
    setAvatarFrame: () => {},
    setMood: () => {},
    toggleHeroSticker: () => {},
    setMascotId: () => {},
    setAssistantVisible: () => {},
    setAssistantMinimized: () => {},
    applyCombo: () => {},
    setCanvasBackdrop: () => {},
    setPinBoardToHome: () => {},
    addStickerToCanvas: () => '',
    addNoteToCanvas: () => '',
    addRibbonToCanvas: () => '',
    updateCanvasItem: () => {},
    removeCanvasItem: () => {},
    duplicateCanvasItem: () => null,
    bringCanvasItemToFront: () => {},
    shuffleCanvasBoard: () => {},
    clearCanvasBoard: () => {},
    canClaimDailySticker: false,
    claimDailySticker: () => ({ stickerId: 'fox_fpt', isNew: false, coins: 0 }),
    unlockSticker: () => {},
    openStickerChest: () => ({ ok: false }),
    canClaimLoginReward: false,
    nextLoginStreakDay: 1,
    claimLoginReward: () => ({
      coins: 0,
      bonusWelcomeCoins: 0,
      stickerId: null,
      isNewSticker: false,
      duplicateCoins: 0,
      streakDay: 1,
      isWelcome: false,
    }),
    openLoginRewardModal: () => {},
    closeLoginRewardModal: () => {},
    recordMissionProgress: () => {},
    getMissionStatus: () => ({
      current: 0,
      target: 1,
      completed: false,
      claimed: false,
      readyToClaim: false,
    }),
    claimableMissionCount: 0,
    claimMissionReward: () => ({ ok: false, coins: 0, stickerId: null, isNewSticker: false }),
    completeQuest: () => {},
    triggerCelebration: () => {},
    openAssistant: () => {},
    closeAssistant: () => {},
    setAssistantTab: () => {},
    startTour: () => {},
    nextTourStep: () => {},
    prevTourStep: () => {},
    endTour: () => {},
    dismissTourPrompt: () => {},
    resetDecor: () => {},
  };
}
