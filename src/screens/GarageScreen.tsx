import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { garageStyles } from '@styles/styles';
import { useGarageContext } from '@hooks/GarageContext';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { colors } from '@styles/colors';
import { calculateCarPrice } from '../utils/priceCalculator';

interface GarageScreenProps {
  onSellCar?: (carId: string, sellPrice: number) => void;
}

export const GarageScreen: React.FC<GarageScreenProps> = ({ onSellCar }) => {
  const { garage, repairCar, sellCar } = useGarageContext();
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;
  const [selectedCarForSale, setSelectedCarForSale] = useState<{
    id: string;
    name: string;
    boughtPrice: number;
    sellPrice: number;
    profit: number;
    profitPercent: number;
  } | null>(null);

  const getConditionColor = (condition: number) => {
    if (condition >= 80) return colors.primary;
    if (condition >= 50) return '#F59E0B';
    if (condition >= 20) return '#EF4444';
    return '#991B1B';
  };

  const handleSellCar = (carId: string) => {
    const car = garage.find((c) => c.id === carId);
    if (!car) return;

    const sellPrice = calculateCarPrice(car.basePrice, {
      year: car.year,
      mileage: car.mileage,
      condition: car.condition,
    });

    const profit = sellPrice - car.price;
    const profitPercent = ((profit / car.price) * 100).toFixed(1);

    setSelectedCarForSale({
      id: carId,
      name: car.name,
      boughtPrice: car.price,
      sellPrice,
      profit,
      profitPercent: parseFloat(profitPercent),
    });
  };

  const confirmSell = () => {
    if (!selectedCarForSale) return;
    sellCar(selectedCarForSale.id, selectedCarForSale.sellPrice);
    onSellCar?.(selectedCarForSale.id, selectedCarForSale.sellPrice);
    setSelectedCarForSale(null);
  };

  return (
    <ScrollView style={garageStyles.container}>
      <Text style={garageStyles.title}>Мой гараж</Text>

      {garage.length === 0 ? (
        <Text style={garageStyles.emptyText}>Ещё нет машин. Купи её на авторынке!</Text>
      ) : (
        <View style={garageStyles.carsList}>
          {garage.map((car) => {
            const currentPrice = calculateCarPrice(car.basePrice, {
              year: car.year,
              mileage: car.mileage,
              condition: car.condition,
            });
            const priceChange = currentPrice - car.price;
            const priceChangePercent = ((currentPrice / car.price - 1) * 100).toFixed(1);

            return (
              <TouchableOpacity
                key={car.id}
                onPress={() => repairCar(car.id)}
                activeOpacity={0.7}
              >
                <View style={garageStyles.carCard}>
                  <View style={garageStyles.carHeader}>
                    <Text style={garageStyles.carEmoji}>{car.emoji}</Text>
                    <View style={garageStyles.carInfo}>
                      <Text style={garageStyles.carName}>{car.name}</Text>
                      <Text style={garageStyles.carSpeed}>⚡ {car.speed} км/ч</Text>
                      <Text style={garageStyles.carMeta}>
                        📅 {car.year} • 📏 {car.mileage.toLocaleString()} км
                      </Text>
                    </View>
                  </View>

                  <View style={garageStyles.conditionContainer}>
                    <View style={garageStyles.conditionBar}>
                      {/* Текущее состояние */}
                      <View
                        style={[
                          garageStyles.conditionFill,
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
                          garageStyles.conditionMaxFill,
                          {
                            width: `${car.maxCondition}%`,
                            backgroundColor: colors.border,
                            position: 'absolute',
                            left: 0,
                          },
                        ]}
                      />
                      {/* Недостижимая часть (разница между 100% и максимумом) */}
                      <View
                        style={[
                          garageStyles.conditionUnachievableFill,
                          {
                            width: `${100 - car.maxCondition}%`,
                            backgroundColor: '#27272A',
                            position: 'absolute',
                            right: 0,
                          },
                        ]}
                      />
                    </View>
                    <View style={garageStyles.conditionLabelContainer}>
                      <Text
                        style={[
                          garageStyles.conditionText,
                          { color: getConditionColor(car.condition) },
                        ]}
                      >
                        {car.condition.toFixed(1)}%
                      </Text>
                      <Text style={garageStyles.maxConditionText}>
                        макс {car.maxCondition.toFixed(1)}%
                      </Text>
                    </View>
                  </View>

                  <View style={garageStyles.priceContainer}>
                    <Text style={garageStyles.priceLabel}>Текущая цена:</Text>
                    <Text style={garageStyles.currentPrice}>
                      ${currentPrice.toLocaleString()}
                    </Text>
                    <Text
                      style={[
                        garageStyles.priceChange,
                        { color: priceChange >= 0 ? colors.primary : '#EF4444' },
                      ]}
                    >
                      {priceChange >= 0 ? '+' : ''}{priceChange.toLocaleString()}$ (
                      {priceChangePercent}%)
                    </Text>
                  </View>

                  <View style={garageStyles.buttonsContainer}>
                    <TouchableOpacity
                      style={[
                        garageStyles.button,
                        garageStyles.repairButton,
                        car.condition >= car.maxCondition && garageStyles.repairButtonDisabled,
                      ]}
                      onPress={() => repairCar(car.id)}
                      disabled={car.condition >= car.maxCondition}
                    >
                      <Text style={garageStyles.buttonText}>
                        {car.condition >= car.maxCondition ? '✓ Макс' : '🔧 Ремонт (+0.1%)'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[garageStyles.button, garageStyles.sellButton]}
                      onPress={() => handleSellCar(car.id)}
                    >
                      <Text style={garageStyles.buttonText}>💰 Продать</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <Modal
        visible={selectedCarForSale !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedCarForSale(null)}
      >
        <View style={garageStyles.modalOverlay}>
          <View style={[garageStyles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={garageStyles.modalTitle}>Продажа машины</Text>

            <View style={garageStyles.modalInfoBlock}>
              <Text style={garageStyles.modalLabel}>Машина:</Text>
              <Text style={garageStyles.modalCarName}>{selectedCarForSale?.name}</Text>
            </View>

            <View style={garageStyles.modalInfoBlock}>
              <Text style={garageStyles.modalLabel}>Купили за:</Text>
              <Text style={garageStyles.modalPrice}>
                ${selectedCarForSale?.boughtPrice.toLocaleString()}
              </Text>
            </View>

            <View style={garageStyles.modalInfoBlock}>
              <Text style={garageStyles.modalLabel}>Продаём за:</Text>
              <Text style={[garageStyles.modalPrice, { color: colors.primary }]}>
                ${selectedCarForSale?.sellPrice.toLocaleString()}
              </Text>
            </View>

            <View
              style={[
                garageStyles.modalInfoBlock,
                {
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  paddingTop: 16,
                  marginTop: 16,
                },
              ]}
            >
              <Text style={garageStyles.modalLabel}>Прибыль:</Text>
              <Text
                style={[
                  garageStyles.modalProfit,
                  {
                    color:
                      (selectedCarForSale?.profit ?? 0) >= 0 ? colors.primary : '#EF4444',
                  },
                ]}
              >
                {(selectedCarForSale?.profit ?? 0) >= 0 ? '+' : ''}
                ${selectedCarForSale?.profit.toLocaleString()} (
                {selectedCarForSale?.profitPercent}%)
              </Text>
            </View>

            <View style={garageStyles.modalButtonsContainer}>
              <TouchableOpacity
                style={[garageStyles.modalButton, garageStyles.cancelButton]}
                onPress={() => setSelectedCarForSale(null)}
              >
                <Text style={garageStyles.modalButtonText}>Отмена</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[garageStyles.modalButton, garageStyles.confirmButton]}
                onPress={confirmSell}
              >
                <Text style={[garageStyles.modalButtonText, { color: '#FFF' }]}>
                  Продать
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};
