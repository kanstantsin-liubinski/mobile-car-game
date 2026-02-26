import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Platform } from 'react-native';
import { marketStyles, garageStyles } from '@styles/styles';
import { useBalanceContext } from '@hooks/BalanceContext';
import { useGarageContext } from '@hooks/GarageContext';
import { useSoldCarsContext } from '@hooks/SoldCarsContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { colors } from '@styles/colors';
import { calculateMaxCondition } from '../utils/priceCalculator';
import type { Car } from '@/types';

const AVAILABLE_CARS: Car[] = [
  {
    id: 'car-1',
    name: 'VW Golf 2000',
    price: 5000,
    emoji: '🚗',
    speed: 180,
    description: 'Надежная немецкая компактная машина',
    year: 2000,
    mileage: 180000,
    condition: 35.0,
  },
  {
    id: 'car-2',
    name: 'Honda Civic',
    price: 8000,
    emoji: '🚙',
    speed: 195,
    description: 'Японская спортивная компактная',
    year: 2005,
    mileage: 140000,
    condition: 45.0,
  },
  {
    id: 'car-3',
    name: 'Toyota Corolla',
    price: 10000,
    emoji: '🚗',
    speed: 190,
    description: 'Самая надежная машина в мире',
    year: 2010,
    mileage: 95000,
    condition: 60.0,
  },
  {
    id: 'car-4',
    name: 'Ford Mustang',
    price: 18000,
    emoji: '🏎️',
    speed: 240,
    description: 'Легендарный американский спортсмен',
    year: 2015,
    mileage: 65000,
    condition: 72.0,
  },
  {
    id: 'car-5',
    name: 'BMW 330i',
    price: 25000,
    emoji: '🚘',
    speed: 250,
    description: 'Немецкий премиум с отличным дизайном',
    year: 2018,
    mileage: 32000,
    condition: 85.0,
  },
  {
    id: 'car-6',
    name: 'Porsche 911',
    price: 40000,
    emoji: '🏎️',
    speed: 300,
    description: 'Икона спортивного автомобилестроения',
    year: 2019,
    mileage: 18000,
    condition: 92.0,
  },
  {
    id: 'car-7',
    name: 'Ferrari F430',
    price: 60000,
    emoji: '🏁',
    speed: 330,
    description: 'Красная машина мечты каждого',
    year: 2020,
    mileage: 8000,
    condition: 96.0,
  },
  {
    id: 'car-8',
    name: 'Bugatti Veyron',
    price: 100000,
    emoji: '⚡',
    speed: 407,
    description: 'Самая быстрая серийная машина в мире',
    year: 2023,
    mileage: 500,
    condition: 99.0,
  },
];

