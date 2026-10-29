import React, { useRef, useState } from 'react';
import { Animated, Easing, Platform, View, Text, StyleSheet, type ImageSourcePropType } from 'react-native';
import { TouchableOpacity } from '@components/Touchable';
import { colors } from '@styles/colors';
import { GameIcon } from '@components/GameIcon';

export type TileState = 'ready' | 'done' | 'locked' | 'pending';

/** Показатель на большой кнопке: цветная плашка «подпись — значение» */
export interface TileStat {
  label: string;
  value: string;
  color: string;
}

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
  /** Большая кнопка: цветные показатели (за тап, детали, рост цены) */
  stats?: TileStat[];
  /** Большая кнопка: шкала прогресса 0–100 с отметкой достижимого максимума */
  progress?: { value: number; max: number };
  /** Большая кнопка: фразы-похвалы, которые иногда всплывают вместо награды */
  cheers?: string[];
  /** …и фразы на финише (прогресс почти у максимума) */
  finishCheers?: string[];
}

/** Темп повтора при удержании: 4 нажатия в секунду — как бодро тапающий игрок, не быстрее */
const HOLD_REPEAT_MS = 250;
const NATIVE = Platform.OS !== 'web';
const MAX_POPUPS = 8;
/** Доля тапов, после которых вместе с наградой всплывает похвала, и пауза между похвалами */
const CHEER_CHANCE = 0.22;
const CHEER_GAP_MS = 1200;

const DEFAULT_CHEERS = [
  'Отлично!',
  'Так держать!',
  'Золотые руки!',
  'Мастер!',
  'Гайка к гайке!',
  'Блестяще!',
  'Профи!',
  'Огонь!',
  'Чисто сделано!',
  'Вот это скорость!',
  'Красота!',
  'Работа кипит!',
  'Без халтуры!',
  'Ещё рывок!',
  'Как по учебнику!',
  'Покупатель оценит!',
];
const DEFAULT_FINISH_CHEERS = ['Ещё немного!', 'Почти готово!', 'Ещё чуть-чуть!', 'Финишная прямая!'];

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
    <Text style={[styles.emoji, { fontSize: size - 4, lineHeight: size + 2 }]}>🔒</Text>
  ) : tile.state === 'done' ? (
    <Text style={[styles.emoji, styles.check, { fontSize: size - 4, lineHeight: size + 2 }]}>✓</Text>
  ) : tile.icon ? (
    <GameIcon source={tile.icon} size={size} />
  ) : (
    <Text style={[styles.emoji, { fontSize: size - 4, lineHeight: size + 2 }]}>{tile.emoji}</Text>
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
        {/* Высота по содержимому: однострочная подпись не оставляет пустой строки внизу */}
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
  cheer: boolean;
  dx: number;
  anim: Animated.Value;
}

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

/**
 * Большая кнопка главного действия: шкала прогресса, цветные показатели и «тайкун»-отклик на каждый
 * успешный тап — вся кнопка пружинисто сжимается, всплывает награда (+$ стоимости), иногда — похвала.
 */
