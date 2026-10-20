import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, Platform } from 'react-native';
import { SheetModal } from '@components/SheetModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TouchableOpacity } from '@components/Touchable';
import { garageStyles } from '@styles/styles';
import { colors } from '@styles/colors';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { useEconomy } from '@hooks/EconomyContext';
import { useGarageContext } from '@hooks/GarageContext';
import { GameIcon } from '@components/GameIcon';
import { SheetFooter, SheetHeader, SheetScroll } from '@components/SheetHeader';
import { ActionTiles } from '@components/ActionTiles';
import { WorkerTrainingModal } from '@components/WorkerTrainingModal';
import { FireMechanicModal } from '@components/finance/FireMechanicModal';
import { ICONS, getMechanicAvatar } from '@img/gameIcons';
import { MECHANIC_MONTHLY_SALARY_CENTS, salaryForLevel } from '../../economy/economy';
import { skillMultiplier } from '../../economy/progression';
import { formatMoney } from '../../economy/format';
import { ACTION_COLORS } from './CarWorkPanels';
import type { Mechanic } from '@/types';

type Status = { text: string; color: string };

/** Окно персонала: механики, их слоты, навык и увольнение. Вложенные окна — слоями внутри (iOS) */
export const MechanicsModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const { state } = useEconomy();
  const { mechanics, garageSlots, boothSlot, hireMechanic, fireMechanic, changeMechanicSlot, mechanicRepairs } = useGarageContext();
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;
  const [trainingId, setTrainingId] = useState<string | null>(null);
  const [fireId, setFireId] = useState<string | null>(null);

  const repairingIds = new Set(Object.values(mechanicRepairs).map((r) => r.mechanicId));

  const statusOf = (m: Mechanic): Status => {
    if (!m.hired) return { text: 'Можно нанять', color: colors.textTertiary };
    if (repairingIds.has(m.id)) return { text: `Ремонтирует · слот ${m.slotIndex + 1}`, color: '#22C55E' };
    if (m.slotIndex === -1) return { text: 'Без слота', color: '#F59E0B' };
    return { text: `Слот ${m.slotIndex + 1} · ждёт машину`, color: colors.primary };
  };

  return (
    <SheetModal visible={visible} onRequestClose={onClose}>
        <View style={[garageStyles.modalContent, { paddingBottom: insets.bottom + 12, maxHeight: '90%' }]}>
          <SheetHeader title="Механики" onClose={onClose} flush />
          <SheetScroll>
            {mechanics.map((m) => {
              const contract = state.contracts[m.id];
              const status = statusOf(m);
              const salary = contract?.monthlyCents ?? MECHANIC_MONTHLY_SALARY_CENTS;
              return (
                <View key={m.id} style={styles.card}>
                  <View style={styles.head}>
                    <GameIcon source={getMechanicAvatar(m.id)} size={46} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={styles.nameRow}>
                        <Text style={styles.name} numberOfLines={1}>
                          {m.name}
                        </Text>
                        {m.hired && <Text style={styles.level}>Ур. {m.skillLevel}</Text>}
                      </View>
                      <View style={[styles.chip, { borderColor: status.color }]}>
                        <View style={[styles.dot, { backgroundColor: status.color }]} />
                        <Text style={[styles.chipText, { color: status.color }]}>{status.text}</Text>
                      </View>
                    </View>
                  </View>

                  <Text style={styles.info}>
                    {m.hired
                      ? `Скорость ремонта +${Math.round((skillMultiplier(m.skillLevel) - 1) * 100)}% · оклад ${formatMoney(salary)}/мес`
                      : `Ремонтирует машины сам, 0,5% в день. Оклад ${formatMoney(salaryForLevel(1))}/мес, платится и в простое.`}
                  </Text>

                  {m.hired && (
                    <View style={styles.slots}>
                      <Text style={styles.slotsLabel}>Рабочий слот</Text>
                      <View style={styles.slotRow}>
                        {Array.from({ length: garageSlots }).map((_, i) => {
                          const other = mechanics.find((x) => x.slotIndex === i && x.id !== m.id);
                          const isBooth = i === boothSlot;
                          const current = m.slotIndex === i;
                          const blocked = !!other || isBooth;
                          return (
                            <TouchableOpacity
                              key={i}
                              style={[styles.slot, current && styles.slotCurrent, blocked && styles.slotBlocked]}
                              disabled={blocked}
                              onPress={() => changeMechanicSlot(m.id, current ? -1 : i)}
                            >
                              <Text style={[styles.slotText, current && { color: '#FFF' }]}>{isBooth ? '🎨' : i + 1}</Text>
                              {other && <Text style={styles.slotTaken}>{other.name.slice(0, 3)}</Text>}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  <ActionTiles
                    tiles={
                      m.hired
                        ? [
                            {
                              key: 'skill',
                              icon: ICONS.upgradeSkill,
                              title: 'Навык',
                              subtitle: 'и обучение',
                              state: 'ready',
                              accent: colors.primary,
                              info: 'Уровень, практика и платный курс механика. Практика копится только во время ремонта; с уровнем растут скорость и оклад.',
                              onPress: () => setTrainingId(m.id),
                            },
                            {
                              key: 'unassign',
                              emoji: '↩️',
                              title: 'Открепить',
                              subtitle: m.slotIndex === -1 ? 'нет слота' : `от слота ${m.slotIndex + 1}`,
                              state: m.slotIndex === -1 || repairingIds.has(m.id) ? 'locked' : 'ready',
                              accent: '#F59E0B',
                              info: 'Снять механика со слота. Во время ремонта открепить нельзя — сначала остановите ремонт на карточке машины.',
                              onPress: () => changeMechanicSlot(m.id, -1),
                            },
                            {
                              key: 'fire',
                              emoji: '✕',
                              title: 'Уволить',
                              subtitle: 'расчёт + оклад',
                              state: 'ready',
                              accent: '#EF4444',
                              info: 'Выплачивается начисленная зарплата и компенсация в один оклад. Прокачка сбрасывается: при повторном найме — снова 1 уровень.',
                              onPress: () => setFireId(m.id),
                            },
                          ]
                        : [
                            {
                              key: 'hire',
                              icon: ICONS.hireMechanic,
                              title: 'Нанять',
                              subtitle: `${formatMoney(salaryForLevel(1))}/мес`,
                              state: 'ready',
                              accent: ACTION_COLORS.mechanic,
                              info: 'Оклад начисляется с момента найма и выплачивается в зарплатный день — даже если механик простаивает. Прикрепите его к слоту, чтобы он ремонтировал.',
                              onPress: () => hireMechanic(m.id),
                            },
                          ]
                    }
                  />
                </View>
              );
            })}
          </SheetScroll>
          <SheetFooter>
            <TouchableOpacity style={[garageStyles.modalButton, garageStyles.cancelButton]} onPress={onClose}>
              <Text style={garageStyles.modalButtonText}>Закрыть</Text>
            </TouchableOpacity>
          </SheetFooter>
        </View>

        {/* Навык и увольнение — слоями внутри окна: на iOS второй Modal рядом не откроется */}
        <WorkerTrainingModal mechanic={mechanics.find((x) => x.id === trainingId) ?? null} onClose={() => setTrainingId(null)} />
        <FireMechanicModal
          mechanic={mechanics.find((x) => x.id === fireId) ?? null}
          onCancel={() => setFireId(null)}
          onConfirm={(id) => {
            fireMechanic(id);
            setFireId(null);
          }}
        />
    </SheetModal>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 10,
    marginBottom: 10,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  level: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 11, fontWeight: '700' },
  info: { fontSize: 12, color: colors.textTertiary, lineHeight: 17 },
  slots: { gap: 6 },
  slotsLabel: { fontSize: 11, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase' },
  slotRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  slot: {
    width: 46,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.darkBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotCurrent: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotBlocked: { opacity: 0.4 },
  slotText: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  slotTaken: { fontSize: 8, color: colors.textTertiary },
});
