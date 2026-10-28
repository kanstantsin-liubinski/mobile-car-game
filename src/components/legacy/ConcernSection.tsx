import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TouchableOpacity } from '@components/Touchable';
import { FinanceSection } from '@components/finance/FinanceUI';
import { useEconomy } from '@hooks/EconomyContext';
import { useLegacy } from '@hooks/LegacyContext';
import { useToast } from '@components/toast/ToastContext';
import { colors } from '@styles/colors';
import { ICONS } from '@img/gameIcons';
import { CONCERN_PRICE } from '../../economy/balance';
import { concernAvailable, concernRequirements } from '../../economy/concern';
import { formatMoney } from '../../economy/format';

/** Цель «Приобрести автомобильный концерн»: условия с прогрессом и покупка с подтверждением */
export const ConcernSection = () => {
  const { state, buyConcern } = useEconomy();
  const { legacy } = useLegacy();
  const { showToast } = useToast();
  const [confirm, setConfirm] = useState(false);

  const purchased = legacy.concern.purchased || !!state.concernPurchased;
  const requirements = concernRequirements(state, legacy);
  const available = concernAvailable(state, legacy);

  const handleBuy = () => {
    if (!available || !buyConcern()) return;
    setConfirm(false);
    showToast({
      title: '🏆 Автомобильный концерн твой!',
      message: 'Главная цель выполнена. Игра продолжается — бизнес, филиалы и наследие остаются.',
      icon: ICONS.money,
      tone: 'success',
    });
  };

  return (
    <FinanceSection title="Цель: автомобильный концерн">
      {purchased ? (
        <Text style={styles.done}>
          🏆 Концерн приобретён{legacy.concern.purchasedAtCareer ? ` в карьере ${legacy.concern.purchasedAtCareer}` : ''}. Игра продолжается.
        </Text>
      ) : (
        <>
          <Text style={styles.hint}>
            Купи автомобильный концерн за {formatMoney(CONCERN_PRICE * 100)}. Нужны и «Наследие», и сильная текущая карьера.
          </Text>
          {requirements.map((r) => (
            <View key={r.id} style={styles.req}>
              <View style={styles.reqHead}>
                <Text style={[styles.reqText, r.done && { color: '#22C55E' }]}>
                  {r.done ? '✓' : '○'} {r.text}
                </Text>
                <Text style={styles.reqProgress}>{r.progress}</Text>
              </View>
              <View style={styles.bar}>
                <View style={[styles.fill, { width: `${Math.round(r.share * 100)}%` }, r.done && { backgroundColor: '#22C55E' }]} />
              </View>
            </View>
          ))}
          {confirm ? (
            <View style={styles.buttons}>
              <TouchableOpacity style={[styles.button, styles.secondary]} onPress={() => setConfirm(false)}>
                <Text style={styles.buttonText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.gold]} onPress={handleBuy}>
                <Text style={styles.buttonText}>Подтвердить покупку</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[styles.button, styles.gold, !available && styles.disabled]} disabled={!available} onPress={() => setConfirm(true)}>
              <Text style={styles.buttonText}>Приобрести концерн · {formatMoney(CONCERN_PRICE * 100)}</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </FinanceSection>
  );
};

const styles = StyleSheet.create({
  hint: { fontSize: 12, color: colors.textTertiary, lineHeight: 17, marginBottom: 6 },
  done: { fontSize: 14, fontWeight: '800', color: '#22C55E' },
  req: { marginVertical: 4 },
  reqHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  reqText: { flex: 1, fontSize: 13, color: colors.textSecondary },
  reqProgress: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  bar: { height: 5, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden', marginTop: 3 },
  fill: { height: 5, backgroundColor: '#F59E0B' },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 10 },
  button: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  gold: { backgroundColor: '#B45309' },
  secondary: { borderWidth: 1, borderColor: colors.border },
  buttonText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  disabled: { opacity: 0.45 },
});
