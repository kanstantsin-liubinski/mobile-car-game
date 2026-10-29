import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, View, Text, StyleSheet, type ImageSourcePropType } from 'react-native';
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
  /** Возвращает false, если действие не выполнилось (тогда без анимации награды) */
  onPress: () => void | boolean;
  /** Удержание повторяет действие (ремонт, покраска тапами) */
  repeat?: boolean;
  /**
   * Главное действие карточки: большая кнопка на всю ширину над остальными плитками.
   * Для действий, по которым тапают сотни раз (ремонт, покраска).
   */
  hero?: boolean;
  /** Что всплывает над кнопкой после успешного нажатия («+$12»); считается до нажатия */
  popup?: () => string | null;
}

/** Темп повтора при удержании: 4 нажатия в секунду — как бодро тапающий игрок, не быстрее */
const HOLD_REPEAT_MS = 250;
const NATIVE = Platform.OS !== 'web';
/** Серия тапов чаще этого — «комбо» (только визуально) */
const COMBO_GAP_MS = 700;
const MAX_POPUPS = 8;

/** Сколько плиток в ряду: до трёх — в один ряд, четыре — 2×2, больше — по три */
const perRow = (n: number) => (n <= 3 ? Math.max(1, n) : n === 4 ? 2 : 3);

/** Цвет с прозрачностью из «#RRGGBB» */
const tint = (hex: string | undefined, alpha: number): string | undefined => {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return undefined;
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;
};

/**
 * Плитки действий одного вида на авторынке и в гараже: значок, название, подпись и (i) с описанием.
 * Главное действие (hero) — большой кнопкой сверху, остальные — ровными рядами под ним.
 */
