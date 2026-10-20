import React, { useMemo, useState } from 'react';
import { Modal, View, Text, ScrollView, Platform, StyleSheet } from 'react-native';
import { TouchableOpacity } from '@components/Touchable';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@styles/colors';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { useGarageContext } from '@hooks/GarageContext';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { GameIcon } from '@components/GameIcon';
import { CarImage, getCarTier } from '@components/CarImage';
import { getMechanicAvatar } from '@img/gameIcons';
import { TIER_NAMES } from '../../data/carModels';
import { FinanceRow, FinanceSection, Notice, financeColors, moneyColor, ui } from './FinanceUI';
import * as E from '../../economy/economy';
import { formatGameDays, formatGameSpan, formatMoney, formatPercent } from '../../economy/format';

type Tab = 'overview' | 'pnl' | 'assets' | 'mechanics' | 'advice' | 'loan';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Обзор' },
  { id: 'pnl', label: 'Доходы и расходы' },
  { id: 'assets', label: 'Активы' },
  { id: 'mechanics', label: 'Персонал' },
  { id: 'advice', label: 'Советы' },
  { id: 'loan', label: 'Кредит' },
];

interface FinancePanelProps {
  visible: boolean;
  onClose: () => void;
}

/** Финансы бизнеса: открывается нажатием на баланс, все цифры — из реальных игровых операций */
export const FinancePanel = ({ visible, onClose }: FinancePanelProps) => {
  const [tab, setTab] = useState<Tab>('overview');
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Финансы</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={{ gap: 8 }}>
            {TABS.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.tab, tab === t.id && styles.tabActive]}
                onPress={() => setTab(t.id)}
              >
                <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {visible && (
            <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 8, paddingHorizontal: 14 }}>
              {tab === 'overview' && <OverviewTab />}
              {tab === 'pnl' && <PnlTab />}
              {tab === 'assets' && <AssetsTab />}
              {tab === 'mechanics' && <MechanicsTab />}
              {tab === 'advice' && <AdviceTab />}
              {tab === 'loan' && <LoanTab />}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

// ─── Обзор ────────────────────────────────────────────────────────────

const OverviewTab = () => {
  const { state } = useEconomy();
  const { gameTimeMs, calendar } = useGameClock();
  const result = E.getMonthResult(state, gameTimeMs);

  return (
    <>
      <FinanceSection title={`Месяц ${calendar.month} · День ${calendar.day}/${E.DAYS_IN_MONTH}`}>
        <FinanceRow label="До зарплатного дня" value={formatGameDays(calendar.msToPayday)} />
      </FinanceSection>
      <FinanceSection title="Деньги и обязательства">
        <FinanceRow label="Свободные деньги" cents={state.balanceCents} bold />
        <FinanceRow
          label={`Машины в активах (${Object.keys(state.assets).length})`}
          cents={E.assetsTotalCents(state)}
        />
        <FinanceRow label="Начисленная зарплата" cents={E.payrollCents(state, gameTimeMs)} />
        <FinanceRow label="Зарплата к концу месяца" cents={E.projectedPayrollCents(state)} />
        <FinanceRow label="Долг банку" cents={state.loan?.principalCents ?? 0} />
      </FinanceSection>
      <FinanceSection title="Этот месяц">
        <FinanceRow label="Прибыль от сделок" cents={result.dealProfitCents} signed />
        <FinanceRow label="Чистая прибыль на сейчас" cents={result.netProfitCents} signed bold />
      </FinanceSection>
      <Text style={styles.hint}>
        Активы — непроданные машины по себестоимости. В свободные деньги они превращаются только после продажи.
      </Text>
    </>
  );
};

// ─── Доходы и расходы ─────────────────────────────────────────────────

