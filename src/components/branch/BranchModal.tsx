import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { SheetModal } from '@components/SheetModal';
import { TouchableOpacity } from '@components/Touchable';
import { SheetFooter, SheetHeader, SheetScroll } from '@components/SheetHeader';
import { GameIcon } from '@components/GameIcon';
import { WorkerTrainingModal } from '@components/WorkerTrainingModal';
import { FireMechanicModal } from '@components/finance/FireMechanicModal';
import { FinanceRow, FinanceSection, Notice, ui } from '@components/finance/FinanceUI';
import { useToast } from '@components/toast/ToastContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { useGarageContext } from '@hooks/GarageContext';
import { garageStyles } from '@styles/styles';
import { colors } from '@styles/colors';
import { BUILDING_ICONS, ICONS, getMechanicAvatar } from '@img/gameIcons';
import { getGarageById, getGarageRank } from '../../data/cityBuildings';
import { TIER_NAMES } from '../../data/carModels';
import * as B from '../../economy/balance';
import * as Br from '../../economy/branches';
import { clearanceUpgradeCostCents, salaryForLevel } from '../../economy/economy';
import { serviceDef } from '../../economy/orders';
import { formatGameDays, formatGameSpan, formatMoney, formatPercent } from '../../economy/format';
import { DAY_MS } from '../../economy/time';
import { clearanceName } from '../garage/clearanceTile';
import type { Mechanic } from '@/types';

const asWorker = (id: string, name: string, level: number): Mechanic => ({ id, name, slotIndex: -1, skillLevel: level, experience: 0, hired: true });

/** Требование открытия: выполнено или нет */
const Requirement = ({ ok, text }: { ok: boolean; text: string }) => (
  <Text style={[styles.req, { color: ok ? '#22C55E' : colors.textTertiary }]}>
    {ok ? '✓' : '○'} {text}
  </Text>
);

/** Кнопка-чип выбора (стратегия, резерв) */
const Chip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
  <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
  </TouchableOpacity>
);

const SmallButton = ({
  label,
  onPress,
  disabled,
  tone = 'default',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'primary' | 'danger';
}) => (
  <TouchableOpacity
    style={[styles.small, tone === 'primary' && styles.smallPrimary, tone === 'danger' && styles.smallDanger, disabled && styles.disabled]}
    disabled={disabled}
    onPress={onPress}
  >
    <Text style={[styles.smallText, tone !== 'default' && { color: '#FFF' }]}>{label}</Text>
  </TouchableOpacity>
);

/**
 * Филиал: открытие старого гаража, персонал (механики по слотам и управляющий), настройки
 * автоматизации (вкл/выкл, стратегия, резерв), работы в слотах, доска заказов и отчёт месяца.
 */
