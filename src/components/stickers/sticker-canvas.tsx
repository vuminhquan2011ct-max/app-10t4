/**
 * Interactive drag-and-drop Sticker, Sticky-Note & Ribbon Canvas.
 *
 * Works seamlessly on iOS, Android, and Web (touch + mouse) via PanResponder,
 * with relative % coordinates so saved boards look great on every screen size.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';

import { StickerBadge } from '@/components/stickers/sticker-art';
import {
  BOARD_BACKDROPS,
  STICKY_NOTE_COLORS,
  type BoardBackdropId,
} from '@/constants/decor-meta';
import { Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CanvasItem } from '@/store/decor-store';

type StickerCanvasProps = {
  backdrop: BoardBackdropId;
  items: CanvasItem[];
  height?: number;
  interactive?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onDragStateChange?: (dragging: boolean) => void;
};

type DraggableItemProps = {
  item: CanvasItem;
  canvasW: number;
  canvasH: number;
  interactive: boolean;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onDragStateChange?: (dragging: boolean) => void;
};

function DraggableCanvasItem({
  item,
  canvasW,
  canvasH,
  interactive,
  selected,
  onSelect,
  onMove,
  onDragStateChange,
}: DraggableItemProps) {
  const theme = useTheme();
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const dragOriginRef = useRef<{
    pageX: number;
    pageY: number;
    itemX: number;
    itemY: number;
  } | null>(null);

  const handleGrant = (e: GestureResponderEvent) => {
    if (!interactive) return;
    dragOriginRef.current = {
      pageX: e.nativeEvent.pageX,
      pageY: e.nativeEvent.pageY,
      itemX: item.x,
      itemY: item.y,
    };
    onSelect();
    onDragStateChange?.(true);
    setDragOffset({ dx: 0, dy: 0 });
  };

  const handleMove = (e: GestureResponderEvent) => {
    const origin = dragOriginRef.current;
    if (!origin) return;
    setDragOffset({
      dx: e.nativeEvent.pageX - origin.pageX,
      dy: e.nativeEvent.pageY - origin.pageY,
    });
  };

  const handleRelease = (e: GestureResponderEvent) => {
    const origin = dragOriginRef.current;
    dragOriginRef.current = null;
    if (origin && canvasW > 0 && canvasH > 0) {
      const dx = e.nativeEvent.pageX - origin.pageX;
      const dy = e.nativeEvent.pageY - origin.pageY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        const nextX = Math.max(8, Math.min(92, origin.itemX + (dx / canvasW) * 100));
        const nextY = Math.max(10, Math.min(90, origin.itemY + (dy / canvasH) * 100));
        onMove(Math.round(nextX * 10) / 10, Math.round(nextY * 10) / 10);
      }
    }
    setDragOffset(null);
    onDragStateChange?.(false);
  };

  const handleTerminate = () => {
    dragOriginRef.current = null;
    setDragOffset(null);
    onDragStateChange?.(false);
  };

  const pxX = (item.x / 100) * canvasW + (dragOffset?.dx ?? 0);
  const pxY = (item.y / 100) * canvasH + (dragOffset?.dy ?? 0);

  const noteMeta =
    STICKY_NOTE_COLORS.find((c) => c.id === item.noteColorId) ?? STICKY_NOTE_COLORS[0];

  const baseSize = interactive ? 1 : 0.72;
  const effectiveScale = item.scale * baseSize;

  return (
    <View
      onStartShouldSetResponder={() => interactive}
      onMoveShouldSetResponder={() => interactive}
      onResponderTerminationRequest={() => false}
      onResponderGrant={handleGrant}
      onResponderMove={handleMove}
      onResponderRelease={handleRelease}
      onResponderTerminate={handleTerminate}
      style={[
        styles.itemAnchor,
        {
          left: pxX,
          top: pxY,
          zIndex: selected ? 999 : item.zIndex,
          transform: [
            { translateX: -62 },
            { translateY: -44 },
            { scale: dragOffset ? effectiveScale * 1.06 : effectiveScale },
            { rotate: `${item.rotation}deg` },
          ],
        },
      ]}>
      <View
        style={[
          styles.itemBox,
          selected &&
            interactive && {
              borderColor: theme.accent,
              borderWidth: 2,
              borderStyle: 'dashed',
              backgroundColor: 'rgba(255,255,255,0.16)',
            },
        ]}>
        {item.kind === 'sticker' ? (
          <StickerBadge id={item.stickerId ?? 'fox_fpt'} size={70} showRibbon />
        ) : item.kind === 'note' ? (
          <View style={[styles.stickyNote, { backgroundColor: noteMeta.bg }]}>
            <View style={[styles.pinDot, { backgroundColor: noteMeta.pin }]} />
            <Text style={[styles.noteText, { color: noteMeta.text }]} numberOfLines={4}>
              {item.text ?? 'Ghi chú 10T4 ✨'}
            </Text>
          </View>
        ) : (
          <LinearGradient
            colors={[theme.gradientStart, theme.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ribbonBanner}>
            <Text style={styles.ribbonText} numberOfLines={1}>
              {item.text ?? 'Lớp 10T4 · Mãi Đĩnh!'}
            </Text>
          </LinearGradient>
        )}
      </View>
    </View>
  );
}

export function StickerCanvas({
  backdrop,
  items,
  height = 350,
  interactive = true,
  selectedId = null,
  onSelect,
  onMove,
  onDragStateChange,
}: StickerCanvasProps) {
  const [size, setSize] = useState({ width: 320, height });
  const meta = BOARD_BACKDROPS[backdrop] ?? BOARD_BACKDROPS.notebook;

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    if (width > 0 && h > 0) setSize({ width, height: h });
  };

  return (
    <View
      onLayout={handleLayout}
      onStartShouldSetResponder={() => interactive}
      onResponderRelease={() => {
        if (interactive) onSelect?.(null);
      }}
      style={[
        styles.board,
        Shadow.card,
        {
          height,
          borderColor: meta.borderColor,
          borderWidth: backdrop === 'chalk' || backdrop === 'cork' ? 4 : 1.5,
        },
      ]}>
      <LinearGradient
        colors={meta.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle decorative dots / grid inside board */}
      <View pointerEvents="none" style={styles.patternGrid}>
        {Array.from({ length: 24 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.gridDot,
              {
                backgroundColor: meta.gridColor,
                left: `${(i % 6) * 18 + 6}%` as `${number}%`,
                top: `${Math.floor(i / 6) * 26 + 10}%` as `${number}%`,
              },
            ]}
          />
        ))}
      </View>

      {/* Watermark corner label */}
      <View pointerEvents="none" style={styles.watermark}>
        <Text style={[styles.watermarkText, { color: meta.textColor }]}>
          {`${meta.emoji} Bảng 10T4`}
        </Text>
      </View>

      {items.length === 0 ? (
        <View pointerEvents="none" style={styles.emptyWrap}>
          <Text style={[styles.emptyTitle, { color: meta.textColor }]}>
            Chạm Sticker hoặc Giấy nhớ bên dưới để dán vào bảng! ✨
          </Text>
        </View>
      ) : null}

      {items.map((item) => (
        <DraggableCanvasItem
          key={item.id}
          item={item}
          canvasW={size.width}
          canvasH={size.height}
          interactive={interactive}
          selected={selectedId === item.id}
          onSelect={() => onSelect?.(item.id)}
          onMove={(x, y) => onMove?.(item.id, x, y)}
          onDragStateChange={onDragStateChange}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    width: '100%',
    borderRadius: Radius.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  patternGrid: {
    ...StyleSheet.absoluteFill,
  },
  gridDot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  watermark: {
    position: 'absolute',
    bottom: 10,
    right: 12,
    opacity: 0.45,
  },
  watermarkText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  emptyWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    opacity: 0.72,
  },
  itemAnchor: {
    position: 'absolute',
    width: 124,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBox: {
    padding: 5,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyNote: {
    width: 112,
    minHeight: 74,
    paddingHorizontal: 9,
    paddingTop: 14,
    paddingBottom: 9,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  pinDot: {
    position: 'absolute',
    top: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  noteText: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 15,
  },
  ribbonBanner: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  ribbonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
});