const PnlTab = () => {
  const { state } = useEconomy();
  const { gameTimeMs, calendar } = useGameClock();
  const r = E.getMonthResult(state, gameTimeMs);
  const history = [...state.history].reverse();

  return (
    <>
      <FinanceSection title={`Месяц ${calendar.month} (идёт)`}>
        <FinanceRow label="Продано машин" value={String(r.carsSold)} />
        <FinanceRow label="Выручка" cents={r.revenueCents} />
        <FinanceRow label="Себестоимость проданных" cents={-r.cogsCents} />
        <FinanceRow label="Прибыль от сделок" cents={r.dealProfitCents} signed />
        <FinanceRow label="Зарплаты (начислено)" cents={-r.salaryCents} />
        <FinanceRow label="Компенсации при увольнении" cents={-r.severanceCents} />
        <FinanceRow label="Заказы автосервиса: оплата" cents={r.serviceRevenueCents} />
        <FinanceRow label="Заказы автосервиса: детали" cents={-r.serviceCostsCents} />
        <FinanceRow label="Сторонняя диагностика" cents={-r.diagnosticsCents} />
        <FinanceRow label="Обучение (курсы)" cents={-r.otherExpenseCents} />
        <FinanceRow label="Прочие доходы" cents={r.otherIncomeCents} />
        <View style={ui.divider} />
        <FinanceRow label="Чистая прибыль" cents={r.netProfitCents} signed bold />
        <FinanceRow label="Вложения (гаражи, оборудование)" cents={-r.investmentsCents} muted />
        <FinanceRow label="Покраска своих машин (в себестоимость)" cents={-state.ledger.carExtraCostsCents} muted />
        <FinanceRow label="Куплено машин" value={`${state.ledger.carsBought} на ${formatMoney(state.ledger.carPurchasesCents)}`} muted />
      </FinanceSection>
      <Text style={styles.hint}>
        Затраты на ремонт и улучшения входят в себестоимость машины и учитываются при её продаже.
      </Text>

      <FinanceSection title="Прошлые месяцы">
        {history.length === 0 && <Text style={styles.empty}>Закрытых месяцев пока нет</Text>}
        {history.map((m) => (
          <View key={m.month} style={styles.historyRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.historyTitle}>Месяц {m.month}</Text>
              <Text style={styles.historyMeta}>
                Продано {m.carsSold} · выручка {formatMoney(m.revenueCents)} · зарплаты {formatMoney(m.salaryCents)}
              </Text>
              <Text style={styles.historyMeta}>
                На счету в конце: {formatMoney(m.balanceEndCents)}
                {m.loanEndCents > 0 ? ` · долг ${formatMoney(m.loanEndCents)}` : ''}
              </Text>
            </View>
            <Text style={[styles.historyProfit, { color: moneyColor(m.netProfitCents) }]}>
              {formatMoney(m.netProfitCents, { sign: true })}
            </Text>
          </View>
        ))}
      </FinanceSection>
    </>
  );
};

// ─── Активы ───────────────────────────────────────────────────────────

const AssetsTab = () => {
  const { state } = useEconomy();
  const { garage: allCars, mechanicRepairs, mechanicRepairsProgress, activeSells, activeSellsProgress, carBusyReason } = useGarageContext();
  // Машины клиентов — не активы бизнеса
  const garage = allCars.filter((c) => !c.clientOrderId);

  const stage = (carId: string, condition: number, maxCondition: number) => {
    if (activeSells[carId]) return `Продаётся · ${Math.round(activeSellsProgress[carId] ?? 0)}%`;
    const paintBusy = carBusyReason(carId);
    if (paintBusy && !mechanicRepairs[carId]) return paintBusy;
    if (mechanicRepairs[carId]) return `Ремонт механиком · ${Math.round(mechanicRepairsProgress[carId] ?? 0)}%`;
    if (condition < maxCondition) return `Ждёт ремонта · ${condition.toFixed(0)}% из ${maxCondition.toFixed(0)}%`;
    return 'Отремонтирована, готова к продаже';
  };

  return (
    <>
      <FinanceSection title="Стоимость активов">
        <FinanceRow label="Машин в гараже" value={String(garage.length)} />
        <FinanceRow label="По себестоимости" cents={E.assetsTotalCents(state)} bold />
      </FinanceSection>
      {garage.length === 0 && <Text style={styles.empty}>Непроданных машин нет</Text>}
      {garage.map((car) => {
        const asset = state.assets[car.id];
        const purchase = asset?.purchaseCents ?? E.toCents(car.price);
        const extra = asset?.extraCostsCents ?? 0;
        const tier = getCarTier(car);
        return (
          <View key={car.id} style={ui.section}>
            <View style={styles.itemHeader}>
              <CarImage car={car} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{car.name}</Text>
                <Text style={styles.itemMeta}>
                  {tier ? TIER_NAMES[tier] : 'Класс неизвестен'} · {stage(car.id, car.condition, car.maxCondition)}
                </Text>
              </View>
            </View>
            <FinanceRow label="Цена покупки" cents={purchase} />
            <FinanceRow label="Вложено после покупки" cents={extra} />
            <FinanceRow label="Себестоимость" cents={purchase + extra} bold />
          </View>
        );
      })}
    </>
  );
};