export const BranchModal = ({ garageId, onClose }: { garageId: string | null; onClose: () => void }) => {
  const economy = useEconomy();
  const { state } = economy;
  const { gameTimeMs: now, paydayPending } = useGameClock();
  const { garageId: mainId } = useGarageContext();
  const { showToast } = useToast();
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;
  const [training, setTraining] = useState<Mechanic | null>(null);
  const [firing, setFiring] = useState<Mechanic | null>(null);

  const garage = garageId ? getGarageById(garageId) : undefined;
  const branch = garageId ? state.branches?.[garageId] : undefined;
  const level = state.player.xp.level;

  const renderOpen = () => {
    if (!garage) return null;
    const info: Br.GarageInfo = { id: garage.id, name: garage.name, slots: garage.slots, rank: getGarageRank(garage.id) };
    const mainRank = getGarageRank(mainId);
    const block = Br.branchOpenBlock(state, info, mainRank);
    const cost = Br.branchOpenCostCents(garage.id);
    const need = Br.branchUnlockLevel(state);
    return (
      <>
        <View style={styles.hero}>
          {BUILDING_ICONS[garage.id] && <GameIcon source={BUILDING_ICONS[garage.id]} size={64} />}
          <Text style={styles.heroText}>
            Старый гараж можно снова открыть как филиал. Управляющий сам берёт простые заказы (ТО, подвеска), ставит на них
            механика и сдаёт готовое. Деньги, репутация, уровень и зарплатный день — общие.
          </Text>
        </View>
        <FinanceSection title="Условия">
          <Requirement ok={level >= need} text={`Уровень ${need} (у вас ${level})`} />
          <Requirement ok={info.rank < mainRank} text="Основной гараж — новее этого" />
          <Requirement
            ok={Br.branchList(state).length + 1 < B.MAX_BUSINESS_OBJECTS}
            text={`Объектов бизнеса: ${Br.branchList(state).length + 1} из ${B.MAX_BUSINESS_OBJECTS}`}
          />
          <Requirement ok={state.balanceCents >= cost} text={`Свободные деньги на открытие: ${formatMoney(cost)}`} />
        </FinanceSection>
        <FinanceSection title="Что дальше">
          <Text style={styles.text}>
            1. Наймите управляющего ({formatMoney(B.MANAGER_BASE_SALARY_CENTS)}/мес) и механика на слот.{'\n'}
            2. Включите автоматизацию и выберите стратегию.{'\n'}
            3. Повысьте механику допуск к классам — без него старшие машины он чинит вдвое медленнее, и филиал зарабатывает мало.
          </Text>
        </FinanceSection>
        {block && <Notice level="info">{block}</Notice>}
      </>
    );
  };

  const renderBranch = (b: Br.BranchState) => {
    const manager = b.managerId ? state.contracts[b.managerId] : undefined;
    const autoBlock = Br.automationBlock(state, b);
    const strat = B.managerStrategy(b.strategy);
    const report = Br.currentBranchReport(state, b, now);
    const freeSlot = b.slots.findIndex((sl, i) => sl.mechanicId && state.contracts[sl.mechanicId] && !b.jobs.some((j) => j.slot === i));
    const slotBlock = Br.addSlotBlock(state, b, garage?.slots ?? 1);
    const nextSlot = b.slots.length + 1;

    return (
      <>
        {/* ─── Автоматизация ─── */}
        <FinanceSection title="Автоматизация">
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{b.automation ? '🟢 Управляющий работает' : '⚪ Выключена'}</Text>
              <Text style={styles.text}>
                {b.automation
                  ? 'Берёт простые заказы, ставит механика, сдаёт готовое. Машины не покупает и не продаёт.'
                  : autoBlock ?? 'Заказы филиала можно брать и сдавать вручную.'}
              </Text>
            </View>
            <SmallButton
              label={b.automation ? 'Выключить' : 'Включить'}
              tone={b.automation ? 'default' : 'primary'}
              disabled={!b.automation && !!autoBlock}
              onPress={() => garageId && economy.setBranchAutomation(garageId, !b.automation)}
            />
          </View>
          <Text style={styles.label}>Стратегия</Text>
          <View style={styles.chips}>
            {B.MANAGER_STRATEGIES.map((d) => (
              <Chip key={d.id} label={d.name} active={b.strategy === d.id} onPress={() => garageId && economy.setBranchStrategy(garageId, d.id)} />
            ))}
          </View>
          <Text style={styles.text}>{strat.description}</Text>
          <Text style={styles.label}>Резерв — ниже него управляющий не тратит</Text>
          <View style={styles.chips}>
            {B.BRANCH_RESERVE_OPTIONS.map((r) => (
              <Chip
                key={r}
                label={r === 0 ? 'Нет' : formatMoney(r * 100)}
                active={b.reserveCents === r * 100}
                onPress={() => garageId && economy.setBranchReserve(garageId, r * 100)}
              />
            ))}
          </View>
        </FinanceSection>

        {/* ─── Слоты ─── */}
        {b.slots.map((sl, i) => {
          const mech = sl.mechanicId ? state.contracts[sl.mechanicId] : undefined;
          const mechName = sl.mechanicId ? b.staffNames[sl.mechanicId] ?? 'Механик' : '';
          const job = b.jobs.find((j) => j.slot === i);
          const order = job ? b.orders.active.find((o) => o.id === job.orderId) : undefined;
          const progress =
            job && job.doneAtMs !== null ? Math.min(1, Math.max(0, (now - job.startAtMs) / Math.max(1, job.doneAtMs - job.startAtMs))) : 0;
          return (
            <FinanceSection key={i} title={`Слот ${i + 1}`}>
              {mech && sl.mechanicId ? (
                <View style={styles.person}>
                  <GameIcon source={getMechanicAvatar(sl.mechanicId)} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{mechName}</Text>
                    <Text style={styles.text}>
                      Механик · ур. {mech.skill.level} · допуск: {clearanceName(mech.clearance)} · {formatMoney(mech.monthlyCents)}/мес
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={styles.text}>Механика нет — работа в слоте стоит.</Text>
              )}
              <View style={styles.buttons}>
                {mech && sl.mechanicId ? (
                  <>
                    <SmallButton label="Навык" onPress={() => setTraining(asWorker(sl.mechanicId!, mechName, mech.skill.level))} />
                    {(mech.clearance ?? 1) < 6 && (
                      <SmallButton
                        label={`🎓 ${clearanceName((mech.clearance ?? 1) + 1)} · ${formatMoney(clearanceUpgradeCostCents(mech))}`}
                        disabled={state.balanceCents < clearanceUpgradeCostCents(mech)}
                        onPress={() => economy.upgradeClearance(sl.mechanicId!)}
                      />
                    )}
                    <SmallButton label="Уволить" tone="danger" onPress={() => setFiring(asWorker(sl.mechanicId!, mechName, mech.skill.level))} />
                  </>
                ) : (
                  <SmallButton
                    label={`Нанять механика · ${formatMoney(salaryForLevel(1, 'mechanic', 1))}/мес`}
                    tone="primary"
                    onPress={() => garageId && economy.hireBranchStaff(garageId, 'mechanic', i)}
                  />
                )}
              </View>
              <View style={ui.divider} />
              {job && order && order.kind === 'service' ? (
                <>
                  <Text style={styles.name}>
                    {order.car.emoji} {serviceDef(order.type).name} · {order.car.name}
                  </Text>
                  <Text style={styles.text}>
                    {TIER_NAMES[order.tier]} · {job.byManager ? 'взял управляющий' : 'взят вручную'} · оплата {formatMoney(order.rewardCents)}
                  </Text>
                  <View style={styles.bar}>
                    <View style={[styles.barFill, { width: `${Math.round((job.finished ? 1 : progress) * 100)}%` }]} />
                  </View>
                  <FinanceRow
                    label={job.finished ? 'Готово' : job.doneAtMs === null ? 'Стоит' : 'До готовности'}
                    value={
                      job.finished
                        ? b.automation
                          ? 'управляющий сдаст'
                          : 'ждёт сдачи'
                        : job.doneAtMs === null
                          ? 'нет механика'
                          : formatGameDays(job.doneAtMs - now)
                    }
                  />
                  <FinanceRow label="До срока" value={order.deadlineAtMs !== undefined ? formatGameDays(order.deadlineAtMs - now) : '—'} />
                  <FinanceRow label="Ожидаемая прибыль" cents={job.expectedProfitCents} signed />
                  <View style={styles.buttons}>
                    {job.finished && (
                      <SmallButton label="Сдать" tone="primary" onPress={() => garageId && economy.deliverBranchJob(garageId, i)} />
                    )}
                    <SmallButton label="Отказаться (−3 реп.)" tone="danger" onPress={() => garageId && economy.cancelBranchJob(garageId, i)} />
                  </View>
                </>
              ) : (
                <Text style={styles.text}>
                  {b.automation && mech ? '🔎 Свободен — управляющий подбирает заказ' : 'Свободен'}
                </Text>
              )}
            </FinanceSection>
          );
        })}
        {garage && b.slots.length < garage.slots && (
          <FinanceSection title={`Слот ${nextSlot}`}>
            <Text style={styles.text}>
              Автоматизация ещё одного слота: {formatMoney(B.branchSlotCost(nextSlot) * 100)}. Нужны {B.BRANCH_NETWORK_LEVEL} уровень игрока и
              управляющий {B.branchSlotManagerLevel(nextSlot)} уровня; каждый слот приводит свой поток клиентов.
            </Text>
            <View style={styles.buttons}>
              <SmallButton
                label={slotBlock ?? `Автоматизировать · ${formatMoney(B.branchSlotCost(nextSlot) * 100)}`}
                tone="primary"
                disabled={!!slotBlock}
                onPress={() => garageId && economy.addBranchSlot(garageId)}
              />
            </View>
          </FinanceSection>
        )}

        {/* ─── Управляющий ─── */}
        <FinanceSection title="Управляющий">
          {manager && b.managerId ? (
            <>
              <View style={styles.person}>
                <GameIcon source={getMechanicAvatar(b.managerId)} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{b.staffNames[b.managerId] ?? 'Управляющий'}</Text>
                  <Text style={styles.text}>
                    Ур. {manager.skill.level} · реакция {formatGameSpan(B.managerDelayDays(manager.skill.level) * DAY_MS)} · ошибки{' '}
                    {formatPercent(B.managerErrorChance(manager.skill.level))} · {formatMoney(manager.monthlyCents)}/мес
                  </Text>
                </View>
              </View>
              <Text style={styles.text}>
                Практика: +{B.MANAGER_ORDER_PRACTICE} за каждый выполненный заказ. Ошибки мягкие: упущенный заказ, неудачный выбор, лишний день.
              </Text>
              <View style={styles.buttons}>
                <SmallButton label="Навык" onPress={() => setTraining(asWorker(b.managerId!, b.staffNames[b.managerId!] ?? '', manager.skill.level))} />
                <SmallButton
                  label="Уволить"
                  tone="danger"
                  onPress={() => setFiring(asWorker(b.managerId!, b.staffNames[b.managerId!] ?? 'Управляющий', manager.skill.level))}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.text}>
                Без управляющего автоматизация не работает. Реакция на 1 уровне — 1 день, ошибки 15%; к 20 уровню — 0,1 дня и 2%.
              </Text>
              <View style={styles.buttons}>
                <SmallButton
                  label={`Нанять управляющего · ${formatMoney(B.MANAGER_BASE_SALARY_CENTS)}/мес`}
                  tone="primary"
                  onPress={() => garageId && economy.hireBranchStaff(garageId, 'manager')}
                />
              </View>
            </>
          )}
        </FinanceSection>

        {/* ─── Доска заказов филиала ─── */}
        <FinanceSection title="Заказы филиала">
          {b.orders.board.length === 0 && <Text style={styles.text}>Новых заказов пока нет — проверка каждый игровой день.</Text>}
          {b.orders.board.map((o) => {
            if (o.kind !== 'service') return null;
            const est = Br.estimateOrder(state, b, o, freeSlot >= 0 ? b.slots[freeSlot].mechanicId : b.slots[0]?.mechanicId ?? null, level);
            return (
              <View key={o.id} style={styles.order}>
                <Text style={styles.name}>
                  {o.premium ? '💎 ' : ''}
                  {serviceDef(o.type).name} · {TIER_NAMES[o.tier]} · {o.car.name}
                </Text>
                <Text style={styles.text}>
                  Оплата {formatMoney(o.rewardCents)}, детали {formatMoney(o.partsCents)} · срок {o.deadlineDays} дн. · работы ≈
                  {Number.isFinite(est.workDays) ? ` ${formatGameSpan(est.workDays * DAY_MS)}` : ' —'}
                </Text>
                <Text style={[styles.text, { color: est.reject ? '#F59E0B' : '#22C55E' }]}>
                  {est.reject ? `Управляющий не возьмёт: ${est.reject}` : `Подходит · ожидаемо ${formatMoney(est.profitCents, { sign: true })}`}
                </Text>
                <View style={styles.buttons}>
                  <SmallButton
                    label={freeSlot >= 0 ? `Взять в слот ${freeSlot + 1}` : 'Нет свободного слота'}
                    disabled={freeSlot < 0 || state.balanceCents < o.partsCents}
                    onPress={() => garageId && economy.acceptBranchOrder(garageId, o.id, freeSlot)}
                  />
                </View>
              </View>
            );
          })}
        </FinanceSection>

        {/* ─── Отчёт месяца ─── */}
        <FinanceSection title="Этот месяц">
          <FinanceRow label="Оплата заказов" cents={report.revenueCents} />
          <FinanceRow label="Детали и материалы" cents={-report.partsCents} />
          <FinanceRow label="Оклады (начислено)" cents={-report.salaryCents} />
          <FinanceRow label="Чистыми" cents={report.netCents} signed bold />
          <View style={ui.divider} />
          <FinanceRow label="Загрузка слотов" value={formatPercent(report.loadPct)} />
          <FinanceRow label="Простой" value={formatGameSpan(report.idleMs)} />
          <FinanceRow label="Выполнено / с опозданием" value={`${report.completed} / ${report.late}`} />
          <FinanceRow label="Провалено / отказов" value={`${report.failed} / ${report.cancelled}`} />
          <FinanceRow label="Ошибок управляющего" value={String(report.managerErrors)} />
          <FinanceRow label="Ожидалось → факт" value={`${formatMoney(report.expectedProfitCents)} → ${formatMoney(report.actualProfitCents)}`} />
          <Text style={styles.hint}>Ожидание — оценка управляющего при принятии, факт — после сдачи (оплата − детали − оклад механика за дни работы).</Text>
        </FinanceSection>

        {/* ─── Журнал ─── */}
        <FinanceSection title="Журнал">
          {b.log.slice(0, 8).map((e, i) => (
            <Text key={i} style={[styles.text, e.kind === 'warn' && { color: '#F59E0B' }, e.kind === 'ok' && { color: '#22C55E' }]}>
              {e.text}
            </Text>
          ))}
        </FinanceSection>
      </>
    );
  };

  const handleOpen = () => {
    if (!garageId || !garage) return;
    if (!economy.openBranch(garageId, mainId)) return;
    showToast({ title: `Филиал «${garage.name}» открыт`, message: 'Наймите управляющего и механика.', icon: ICONS.money, tone: 'success' });
  };

  const openBlock =
    garage && !branch
      ? Br.branchOpenBlock(state, { id: garage.id, name: garage.name, slots: garage.slots, rank: getGarageRank(garage.id) }, getGarageRank(mainId))
      : null;

  return (
    // В зарплатный день окно прячется: отчёт месяца — поверх всей игры
    <SheetModal visible={!!garageId && !paydayPending && !state.bankruptcy} onRequestClose={onClose}>
      <View style={[garageStyles.modalContent, { paddingBottom: insets.bottom + 12, maxHeight: '92%' }]}>
        <SheetHeader title={branch ? `Филиал «${garage?.name ?? ''}»` : garage?.name ?? 'Гараж'} onClose={onClose} flush />
        <SheetScroll>{branch ? renderBranch(branch) : renderOpen()}</SheetScroll>
        <SheetFooter>
          <TouchableOpacity style={[garageStyles.modalButton, garageStyles.cancelButton]} onPress={onClose}>
            <Text style={garageStyles.modalButtonText}>Закрыть</Text>
          </TouchableOpacity>
          {!branch && garage && (
            <TouchableOpacity
              style={[garageStyles.modalButton, garageStyles.confirmButton, !!openBlock && styles.disabled]}
              disabled={!!openBlock}
              onPress={handleOpen}
            >
              <Text style={garageStyles.modalButtonText}>Открыть · {formatMoney(Br.branchOpenCostCents(garage.id))}</Text>
            </TouchableOpacity>
          )}
        </SheetFooter>
        <WorkerTrainingModal mechanic={training} onClose={() => setTraining(null)} />
        <FireMechanicModal
          mechanic={firing}
          onCancel={() => setFiring(null)}
          onConfirm={(id) => {
            if (garageId) economy.fireBranchStaff(garageId, id);
            setFiring(null);
          }}
        />
      </View>
    </SheetModal>
  );
};

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 10 },
  heroText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  req: { fontSize: 14, fontWeight: '600', paddingVertical: 3 },
  text: { fontSize: 12, color: colors.textTertiary, lineHeight: 17 },
  hint: { fontSize: 11, color: colors.textTertiary, marginTop: 6, lineHeight: 15 },
  label: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 10, marginBottom: 6 },
  name: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingVertical: 6, paddingHorizontal: 10 },
  chipActive: { borderColor: colors.primary, backgroundColor: 'rgba(99, 102, 241, 0.25)' },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.textTertiary },
  chipTextActive: { color: colors.textPrimary },
  person: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 6 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  small: { borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingVertical: 7, paddingHorizontal: 10 },
  smallPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  smallDanger: { backgroundColor: '#B91C1C', borderColor: '#B91C1C' },
  smallText: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  disabled: { opacity: 0.45 },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden', marginVertical: 6 },
  barFill: { height: 6, backgroundColor: '#22C55E' },
  order: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 8 },
});