export const MarketScreen = () => {
  const { balance, removeBalance } = useBalanceContext();
  const { addCar, hasCar, garage, garageSlots } = useGarageContext();
  const { isSold } = useSoldCarsContext();
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;

  const [showSlotModal, setShowSlotModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [carToBuy, setCarToBuy] = useState<Car | null>(null);

  const getConditionColor = (condition: number) => {
    if (condition >= 80) return colors.primary;
    if (condition >= 50) return '#F59E0B';
    if (condition >= 20) return '#EF4444';
    return '#991B1B';
  };

  const handleBuyCar = (car: Car) => {
    if (removeBalance(car.price)) {
      setCarToBuy(car);
      setSelectedSlot(null);
      setShowSlotModal(true);
    }
  };

  const confirmPurchase = () => {
    if (carToBuy && selectedSlot !== null) {
      addCar(carToBuy, selectedSlot);
      setShowSlotModal(false);
      setCarToBuy(null);
      setSelectedSlot(null);
    }
  };

  return (
    <ScrollView style={marketStyles.container}>
      <Text style={marketStyles.title}>Авторынок</Text>

      <View style={marketStyles.carsList}>
        {AVAILABLE_CARS.map((car) => {
          const owned = hasCar(car.id);
          const sold = isSold(car.id);
          
          // Если машина уже куплена или продана, не показываем её на авторынке
          if (owned) {
            return null;
          }

          if (sold) {
            return null;
          }
          
          const canAfford = balance >= car.price;
          const maxCondition = calculateMaxCondition(car.year, car.mileage);

          return (
            <View key={car.id} style={marketStyles.carCard}>
              <View style={marketStyles.carHeader}>
                <Text style={marketStyles.carEmoji}>{car.emoji}</Text>
                <View style={marketStyles.carInfo}>
                  <Text style={marketStyles.carName}>{car.name}</Text>
                  <Text style={marketStyles.carSpeed}>⚡ {car.speed} км/ч</Text>
                  <Text style={marketStyles.carMeta}>📅 {car.year} • 📏 {car.mileage.toLocaleString()} км</Text>
                </View>
                <Text style={marketStyles.carPrice}>${car.price.toLocaleString()}</Text>
              </View>

              <View style={marketStyles.conditionContainer}>
                <View style={marketStyles.conditionBar}>
                  {/* Текущее состояние */}
                  <View
                    style={[
                      marketStyles.conditionFill,
                      {
                        width: `${car.condition}%`,
                        backgroundColor: getConditionColor(car.condition),
                        position: 'absolute',
                        left: 0,
                      },
                    ]}
                  />
                  {/* Максимально возможное состояние */}
                  <View
                    style={[
                      marketStyles.conditionMaxFill,
                      {
                        width: `${maxCondition}%`,
                        backgroundColor: colors.border,
                        position: 'absolute',
                        left: 0,
                      },
                    ]}
                  />
                  {/* Недостижимая часть */}
                  <View
                    style={[
                      marketStyles.conditionUnachievableFill,
                      {
                        width: `${100 - maxCondition}%`,
                        backgroundColor: '#27272A',
                        position: 'absolute',
                        right: 0,
                      },
                    ]}
                  />
                </View>
                <View style={marketStyles.conditionLabelContainer}>
                  <Text style={[marketStyles.conditionText, { color: getConditionColor(car.condition) }]}>
                    {car.condition.toFixed(0)}% состояние
                  </Text>
                  <Text style={marketStyles.maxConditionText}>макс {maxCondition.toFixed(1)}%</Text>
                </View>
              </View>

              <Text style={marketStyles.carDescription}>{car.description}</Text>

              <TouchableOpacity
                style={[marketStyles.buyButton, !canAfford && marketStyles.buyButtonDisabled]}
                onPress={() => handleBuyCar(car)}
                disabled={!canAfford}
              >
                <Text style={[marketStyles.buyButtonText, !canAfford && { color: colors.textTertiary }]}>
                  Купить
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {/* Slot Selection Modal */}
      <Modal
        visible={showSlotModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSlotModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            justifyContent: 'flex-end',
          }}
        >
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

            {carToBuy && (
              <View
                style={{
                  marginBottom: 16,
                  paddingBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: colors.textTertiary,
                    marginBottom: 4,
                    fontWeight: '500',
                  }}
                >
                  Покупаете:
                </Text>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '700',
                    color: colors.textPrimary,
                  }}
                >
                  {carToBuy.emoji} {carToBuy.name}
                </Text>
              </View>
            )}

            <View
              style={{
                marginBottom: 16,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  color: colors.textTertiary,
                  marginBottom: 10,
                  fontWeight: '500',
                }}
              >
                ВЫБЕРИТЕ СЛОТ
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  gap: 8,
                }}
              >
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
            </View>

            <View style={garageStyles.modalButtonsContainer}>
              <TouchableOpacity
                style={[garageStyles.modalButton, garageStyles.cancelButton]}
                onPress={() => setShowSlotModal(false)}
              >
                <Text style={garageStyles.modalButtonText}>
                  Отмена
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  garageStyles.modalButton,
                  garageStyles.confirmButton,
                  selectedSlot === null && { opacity: 0.5 },
                ]}
                onPress={confirmPurchase}
                disabled={selectedSlot === null}
              >
                <Text style={[garageStyles.modalButtonText, { color: '#FFF' }]}>
                  Купить
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};