// ─── Механики ─────────────────────────────────────────────────────────

const MechanicsTab = () => {
  const { state } = useEconomy();
  const { gameTimeMs } = useGameClock();
  const { mechanics, painters } = useGarageContext();
  // Механики и маляры — в одном зарплатном фонде
  const staff = [...mechanics, ...painters].filter((m) => state.contracts[m.id]);

  return (
    <>
      {staff.length === 0 && (
        <Text style={styles.empty}>В штате никого нет. Механиков и маляра нанимают в гараже.</Text>
      )}
      {staff.map((m) => {
        const c = state.contracts[m.id];
        const activity = E.getMechanicActivity(state, c, gameTimeMs);
        const busyNow = c.busySinceMs !== null;
        return (
          <View key={m.id} style={ui.section}>
            <View style={styles.itemHeader}>
              <GameIcon source={getMechanicAvatar(m.id)} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>
                  {m.name} · {c.profession === 'painter' ? 'маляр' : 'механик'}
                </Text>
                <Text style={[styles.itemMeta, busyNow && { color: financeColors.positive }]}>
                  Уровень {m.skillLevel} · {busyNow ? (c.profession === 'painter' ? 'красит' : 'ремонтирует') : 'простаивает'}
                </Text>
              </View>
              <Text style={styles.load}>{formatPercent(activity.loadPct)}</Text>
            </View>
            <FinanceRow label="Зарплата" value={`${formatMoney(c.monthlyCents)}/мес`} />
            <FinanceRow label="Начислено в этом месяце" cents={E.accruedSalaryCents(c, gameTimeMs)} />
            <FinanceRow label="Прокачка" value={`ур. ${m.skillLevel} · опыт ${m.experience}`} />
            <FinanceRow label="Ремонтов" value={`${c.jobsDoneMonth} в этом месяце · ${c.jobsDoneTotal} всего`} />
            <FinanceRow label="Занят" value={formatGameSpan(activity.busyMs)} />
            <FinanceRow label="Простой" value={formatGameSpan(activity.idleMs)} />
            <Text style={styles.hint}>Загрузка — доля времени в ремонте от времени в штате в этом месяце.</Text>
          </View>
        );
      })}
    </>
  );
};

// ─── Советы ───────────────────────────────────────────────────────────

const AdviceTab = () => {
  const { state } = useEconomy();
  const { gameTimeMs } = useGameClock();
  const { garage, garageSlots, mechanics, mechanicRepairs, activeSells } = useGarageContext();

  const advice = useMemo(() => {
    const occupied = new Set(garage.filter((c) => c.slotIndex >= 0).map((c) => c.slotIndex));
    return E.buildAdvice(state, {
      now: gameTimeMs,
      mechanicNames: Object.fromEntries(mechanics.map((m) => [m.id, m.name])),
      emptySlots: Math.max(0, garageSlots - occupied.size),
      carsAwaitingRepair: garage.filter(
        (c) => c.condition < c.maxCondition && !mechanicRepairs[c.id] && !activeSells[c.id],
      ).length,
    });
  }, [state, gameTimeMs, garage, garageSlots, mechanics, mechanicRepairs, activeSells]);

  if (advice.length === 0) {
    return <Text style={styles.empty}>Пока всё в порядке — советов нет.</Text>;
  }
  return (
    <>
      {advice.map((a) => (
        <Notice key={a.id} level={a.level}>
          {a.text}
        </Notice>
      ))}
    </>
  );
};

