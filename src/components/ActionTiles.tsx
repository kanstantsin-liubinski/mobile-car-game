import React, { useState } from 'react';
import { View, Text, StyleSheet, type ImageSourcePropType } from 'react-native';
import { TouchableOpacity } from '@components/Touchable';
import { colors } from '@styles/colors';
import { GameIcon } from '@components/GameIcon';

export type TileState = 'ready' | 'done' | 'locked' | 'pending';

export interface TileSpec {
  key: string;
  emoji?: string;
  icon?: ImageSourcePropType;
  title: string;
  subtitle: string;
  state: TileState;
  /** Текст подсказки (i): что делает действие и как работает */
  info: string;
  /** Цвет рамки готового действия (по умолчанию нейтральная) */
  accent?: string;
  onPress: () => void;
  /** Удержание повторяет действие (ремонт, покраска тапами) */
  repeat?: boolean;
}

/** Темп повтора при удержании: 4 нажатия в секунду — как бодро тапающий игрок, не быстрее */
const HOLD_REPEAT_MS = 250;

/** Сколько плиток в ряду: до трёх — в один ряд, четыре — 2×2, больше — по три */
const perRow = (n: number) => (n <= 3 ? Math.max(1, n) : n === 4 ? 2 : 3);

/**
 * Плитки действий одного вида на авторынке и в гараже: значок, название, подпись и (i) с описанием.
 * Плитки одного ряда одинаковой ширины, подсказка раскрывается под плитками.
 */
export const ActionTiles = ({ tiles }: { tiles: TileSpec[] }) => {
  const [open, setOpen] = useState<string | null>(null);
  if (tiles.length === 0) return null;
  const n = perRow(tiles.length);
  const rows: TileSpec[][] = [];
  for (let i = 0; i < tiles.length; i += n) rows.push(tiles.slice(i, i + n));
  const openTile = tiles.find((t) => t.key === open);

  return (
    <View style={styles.wrap}>
      {rows.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((t) => (
            <Tile key={t.key} tile={t} infoOpen={open === t.key} onInfo={() => setOpen((p) => (p === t.key ? null : t.key))} />
          ))}
          {/* Пустые места в неполном ряду — чтобы все плитки были одной ширины */}
          {Array.from({ length: n - row.length }).map((_, i) => (
            <View key={`gap${i}`} style={styles.spacer} />
          ))}
        </View>
      ))}
      {openTile && (
        <TouchableOpacity style={styles.tooltip} onPress={() => setOpen(null)} activeOpacity={0.8}>
          <Text style={styles.tooltipText}>{openTile.info}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const Tile = ({ tile, infoOpen, onInfo }: { tile: TileSpec; infoOpen: boolean; onInfo: () => void }) => {
  const { state } = tile;
  return (
    <View
      style={[
        styles.tile,
        state === 'ready' && tile.accent ? { borderColor: tile.accent } : null,
        state === 'done' && styles.tileDone,
        state === 'locked' && styles.tileLocked,
        state === 'pending' && styles.tilePending,
      ]}
    >
      <TouchableOpacity
        style={styles.body}
        disabled={state !== 'ready'}
        onPress={tile.onPress}
        repeatMs={tile.repeat ? HOLD_REPEAT_MS : undefined}
        activeOpacity={0.75}
      >
        {state === 'locked' ? (
          <Text style={styles.emoji}>🔒</Text>
        ) : state === 'done' ? (
          <Text style={[styles.emoji, styles.check]}>✓</Text>
        ) : tile.icon ? (
          <GameIcon source={tile.icon} size={22} />
        ) : (
          <Text style={styles.emoji}>{tile.emoji}</Text>
        )}
        <Text style={styles.title} numberOfLines={1}>
          {tile.title}
        </Text>
        <Text style={styles.sub} numberOfLines={2}>
          {tile.subtitle}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.info, infoOpen && styles.infoActive]} onPress={onInfo} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={[styles.infoText, infoOpen && { color: '#FFF' }]}>i</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 6, marginTop: 4 },
  row: { flexDirection: 'row', gap: 6 },
  spacer: { flex: 1 },
  // Фиксированная высота: подпись в одну или две строки, статус «готово/замок» — плитка не меняет размер
  tile: {
    flex: 1,
    height: 88,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  tileDone: { borderColor: '#22C55E' },
  tileLocked: { opacity: 0.55 },
  tilePending: { borderColor: '#F59E0B' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 4, gap: 2 },
  emoji: { fontSize: 18, lineHeight: 22, height: 22, color: colors.textPrimary, fontWeight: '800' },
  check: { color: '#22C55E' },
  title: { fontSize: 12, lineHeight: 16, fontWeight: '800', color: colors.textPrimary },
  sub: { fontSize: 10, lineHeight: 13, height: 26, color: colors.textTertiary, textAlign: 'center' },
  info: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  infoText: { fontSize: 10, fontWeight: '800', color: colors.textTertiary, fontStyle: 'italic' },
  tooltip: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.4)',
    borderRadius: 8,
    padding: 8,
  },
  tooltipText: { fontSize: 12, color: colors.textPrimary, lineHeight: 17 },
});
