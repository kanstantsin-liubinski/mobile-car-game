import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, Platform, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@styles/colors';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { GameIcon } from '@components/GameIcon';
import { ICONS } from '@img/gameIcons';
import { FinanceRow, FinanceSection, Notice, ui } from './FinanceUI';
import * as E from '../../economy/economy';
import { formatMoney } from '../../economy/format';
import { managementMonthPractice, monthXp } from '../../economy/progression';

/**
 * Зарплатный день: обязательный отчёт за месяц. Закрыть его можно только выплатой —
 * «Назад»/Escape ничего не делают, а после перезагрузки он откроется снова.
 */
export const PaydayModal = () => {
  const { state, closeMonth } = useEconomy();
  const { paydayPending, gameTimeMs } = useGameClock();
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;

  const [repayCents, setRepayCents] = useState(0);
  const submittingRef = useRef(false);

  // Каждый новый отчёт начинается без погашения
  useEffect(() => {
    setRepayCents(0);
    submittingRef.current = false;
  }, [state.completedMonths]);

  if (!paydayPending) return null;

  const result = E.getMonthResult(state, gameTimeMs);
  const preview = E.previewClose(state, repayCents);
  const monthBonusXp = monthXp(result.netProfitCents, state.ledger.salesXp);
  const loan = state.loan;

  const handlePay = () => {
    // Защита от двойного нажатия; сама экономика тоже не закроет месяц дважды
    if (submittingRef.current) return;
    submittingRef.current = true;
    const outcome = closeMonth(preview.repayCents);
    if (outcome === 'noop') submittingRef.current = false;
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <Text style={styles.title}>Финансовый отчёт — Месяц {preview.month}</Text>

          <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 4 }}>
            {preview.isLoanDeadline && (
              <Notice level={preview.canContinue ? 'warning' : 'danger'}>
                Это последний месяц кредита: долг {formatMoney(loan?.principalCents ?? 0)} нужно вернуть полностью.
              </Notice>
            )}

            <FinanceSection title="Итоги месяца">
              <FinanceRow label="Продано машин" value={String(result.carsSold)} />
              <FinanceRow label="Выручка от продаж" cents={result.revenueCents} />
              <FinanceRow label="Себестоимость проданных" cents={-result.cogsCents} />
              <FinanceRow label="Прибыль от сделок" cents={result.dealProfitCents} signed />
              <FinanceRow label="Зарплаты механиков" cents={-result.salaryCents} />
              {result.severanceCents > 0 && (
                <FinanceRow label="Компенсации при увольнении" cents={-result.severanceCents} />
              )}
              {result.otherIncomeCents > 0 && <FinanceRow label="Прочие доходы" cents={result.otherIncomeCents} />}
              {result.otherExpenseCents > 0 && (
                <FinanceRow label="Обучение (курсы)" cents={-result.otherExpenseCents} />
              )}
              <View style={ui.divider} />
              <FinanceRow label="Чистая прибыль" cents={result.netProfitCents} signed bold />
              {result.investmentsCents > 0 && (
                <FinanceRow label="Вложения (покупка гаража)" cents={-result.investmentsCents} muted />
              )}
            </FinanceSection>

            <FinanceSection title="Опыт">
              <FinanceRow label="XP за продажи в этом месяце" value={`${state.ledger.salesXp} XP`} />
              <FinanceRow
                label="Бонус за прибыльный месяц"
                value={monthBonusXp > 0 ? `+${monthBonusXp} XP` : 'нет — месяц без прибыли'}
                bold={monthBonusXp > 0}
              />
              <FinanceRow
                label="Практика «Менеджмента» за месяц"
                value={result.netProfitCents > 0 ? `+${managementMonthPractice(result.netProfitCents)}` : 'нет'}
              />
            </FinanceSection>

            <FinanceSection title="Выплата">
              <FinanceRow label="Зарплатный фонд к оплате" cents={preview.payrollCents} bold />
              <FinanceRow label="Доступно сейчас" cents={state.balanceCents} />
              {loan && <FinanceRow label="Долг банку" cents={loan.principalCents} />}
            </FinanceSection>

            {preview.loanNeededCents > 0 && (
              <Notice level="danger">
                Не хватает {formatMoney(preview.loanNeededCents)} на зарплаты. Недостаток покроет кредит:{' '}
                {loan
                  ? `он добавится к текущему долгу, срок — до конца месяца ${loan.dueMonth}.`
                  : `вернуть до конца месяца ${preview.month + E.LOAN_TERM_MONTHS}, иначе банкротство.`}{' '}
                Свободных денег после выплаты не останется.
              </Notice>
            )}

            {loan && !preview.isLoanDeadline && preview.maxRepayCents > 0 && (
              <FinanceSection title="Погасить кредит сейчас">
                <FinanceRow label="Сумма погашения" cents={preview.repayCents} bold />
                <Slider
                  style={{ height: 36 }}
                  minimumValue={0}
                  maximumValue={preview.maxRepayCents}
                  step={Math.max(1, Math.round(preview.maxRepayCents / 100))}
                  value={repayCents}
                  onValueChange={(v) => setRepayCents(Math.round(v))}
                  minimumTrackTintColor={colors.primary}
                  maximumTrackTintColor={colors.border}
                  thumbTintColor={colors.primary}
                />
                <FinanceRow
                  label={`Срок: до конца месяца ${loan.dueMonth} (осталось ${E.loanMonthsLeft(state)} мес.)`}
                  muted
                />
              </FinanceSection>
            )}

            {preview.canContinue ? (
              <FinanceSection title="После выплаты">
                <FinanceRow label="Свободные деньги" cents={preview.balanceAfterCents} bold />
                <FinanceRow label="Долг банку" cents={preview.loanAfterCents} />
              </FinanceSection>
            ) : (
              <Notice level="danger">
                Чтобы выплатить зарплаты и вернуть кредит, не хватает {formatMoney(preview.shortfallCents)}. Вы банкрот.
              </Notice>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[ui.primaryButton, !preview.canContinue && ui.dangerButton, styles.payButton]}
            onPress={handlePay}
            activeOpacity={0.85}
          >
            <GameIcon source={ICONS.money} size={26} />
            <Text style={ui.primaryButtonText}>
              {preview.canContinue ? 'Выплатить и продолжить' : 'Подвести итоги'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.darkBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 14,
    maxHeight: '92%',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  scroll: {
    flexGrow: 0,
  },
  payButton: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
});
