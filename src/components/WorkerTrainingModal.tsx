import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { InnerOverlay } from '@components/InnerOverlay';
import { SheetHeader } from '@components/SheetHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { garageStyles } from '@styles/styles';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { SkillCard } from '@components/SkillCard';
import { useToast } from '@components/toast/ToastContext';
import { getMechanicAvatar } from '@img/gameIcons';
import { salaryForLevel, workerPracticeAt } from '../economy/economy';
import { SKILL_MAX_LEVEL, skillMultiplier } from '../economy/progression';
import { PAINTER_SPEED_PER_SEC } from '../economy/balance';
import { formatMoney } from '../economy/format';
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

/** Навык нанятого механика: практика от реальных ремонтов, скорость, оклад и курс обучения */
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
          <SheetHeader title={painter ? 'Навык маляра' : 'Навык механика'} onClose={onClose} />
          {mechanic && contract && (
            <ScrollView style={{ flexShrink: 1 }}>
              <SkillCard
                title={mechanic.name}
                icon={getMechanicAvatar(mechanic.id)}
                skill={contract.skill}
                practice={workerPracticeAt(contract, gameTimeMs)}
                bonusLabel={painter ? 'Скорость покраски' : 'Скорость ремонта'}
                offer={offer}
                onBuyCourse={handleBuy}
                extraRows={[
                  { label: painter ? 'Красит сейчас' : 'Ремонтирует сейчас', value: speedText(level, painter) },
                  ...(isMax ? [] : [{ label: 'После повышения', value: speedText(level + 1, painter) }]),
                  { label: 'Оклад сейчас', value: `${formatMoney(contract.monthlyCents)}/мес` },
                  ...(isMax ? [] : [{ label: 'Оклад после повышения', value: `${formatMoney(salaryForLevel(level + 1, profession))}/мес` }]),
                ]}
              />
              <Text style={{ color: '#94A3B8', fontSize: 12, marginBottom: 8 }}>
                Практика копится только во время {painter ? 'покраски' : 'ремонта'}: 20 единиц за игровой день работы. Оклад — около
                40% того, что сотрудник приносит при полной загрузке, и растёт вместе со скоростью.
              </Text>
            </ScrollView>
          )}
          <TouchableOpacity style={[garageStyles.modalButton, garageStyles.cancelButton, { flex: 0 }]} onPress={onClose}>
            <Text style={garageStyles.modalButtonText}>Закрыть</Text>
          </TouchableOpacity>
        </View>
      </View>
    </InnerOverlay>
  );
};
