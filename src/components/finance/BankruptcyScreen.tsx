import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { TouchableOpacity } from '@components/Touchable';
import { colors } from '@styles/colors';
import { useEconomy } from '@hooks/EconomyContext';
import { useGarageContext } from '@hooks/GarageContext';
import { useGameState } from '@hooks/GameStateContext';
import { garagesValueCents, useLegacy } from '@hooks/LegacyContext';
import { careerSummary } from '../../economy/economy';
import { GameIcon } from '@components/GameIcon';
import { BUILDING_ICONS } from '@img/gameIcons';
import { getGarageById } from '../../data/cityBuildings';
import { FinanceRow, FinanceSection, Notice, ui } from './FinanceUI';
import { formatMoney } from '../../economy/format';

/** Экран проигрыша: причина, итоги бизнеса и новая игра */
export const BankruptcyScreen = () => {
  const { state, getNow } = useEconomy();
  const { recordEnd } = useLegacy();
  const { garageId, garage } = useGarageContext();
  const { resetGameData } = useGameState();
  const [restarting, setRestarting] = useState(false);

  const bankruptcy = state.bankruptcy;
  if (!bankruptcy) return null;
  const garageInfo = getGarageById(garageId);

  const handleNewGame = async () => {
    if (restarting) return;
    setRestarting(true);
    // Банкротство не стирает «Наследие»: карьера только записывается в историю
    await recordEnd(careerSummary(state, getNow(), garagesValueCents(garageId)), 'bankruptcy');
    await resetGameData();
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.emoji}>💸</Text>
        <Text style={styles.title}>Банкротство</Text>
        <Text style={styles.subtitle}>Месяц {bankruptcy.month}</Text>

        <Notice level="danger">
          В конце месяца {bankruptcy.month} нужно было выплатить зарплаты ({formatMoney(bankruptcy.payrollCents)}) и
          вернуть кредит ({formatMoney(bankruptcy.debtCents)}), но на счету было {formatMoney(state.balanceCents)}.
          Не хватило {formatMoney(bankruptcy.shortfallCents)}.
        </Notice>

        <FinanceSection title="Итоги бизнеса">
          <FinanceRow label="Месяцев в бизнесе" value={String(bankruptcy.month)} />
          <FinanceRow label="Продано машин" value={String(state.totals.carsSold)} />
          <FinanceRow label="Выручка за всё время" cents={state.totals.revenueCents} />
          <FinanceRow label="Чистая прибыль за всё время" cents={state.totals.netProfitCents} signed />
          <FinanceRow label="Машин в гараже" value={String(garage.length)} />
          <FinanceRow label="Механиков в штате" value={String(Object.keys(state.contracts).length)} />
          <View style={styles.garageRow}>
            {BUILDING_ICONS[garageId] && <GameIcon source={BUILDING_ICONS[garageId]} size={56} />}
            <Text style={styles.garageName}>{garageInfo?.name ?? 'Гараж'}</Text>
          </View>
        </FinanceSection>

        <TouchableOpacity style={[ui.primaryButton, styles.button]} onPress={handleNewGame} disabled={restarting}>
          <Text style={ui.primaryButtonText}>Начать новую игру</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
    zIndex: 100,
  },
  content: {
    padding: 20,
    paddingTop: 48,
  },
  emoji: {
    fontSize: 56,
    textAlign: 'center',
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: '#EF4444',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: 16,
  },
  garageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  garageName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  button: {
    marginTop: 8,
  },
});