// ─── Кредит ───────────────────────────────────────────────────────────

const LoanTab = () => {
  const { state, repayLoan } = useEconomy();
  const [amountCents, setAmountCents] = useState(0);
  const loan = state.loan;
  const max = E.maxRepayCents(state);
  const amount = Math.min(amountCents, max);

  if (!loan) {
    return (
      <Notice level="info">
        Кредита нет. Он оформляется автоматически, только если в зарплатный день или при увольнении не хватает денег,
        и выдаётся на {E.LOAN_TERM_MONTHS} месяцев без процентов.
      </Notice>
    );
  }

  const monthsLeft = E.loanMonthsLeft(state);
  return (
    <>
      <FinanceSection title="Кредит">
        <FinanceRow label="Остаток долга" cents={loan.principalCents} bold />
        <FinanceRow label="Оформлен" value={`месяц ${loan.issuedMonth}`} />
        <FinanceRow label="Погасить до конца" value={`месяца ${loan.dueMonth}`} />
        <FinanceRow label="Осталось месяцев" value={String(monthsLeft)} />
      </FinanceSection>
      {monthsLeft <= 1 && (
        <Notice level="danger">
          Последний месяц: в зарплатный день долг нужно вернуть полностью, иначе банкротство.
        </Notice>
      )}
      <FinanceSection title="Погашение">
        {max <= 0 ? (
          <Text style={styles.empty}>Нет свободных денег для погашения.</Text>
        ) : (
          <>
            <FinanceRow label="Сумма платежа" cents={amount} bold />
            <Slider
              style={{ height: 36 }}
              minimumValue={0}
              maximumValue={max}
              step={Math.max(1, Math.round(max / 100))}
              value={amount}
              onValueChange={(v) => setAmountCents(Math.round(v))}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
            />
            <FinanceRow label="Баланс после платежа" cents={state.balanceCents - amount} />
            <FinanceRow label="Долг после платежа" cents={loan.principalCents - amount} />
            <View style={styles.loanButtons}>
              <TouchableOpacity style={[styles.secondaryButton]} onPress={() => setAmountCents(max)}>
                <Text style={styles.secondaryButtonText}>Максимум</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[ui.primaryButton, { flex: 1, paddingVertical: 12 }, amount <= 0 && { opacity: 0.5 }]}
                disabled={amount <= 0}
                onPress={() => {
                  if (repayLoan(amount)) setAmountCents(0);
                }}
              >
                <Text style={[ui.primaryButtonText, { fontSize: 15 }]}>Погасить {formatMoney(amount)}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </FinanceSection>
      <Text style={styles.hint}>
        Выручка от продаж на кредит автоматически не идёт — вы сами решаете, когда и сколько гасить. Процентов нет.
      </Text>
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.darkBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 14,
    // Фиксированная высота: при переключении вкладок панель не прыгает
    height: '75%',
  },
  // Шапка окна отделена серой линией на всю ширину
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginHorizontal: -14,
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  close: {
    fontSize: 22,
    color: colors.textTertiary,
  },
  tabs: {
    flexGrow: 0,
    marginBottom: 10,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.buttonBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  tabTextActive: {
    color: '#FFF',
  },
  // Прокрутка на всю ширину окна: полоса идёт по краю, а не по карточкам
  body: {
    flex: 1,
    marginHorizontal: -14,
  },
  hint: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: 10,
    lineHeight: 16,
  },
  empty: {
    fontSize: 14,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: 12,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  historyMeta: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  historyProfit: {
    fontSize: 15,
    fontWeight: '800',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  itemMeta: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  load: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },
  loanButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  secondaryButton: {
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.buttonBg,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
});
