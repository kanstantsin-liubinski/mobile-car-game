import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetModal } from '@components/SheetModal';
import { SheetFooter, SheetHeader, SheetScroll, ITEM_GAP } from '@components/SheetHeader';
import { TouchableOpacity } from '@components/Touchable';
import { GameIcon } from '@components/GameIcon';
import { useEconomy } from '@hooks/EconomyContext';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { colors } from '@styles/colors';
import { garageStyles } from '@styles/styles';
import { TIER_ICONS } from '@img/gameIcons';
import * as E from '../../economy/economy';
import * as G from '../../economy/goals';
import { formatMoney } from '../../economy/format';
import { CAR_MODELS_BY_TIER, TIER_NAMES } from '../../data/carModels';
import { haptics } from '../../utils/haptics';

type Tab = 'daily' | 'achievements' | 'collection';
const TABS: { id: Tab; label: string }[] = [
  { id: 'daily', label: 'Задания' },
  { id: 'achievements', label: 'Достижения' },
  { id: 'collection', label: 'Коллекция' },
];

const GOLD = '#F59E0B';
const GREEN = '#22C55E';

/** Цели: задания дня, достижения карьеры и коллекция проданных моделей */
export const GoalsModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;
  const [tab, setTab] = useState<Tab>('daily');
  const { state } = useEconomy();
  const goals = G.restoreGoals(state.goals);
  const stats = E.achievementStats(state);
  const dailyPending = (goals.daily?.tasks.filter((t) => !t.claimed && G.taskDone(t)).length ?? 0) + (E.dailyBonusReady(state) ? 1 : 0);
  const achPending = G.ACHIEVEMENTS.filter((a) => !goals.achievements.includes(a.id) && G.achievementReached(a, stats)).length;

  return (
    <SheetModal visible={visible} onRequestClose={onClose}>
      <View style={[garageStyles.modalContent, styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
        <SheetHeader title="Цели" onClose={onClose} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent}>
          {TABS.map((t) => {
            const pending = t.id === 'daily' ? dailyPending : t.id === 'achievements' ? achPending : 0;
            return (
              <TouchableOpacity key={t.id} style={[styles.tab, tab === t.id && styles.tabActive]} onPress={() => setTab(t.id)}>
                <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>
                  {t.label}
                  {pending > 0 ? ` · ${pending}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {visible && (
          <SheetScroll>
            {tab === 'daily' && <DailyTab />}
            {tab === 'achievements' && <AchievementsTab />}
            {tab === 'collection' && <CollectionTab />}
          </SheetScroll>
        )}
        <SheetFooter>
          <TouchableOpacity style={[garageStyles.modalButton, garageStyles.cancelButton]} onPress={onClose}>
            <Text style={garageStyles.modalButtonText}>Закрыть</Text>
          </TouchableOpacity>
        </SheetFooter>
      </View>
    </SheetModal>
  );
};

const Bar = ({ share, color }: { share: number; color: string }) => (
  <View style={styles.track}>
    <View style={[styles.fill, { width: `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`, backgroundColor: color }]} />
  </View>
);

const ClaimButton = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <TouchableOpacity
    style={styles.claim}
    onPress={() => {
      haptics.success();
      onPress();
    }}
  >
    <Text style={styles.claimText}>{label}</Text>
  </TouchableOpacity>
);

/** Конец суток по часам устройства — до него задания действуют */
const untilMidnight = (): string => {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const minutes = Math.max(0, Math.round((end.getTime() - now.getTime()) / 60_000));
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h} ч ${minutes % 60} мин` : `${minutes} мин`;
};

const DailyTab = () => {
  const { state, claimDailyTask, claimDailyBonus } = useEconomy();
  const daily = state.goals?.daily;
  if (!daily) return <Text style={styles.empty}>Задания появятся через пару секунд.</Text>;
  const claimed = daily.tasks.filter((t) => t.claimed).length;
  const bonus = G.dailyBonusCents(state.player.xp.level);
  return (
    <>
      <Text style={styles.hint}>Новые задания — каждый день. Эти сгорят через {untilMidnight()}.</Text>
      {daily.tasks.map((t) => {
        const done = G.taskDone(t);
        const progressText = t.kind === 'profitSum' ? `${formatMoney(t.progress)} / ${formatMoney(t.target)}` : `${t.progress} / ${t.target}`;
        return (
          <View key={t.id} style={[styles.card, done && !t.claimed && { borderColor: GREEN }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.title, t.claimed && styles.muted]}>
                {t.claimed ? '✓ ' : ''}
                {G.taskTitle(t, formatMoney)}
              </Text>
              <Text style={styles.progress}>{progressText}</Text>
            </View>
            <Bar share={t.progress / t.target} color={done ? GREEN : GOLD} />
            <View style={styles.rowBetween}>
              <Text style={styles.reward}>
                Награда: {formatMoney(t.rewardCents)} · +{t.rewardXp} XP
              </Text>
              {done && !t.claimed && <ClaimButton label="Забрать" onPress={() => claimDailyTask(t.id)} />}
            </View>
          </View>
        );
      })}
      <View style={[styles.card, E.dailyBonusReady(state) && { borderColor: GOLD }]}>
        <View style={styles.rowBetween}>
          <Text style={[styles.title, daily.bonusClaimed && styles.muted]}>
            {daily.bonusClaimed ? '✓ ' : '🎁 '}Бонус за все задания дня
          </Text>
          <Text style={styles.progress}>
            {claimed} / {daily.tasks.length}
          </Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.reward}>Награда: {formatMoney(bonus)}</Text>
          {E.dailyBonusReady(state) && <ClaimButton label="Забрать бонус" onPress={claimDailyBonus} />}
        </View>
      </View>
    </>
  );
};

const AchievementsTab = () => {
  const { state, claimAchievement } = useEconomy();
  const goals = G.restoreGoals(state.goals);
  const stats = E.achievementStats(state);
  // Сначала — с наградой, потом — в процессе, в конце — полученные
  const order = (a: G.Achievement) => (goals.achievements.includes(a.id) ? 2 : G.achievementReached(a, stats) ? 0 : 1);
  const list = [...G.ACHIEVEMENTS].sort((a, b) => order(a) - order(b));
  const got = goals.achievements.length;
  return (
    <>
      <Text style={styles.hint}>
        Получено {got} из {G.ACHIEVEMENTS.length}. Награду за достижение забирают здесь.
      </Text>
      {list.map((a) => {
        const value = a.value(stats);
        const claimed = goals.achievements.includes(a.id);
        const reached = value >= a.target;
        const shown = a.money ? `${formatMoney(Math.min(value, a.target))} / ${formatMoney(a.target)}` : `${Math.min(value, a.target)} / ${a.target}`;
        return (
          <View key={a.id} style={[styles.card, reached && !claimed && { borderColor: GOLD }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.title, claimed && styles.muted]}>
                {claimed ? '🏆 ' : reached ? '⭐ ' : ''}
                {a.title}
              </Text>
              <Text style={styles.progress}>{claimed ? 'получено' : shown}</Text>
            </View>
            <Text style={styles.text}>{a.text}</Text>
            {!claimed && <Bar share={value / a.target} color={reached ? GOLD : colors.primary} />}
            <View style={styles.rowBetween}>
              <Text style={styles.reward}>Награда: {formatMoney(a.rewardCents)}</Text>
              {reached && !claimed && <ClaimButton label="Забрать" onPress={() => claimAchievement(a.id)} />}
            </View>
          </View>
        );
      })}
    </>
  );
};

const CollectionTab = () => {
  const { state } = useEconomy();
  const goals = G.restoreGoals(state.goals);
  const tiers = E.unlockedTiers(state);
  return (
    <>
      <Text style={styles.hint}>Модели, которые ты уже продавал. Собери класс целиком — получишь достижение.</Text>
      {Object.entries(CAR_MODELS_BY_TIER).map(([tierKey, models]) => {
        const tier = Number(tierKey);
        const open = tiers.includes(tier);
        const have = models.filter((m) => (goals.collection[m.name]?.sold ?? 0) > 0).length;
        return (
          <View key={tier} style={[styles.card, have === models.length && { borderColor: GOLD }]}>
            <View style={styles.rowBetween}>
              <View style={styles.tierHead}>
                <GameIcon source={TIER_ICONS[tier]} size={28} style={!open && { opacity: 0.4 }} />
                <Text style={[styles.title, !open && styles.muted]}>{TIER_NAMES[tier]}</Text>
              </View>
              <Text style={styles.progress}>
                {have} / {models.length}
              </Text>
            </View>
            <View style={styles.models}>
              {models.map((m) => {
                const entry = goals.collection[m.name];
                const sold = (entry?.sold ?? 0) > 0;
                return (
                  <View key={m.modelId} style={[styles.model, sold && styles.modelSold]}>
                    <Text style={[styles.modelName, !sold && styles.muted]} numberOfLines={1}>
                      {sold ? m.name : open ? '???' : '🔒'}
                    </Text>
                    {sold && (
                      <Text style={styles.modelMeta} numberOfLines={1}>
                        ×{entry!.sold} · лучшая {formatMoney(entry!.bestProfitCents, { sign: true })}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </>
  );
};

const styles = StyleSheet.create({
  // Фиксированная высота: окно не прыгает при переключении вкладок
  sheet: { height: '82%' },
  // Не сжимается: длинный список на «Достижениях» иначе сплющивал вкладки и обрезал их текст
  tabs: { flexGrow: 0, flexShrink: 0, marginHorizontal: -14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabsContent: { gap: 8, paddingHorizontal: 14 },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.buttonBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textTertiary },
  tabTextActive: { color: '#FFF' },
  hint: { fontSize: 12, lineHeight: 17, color: colors.textTertiary, marginBottom: ITEM_GAP },
  empty: { fontSize: 14, color: colors.textTertiary, textAlign: 'center', paddingVertical: 12 },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
    marginBottom: ITEM_GAP,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  title: { flexShrink: 1, fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  text: { fontSize: 12, color: colors.textTertiary, lineHeight: 17 },
  muted: { color: colors.textTertiary },
  progress: { fontSize: 13, fontWeight: '800', color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  reward: { flexShrink: 1, fontSize: 12, fontWeight: '700', color: GOLD },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  claim: { backgroundColor: GREEN, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  claimText: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  tierHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  models: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  model: {
    width: '48.5%',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: colors.darkBg,
  },
  modelSold: { borderColor: `${GOLD}66` },
  modelName: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  modelMeta: { fontSize: 10, color: colors.textTertiary, marginTop: 2 },
});
