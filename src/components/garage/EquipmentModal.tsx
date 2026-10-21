import React from 'react';
import { Modal, View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { SheetModal } from '@components/SheetModal';
import { TouchableOpacity } from '@components/Touchable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { garageStyles } from '@styles/styles';
import { colors } from '@styles/colors';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { useEconomy } from '@hooks/EconomyContext';
import { useGarageContext } from '@hooks/GarageContext';
import { useToast } from '@components/toast/ToastContext';
import { GameIcon } from '@components/GameIcon';
import { SheetFooter, SheetHeader, SheetScroll } from '@components/SheetHeader';
import { ActionTiles } from '@components/ActionTiles';
import { clearanceName, clearanceTile } from './clearanceTile';
import { ICONS, getMechanicAvatar } from '@img/gameIcons';
import { EQUIPMENT, PAINTER_MONTHLY_SALARY_CENTS, type EquipmentId } from '../../economy/balance';
import { equipmentBlock, hasEquipment } from '../../economy/economy';
import { skillMultiplier } from '../../economy/progression';
import { formatMoney } from '../../economy/format';
import type { Mechanic } from '@/types';

const EQUIPMENT_EMOJI: Record<EquipmentId, string> = {
  basic_tools: '🧰',
  scanner: '💻',
  transmission: '⚙️',
  paint_booth: '🎨',
  engine: '🔧',
  pro_tools: '🛠️',
  alignment: '📐',
  body_frame: '🏗️',
  paint_matching: '🎯',
  dyno: '🏎️',
  parking: '🅿️',
};

/** Оборудование: покупка по уровню игрока, установка и демонтаж покрасочной камеры */
export const EquipmentModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const { state, buyEquipment } = useEconomy();
  const { garageSlots, boothSlot, boothBlockReason, installBooth, uninstallBooth, boothJob, painterRun } = useGarageContext();
  const { showToast } = useToast();
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;

  const level = state.player.xp.level;

  const handleBuy = (id: EquipmentId, name: string) => {
    if (!buyEquipment(id)) return;
    showToast({ title: `Куплено: ${name}`, message: 'Оборудование переезжает вместе с гаражом.', icon: ICONS.money, tone: 'success' });
  };

  return (
    <SheetModal visible={visible} onRequestClose={onClose}>
        <View style={[garageStyles.modalContent, { paddingBottom: insets.bottom + 12, maxHeight: '90%' }]}>
          <SheetHeader title="Оборудование" onClose={onClose} flush />
          <SheetScroll>
            {EQUIPMENT.map((eq) => {
              const owned = hasEquipment(state, eq.id);
              const block = equipmentBlock(state, eq.id);
              return (
                <View key={eq.id} style={[styles.card, owned && styles.owned]}>
                  <View style={styles.head}>
                    <Text style={styles.emoji}>{EQUIPMENT_EMOJI[eq.id]}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{eq.name}</Text>
                      <Text style={styles.desc}>{eq.description}</Text>
                    </View>
                  </View>
                  {owned ? (
                    <Text style={styles.ownedText}>✓ Есть</Text>
                  ) : (
                    <TouchableOpacity
                      style={[styles.buy, !!block && styles.disabled]}
                      disabled={!!block}
                      onPress={() => handleBuy(eq.id, eq.name)}
                    >
                      <Text style={styles.buyText}>
                        {block === 'level'
                          ? `🔒 С ${eq.requiredLevel} уровня (у вас ${level})`
                          : `Купить · ${formatMoney(eq.price * 100)}`}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {eq.id === 'paint_booth' && owned && (
                    <View style={styles.booth}>
                      {boothSlot !== null ? (
                        <>
                          <Text style={styles.desc}>Установлена в слот #{boothSlot + 1} — он занят камерой постоянно.</Text>
                          <TouchableOpacity
                            style={[styles.secondary, (!!boothJob || !!painterRun) && styles.disabled]}
                            disabled={!!boothJob || !!painterRun}
                            onPress={() => uninstallBooth()}
                          >
                            <Text style={styles.secondaryText}>
                              {boothJob ? 'Демонтаж — после окончания покраски' : 'Демонтировать'}
                            </Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          <Text style={styles.desc}>Не установлена. Выберите свободный слот (без машины и механика).</Text>
                          <View style={styles.slots}>
                              {Array.from({ length: garageSlots }).map((_, i) => {
                                const reason = boothBlockReason(i);
                                return (
                                  <TouchableOpacity
                                    key={i}
                                    style={[styles.slot, !!reason && styles.disabled]}
                                    disabled={!!reason}
                                    onPress={() => installBooth(i)}
                                  >
                                    <Text style={styles.slotText}>{i + 1}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                          </View>
                          {garageSlots < 2 && (
                            <Text style={styles.warn}>
                              В гараже один слот: после камеры не останется места для ремонта. Переезжайте в гараж побольше.
                            </Text>
                          )}
                          {garageSlots >= 2 && boothBlockReason(0) && boothBlockReason(garageSlots - 1) && (
                            <Text style={styles.warn}>Освободите слот: уберите машину и открепите механика.</Text>
                          )}
                        </>
                      )}
                    </View>
                  )}
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
    </SheetModal>
  );
};

/** Маляр: найм (нужна установленная камера), навык и увольнение */
export const PainterModal = ({
  visible,
  onClose,
  onTraining,
  onFire,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  onTraining: (painter: Mechanic) => void;
  onFire: (painter: Mechanic) => void;
  /** Вложенные окна (навык, увольнение) — рисуются слоем внутри этого окна */
  children?: React.ReactNode;
}) => {
  const { state, upgradeClearance } = useEconomy();
  const { painters, hirePainter, boothSlot, painterRun } = useGarageContext();
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;

  return (
    <SheetModal visible={visible} onRequestClose={onClose}>
        <View style={[garageStyles.modalContent, { paddingBottom: insets.bottom + 12 }]}>
          <SheetHeader title="Маляр" onClose={onClose} />
          {painters.map((p) => {
            const contract = state.contracts[p.id];
            return (
              <View key={p.id} style={styles.card}>
                <View style={styles.head}>
                  <GameIcon source={getMechanicAvatar(p.id)} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{p.name}</Text>
                    <Text style={styles.desc}>
                      {p.hired
                        ? `Уровень ${p.skillLevel} · скорость +${Math.round((skillMultiplier(p.skillLevel) - 1) * 100)}% · допуск: ${clearanceName(contract?.clearance)} · оклад ${formatMoney(contract?.monthlyCents ?? PAINTER_MONTHLY_SALARY_CENTS)}/мес`
                        : 'Красит машины в камере автоматически. Зарплата идёт и в простое.'}
                    </Text>
                    {p.hired && (
                      <Text style={[styles.desc, { color: painterRun ? '#22C55E' : '#F59E0B' }]}>
                        {painterRun ? 'Красит' : boothSlot === null ? 'Простаивает: камера не установлена' : 'Простаивает: нет покраски в камере'}
                      </Text>
                    )}
                  </View>
                </View>
                <ActionTiles
                  tiles={
                    p.hired
                      ? [
                          {
                            key: 'skill',
                            icon: ICONS.upgradeSkill,
                            title: 'Навык',
                            subtitle: 'и обучение',
                            state: 'ready',
                            accent: colors.primary,
                            info: 'Уровень, практика и платный курс маляра. Практика копится только во время покраски; с уровнем растут скорость и оклад.',
                            onPress: () => onTraining(p),
                          },
                          ...[clearanceTile(contract, state.balanceCents, () => upgradeClearance(p.id))].filter(
                            (t): t is NonNullable<typeof t> => t !== null,
                          ),
                          {
                            key: 'fire',
                            emoji: '✕',
                            title: 'Уволить',
                            subtitle: 'расчёт + оклад',
                            state: 'ready',
                            accent: '#EF4444',
                            info: 'Выплачивается начисленная зарплата и компенсация в один оклад. Прокачка сбрасывается.',
                            onPress: () => onFire(p),
                          },
                        ]
                      : [
                          {
                            key: 'hire',
                            emoji: '🎨',
                            title: 'Нанять',
                            subtitle: boothSlot === null ? 'нужна камера' : `${formatMoney(PAINTER_MONTHLY_SALARY_CENTS)}/мес`,
                            state: boothSlot === null ? 'locked' : 'ready',
                            accent: '#0EA5E9',
                            info:
                              boothSlot === null
                                ? 'Маляр работает только в покрасочной камере: купите и установите её (гараж → «Оборудование»).'
                                : 'Маляр сам красит машины в камере. Оклад начисляется с найма и платится и в простое.',
                            onPress: () => hirePainter(p.id),
                          },
                        ]
                  }
                />
              </View>
            );
          })}
          <SheetFooter>
            <TouchableOpacity style={[garageStyles.modalButton, garageStyles.cancelButton]} onPress={onClose}>
              <Text style={garageStyles.modalButtonText}>Закрыть</Text>
            </TouchableOpacity>
          </SheetFooter>
        </View>
        {children}
    </SheetModal>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  owned: { borderColor: '#22C55E' },
  head: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  emoji: { fontSize: 28 },
  name: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  desc: { fontSize: 12, color: colors.textTertiary, lineHeight: 17 },
  ownedText: { fontSize: 13, fontWeight: '700', color: '#22C55E' },
  buy: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  buyText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  secondary: { borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, alignItems: 'center' },
  secondaryText: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },
  disabled: { opacity: 0.45 },
  booth: { gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  slots: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  slot: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotText: { color: '#38BDF8', fontWeight: '800', fontSize: 16 },
  warn: { fontSize: 12, color: '#F59E0B', fontWeight: '600' },
});
