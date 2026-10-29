import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@styles/colors';
import { useEconomy } from '@hooks/EconomyContext';
import { InfoBar, InfoRow, InfoSection, InfoSheet, InfoText } from './InfoSheet';
import { FULL_REPAIR_XP, SALE_BASE_XP, requiredXp } from '../../economy/progression';
import { EQUIPMENT, LADDER, LEVEL_LADDER } from '../../economy/balance';
import { legacyProfitMultiplier, legacyXpMultiplier } from '../../economy/legacy';
import { TouchableOpacity } from '@components/Touchable';

/** Что открывается на каком уровне: лестница до 100 (классы, гаражи, филиалы, оборудование, новые механики) */
const unlocks = (): { level: number; text: string }[] => {
  const list = LEVEL_LADDER.filter((u) => u.level > 1).map((u) => ({ ...u }));
  // Камера, продвинутое оборудование и стоянка уже есть в лестнице — из списка оборудования только ранние ступени
  for (const e of EQUIPMENT) if (e.requiredLevel > 1 && e.requiredLevel < LADDER.paintBooth) list.push({ level: e.requiredLevel, text: e.name });
  return list.sort((a, b) => a.level - b.level);
};

/** Окно «Опыт»: уровень, прогресс, история начислений, как заработать и что даёт уровень */
export const ExperienceModal = ({
  visible,
  onClose,
  onOpenLegacy,
  onClosed,
}: {
  visible: boolean;
  onClose: () => void;
  onOpenLegacy?: () => void;
  onClosed?: () => void;
}) => {
  const { state } = useEconomy();
  const { level, xp, totalXp } = state.player.xp;
  const required = requiredXp(level);
  const log = (state.xpLog ?? []).slice(0, 10);
  const next = unlocks().filter((u) => u.level > level);
  const opened = unlocks().filter((u) => u.level <= level);

  return (
    <InfoSheet visible={visible} title="Опыт" onClose={onClose} onClosed={onClosed}>
      <InfoSection title={`Уровень ${level}`}>
        <InfoRow label="До следующего уровня" value={`${xp} / ${required} XP`} />
        <InfoBar progress={xp / required} color={colors.primary} />
        <InfoRow label="Осталось" value={`${required - xp} XP`} />
        <InfoRow label="Всего заработано" value={`${totalXp.toLocaleString('ru-RU')} XP`} />
        <InfoRow label="Продано машин за всё время" value={String(state.totals.carsSold)} />
      </InfoSection>

      {onOpenLegacy && (
        <InfoSection title="Наследие">
          <InfoText>
            Очки наследия: {state.legacyPoints ?? 0} · опыт ×{legacyXpMultiplier(state.legacyPoints ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} · прибыль ×
            {legacyProfitMultiplier(state.legacyPoints ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}. С 20 уровня карьеру можно перезапустить с
            постоянными бонусами.
          </InfoText>
          <TouchableOpacity style={styles.legacyButton} onPress={onOpenLegacy}>
            <Text style={styles.legacyButtonText}>🏛️ Открыть «Наследие»</Text>
          </TouchableOpacity>
        </InfoSection>
      )}

      <InfoSection title="Последние начисления">
        {log.length === 0 ? (
          <InfoText>Пока пусто. Продай машину с прибылью — и здесь появится первая запись.</InfoText>
        ) : (
          log.map((e, i) => (
            <View key={i} style={[styles.logRow, i === log.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.logReason}>{e.reason}</Text>
                <Text style={styles.logMeta}>
                  Месяц {e.month} · уровень {e.level}
                </Text>
              </View>
              <Text style={styles.logAmount}>+{e.amount} XP</Text>
            </View>
          ))
        )}
      </InfoSection>

      <InfoSection title="Как заработать опыт">
        <InfoText>
          • Продажа с прибылью: база по классу (Эконом {SALE_BASE_XP[1]}, Средний {SALE_BASE_XP[2]}, Премиум {SALE_BASE_XP[3]}, Люкс{' '}
          {SALE_BASE_XP[4]}, Спорт {SALE_BASE_XP[5]}, Гипер {SALE_BASE_XP[6]} XP) × множитель доходности: каждые 25% прибыли от цены
          покупки — ×1 (до ×4), выше 100% — ещё до +2. Продажа без прибыли опыта не даёт.
        </InfoText>
        <InfoText>
          • Первое полное восстановление своей машины до технического максимума: до {FULL_REPAIR_XP[1]}–{FULL_REPAIR_XP[6]} XP по
          классу (полный бонус — если износ был от 30 пунктов).
        </InfoText>
        <InfoText>• Прибыльный месяц: +10% от базового XP продаж за месяц (не больше 80 XP) — начисляется в зарплатный день.</InfoText>
        <InfoText>• «Наследие» умножает опыт продаж и восстановлений (один раз, до ×2,5).</InfoText>
        <InfoText>Навыки («Механик», «Торговля» и др.) и заказы клиентов общий опыт не дают — у них своя практика.</InfoText>
      </InfoSection>

      <InfoSection title="Что даёт уровень">
        {next.length > 0 && (
          <>
            <Text style={styles.subTitle}>Откроется</Text>
            {next.slice(0, 8).map((u) => (
              <InfoRow key={u.text} label={u.text} value={`ур. ${u.level}`} accent="#F59E0B" />
            ))}
          </>
        )}
        {opened.length > 0 && (
          <>
            <Text style={styles.subTitle}>Уже открыто</Text>
            {opened.map((u) => (
              <InfoRow key={u.text} label={u.text} value="✓" accent="#22C55E" />
            ))}
          </>
        )}
      </InfoSection>
    </InfoSheet>
  );
};

const styles = StyleSheet.create({
  legacyButton: { backgroundColor: '#B45309', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  legacyButtonText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logReason: { fontSize: 13, color: colors.textPrimary },
  logMeta: { fontSize: 11, color: colors.textTertiary },
  logAmount: { fontSize: 14, fontWeight: '800', color: '#22C55E', fontVariant: ['tabular-nums'] },
  subTitle: { fontSize: 12, fontWeight: '700', color: colors.textTertiary, marginTop: 4 },
});
