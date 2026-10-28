import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { SheetModal } from '@components/SheetModal';
import { TouchableOpacity } from '@components/Touchable';
import { InnerOverlay } from '@components/InnerOverlay';
import { SheetFooter, SheetHeader, SheetScroll } from '@components/SheetHeader';
import { FinanceRow, FinanceSection, Notice } from '@components/finance/FinanceUI';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { useGarageContext } from '@hooks/GarageContext';
import { useGameState } from '@hooks/GameStateContext';
import { garagesValueCents, useLegacy } from '@hooks/LegacyContext';
import { garageStyles } from '@styles/styles';
import { colors } from '@styles/colors';
import * as L from '../../economy/legacy';
import { ConcernSection } from './ConcernSection';
import { careerSummary } from '../../economy/economy';
import { formatMoney } from '../../economy/format';

const mult = (v: number) => `×${v.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}`;
const END_NAMES: Record<L.CareerEnd, string> = { legacy: '🏛️ Наследие', bankruptcy: '💸 Банкротство', new_game: '🔄 Новая игра' };

/**
 * «Наследие»: текущие бонусы, сколько очков даст перезапуск сейчас, перезапуск с явным
 * подтверждением (что сбросится, что останется), история карьер, рекорды и цель «Концерн».
 */
export const LegacyModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const { state } = useEconomy();
  const { gameTimeMs: now } = useGameClock();
  const { garageId } = useGarageContext();
  const { legacy, restart } = useLegacy();
  const { setCurrentScreen, resetGameData } = useGameState();
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const career = careerSummary(state, now, garagesValueCents(garageId));
  const preview = L.restartPreview(legacy, career);
  const blocked = !preview.available && preview.blocks.length > 0;
  const points = state.legacyPoints ?? 0;

  const handleRestart = async () => {
    if (busy || !preview.available) return;
    setBusy(true);
    // Очки и история записываются в отдельное хранилище, затем карьера сбрасывается как «Новая игра»
    const ok = await restart(careerSummary(state, now, garagesValueCents(garageId)));
    if (!ok) {
      setBusy(false);
      return;
    }
    setCurrentScreen('menu');
    await resetGameData();
    setCurrentScreen('game');
  };

  return (
    <SheetModal visible={visible} onRequestClose={onClose}>
      <View style={[garageStyles.modalContent, { paddingBottom: insets.bottom + 12, maxHeight: '92%' }]}>
        <SheetHeader title="Наследие" onClose={onClose} flush />
        <SheetScroll>
          <FinanceSection title="Бонусы этой карьеры">
            <FinanceRow label="Очки наследия" value={String(points)} bold />
            <FinanceRow label="Прибыль (к положительной марже)" value={mult(L.legacyProfitMultiplier(points))} />
            <FinanceRow label="Опыт" value={mult(L.legacyXpMultiplier(points))} />
            <FinanceRow label="Прибавка к стартовому капиталу" cents={L.legacyStartCash(points) * 100} />
            <FinanceRow label="Карьер всего / перезапусков" value={`${legacy.careers + 1} / ${legacy.restarts}`} />
            {legacy.pointsTotal > points && (
              <Text style={styles.hint}>Накоплено {legacy.pointsTotal} очков — они начнут действовать со следующей карьеры.</Text>
            )}
            <Text style={styles.hint}>
              Бонус прибыли начисляется отдельной строкой «Бонус наследия» к марже прибыльных продаж и заказов; убытки бонуса не получают.
            </Text>
          </FinanceSection>

          <FinanceSection title="Перезапуск сейчас">
            <FinanceRow label="Прибыль карьеры (без бонуса)" cents={career.baseProfitCents} signed />
            <FinanceRow label="Стоимость бизнеса" cents={career.netWorthCents} />
            <FinanceRow label="Очков получишь" value={`+${preview.gain}`} bold />
            <FinanceRow label="Очков станет" value={`${preview.pointsNow} → ${preview.pointsAfter}`} />
            <FinanceRow label="Прибыль" value={`${mult(preview.profitMultNow)} → ${mult(preview.profitMultAfter)}`} />
            <FinanceRow label="Опыт" value={`${mult(preview.xpMultNow)} → ${mult(preview.xpMultAfter)}`} />
            <FinanceRow
              label="Стартовый капитал"
              value={`${formatMoney(preview.startCashNow * 100)} → ${formatMoney(preview.startCashAfter * 100)}`}
            />
            <Text style={styles.hint}>
              Всего очков = 10 × √(прибыль всех закрытых карьер / $1 000 000); начисляются только новые. Банкротство и «Новая игра» очков не
              дают, но и наследие не стирают.
            </Text>
            {blocked && (
              <View style={styles.blocks}>
                {preview.blocks.map((b) => (
                  <Notice key={b} level="info">
                    {b}
                  </Notice>
                ))}
              </View>
            )}
            <TouchableOpacity
              // Под Notice уже есть свои 10 снизу — второй отступ кнопки дал бы двойной зазор
              style={[styles.restart, blocked && styles.restartAfterNotice, !preview.available && styles.disabled]}
              disabled={!preview.available}
              onPress={() => setConfirming(true)}
            >
              <Text style={styles.restartText}>Начать новую карьеру с наследием</Text>
            </TouchableOpacity>
          </FinanceSection>

          <ConcernSection />

          <FinanceSection title="Рекорды">
            <FinanceRow label="Лучший уровень" value={String(Math.max(legacy.records.bestLevel, state.player.xp.level))} />
            <FinanceRow label="Лучшая стоимость бизнеса" cents={Math.max(legacy.records.bestNetWorthCents, career.netWorthCents)} />
            <FinanceRow label="Лучший месяц" cents={Math.max(legacy.records.bestMonthProfitCents, career.bestMonthProfitCents)} />
            <FinanceRow label="Продано машин за все карьеры" value={String(legacy.records.totalCarsSold + state.totals.carsSold)} />
            <FinanceRow label="Прибыль закрытых карьер" cents={legacy.lifetimeBaseProfitCents} />
          </FinanceSection>

          <FinanceSection title="История карьер">
            {legacy.history.length === 0 && <Text style={styles.hint}>Это твоя первая карьера.</Text>}
            {[...legacy.history].reverse().map((c) => (
              <View key={c.careerId} style={styles.career}>
                <Text style={styles.careerTitle}>
                  Карьера {c.number} · {END_NAMES[c.end]}
                </Text>
                <Text style={styles.hint}>
                  Ур. {c.level} · {c.months} мес. · продано {c.carsSold} · прибыль {formatMoney(c.baseProfitCents)} · бизнес{' '}
                  {formatMoney(c.netWorthCents)}
                  {c.pointsEarned > 0 ? ` · +${c.pointsEarned} очков` : ''}
                </Text>
              </View>
            ))}
          </FinanceSection>
        </SheetScroll>
        <SheetFooter>
          <TouchableOpacity style={[garageStyles.modalButton, garageStyles.cancelButton]} onPress={onClose}>
            <Text style={garageStyles.modalButtonText}>Закрыть</Text>
          </TouchableOpacity>
        </SheetFooter>

        {/* Явное подтверждение: что сбросится, что останется, что получишь */}
        <InnerOverlay visible={confirming}>
          <View style={garageStyles.modalOverlay}>
            <View style={[garageStyles.modalContent, { paddingBottom: insets.bottom + 12, maxHeight: '90%' }]}>
              <SheetHeader title="Новая карьера" onClose={() => setConfirming(false)} flush />
              <SheetScroll>
                <Notice level="warning">Текущая карьера закончится. Это действие нельзя отменить.</Notice>
                <FinanceSection title="Сбросится">
                  {preview.resets.map((r) => (
                    <Text key={r} style={styles.item}>
                      ✕ {r}
                    </Text>
                  ))}
                </FinanceSection>
                <FinanceSection title="Останется">
                  {preview.keeps.map((r) => (
                    <Text key={r} style={[styles.item, { color: '#22C55E' }]}>
                      ✓ {r}
                    </Text>
                  ))}
                </FinanceSection>
                <FinanceSection title="Получишь">
                  <FinanceRow label="Очков наследия" value={`+${preview.gain} (всего ${preview.pointsAfter})`} bold />
                  <FinanceRow label="Множитель прибыли" value={mult(preview.profitMultAfter)} />
                  <FinanceRow label="Множитель опыта" value={mult(preview.xpMultAfter)} />
                  <FinanceRow label="Стартовый капитал" cents={preview.startCashAfter * 100} />
                </FinanceSection>
              </SheetScroll>
              <SheetFooter>
                <TouchableOpacity style={[garageStyles.modalButton, garageStyles.cancelButton]} onPress={() => setConfirming(false)}>
                  <Text style={garageStyles.modalButtonText}>Отмена</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[garageStyles.modalButton, garageStyles.confirmButton, (busy || !preview.available) && styles.disabled]}
                  disabled={busy || !preview.available}
                  onPress={handleRestart}
                >
                  <Text style={[garageStyles.modalButtonText, { color: '#FFF' }]}>{busy ? 'Перезапуск…' : 'Перезапустить'}</Text>
                </TouchableOpacity>
              </SheetFooter>
            </View>
          </View>
        </InnerOverlay>
      </View>
    </SheetModal>
  );
};

const styles = StyleSheet.create({
  hint: { fontSize: 12, color: colors.textTertiary, lineHeight: 17, marginTop: 4 },
  restart: { backgroundColor: '#B45309', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  restartAfterNotice: { marginTop: 0 },
  // Тот же зазор 10, что между секциями и уведомлениями в остальных окнах
  blocks: { marginTop: 10 },
  restartText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  disabled: { opacity: 0.45 },
  career: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, marginTop: 6 },
  careerTitle: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  item: { fontSize: 13, color: colors.textSecondary, paddingVertical: 2 },
});
