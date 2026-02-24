import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Pressable, Platform } from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { garageStyles } from '@styles/styles';
import { useGarageContext } from '@hooks/GarageContext';
import { useSkillsContext } from '@hooks/SkillsContext';
import { useExperienceContext } from '@hooks/ExperienceContext';
import { useGlobalTimer } from '@hooks/GlobalTimerContext';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { colors } from '@styles/colors';
import { calculateCarPrice } from '../utils/priceCalculator';

interface GarageScreenProps {
  onSellCar?: (carId: string, sellPrice: number) => void;
}

interface ActiveSell {
  timerId: string;
  sellPrice: number;
  duration: number;
}

export const GarageScreen: React.FC<GarageScreenProps> = ({ onSellCar }) => {
  const { garage, repairCar, sellCar, removeCar } = useGarageContext();
  const { getSkill } = useSkillsContext();
  const { addExperience } = useExperienceContext();
  const { addTimer, getProgress, removeTimer } = useGlobalTimer();
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;
  const [selectedCarForSale, setSelectedCarForSale] = useState<{
    id: string;
    name: string;
    boughtPrice: number;
    baseSellPrice: number;
    sellPrice: number;
    profit: number;
    profitPercent: number;
  } | null>(null);
  const [priceAdjustment, setPriceAdjustment] = useState(10); // 0-20, где 10 = 0% (центр)
  const [activeSells, setActiveSells] = useState<Record<string, ActiveSell>>({});
  const [activeSellsProgress, setActiveSellsProgress] = useState<Record<string, number>>({});
  const [modalOpenCount, setModalOpenCount] = useState(0); // Счетчик для пересоздания Slider

  const mechanicSkill = getSkill('mechanic');
  const mechanicMultiplier = mechanicSkill?.level ?? 1;

  // Преобразуем значение слайдера (0-20) в процент (-10 до +10)
  const sliderValueToPercent = (sliderValue: number): number => {
    return sliderValue - 10;
  };

  // Сбрасываем ползунок на 0% при открытии модали
  useEffect(() => {
    if (selectedCarForSale !== null) {
      setPriceAdjustment(10);
      setModalOpenCount((prev) => prev + 1);
    }
  }, [selectedCarForSale?.id]);

  // Обновляем прогресс активных продаж
  useEffect(() => {
    if (Object.keys(activeSells).length === 0) {
      setActiveSellsProgress({});
      return;
    }

    const interval = setInterval(() => {
      const newProgress: Record<string, number> = {};
      Object.entries(activeSells).forEach(([carId, sell]) => {
        newProgress[carId] = getProgress(sell.timerId);
      });
      setActiveSellsProgress(newProgress);
    }, 50);

    return () => clearInterval(interval);
  }, [activeSells, getProgress]);

  const getConditionColor = (condition: number) => {
    if (condition >= 80) return colors.primary;
    if (condition >= 50) return '#F59E0B';
    if (condition >= 20) return '#EF4444';
    return '#991B1B';
  };

  // Расчет времени продажи в зависимости от корректировки цены
  // -10% = 0 мин (мгновенно)
  // 0% = 2.5 мин = 150 сек
  // +10% = 5 мин = 300 сек
  const calculateSellDuration = (adjustment: number): number => {
    // Линейная интерполяция: от 0% при -10% до 100% при +10%
    const normalizedAdjustment = (adjustment + 10) / 20; // 0 to 1
    const durationSeconds = normalizedAdjustment * 300; // 0 to 300 seconds
    return durationSeconds * 1000; // Convert to milliseconds
  };

  const calculateFinalSellPrice = (basePrice: number, adjustment: number): number => {
    const adjustmentPercent = adjustment / 100; // Convert to decimal (e.g., 5 -> 0.05)
    return Math.round(basePrice * (1 + adjustmentPercent));
  };

  const handleSellCar = (carId: string) => {
    const car = garage.find((c) => c.id === carId);
    if (!car) return;

    const baseSellPrice = calculateCarPrice(car.basePrice, {
      year: car.year,
      mileage: car.mileage,
      condition: car.condition,
    });

    const finalSellPrice = calculateFinalSellPrice(baseSellPrice, 0); // 0% at start
    const profit = finalSellPrice - car.price;
    const profitPercent = ((profit / car.price) * 100).toFixed(1);

    setSelectedCarForSale({
      id: carId,
      name: car.name,
      boughtPrice: car.price,
      baseSellPrice,
      sellPrice: finalSellPrice,
      profit,
      profitPercent: parseFloat(profitPercent),
    });
    setPriceAdjustment(10);
  };

  const handleSliderChange = (sliderValue: number) => {
    if (!selectedCarForSale) return;
    setPriceAdjustment(sliderValue);

    const percentAdjustment = sliderValueToPercent(sliderValue);
    const finalSellPrice = calculateFinalSellPrice(selectedCarForSale.baseSellPrice, percentAdjustment);
    const profit = finalSellPrice - selectedCarForSale.boughtPrice;
    const profitPercent = ((profit / selectedCarForSale.boughtPrice) * 100).toFixed(1);

    // Обновляем целиком объект машины для полной синхронизации
    setSelectedCarForSale((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sellPrice: finalSellPrice,
        profit,
        profitPercent: parseFloat(profitPercent),
      };
    });
  };

  const confirmSell = () => {
    if (!selectedCarForSale) return;

    // Начинаем процесс продажи
    const percentAdjustment = sliderValueToPercent(priceAdjustment);
    const duration = calculateSellDuration(percentAdjustment);

    const timerId = addTimer(
      {
        type: 'sell',
        duration,
        onComplete: () => {
          // Когда таймер завершился - продаем машину
          sellCar(selectedCarForSale.id, selectedCarForSale.sellPrice);
          onSellCar?.(selectedCarForSale.id, selectedCarForSale.sellPrice);
          
          // Удаляем из activeSells
          setActiveSells((prev) => {
            const updated = { ...prev };
            delete updated[selectedCarForSale.id];
            return updated;
          });
          setActiveSellsProgress((prev) => {
            const updated = { ...prev };
            delete updated[selectedCarForSale.id];
            return updated;
          });
        },
        metadata: {
          carId: selectedCarForSale.id,
          sellPrice: selectedCarForSale.sellPrice,
        },
      },
      duration
    );

    // Добавляем в активные продажи и закрываем модаль
    setActiveSells((prev) => ({
      ...prev,
      [selectedCarForSale.id]: {
        timerId,
        sellPrice: selectedCarForSale.sellPrice,
        duration,
      },
    }));

    setSelectedCarForSale(null);
    setPriceAdjustment(10);
  };

  const handleCancelSell = (carId: string) => {
    const activeSell = activeSells[carId];
    if (!activeSell) return;

    // Удаляем таймер
    removeTimer(activeSell.timerId);

    // Удаляем из activeSells
    setActiveSells((prev) => {
      const updated = { ...prev };
      delete updated[carId];
      return updated;
    });
    setActiveSellsProgress((prev) => {
      const updated = { ...prev };
      delete updated[carId];
      return updated;
    });
  };

  // Форматирование времени
  const formatTime = (milliseconds: number): string => {
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
                onPress={() => {
                  if (activeSells[car.id]) return; // Не ремонтируем машину во время продажи
                  repairCar(car.id, mechanicMultiplier);
                  // XP = (0.1 * mechanicLevel) * 10 = mechanicLevel
                  addExperience(mechanicMultiplier);
                }}
                activeOpacity={activeSells[car.id] ? 1 : 0.7}
                disabled={!!activeSells[car.id]}
              >
                <View
                  style={[
                    garageStyles.carCard,
                  ]}
                >
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
                    {activeSells[car.id] ? (
                      <View style={{ flex: 1, gap: 10 }}>
                        {/* Timer Card */}
                        <View
                          style={{
                            backgroundColor: colors.cardBg,
                            borderRadius: 12,
                            padding: 16,
                            alignItems: 'center',
                            gap: 12,
                            borderWidth: 2,
                            borderColor: colors.primary,
                          }}
                        >
                          <Text style={{ color: colors.textTertiary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            💰 Продажа в процессе
                          </Text>
                          <Text
                            style={{
                              fontSize: 36,
                              fontWeight: '900',
                              color: colors.primary,
                              fontVariant: ['tabular-nums'],
                            }}
                          >
                            {formatTime(
                              activeSells[car.id].duration -
                                (activeSellsProgress[car.id] ?? 0) / 100 * activeSells[car.id].duration
                            )}
                          </Text>
                          <View
                            style={{
                              height: 8,
                              backgroundColor: 'rgba(99, 102, 241, 0.1)',
                              borderRadius: 4,
                              overflow: 'hidden',
                              width: '100%',
                            }}
                          >
                            <View
                              style={{
                                height: '100%',
                                width: `${activeSellsProgress[car.id] ?? 0}%`,
                                backgroundColor: colors.primary,
                                borderRadius: 4,
                              }}
                            />
                          </View>
                          <Text
                            style={{
                              fontSize: 12,
                              color: colors.textTertiary,
                              fontWeight: '600',
                            }}
                          >
                            {Math.round(activeSellsProgress[car.id] ?? 0)}% завершено
                          </Text>
                        </View>

                        {/* Cancel Button */}
                        <TouchableOpacity
                          style={{
                            backgroundColor: 'rgba(220, 38, 38, 0.15)',
                            borderRadius: 10,
                            paddingVertical: 12,
                            paddingHorizontal: 16,
                            alignItems: 'center',
                            borderWidth: 2,
                            borderColor: '#EF4444',
                          }}
                          onPress={() => handleCancelSell(car.id)}
                        >
                          <Text
                            style={{
                              color: '#EF4444',
                              fontSize: 14,
                              fontWeight: '700',
                            }}
                          >
                            ✕ Отменить продажу
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          style={[
                            garageStyles.button,
                            garageStyles.repairButton,
                            car.condition >= car.maxCondition && garageStyles.repairButtonDisabled,
                          ]}
                          onPress={() => {
                            repairCar(car.id, mechanicMultiplier);
                            addExperience(mechanicMultiplier);
                          }}
                          disabled={car.condition >= car.maxCondition}
                        >
                          <Text style={garageStyles.buttonText}>
                            {car.condition >= car.maxCondition ? '✓ Макс' : `🔧 Ремонт (+${(0.1 * mechanicMultiplier).toFixed(1)}%)`}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[garageStyles.button, garageStyles.sellButton]}
                          onPress={() => handleSellCar(car.id)}
                        >
                          <Text style={garageStyles.buttonText}>💰 Продать</Text>
                        </TouchableOpacity>
                      </View>
                    )}
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
        onRequestClose={() => {
          setSelectedCarForSale(null);
          setPriceAdjustment(10);
        }}
      >
        <View style={garageStyles.modalOverlay}>
          <View style={[garageStyles.modalContent, { paddingBottom: insets.bottom + 12 }]}>
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

            {/* Price Adjustment Slider */}
            <View style={garageStyles.modalInfoBlock}>
              <View style={{ marginBottom: 12 }}>
                <Text style={garageStyles.modalLabel}>Регулировка цены:</Text>
                <Text
                  style={[
                    garageStyles.modalPrice,
                    {
                      color:
                        priceAdjustment > 10
                          ? colors.primary
                          : priceAdjustment < 10
                            ? '#EF4444'
                            : colors.textTertiary,
                    },
                  ]}
                >
                  {sliderValueToPercent(priceAdjustment) > 0 ? '+' : ''}
                  {sliderValueToPercent(priceAdjustment)}%
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: colors.textTertiary, fontSize: 12 }}>-10%</Text>
                <Slider
                  key={`slider-${modalOpenCount}`}
                  style={{ flex: 1, height: 40 }}
                  minimumValue={0}
                  maximumValue={20}
                  step={1}
                  value={priceAdjustment}
                  onValueChange={handleSliderChange}
                  minimumTrackTintColor={colors.primary}
                  maximumTrackTintColor={colors.border}
                  thumbTintColor={colors.primary}
                />
                <Text style={{ color: colors.textTertiary, fontSize: 12 }}>+10%</Text>
              </View>
            </View>

            {/* Time to sell display */}
            <View style={garageStyles.modalInfoBlock}>
              <Text style={garageStyles.modalLabel}>Время продажи:</Text>
              <Text style={[garageStyles.modalPrice, { color: colors.primary }]}>
                {`${formatTime(calculateSellDuration(sliderValueToPercent(priceAdjustment)))} мин`}
              </Text>
            </View>

            <View
              style={[
                garageStyles.modalInfoBlock,
                {
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  paddingTop: 12,
                  marginTop: 12,
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
                onPress={() => {
                  setSelectedCarForSale(null);
                  setPriceAdjustment(10);
                }}
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