export const ActionTiles = ({ tiles }: { tiles: TileSpec[] }) => {
  const [open, setOpen] = useState<string | null>(null);
  if (tiles.length === 0) return null;
  const heroes = tiles.filter((t) => t.hero);
  const rest = tiles.filter((t) => !t.hero);
  const n = perRow(rest.length);
  const rows: TileSpec[][] = [];
  for (let i = 0; i < rest.length; i += n) rows.push(rest.slice(i, i + n));
  const openTile = tiles.find((t) => t.key === open);
  const toggle = (key: string) => setOpen((p) => (p === key ? null : key));

  return (
    <View style={styles.wrap}>
      {heroes.map((t) => (
        <HeroTile key={t.key} tile={t} infoOpen={open === t.key} onInfo={() => toggle(t.key)} />
      ))}
      {rows.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((t) => (
            <Tile key={t.key} tile={t} infoOpen={open === t.key} onInfo={() => toggle(t.key)} />
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

const InfoButton = ({ open, onPress }: { open: boolean; onPress: () => void }) => (
  <TouchableOpacity style={[styles.info, open && styles.infoActive]} onPress={onPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
    <Text style={[styles.infoText, open && { color: '#FFF' }]}>i</Text>
  </TouchableOpacity>
);

const TileIcon = ({ tile, size }: { tile: TileSpec; size: number }) =>
  tile.state === 'locked' ? (
    <Text style={[styles.emoji, { fontSize: size - 4 }]}>🔒</Text>
  ) : tile.state === 'done' ? (
    <Text style={[styles.emoji, styles.check, { fontSize: size - 4 }]}>✓</Text>
  ) : tile.icon ? (
    <GameIcon source={tile.icon} size={size} />
  ) : (
    <Text style={[styles.emoji, { fontSize: size - 4 }]}>{tile.emoji}</Text>
  );

const Tile = ({ tile, infoOpen, onInfo }: { tile: TileSpec; infoOpen: boolean; onInfo: () => void }) => {
  const { state } = tile;
  const ready = state === 'ready';
  return (
    <View
      style={[
        styles.tile,
        ready && tile.accent ? { borderColor: tint(tile.accent, 0.55) ?? tile.accent, backgroundColor: tint(tile.accent, 0.07) } : null,
        state === 'done' && styles.tileDone,
        state === 'locked' && styles.tileLocked,
        state === 'pending' && styles.tilePending,
      ]}
    >
      <TouchableOpacity
        style={styles.body}
        disabled={!ready}
        onPress={tile.onPress}
        repeatMs={tile.repeat ? HOLD_REPEAT_MS : undefined}
        activeOpacity={0.75}
      >
        <View style={[styles.iconBadge, ready && { backgroundColor: tint(tile.accent, 0.18) ?? 'rgba(148, 163, 184, 0.12)' }]}>
          <TileIcon tile={tile} size={20} />
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {tile.title}
        </Text>
        <Text style={styles.sub} numberOfLines={2}>
          {tile.subtitle}
        </Text>
      </TouchableOpacity>
      <InfoButton open={infoOpen} onPress={onInfo} />
    </View>
  );
};

interface Popup {
  id: number;
  text: string;
  dx: number;
  anim: Animated.Value;
}

/**
 * Большая кнопка главного действия с «тайкун»-откликом на каждый успешный тап: всплывающая награда
 * (+$ стоимости), рывок значка и счётчик комбо при быстрой серии. Комбо — только визуальное.
 */
const HeroTile = ({ tile, infoOpen, onInfo }: { tile: TileSpec; infoOpen: boolean; onInfo: () => void }) => {
  const { state } = tile;
  const ready = state === 'ready';
  const accent = tile.accent ?? colors.primary;
  const [popups, setPopups] = useState<Popup[]>([]);
  const [combo, setCombo] = useState(0);
  const lastTap = useRef(0);
  const nextId = useRef(0);
  const kick = useRef(new Animated.Value(0)).current;
  const comboPop = useRef(new Animated.Value(1)).current;
  const comboTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (comboTimer.current) clearTimeout(comboTimer.current);
    },
    [],
  );

  const celebrate = (text: string | null) => {
    // Рывок значка: поворот гаечного ключа и короткий «пульс»
    kick.stopAnimation();
    kick.setValue(0);
    Animated.sequence([
      Animated.timing(kick, { toValue: 1, duration: 70, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }),
      Animated.timing(kick, { toValue: 0, duration: 160, easing: Easing.out(Easing.back(2)), useNativeDriver: NATIVE }),
    ]).start();

    // Комбо: серия быстрых тапов
    const now = Date.now();
    const nextCombo = now - lastTap.current < COMBO_GAP_MS ? combo + 1 : 1;
    lastTap.current = now;
    setCombo(nextCombo);
    if (comboTimer.current) clearTimeout(comboTimer.current);
    comboTimer.current = setTimeout(() => setCombo(0), COMBO_GAP_MS + 300);
    if (nextCombo >= 3) {
      comboPop.setValue(1.35);
      Animated.spring(comboPop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: NATIVE }).start();
    }

    // Всплывающая награда
    if (!text) return;
    const anim = new Animated.Value(0);
    const popup: Popup = { id: nextId.current++, text, dx: Math.round((Math.random() - 0.5) * 70), anim };
    setPopups((prev) => [...prev.slice(-(MAX_POPUPS - 1)), popup]);
    Animated.timing(anim, { toValue: 1, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start(() =>
      setPopups((prev) => prev.filter((p) => p.id !== popup.id)),
    );
  };

  const handlePress = () => {
    const text = tile.popup?.() ?? null;
    const result = tile.onPress();
    if (result !== false) celebrate(text);
  };

  const rotate = kick.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-28deg'] });
  const scale = kick.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });

  return (
    <View
      style={[
        styles.hero,
        { borderColor: ready ? accent : colors.border, backgroundColor: ready ? tint(accent, 0.16) ?? colors.cardBg : colors.cardBg },
        state === 'done' && styles.tileDone,
        state === 'locked' && styles.tileLocked,
        state === 'pending' && styles.tilePending,
      ]}
    >
      <TouchableOpacity
        style={styles.heroBody}
        disabled={!ready}
        onPress={handlePress}
        repeatMs={tile.repeat ? HOLD_REPEAT_MS : undefined}
        activeOpacity={0.85}
      >
        <Animated.View style={[styles.heroIcon, { backgroundColor: ready ? accent : 'rgba(148, 163, 184, 0.15)', transform: [{ rotate }, { scale }] }]}>
          <TileIcon tile={tile} size={28} />
        </Animated.View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle} numberOfLines={1}>
            {tile.title}
          </Text>
          <Text style={styles.heroSub} numberOfLines={1}>
            {tile.subtitle}
          </Text>
        </View>
        {combo >= 3 && (
          <Animated.View style={[styles.combo, { borderColor: accent, transform: [{ scale: comboPop }] }]}>
            <Text style={styles.comboLabel}>КОМБО</Text>
            <Text style={styles.comboValue}>×{combo}</Text>
          </Animated.View>
        )}
      </TouchableOpacity>
      {/* Награды всплывают над кнопкой и не мешают нажатиям */}
      <View pointerEvents="none" style={styles.popupLayer}>
        {popups.map((p) => (
          <Animated.Text
            key={p.id}
            style={[
              styles.popup,
              {
                opacity: p.anim.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateX: p.dx },
                  { translateY: p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, -56] }) },
                  { scale: p.anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.6, 1.15, 1] }) },
                ],
              },
            ]}
          >
            {p.text}
          </Animated.Text>
        ))}
      </View>
      <InfoButton open={infoOpen} onPress={onInfo} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 4 },
  row: { flexDirection: 'row', gap: 8 },
  spacer: { flex: 1 },
  // Фиксированная высота: подпись в одну или две строки, статус «готово/замок» — плитка не меняет размер
  tile: {
    flex: 1,
    height: 92,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  tileDone: { borderColor: '#22C55E' },
  tileLocked: { opacity: 0.55 },
  tilePending: { borderColor: '#F59E0B' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 4, gap: 3 },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
  },
  emoji: { fontSize: 16, lineHeight: 22, color: colors.textPrimary, fontWeight: '800', textAlign: 'center' },
  check: { color: '#22C55E' },
  title: { fontSize: 12, lineHeight: 16, fontWeight: '800', color: colors.textPrimary },
  sub: { fontSize: 10, lineHeight: 13, height: 26, color: colors.textTertiary, textAlign: 'center' },
  hero: {
    height: 74,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  heroBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingRight: 30 },
  heroIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 18, lineHeight: 22, fontWeight: '900', color: colors.textPrimary, letterSpacing: 0.3 },
  heroSub: { fontSize: 12, lineHeight: 16, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  combo: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  comboLabel: { fontSize: 8, fontWeight: '800', color: '#FBBF24', letterSpacing: 1 },
  comboValue: { fontSize: 16, fontWeight: '900', color: '#FBBF24', fontVariant: ['tabular-nums'] },
  popupLayer: { position: 'absolute', left: 0, right: 0, top: 8, alignItems: 'center' },
  popup: {
    position: 'absolute',
    fontSize: 16,
    fontWeight: '900',
    color: '#4ADE80',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  info: {
    position: 'absolute',
    top: 5,
    right: 5,
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
