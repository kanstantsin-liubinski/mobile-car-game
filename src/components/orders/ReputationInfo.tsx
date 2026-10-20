import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TouchableOpacity } from '@components/Touchable';
import { colors } from '@styles/colors';
import * as B from '../../economy/balance';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const mult = (v: number) => `×${v.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}`;

interface Milestone {
  rep: number;
  title: string;
}

/** Ступени репутации — те же, что у множителя оплаты: 0, 250, 500, 750, 1000 */
const MILESTONES: Milestone[] = B.REPUTATION_PAY_STEPS.map((step, i) => ({
  rep: step.from,
  title:
    i === 0
      ? `Начало: оплата ${mult(step.mult)}`
      : step.from >= B.REPUTATION_MAX
        ? `Максимум: оплата ${mult(step.mult)}, заказ каждый день`
        : `Оплата ${mult(step.mult)}, больше мест на доске`,
}));

/** Раскрывающийся блок «Что даёт репутация»: как растёт, что открывается и на какой ступени */
export const ReputationInfo = ({ reputation }: { reputation: number }) => {
  const [open, setOpen] = useState(false);
  const next = MILESTONES.find((m) => m.rep > reputation);

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.toggle} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.toggleText}>ⓘ Что даёт репутация</Text>
        <Text style={styles.toggleText}>{open ? '▴' : '▾'}</Text>
      </TouchableOpacity>
      {next && !open && (
        <Text style={styles.hint}>
          Следующая ступень — {next.rep}: {next.title.toLowerCase()} (ещё {next.rep - reputation}).
        </Text>
      )}

      {open && (
        <View style={styles.body}>
          <Text style={styles.text}>
            Чем выше репутация, тем больше заказов приходит каждый день, тем больше их помещается на доске, тем чаще
            попадаются выгодные (оплата ×{B.PREMIUM_REWARD_MULT.toLocaleString('ru-RU')}) и тем выше оплата любой работы.
            Общий уровень игрока тоже повышает оплату, но на частоту заказов не влияет.
          </Text>
          <Text style={styles.text}>
            Как растёт: +{B.REP_SIMPLE_ON_TIME} за простой заказ вовремя, +{B.REP_COMPLEX_ON_TIME} за сложный, досрочно — +
            {B.REP_EARLY_BONUS} (не больше {B.REP_MAX_PER_ORDER} за заказ). Теряется: {B.REP_LATE} за опоздание, {B.REP_CANCEL} за
            отказ от принятого, {B.REP_FAILED} за провал.
          </Text>

          {MILESTONES.map((m) => {
            const reached = reputation >= m.rep;
            const isNext = next?.rep === m.rep;
            return (
              <View key={m.rep} style={[styles.step, reached && styles.stepReached, isNext && styles.stepNext]}>
                <View style={styles.stepHead}>
                  <Text style={[styles.stepRep, reached && { color: '#22C55E' }, isNext && { color: '#FBBF24' }]}>
                    {reached ? '✓ ' : ''}
                    {m.rep}
                  </Text>
                  <Text style={styles.stepTitle}>{m.title}</Text>
                </View>
                <Text style={styles.stepStats}>
                  Заказ в день {pct(B.orderSpawnChance(m.rep))} · второй {pct(B.extraOrderChance(m.rep))} · выгодный{' '}
                  {pct(B.premiumOrderChance(m.rep))} · оплата {mult(B.orderReputationFactor(m.rep))} · мест{' '}
                  {B.maxBoardService(m.rep)}/{B.maxBoardPicking(m.rep)}
                </Text>
                {isNext && <Text style={styles.stepLeft}>Ещё {m.rep - reputation} очков</Text>}
              </View>
            );
          })}
          <Text style={styles.hint}>Мест — ремонт / подбор. Оплата — множитель от репутации, к нему добавляется бонус уровня.</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 6, marginTop: 4 },
  toggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.4)',
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  toggleText: { fontSize: 13, fontWeight: '700', color: '#FBBF24' },
  hint: { fontSize: 12, color: colors.textTertiary, lineHeight: 17 },
  body: { gap: 8 },
  text: { fontSize: 12, color: colors.textPrimary, lineHeight: 17 },
  step: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
    gap: 3,
    opacity: 0.75,
  },
  stepReached: { borderColor: 'rgba(34, 197, 94, 0.5)', opacity: 1 },
  stepNext: { borderColor: '#FBBF24', opacity: 1 },
  stepHead: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  stepRep: { width: 56, fontSize: 13, fontWeight: '800', color: colors.textTertiary, fontVariant: ['tabular-nums'] },
  stepTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  stepStats: { fontSize: 11, color: colors.textTertiary, lineHeight: 15 },
  stepLeft: { fontSize: 11, fontWeight: '700', color: '#FBBF24' },
});