const HeroTile = ({ tile, infoOpen, onInfo }: { tile: TileSpec; infoOpen: boolean; onInfo: () => void }) => {
  const { state } = tile;
  const ready = state === 'ready';
  const accent = tile.accent ?? colors.primary;
  const [popups, setPopups] = useState<Popup[]>([]);
  const nextId = useRef(0);
  const lastCheer = useRef(0);
  const press = useRef(new Animated.Value(1)).current;

  const float = (text: string, cheer: boolean) => {
    const anim = new Animated.Value(0);
    const popup: Popup = { id: nextId.current++, text, cheer, dx: Math.round((Math.random() - 0.5) * (cheer ? 40 : 90)), anim };
    setPopups((prev) => [...prev.slice(-(MAX_POPUPS - 1)), popup]);
    Animated.timing(anim, { toValue: 1, duration: cheer ? 1100 : 800, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start(() =>
      setPopups((prev) => prev.filter((p) => p.id !== popup.id)),
    );
  };

  const celebrate = (reward: string | null) => {
    // Вся кнопка коротко сжимается и пружинит обратно
    press.stopAnimation();
    press.setValue(0.95);
    Animated.spring(press, { toValue: 1, friction: 4, tension: 220, useNativeDriver: NATIVE }).start();
    if (reward) float(reward, false);
    // Иногда — похвала: на финише свои фразы
    const now = Date.now();
    if (now - lastCheer.current > CHEER_GAP_MS && Math.random() < CHEER_CHANCE) {
      lastCheer.current = now;
      const nearFinish = !!tile.progress && tile.progress.max > 0 && tile.progress.value / tile.progress.max >= 0.9;
      float(pick(nearFinish ? tile.finishCheers ?? DEFAULT_FINISH_CHEERS : tile.cheers ?? DEFAULT_CHEERS), true);
    }
  };

  const handlePress = () => {
    const reward = tile.popup?.() ?? null;
    const result = tile.onPress();
    if (result !== false) celebrate(reward);
  };

  const progress = tile.progress;
  return (
    <Animated.View
      style={[
        styles.hero,
        {
          borderColor: ready ? accent : colors.border,
          backgroundColor: ready ? tint(accent, 0.14) ?? colors.cardBg : colors.cardBg,
          transform: [{ scale: press }],
        },
        state === 'done' && styles.tileDone,
        state === 'locked' && styles.tileLocked,
        state === 'pending' && styles.tilePending,
      ]}
    >
      <TouchableOpacity style={styles.heroBody} disabled={!ready} onPress={handlePress} repeatMs={tile.repeat ? HOLD_REPEAT_MS : undefined} noPressEffect>
        <View style={styles.heroTop}>
          <View style={[styles.heroIcon, { backgroundColor: ready ? accent : 'rgba(148, 163, 184, 0.15)' }]}>
            <TileIcon tile={tile} size={26} />
          </View>
          <View style={{ flex: 1 }}>
            {/* Проценты — в одной строке с названием, подпись под ними на всю ширину (влезает и длинная) */}
            <View style={styles.heroTitleRow}>
              <Text style={styles.heroTitle} numberOfLines={1}>
                {tile.title}
              </Text>
              {progress && (
                <Text style={[styles.heroPct, { color: ready ? colors.textPrimary : colors.textTertiary }]} numberOfLines={1}>
                  {progress.value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}
                  <Text style={styles.heroPctMax}> / {progress.max.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%</Text>
                </Text>
              )}
            </View>
            <Text style={styles.heroSub} numberOfLines={2}>
              {tile.subtitle}
            </Text>
          </View>
        </View>
        {progress && (
          <View style={styles.heroBar}>
            <View style={[styles.heroBarMax, { width: `${Math.min(100, progress.max)}%` }]} />
            <View style={[styles.heroBarFill, { width: `${Math.min(100, progress.value)}%`, backgroundColor: accent }]} />
          </View>
        )}
        {tile.stats && tile.stats.length > 0 && (
          <View style={styles.chips}>
            {tile.stats.map((st) => (
              <View key={st.label} style={[styles.chip, { backgroundColor: tint(st.color, 0.14), borderColor: tint(st.color, 0.45) ?? st.color }]}>
                <Text style={styles.chipLabel} numberOfLines={1}>
                  {st.label}
                </Text>
                <Text style={[styles.chipValue, { color: st.color }]} numberOfLines={1}>
                  {st.value}
                </Text>
              </View>
            ))}
          </View>
        )}
      </TouchableOpacity>
      {/* Награды и похвалы всплывают над кнопкой и не мешают нажатиям */}
      <View pointerEvents="none" style={styles.popupLayer}>
        {popups.map((p) => (
          <Animated.Text
            key={p.id}
            style={[
              p.cheer ? styles.cheer : styles.popup,
              {
                opacity: p.anim.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateX: p.dx },
                  { translateY: p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.cheer ? -70 : -56] }) },
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
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 4 },
  row: { flexDirection: 'row', gap: 8 },
  spacer: { flex: 1 },
  // Фиксированная высота плитки, содержимое по центру — сверху и снизу поровну
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
  sub: { fontSize: 10, lineHeight: 13, color: colors.textTertiary, textAlign: 'center' },
  hero: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  heroBody: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12, gap: 10 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  // Справа место под (i): оно нужно только строке с названием, подпись идёт на всю ширину
  heroTitleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, paddingRight: 18 },
  heroTitle: { flexShrink: 1, fontSize: 19, lineHeight: 23, fontWeight: '900', color: colors.textPrimary, letterSpacing: 0.3 },
  heroSub: { fontSize: 12, lineHeight: 16, color: colors.textTertiary },
  heroPct: { fontSize: 17, fontWeight: '900', fontVariant: ['tabular-nums'] },
  heroPctMax: { fontSize: 12, fontWeight: '700', color: colors.textTertiary },
  heroBar: { height: 8, borderRadius: 4, backgroundColor: '#27272A', overflow: 'hidden' },
  // Достижимый максимум — с таким же скруглённым концом, как у текущего состояния
  heroBarMax: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4, backgroundColor: colors.border },
  heroBarFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4 },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { flex: 1, borderRadius: 9, borderWidth: 1, paddingVertical: 5, paddingHorizontal: 6, alignItems: 'center' },
  chipLabel: { fontSize: 9, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.4 },
  chipValue: { fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  popupLayer: { position: 'absolute', left: 0, right: 0, top: 10, alignItems: 'center' },
  popup: {
    position: 'absolute',
    fontSize: 16,
    fontWeight: '900',
    color: '#4ADE80',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cheer: {
    position: 'absolute',
    fontSize: 17,
    fontWeight: '900',
    color: '#FBBF24',
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
