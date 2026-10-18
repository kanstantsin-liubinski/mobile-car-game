import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { garageStyles } from '@styles/styles';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { SkillCard } from '@components/SkillCard';
import { useToast } from '@components/toast/ToastContext';
import { getMechanicAvatar } from '@img/gameIcons';
import { salaryForLevel, workerPracticeAt } from '../economy/economy';
import { SKILL_MAX_LEVEL, skillMultiplier } from '../economy/progression';
import { formatMoney } from '../economy/format';
import type { Mechanic } from '@/types';

/** Базовая скорость ремонта механика, % состояния в секунду (как в useGarage) */
const BASE_SPEED = 0.05;

const speedText = (level: number) =>
  `${(BASE_SPEED * skillMultiplier(level)).toLocaleString('ru-RU', { maximumFractionDigits: 4 })}% / сек`;

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
  const offer = mechanic && contract ? workerCourseOffer(mechanic.id) : null;

  const handleBuy = () => {
    if (!mechanic || !contract || !offer) return;
    const { granted, levelsUp } = offer.preview;
    if (!buyWorkerCourse(mechanic.id)) return;
    showToast({
      title: `${mechanic.name} прошёл курс`,
      message: levelsUp
        ? `Навык повышен до уровня ${contract.skill.level + 1}: ремонт быстрее, оклад ${formatMoney(salaryForLevel(contract.skill.level + 1))}/мес`
        : `+${granted.toLocaleString('ru-RU')} практики`,
      icon: getMechanicAvatar(mechanic.id),
      tone: 'success',
    });
  };

  const level = contract?.skill.level ?? 1;
  const isMax = level >= SKILL_MAX_LEVEL;

  return (
    <Modal visible={!!mechanic && !!contract} transparent animationType="fade" onRequestClose={onClose}>
      <View style={garageStyles.modalOverlay}>
        <View style={[garageStyles.modalContent, { paddingBottom: insets.bottom + 12, maxHeight: '90%' }]}>
          <Text style={garageStyles.modalTitle}>Навык механика</Text>
          {mechanic && contract && (
            <ScrollView style={{ flexGrow: 0 }}>
              <SkillCard
                title={mechanic.name}
                icon={getMechanicAvatar(mechanic.id)}
                skill={contract.skill}
                practice={workerPracticeAt(contract, gameTimeMs)}
                bonusLabel="Скорость ремонта"
                offer={offer}
                onBuyCourse={handleBuy}
                extraRows={[
                  { label: 'Ремонтирует сейчас', value: speedText(level) },
                  ...(isMax ? [] : [{ label: 'После повышения', value: speedText(level + 1) }]),
                  { label: 'Оклад сейчас', value: `${formatMoney(contract.monthlyCents)}/мес` },
                  ...(isMax ? [] : [{ label: 'Оклад после повышения', value: `${formatMoney(salaryForLevel(level + 1))}/мес` }]),
                ]}
              />
              <Text style={{ color: '#94A3B8', fontSize: 12, marginBottom: 8 }}>
                Практика копится только во время ремонта: 2 единицы за секунду работы. Оклад — около 40% того,
                что механик приносит при полной загрузке, и растёт вместе со скоростью.
              </Text>
            </ScrollView>
          )}
          <TouchableOpacity style={[garageStyles.modalButton, garageStyles.cancelButton]} onPress={onClose}>
            <Text style={garageStyles.modalButtonText}>Закрыть</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};
