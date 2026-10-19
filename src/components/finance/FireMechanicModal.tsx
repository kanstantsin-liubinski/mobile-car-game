import React from 'react';
import { Modal, View, Text, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { garageStyles } from '@styles/styles';
import { colors } from '@styles/colors';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { GameIcon } from '@components/GameIcon';
import { getMechanicAvatar } from '@img/gameIcons';
import { FinanceRow, Notice, ui } from './FinanceUI';
import { formatMoney } from '../../economy/format';
import type { Mechanic } from '@/types';

interface FireMechanicModalProps {
  mechanic: Mechanic | null;
  onCancel: () => void;
  onConfirm: (mechanicId: string) => void;
}

/** Подтверждение увольнения с полным расчётом: долг по зарплате + оклад компенсации */
export const FireMechanicModal = ({ mechanic, onCancel, onConfirm }: FireMechanicModalProps) => {
  const { previewFire } = useEconomy();
  useGameClock(); // начисление растёт со временем — пересчитываем при каждом тике
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;

  const preview = mechanic ? previewFire(mechanic.id) : null;

  return (
    <Modal visible={!!mechanic && !!preview} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={garageStyles.modalOverlay}>
        <View style={[garageStyles.modalContent, { paddingBottom: insets.bottom + 14 }]}>
          {mechanic && preview && (
            <>
              <View style={{ alignItems: 'center', marginBottom: 8 }}>
                <GameIcon source={getMechanicAvatar(mechanic.id)} size={72} />
              </View>
              <Text style={garageStyles.modalTitle}>
                {mechanic.profession === 'painter' ? 'Увольнение маляра' : 'Увольнение механика'}
              </Text>
              <Text style={{ color: colors.textTertiary, textAlign: 'center', marginTop: -8, marginBottom: 12 }}>
                {mechanic.name} · уровень {mechanic.skillLevel}
              </Text>

              <View style={ui.section}>
                <FinanceRow label="Начисленная зарплата" cents={preview.accruedCents} />
                <FinanceRow label="Компенсация (оклад за месяц)" cents={preview.compensationCents} />
                <View style={ui.divider} />
                <FinanceRow label="Итого к выплате" cents={preview.totalCents} bold />
              </View>

              {preview.loanCents > 0 && (
                <Notice level="danger">
                  На счету не хватает {formatMoney(preview.loanCents)} — эта сумма будет добавлена в кредит.
                </Notice>
              )}
              <Notice level="warning">
                Прокачка будет потеряна: при повторном найме {mechanic.name} начнёт с 1 уровня
                {mechanic.skillLevel > 1 ? ` (сейчас ${mechanic.skillLevel})` : ''}.
              </Notice>

              <View style={garageStyles.modalButtonsContainer}>
                <TouchableOpacity style={[garageStyles.modalButton, garageStyles.cancelButton]} onPress={onCancel}>
                  <Text style={garageStyles.modalButtonText}>Отмена</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[garageStyles.modalButton, ui.dangerButton, { borderColor: 'transparent' }]}
                  onPress={() => onConfirm(mechanic.id)}
                >
                  <Text style={[garageStyles.modalButtonText, { color: '#FFF' }]}>
                    Уволить за {formatMoney(preview.totalCents)}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};
