import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Modal, Platform } from 'react-native';
import { SheetModal } from '@components/SheetModal';
import { TouchableOpacity } from '@components/Touchable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { garageStyles } from '@styles/styles';
import { colors } from '@styles/colors';
import { useGarageContext } from '@hooks/GarageContext';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { CarImage } from '@components/CarImage';
import type { Car } from '@/types';

interface SlotPickerModalProps {
  /** Машина, которую покупаем; null — модалка закрыта */
  car: Car | null;
  onCancel: () => void;
  /** Игрок выбрал свободный слот и подтвердил покупку */
  onConfirm: (car: Car, slotIndex: number) => void;
}

/** Выбор места в гараже при покупке машины (авторынок, автосалон) */
export const SlotPickerModal = ({ car, onCancel, onConfirm }: SlotPickerModalProps) => {
  const { garage, garageSlots } = useGarageContext();
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;

  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  // Каждое открытие начинаем без выбранного слота
  useEffect(() => {
    setSelectedSlot(null);
  }, [car?.id]);

  const hasFreeSlot = Array.from({ length: garageSlots }).some(
    (_, slotIndex) => !garage.some((c) => c.slotIndex === slotIndex),
  );

  return (
    <SheetModal visible={car !== null} onRequestClose={onCancel}>
        <View
          style={{
            backgroundColor: colors.cardBg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 14,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + 14,
          }}
        >
          <Text
            style={{
              fontSize: 24,
              fontWeight: '700',
              color: colors.textPrimary,
              marginBottom: 14,
              textAlign: 'center',
            }}
          >
            Покупка автомобиля
          </Text>

          {car && (
            <View style={{ marginBottom: 16, paddingBottom: 8 }}>
              <Text style={{ fontSize: 14, color: colors.textTertiary, marginBottom: 4, fontWeight: '500' }}>
                Покупаете:
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <CarImage car={car} size={44} />
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textPrimary }}>{car.name}</Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary, marginTop: 4 }}>
                ${car.price.toLocaleString('ru-RU')}
              </Text>
            </View>
          )}

          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, color: colors.textTertiary, marginBottom: 10, fontWeight: '500' }}>
              ВЫБЕРИТЕ СЛОТ
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {Array.from({ length: garageSlots }).map((_, slotIndex) => {
                const carInSlot = garage.find((c) => c.slotIndex === slotIndex);
                const isSelected = selectedSlot === slotIndex;

                return (
                  <TouchableOpacity
                    key={slotIndex}
                    disabled={!!carInSlot}
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 10,
                      backgroundColor: isSelected
                        ? colors.primary
                        : carInSlot
                          ? 'rgba(251, 191, 36, 0.15)'
                          : 'rgba(99, 102, 241, 0.08)',
                      borderWidth: 2,
                      borderColor: isSelected
                        ? colors.primary
                        : carInSlot
                          ? '#FBBF24'
                          : 'rgba(99, 102, 241, 0.2)',
                      justifyContent: 'center',
                      alignItems: 'center',
                      opacity: carInSlot ? 0.6 : 1,
                    }}
                    onPress={() => !carInSlot && setSelectedSlot(slotIndex)}
                  >
                    <Text
                      style={{
                        color: isSelected ? '#FFF' : colors.textPrimary,
                        fontSize: 20,
                        fontWeight: '700',
                      }}
                    >
                      {slotIndex + 1}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {!hasFreeSlot && (
              <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '600', marginTop: 10 }}>
                Все места в гараже заняты. Продайте машину или купите гараж побольше.
              </Text>
            )}
          </View>

          <View style={garageStyles.modalButtonsContainer}>
            <TouchableOpacity style={[garageStyles.modalButton, garageStyles.cancelButton]} onPress={onCancel}>
              <Text style={garageStyles.modalButtonText}>Отмена</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                garageStyles.modalButton,
                garageStyles.confirmButton,
                selectedSlot === null && { opacity: 0.5 },
              ]}
              onPress={() => car && selectedSlot !== null && onConfirm(car, selectedSlot)}
              disabled={selectedSlot === null}
            >
              <Text style={[garageStyles.modalButtonText, { color: '#FFF' }]}>Купить</Text>
            </TouchableOpacity>
          </View>
        </View>
    </SheetModal>
  );
};
