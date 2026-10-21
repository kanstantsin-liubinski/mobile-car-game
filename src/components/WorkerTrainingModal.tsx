import React from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';
import { TouchableOpacity } from '@components/Touchable';
import { InnerOverlay } from '@components/InnerOverlay';
import { SheetFooter, SheetHeader, SheetScroll } from '@components/SheetHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { garageStyles } from '@styles/styles';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { SkillCard } from '@components/SkillCard';
import { useToast } from '@components/toast/ToastContext';
import { getMechanicAvatar } from '@img/gameIcons';
import { DAY_MS, salaryForLevel, workerCurve, workerPracticeAt } from '../economy/economy';
import { SKILL_MAX_LEVEL, skillMultiplier } from '../economy/progression';
import { MANAGER_ORDER_PRACTICE, PAINTER_SPEED_PER_SEC, managerDelayDays, managerErrorChance } from '../economy/balance';
import { formatGameSpan, formatMoney, formatPercent } from '../economy/format';
import type { Mechanic } from '@/types';

/** Базовая скорость ремонта механика, % состояния в секунду (как в useGarage) */
const BASE_SPEED = 0.05;

/** Скорость в игровой день (10 секунд) */
const speedText = (level: number, painter: boolean) =>
  `${((painter ? PAINTER_SPEED_PER_SEC : BASE_SPEED) * skillMultiplier(level) * 10).toLocaleString('ru-RU', { maximumFractionDigits: 3 })}${
    painter ? ' п. ЛКП' : '%'
  } в день`;

interface WorkerTrainingModalProps {
  mechanic: Pick<Mechanic, 'id' | 'name'> | null;
  onClose: () => void;
}

/** Реакция и ошибки управляющего на уровне */
const managerText = (level: number) =>
  `реакция ${formatGameSpan(managerDelayDays(level) * DAY_MS)}, ошибки ${formatPercent(managerErrorChance(level))}`;

/** Навык нанятого сотрудника: практика от реальной работы, скорость (у управляющего — реакция), оклад и курс */
export const WorkerTrainingModal = ({ mechanic, onClose }: WorkerTrainingModalProps) => {
  const { state, workerCourseOffer, buyWorkerCourse } = useEconomy();
  const { gameTimeMs } = useGameClock();
  const { showToast } = useToast();
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;

  const contract = mechanic ? state.contracts[mechanic.id] : undefined;
  // Модалка общая для механиков и маляров: навык, курсы и оклад — по профессии контракта
  const painter = contract?.profession === 'painter';
  const manager = contract?.profession === 'manager';
  const profession = contract?.profession ?? 'mechanic';
  const offer = mechanic && contract ? workerCourseOffer(mechanic.id) : null;

  const handleBuy = () => {
    if (!mechanic || !contract || !offer) return;
    const { granted, levelsUp } = offer.preview;
    if (!buyWorkerCourse(mechanic.id)) return;
    showToast({
      title: `${mechanic.name} прошёл курс`,
      message: levelsUp
        ? `Навык повышен до уровня ${contract.skill.level + 1}: работа быстрее, оклад ${formatMoney(salaryForLevel(contract.skill.level + 1, profession))}/мес`
        : `+${granted.toLocaleString('ru-RU')} практики`,
      icon: getMechanicAvatar(mechanic.id),
      tone: 'success',
    });
  };

  const level = contract?.skill.level ?? 1;
  const isMax = level >= SKILL_MAX_LEVEL;

  return (
    <InnerOverlay visible={!!mechanic && !!contract}>
      <View style={garageStyles.modalOverlay}>
        <View style={[garageStyles.modalContent, { paddingBottom: insets.bottom + 12, maxHeight: '90%' }]}>
          <SheetHeader title={manager ? 'Навык управляющего' : painter ? 'Навык маляра' : 'Навык механика'} onClose={onClose} flush />
          {mechanic && contract && (
            <SheetScroll>
              <SkillCard
                title={mechanic.name}
                icon={getMechanicAvatar(mechanic.id)}
                skill={contract.skill}
                practice={workerPracticeAt(contract, gameTimeMs)}
                bonusLabel={manager ? 'Реакция' : painter ? 'Скорость покраски' : 'Скорость ремонта'}
                bonusValue={manager ? (l) => formatGameSpan(managerDelayDays(l) * DAY_MS) : undefined}
                curve={workerCurve(contract)}
                offer={offer}
                onBuyCourse={handleBuy}
                extraRows={[
                  manager
                    ? { label: 'Сейчас', value: managerText(level) }
                    : { label: painter ? 'Красит сейчас' : 'Ремонтирует сейчас', value: speedText(level, painter) },
                  ...(isMax ? [] : [{ label: 'После повышения', value: manager ? managerText(level + 1) : speedText(level + 1, painter) }]),
                  { label: 'Оклад сейчас', value: `${formatMoney(contract.monthlyCents)}/мес` },
                  ...(isMax ? [] : [{ label: 'Оклад после повышения', value: `${formatMoney(salaryForLevel(level + 1, profession))}/мес` }]),
                ]}
              />
              <Text style={{ color: '#94A3B8', fontSize: 12, marginBottom: 8 }}>
                {manager
                  ? `Практика: +${MANAGER_ORDER_PRACTICE} за каждый выполненный заказ филиала. Курс даёт до половины порога, раз в 3 месяца. Оклад +3% за уровень.`
                  : `Практика копится только во время ${painter ? 'покраски' : 'ремонта'}: 20 единиц за игровой день работы. Оклад — около 37,5% того, что сотрудник приносит при полной загрузке на машинах своего допуска, и растёт вместе со скоростью.`}
              </Text>
            </SheetScroll>
          )}
          <SheetFooter>
            <TouchableOpacity style={[garageStyles.modalButton, garageStyles.cancelButton]} onPress={onClose}>
              <Text style={garageStyles.modalButtonText}>Закрыть</Text>
            </TouchableOpacity>
          </SheetFooter>
        </View>
      </View>
    </InnerOverlay>
  );
};
