import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  Platform,
} from "react-native";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { garageStyles } from "@styles/styles";
import { useGarageContext } from "@hooks/GarageContext";
import { useSkillsContext } from "@hooks/SkillsContext";
import { useSafeAreaWeb } from "@hooks/useSafeAreaWeb";
import { useBalanceContext } from "@hooks/BalanceContext";
import { colors } from "@styles/colors";
import { calculateCarPrice } from "../utils/priceCalculator";

interface GarageScreenProps {
  onSellCar?: (carId: string, sellPrice: number) => void;
}

export const GarageScreen: React.FC<GarageScreenProps> = ({ onSellCar }) => {
  const {
    garage,
    garageSlots,
    maxGarageSlots,
    mechanics,
    mechanicRepairs,
    mechanicRepairsProgress,
    mechanicRepairsCondition,
    repairCar,
    sellCar,
    removeCar,
    upgradeGarageSlot,
    upgradeMechanicSkill,
    hireMechanic,
    changeMechanicSlot,
    changeCarSlot,
    canUpgradeGarage,
    startMechanicRepair,
    cancelMechanicRepair,
    activeSells,
    activeSellsProgress,
    startSell,
    cancelSell,
  } = useGarageContext();
  const { balance, removeBalance } = useBalanceContext();
  const { getSkill } = useSkillsContext();
  // timerRefresh is used to force re-render for mechanic repair timer display
  const [timerRefresh, setTimerRefresh] = useState(0);
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === "web" ? webInsets : nativeInsets;
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
  const [modalOpenCount, setModalOpenCount] = useState(0); // Счетчик для пересоздания Slider
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedMechanicForUpgrade, setSelectedMechanicForUpgrade] = useState<
    string | null
  >(null);
  const [showMechanicsModal, setShowMechanicsModal] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number>(0); // Выбранный слот гаража


  const mechanicSkill = getSkill("mechanic");
  const mechanicMultiplier = mechanicSkill?.level ?? 1;

  // Уникальные цвета для механиков
  const MECHANIC_COLORS = [
    "#6366F1", // Индиго
    "#EC4899", // Розовый
    "#F59E0B", // Оранжевый
    "#10B981", // Мятный
    "#06B6D4", // Голубой
    "#8B5CF6", // Фиолетовый
    "#EF4444", // Красный
    "#14B8A6", // Бирюзовый
  ];

  const getMechanicColor = (mechanicIndex: number): string => {
    return MECHANIC_COLORS[mechanicIndex % MECHANIC_COLORS.length];
  };

  const getMechanicAtSlot = (
    slotIndex: number,
  ): (typeof mechanics)[0] | undefined => {
    if (!Array.isArray(mechanics)) return undefined;
    return mechanics.find((m) => m.slotIndex === slotIndex);
  };

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

  // Система вычитания денег за нанятых механиков
  const MECHANIC_HOURLY_COST = 5; // $5 в секунду
  useEffect(() => {
    if (!Array.isArray(mechanics)) return;

    const hiredMechanicsCount = mechanics.filter((m) => m.hired).length;

    if (hiredMechanicsCount === 0) return;

    const interval = setInterval(() => {
      const totalCost = hiredMechanicsCount * MECHANIC_HOURLY_COST;
      removeBalance(totalCost);
    }, 1000); // Каждую секунду

    return () => clearInterval(interval);
  }, [mechanics, removeBalance]);

  // Refresh timer display for mechanic repairs
  useEffect(() => {
    if (Object.keys(mechanicRepairs).length === 0) return;

    const interval = setInterval(() => {
      setTimerRefresh((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [mechanicRepairs]);

  const getConditionColor = (condition: number) => {
    if (condition >= 80) return colors.primary;
    if (condition >= 50) return "#F59E0B";
    if (condition >= 20) return "#EF4444";
    return "#991B1B";
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

  const calculateFinalSellPrice = (
    basePrice: number,
    adjustment: number,
  ): number => {
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
    const finalSellPrice = calculateFinalSellPrice(
      selectedCarForSale.baseSellPrice,
      percentAdjustment,
    );
    const profit = finalSellPrice - selectedCarForSale.boughtPrice;
    const profitPercent = (
      (profit / selectedCarForSale.boughtPrice) *
      100
    ).toFixed(1);

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

    startSell(selectedCarForSale.id, selectedCarForSale.sellPrice, duration);

    setSelectedCarForSale(null);
    setPriceAdjustment(10);
  };

  const handleCancelSell = (carId: string) => {
    cancelSell(carId);
  };

  // Начало механического ремонта (delegated to context)
  const handleMechanicRepair = (carId: string, mechanicId: string) => {
    startMechanicRepair(carId, mechanicId);
  };

  // Отмена механического ремонта (delegated to context)
  const handleCancelMechanicRepair = (carId: string) => {
    cancelMechanicRepair(carId);
  };

  // Форматирование времени
  const formatTime = (milliseconds: number): string => {
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <ScrollView style={garageStyles.container}>
      <Text style={garageStyles.title}>Мой гараж</Text>

      {/* Garage Info Header */}
      <View
        style={{
          backgroundColor: colors.cardBg,
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        {/* Info Row */}
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
          {/* Места в гараже */}
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(99, 102, 241, 0.08)",
              borderRadius: 10,
              padding: 12,
              borderWidth: 1,
              borderColor: "rgba(99, 102, 241, 0.2)",
            }}
          >
            <Text
              style={{
                color: colors.textTertiary,
                fontSize: 11,
                fontWeight: "600",
                marginBottom: 6,
              }}
            >
              МЕСТА
            </Text>
            <Text
              style={{
                color: colors.textPrimary,
                fontSize: 24,
                fontWeight: "700",
              }}
            >
              {garageSlots}
            </Text>
          </View>

          {/* Механики */}
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(99, 102, 241, 0.08)",
              borderRadius: 10,
              padding: 12,
              borderWidth: 1,
              borderColor: "rgba(99, 102, 241, 0.2)",
            }}
          >
            <Text
              style={{
                color: colors.textTertiary,
                fontSize: 11,
                fontWeight: "600",
                marginBottom: 6,
              }}
            >
              МЕХАНИКИ
            </Text>
            <Text
              style={{
                color: colors.textPrimary,
                fontSize: 24,
                fontWeight: "700",
              }}
            >
              {Array.isArray(mechanics) ? mechanics.filter((m) => m.hired).length : 0}
            </Text>
          </View>

          {/* Машины */}
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(99, 102, 241, 0.08)",
              borderRadius: 10,
              padding: 12,
              borderWidth: 1,
              borderColor: "rgba(99, 102, 241, 0.2)",
            }}
          >
            <Text
              style={{
                color: colors.textTertiary,
                fontSize: 11,
                fontWeight: "600",
                marginBottom: 6,
              }}
            >
              МАШИНЫ
            </Text>
            <Text
              style={{
                color: colors.textPrimary,
                fontSize: 24,
                fontWeight: "700",
              }}
            >
              {garage.length}
            </Text>
          </View>
        </View>

        {/* Buttons Row */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: colors.primary,
              borderRadius: 10,
              paddingVertical: 12,
              alignItems: "center",
              opacity: canUpgradeGarage() ? 1 : 0.6,
            }}
            onPress={() => setShowUpgradeModal(true)}
            disabled={!canUpgradeGarage()}
          >
            <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "700" }}>
              Улучшить гараж
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: colors.primary,
              borderRadius: 10,
              paddingVertical: 12,
              alignItems: "center",
            }}
            onPress={() => setShowMechanicsModal(true)}
          >
            <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "700" }}>
              Механики
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Garage Slots Selector */}
      <View
        style={{
          marginBottom: 16,
          paddingHorizontal: 0,
        }}
      >
        <View style={{ marginBottom: 10 }}>
          <Text
            style={{
              color: colors.textTertiary,
              fontSize: 11,
              fontWeight: "600",
            }}
          >
            ВЫБЕРИТЕ СЛОТ
          </Text>
        </View>
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
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 10,
                  backgroundColor: isSelected
                    ? colors.primary
                    : carInSlot
                      ? "rgba(251, 191, 36, 0.15)"
                      : "rgba(99, 102, 241, 0.08)",
                  borderWidth: 2,
                  borderColor: isSelected
                    ? colors.primary
                    : carInSlot
                      ? "#FBBF24"
                      : "rgba(99, 102, 241, 0.2)",
                  justifyContent: "center",
                  alignItems: "center",
                }}
                onPress={() => setSelectedSlot(slotIndex)}
              >
                <Text
                  style={{
                    color: isSelected ? "#FFF" : colors.textPrimary,
                    fontSize: 20,
                    fontWeight: "700",
                  }}
                >
                  {slotIndex + 1}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {garage.length === 0 ? (
        <Text style={garageStyles.emptyText}>
          Ещё нет машин. Купи на авторынке!
        </Text>
      ) : (
        <View style={garageStyles.carsList}>
          {garage
            .filter((car) => car.slotIndex === selectedSlot)
            .map((car) => {
              // Используем timerRefresh для форсирования пересчета при ремонте
              const refreshKey = mechanicRepairs[car.id] ? timerRefresh : undefined;
              
              const currentPrice = calculateCarPrice(car.basePrice, {
                year: car.year,
                mileage: car.mileage,
                condition: car.condition,
              });
              const priceChange = currentPrice - car.price;
              const priceChangePercent = (
                (currentPrice / car.price - 1) *
                100
              ).toFixed(1);

              // Получаем механика на этом слоте
              const mechanicAtSlot = getMechanicAtSlot(car.slotIndex);
              const canUseMechanic = mechanicAtSlot && mechanicAtSlot.hired && car.condition < car.maxCondition;

              return (
                <View
                  key={mechanicRepairs[car.id] ? `${car.id}-${timerRefresh}` : car.id}
              >
                <View style={[garageStyles.carCard]}>
                  <View style={garageStyles.carHeader}>
                    <Text style={garageStyles.carEmoji}>{car.emoji}</Text>
                    <View style={garageStyles.carInfo}>
                      <Text style={garageStyles.carName}>{car.name}</Text>
                      <Text style={garageStyles.carSpeed}>
                        ⚡ {car.speed} км/ч
                      </Text>
                      <Text style={garageStyles.carMeta}>
                        📅 {car.year} • 📏 {car.mileage.toLocaleString()} км
                      </Text>
                    </View>
                  </View>

                  <View style={garageStyles.conditionContainer}>
                    <View style={garageStyles.conditionBar}>
                      {/* Текущее состояние */}
                      <View
                        key={`cond-${car.id}-${mechanicRepairsCondition[car.id] ?? car.condition}`}
                        style={[
                          garageStyles.conditionFill,
                          {
                            width: `${mechanicRepairs[car.id] ? mechanicRepairsCondition[car.id] ?? car.condition : car.condition}%`,
                            backgroundColor: getConditionColor(
                              mechanicRepairs[car.id]
                                ? mechanicRepairsCondition[car.id] ?? car.condition
                                : car.condition
                            ),
                            position: "absolute",
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
                            position: "absolute",
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
                            backgroundColor: "#27272A",
                            position: "absolute",
                            right: 0,
                          },
                        ]}
                      />
                    </View>
                    <View style={garageStyles.conditionLabelContainer}>
                      <Text
                        style={[
                          garageStyles.conditionText,
                          {
                            color: getConditionColor(
                              mechanicRepairs[car.id]
                                ? mechanicRepairsCondition[car.id] ?? car.condition
                                : car.condition
                            ),
                          },
                        ]}
                      >
                        {(mechanicRepairs[car.id]
                          ? mechanicRepairsCondition[car.id] ?? car.condition
                          : car.condition
                        ).toFixed(2)}%
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
                        {
                          color: priceChange >= 0 ? colors.primary : "#EF4444",
                        },
                      ]}
                    >
                      {priceChange >= 0 ? "+" : ""}
                      {priceChange.toLocaleString()}$ ({priceChangePercent}%)
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
                            alignItems: "center",
                            gap: 12,
                            borderWidth: 2,
                            borderColor: colors.primary,
                          }}
                        >
                          <Text
                            style={{
                              color: colors.textTertiary,
                              fontSize: 12,
                              fontWeight: "600",
                              textTransform: "uppercase",
                              letterSpacing: 0.5,
                            }}
                          >
                            💰 Продажа в процессе
                          </Text>
                          <Text
                            style={{
                              fontSize: 36,
                              fontWeight: "900",
                              color: colors.primary,
                              fontVariant: ["tabular-nums"],
                            }}
                          >
                            {formatTime(
                              activeSells[car.id].duration -
                                ((activeSellsProgress[car.id] ?? 0) / 100) *
                                  activeSells[car.id].duration,
                            )}
                          </Text>
                          <View
                            style={{
                              height: 8,
                              backgroundColor: "rgba(99, 102, 241, 0.1)",
                              borderRadius: 4,
                              overflow: "hidden",
                              width: "100%",
                            }}
                          >
                            <View
                              style={{
                                height: "100%",
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
                              fontWeight: "600",
                            }}
                          >
                            {Math.round(activeSellsProgress[car.id] ?? 0)}%
                            завершено
                          </Text>
                        </View>

                        {/* Cancel Button */}
                        <TouchableOpacity
                          style={{
                            backgroundColor: "rgba(220, 38, 38, 0.15)",
                            borderRadius: 10,
                            paddingVertical: 12,
                            paddingHorizontal: 16,
                            alignItems: "center",
                            borderWidth: 2,
                            borderColor: "#EF4444",
                          }}
                          onPress={() => handleCancelSell(car.id)}
                        >
                          <Text
                            style={{
                              color: "#EF4444",
                              fontSize: 14,
                              fontWeight: "700",
                            }}
                          >
                            ✕ Отменить продажу
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : mechanicRepairs[car.id] ? (
                      <View style={{ flex: 1, gap: 10 }}>
                        {/* Mechanic Repair Timer Card */}
                        <View
                          style={{
                            backgroundColor: colors.cardBg,
                            borderRadius: 12,
                            padding: 16,
                            alignItems: "center",
                            gap: 12,
                            borderWidth: 2,
                            borderColor: "#10B981",
                          }}
                        >
                          <Text
                            style={{
                              color: colors.textTertiary,
                              fontSize: 12,
                              fontWeight: "600",
                              textTransform: "uppercase",
                              letterSpacing: 0.5,
                            }}
                          >
                            🔧 Механик ремонтирует
                          </Text>
                          <Text
                            style={{
                              fontSize: 36,
                              fontWeight: "900",
                              color: "#10B981",
                              fontVariant: ["tabular-nums"],
                            }}
                          >
                            {(() => {
                              // Используем timerRefresh для форсирования ре-рендера
                              void timerRefresh;
                              
                              const repair = mechanicRepairs[car.id];
                              if (!repair) return "0:00";
                              
                              const elapsedMs = Date.now() - repair.startTime;
                              const totalDurationMs =
                                (repair.maxCondition - repair.startCondition) / 0.05 * 1000;
                              const remainingMs = Math.max(0, totalDurationMs - elapsedMs);
                              
                              return formatTime(remainingMs);
                            })()}
                          </Text>
                          <View
                            style={{
                              height: 8,
                              backgroundColor: "rgba(16, 185, 129, 0.1)",
                              borderRadius: 4,
                              overflow: "hidden",
                              width: "100%",
                            }}
                          >
                            <View
                              style={{
                                height: "100%",
                                width: `${mechanicRepairsProgress[car.id] ?? 0}%`,
                                backgroundColor: "#10B981",
                                borderRadius: 4,
                              }}
                            />
                          </View>
                          <Text
                            style={{
                              fontSize: 12,
                              color: colors.textTertiary,
                              fontWeight: "600",
                            }}
                          >
                            {Math.round(mechanicRepairsProgress[car.id] ?? 0)}%
                            завершено
                          </Text>
                        </View>

                        {/* Cancel Button */}
                        <TouchableOpacity
                          style={{
                            backgroundColor: "rgba(220, 38, 38, 0.15)",
                            borderRadius: 10,
                            paddingVertical: 12,
                            paddingHorizontal: 16,
                            alignItems: "center",
                            borderWidth: 2,
                            borderColor: "#EF4444",
                          }}
                          onPress={() => handleCancelMechanicRepair(car.id)}
                        >
                          <Text
                            style={{
                              color: "#EF4444",
                              fontSize: 14,
                              fontWeight: "700",
                            }}
                          >
                            ✕ Остановить ремонт
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View
                        style={{
                          flex: 1,
                          flexDirection: canUseMechanic ? "column" : "row",
                          gap: canUseMechanic ? 8 : 8,
                        }}
                      >
                        <View style={{ flexDirection: "row", gap: 8, flex: 1 }}>
                          <TouchableOpacity
                            style={[
                              garageStyles.button,
                              garageStyles.repairButton,
                              car.condition >= car.maxCondition &&
                                garageStyles.repairButtonDisabled,
                            ]}
                            onPress={() => {
                              repairCar(car.id, mechanicMultiplier);
                            }}
                            disabled={car.condition >= car.maxCondition}
                          >
                            <Text style={garageStyles.buttonText}>
                              {car.condition >= car.maxCondition
                                ? "✓ Макс"
                                : `🔧 Ремонт (+${(0.1 * mechanicMultiplier).toFixed(1)}%)`}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[garageStyles.button, garageStyles.sellButton]}
                            onPress={() => handleSellCar(car.id)}
                          >
                            <Text style={garageStyles.buttonText}>
                              💰 Продать
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {canUseMechanic && (
                          <TouchableOpacity
                            style={[
                              garageStyles.button,
                              {
                                backgroundColor: "#10B981",
                                borderColor: "#10B981",
                              },
                            ]}
                            onPress={() =>
                              handleMechanicRepair(car.id, mechanicAtSlot!.id)
                            }
                          >
                            <Text style={garageStyles.buttonText}>
                              🔧 Механик ремонтирует (+0.05%/сек)
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              </View>
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
          <View
            style={[
              garageStyles.modalContent,
              { paddingBottom: insets.bottom + 12 },
            ]}
          >
            <Text style={garageStyles.modalTitle}>Продажа машины</Text>

            <View style={garageStyles.modalInfoBlock}>
              <Text style={garageStyles.modalLabel}>Машина:</Text>
              <Text style={garageStyles.modalCarName}>
                {selectedCarForSale?.name}
              </Text>
            </View>

            <View style={garageStyles.modalInfoBlock}>
              <Text style={garageStyles.modalLabel}>Купили за:</Text>
              <Text style={garageStyles.modalPrice}>
                ${selectedCarForSale?.boughtPrice.toLocaleString()}
              </Text>
            </View>

            <View style={garageStyles.modalInfoBlock}>
              <Text style={garageStyles.modalLabel}>Продаём за:</Text>
              <Text
                style={[garageStyles.modalPrice, { color: colors.primary }]}
              >
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
                            ? "#EF4444"
                            : colors.textTertiary,
                    },
                  ]}
                >
                  {sliderValueToPercent(priceAdjustment) > 0 ? "+" : ""}
                  {sliderValueToPercent(priceAdjustment)}%
                </Text>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
                  -10%
                </Text>
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
                <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
                  +10%
                </Text>
              </View>
            </View>

            {/* Time to sell display */}
            <View style={garageStyles.modalInfoBlock}>
              <Text style={garageStyles.modalLabel}>Время продажи:</Text>
              <Text
                style={[garageStyles.modalPrice, { color: colors.primary }]}
              >
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
                      (selectedCarForSale?.profit ?? 0) >= 0
                        ? colors.primary
                        : "#EF4444",
                  },
                ]}
              >
                {(selectedCarForSale?.profit ?? 0) >= 0 ? "+" : ""}$
                {selectedCarForSale?.profit.toLocaleString()} (
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
                <Text style={[garageStyles.modalButtonText, { color: "#FFF" }]}>
                  Продать
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Garage Upgrade Modal */}
      <Modal
        visible={showUpgradeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUpgradeModal(false)}
      >
        <View style={garageStyles.modalOverlay}>
          <View
            style={[
              garageStyles.modalContent,
              { paddingBottom: insets.bottom + 12 },
            ]}
          >
            <Text style={garageStyles.modalTitle}>Улучшить гараж</Text>

            <View
              style={{
                backgroundColor: colors.cardBg,
                borderRadius: 12,
                padding: 16,
                marginBottom: 20,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View style={{ marginBottom: 16 }}>
                <Text
                  style={{
                    color: colors.textTertiary,
                    fontSize: 12,
                    fontWeight: "600",
                    marginBottom: 8,
                  }}
                >
                  📍 НОВОЕ МЕСТО В ГАРАЖЕ
                </Text>
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontSize: 20,
                    fontWeight: "700",
                  }}
                >
                  $5,000
                </Text>
              </View>
              <TouchableOpacity
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: "center",
                }}
                onPress={() => {
                  upgradeGarageSlot();
                  setShowUpgradeModal(false);
                }}
              >
                <Text
                  style={{ color: "#FFF", fontSize: 14, fontWeight: "700" }}
                >
                  ✓ Купить место
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[garageStyles.modalButton, garageStyles.cancelButton]}
              onPress={() => setShowUpgradeModal(false)}
            >
              <Text style={garageStyles.modalButtonText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Hire Mechanic Modal */}
      <Modal
        visible={showMechanicsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMechanicsModal(false)}
      >
        <View style={garageStyles.modalOverlay}>
          <View
            style={[
              garageStyles.modalContent,
              { paddingBottom: insets.bottom + 12 },
            ]}
          >
            <Text style={garageStyles.modalTitle}>Механики</Text>

            <ScrollView style={{ maxHeight: 400, marginBottom: 20 }}>
              {Array.isArray(mechanics) &&
                mechanics.map((mechanic) => (
                  <View
                    key={mechanic.id}
                    style={{
                      backgroundColor: colors.cardBg,
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    {/* Mechanic Header */}
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 12,
                      }}
                    >
                      <View>
                        <Text
                          style={{
                            color: colors.textPrimary,
                            fontSize: 16,
                            fontWeight: "700",
                          }}
                        >
                          🔧 {mechanic.name}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text
                          style={{
                            color: colors.primary,
                            fontSize: 18,
                            fontWeight: "700",
                          }}
                        >
                          Уровень {mechanic.skillLevel}
                        </Text>
                      </View>
                    </View>

                    {/* Status Badge */}
                    <View
                      style={{
                        backgroundColor: mechanic.hired
                          ? getMechanicColor(
                              Array.isArray(mechanics)
                                ? mechanics.indexOf(mechanic)
                                : 0,
                            )
                          : "rgba(107, 114, 128, 0.1)",
                        borderRadius: 8,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        marginBottom: 12,
                        borderWidth: 1,
                        borderColor: mechanic.hired
                          ? getMechanicColor(
                              Array.isArray(mechanics)
                                ? mechanics.indexOf(mechanic)
                                : 0,
                            )
                          : "#D1D5DB",
                      }}
                    >
                      <Text
                        style={{
                          color: mechanic.hired ? "#FFF" : "#6B7280",
                          fontSize: 12,
                          fontWeight: "700",
                          letterSpacing: 0.2,
                        }}
                      >
                        {!mechanic.hired
                          ? "○ СВОБОДЕН"
                          : mechanic.slotIndex === -1
                            ? "⚙️ НЕ НАЗНАЧЕН"
                            : `✓ НАЗНАЧЕН НА СЛОТ #${mechanic.slotIndex + 1}`}
                      </Text>
                    </View>

                    {/* Slot Selector - only show if hired */}
                    {mechanic.hired && (
                      <View style={{ marginBottom: 12 }}>
                        <Text
                          style={{
                            color: colors.textTertiary,
                            fontSize: 11,
                            fontWeight: "600",
                            marginBottom: 8,
                            marginLeft: 4,
                          }}
                        >
                          Выберите слот
                        </Text>
                        <View
                          style={{
                            flexDirection: "row",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          {Array.from({ length: garageSlots }).map(
                            (_, index) => {
                              const mechanicAtSlot = getMechanicAtSlot(index);
                              const isCurrentSlot =
                                mechanic.slotIndex === index;
                              const mechanicIndex = Array.isArray(mechanics)
                                ? mechanics.indexOf(mechanic)
                                : 0;
                              const mechanicColor =
                                getMechanicColor(mechanicIndex);
                              const occupiedByOtherMechanic =
                                mechanicAtSlot &&
                                mechanicAtSlot.id !== mechanic.id;

                              return (
                                <TouchableOpacity
                                  key={index}
                                  style={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 10,
                                    backgroundColor: isCurrentSlot
                                      ? mechanicColor
                                      : occupiedByOtherMechanic
                                        ? getMechanicColor(
                                            Array.isArray(mechanics)
                                              ? mechanics.indexOf(
                                                  mechanicAtSlot,
                                                )
                                              : 0,
                                          )
                                        : "rgba(99, 102, 241, 0.08)",
                                    borderWidth: 1.5,
                                    borderColor: isCurrentSlot
                                      ? mechanicColor
                                      : occupiedByOtherMechanic
                                        ? getMechanicColor(
                                            Array.isArray(mechanics)
                                              ? mechanics.indexOf(
                                                  mechanicAtSlot,
                                                )
                                              : 0,
                                          )
                                        : "rgba(99, 102, 241, 0.2)",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    shadowColor: isCurrentSlot
                                      ? mechanicColor
                                      : "transparent",
                                    shadowOffset: { width: 0, height: 2 },
                                    shadowOpacity: 0.2,
                                    shadowRadius: 3,
                                    elevation: isCurrentSlot ? 3 : 0,
                                    opacity:
                                      occupiedByOtherMechanic && !isCurrentSlot
                                        ? 0.6
                                        : 1,
                                  }}
                                  onPress={() => {
                                    if (
                                      !occupiedByOtherMechanic ||
                                      isCurrentSlot
                                    ) {
                                      changeMechanicSlot(mechanic.id, index);
                                    }
                                  }}
                                  disabled={
                                    occupiedByOtherMechanic && !isCurrentSlot
                                  }
                                >
                                  <Text
                                    style={{
                                      fontSize: 18,
                                      fontWeight: "800",
                                      color: isCurrentSlot
                                        ? "#FFF"
                                        : occupiedByOtherMechanic
                                          ? "#FFF"
                                          : colors.primary,
                                    }}
                                  >
                                    {index + 1}
                                  </Text>
                                </TouchableOpacity>
                              );
                            },
                          )}
                        </View>
                        <TouchableOpacity
                          style={{
                            backgroundColor: "rgba(239, 68, 68, 0.1)",
                            borderRadius: 8,
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            marginTop: 8,
                            borderWidth: 1,
                            borderColor: "rgba(239, 68, 68, 0.2)",
                          }}
                          onPress={() => {
                            changeMechanicSlot(mechanic.id, -1);
                          }}
                        >
                          <Text
                            style={{
                              color: "#EF4444",
                              fontSize: 12,
                              fontWeight: "700",
                              textAlign: "center",
                            }}
                          >
                            ✕ Открепить от слота
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {mechanic.hired && (
                      <View
                        style={{
                          backgroundColor:
                            getMechanicColor(
                              Array.isArray(mechanics)
                                ? mechanics.indexOf(mechanic)
                                : 0,
                            ) + "15",
                          borderRadius: 8,
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          marginBottom: 12,
                          borderWidth: 1,
                          borderColor:
                            getMechanicColor(
                              Array.isArray(mechanics)
                                ? mechanics.indexOf(mechanic)
                                : 0,
                            ) + "30",
                        }}
                      >
                        <Text
                          style={{
                            color: getMechanicColor(
                              Array.isArray(mechanics)
                                ? mechanics.indexOf(mechanic)
                                : 0,
                            ),
                            fontSize: 11,
                            fontWeight: "600",
                          }}
                        >
                          Множитель ремонта: x{mechanic.skillLevel}
                        </Text>
                      </View>
                    )}

                    {/* Action Button */}
                    {!mechanic.hired ? (
                      <TouchableOpacity
                        style={{
                          backgroundColor: "#22C55E",
                          borderRadius: 10,
                          paddingVertical: 12,
                          alignItems: "center",
                        }}
                        onPress={() => {
                          hireMechanic(mechanic.id);
                        }}
                      >
                        <Text
                          style={{
                            color: "#FFF",
                            fontSize: 14,
                            fontWeight: "700",
                          }}
                        >
                          💼 Нанять ($5/сек)
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={{
                          backgroundColor: colors.primary,
                          borderRadius: 10,
                          paddingVertical: 12,
                          alignItems: "center",
                        }}
                        onPress={() => {
                          setSelectedMechanicForUpgrade(mechanic.id);
                        }}
                      >
                        <Text
                          style={{
                            color: "#FFF",
                            fontSize: 14,
                            fontWeight: "700",
                          }}
                        >
                          ⬆️ Улучшить скилл ($500)
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
            </ScrollView>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                style={[garageStyles.modalButton, garageStyles.cancelButton]}
                onPress={() => setShowMechanicsModal(false)}
              >
                <Text style={garageStyles.modalButtonText}>Закрыть</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Upgrade Mechanic Skill Confirmation Modal */}
      <Modal
        visible={selectedMechanicForUpgrade !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSelectedMechanicForUpgrade(null);
          setUpgradeError(null);
        }}
      >
        <View style={garageStyles.modalOverlay}>
          <View
            style={[
              garageStyles.modalContent,
              { paddingBottom: insets.bottom + 12 },
            ]}
          >
            <Text style={garageStyles.modalTitle}>Улучшить скилл механика</Text>

            {selectedMechanicForUpgrade &&
              Array.isArray(mechanics) &&
              (() => {
                const selectedMechanic = mechanics.find(
                  (m) => m.id === selectedMechanicForUpgrade,
                );

                if (!selectedMechanic) return null;

                if (!selectedMechanic.hired) {
                  return (
                    <View
                      style={{
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                        borderRadius: 8,
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        marginBottom: 20,
                        borderWidth: 1,
                        borderColor: "#EF4444",
                      }}
                    >
                      <Text
                        style={{
                          color: "#EF4444",
                          fontSize: 14,
                          fontWeight: "600",
                          marginBottom: 8,
                        }}
                      >
                        ⚠️ Механик не нанят
                      </Text>
                      <Text style={{ color: "#EF4444", fontSize: 12 }}>
                        Сначала наймите механика, затем сможете улучшать его
                        скилл
                      </Text>
                    </View>
                  );
                }

                return (
                  <View
                    style={{
                      backgroundColor: colors.cardBg,
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 20,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <View style={{ marginBottom: 16 }}>
                      <Text
                        style={{
                          color: colors.textTertiary,
                          fontSize: 12,
                          fontWeight: "600",
                          marginBottom: 8,
                        }}
                      >
                        🔧 МЕХАНИК: {selectedMechanic.name}
                      </Text>
                      <Text
                        style={{
                          color: colors.textPrimary,
                          fontSize: 18,
                          fontWeight: "700",
                          marginBottom: 8,
                        }}
                      >
                        Уровень {selectedMechanic.skillLevel} →{" "}
                        {selectedMechanic.skillLevel + 1}
                      </Text>
                      <Text
                        style={{
                          color: colors.textTertiary,
                          fontSize: 14,
                          marginBottom: 12,
                        }}
                      >
                        Множитель ремонта: x{selectedMechanic.skillLevel} → x
                        {selectedMechanic.skillLevel + 1}
                      </Text>
                    </View>
                    <View
                      style={{
                        backgroundColor: "rgba(99, 102, 241, 0.1)",
                        borderRadius: 8,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        marginBottom: 16,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.textPrimary,
                          fontSize: 16,
                          fontWeight: "700",
                        }}
                      >
                        💰 $500
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={{
                        backgroundColor: colors.primary,
                        borderRadius: 10,
                        paddingVertical: 12,
                        alignItems: "center",
                        marginBottom: 10,
                      }}
                      onPress={() => {
                        if (selectedMechanicForUpgrade) {
                          const upgradeCost = 500;
                          if (balance >= upgradeCost) {
                            removeBalance(upgradeCost);
                            upgradeMechanicSkill(selectedMechanicForUpgrade);
                            setUpgradeError(null);
                            setSelectedMechanicForUpgrade(null);
                          } else {
                            setUpgradeError(
                              `Не хватает денег. Нужно: $${upgradeCost}, есть: $${balance}`,
                            );
                          }
                        }
                      }}
                    >
                      <Text
                        style={{
                          color: "#FFF",
                          fontSize: 14,
                          fontWeight: "700",
                        }}
                      >
                        ✓ Улучшить
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })()}

            {upgradeError && (
              <View
                style={{
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  borderRadius: 8,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: "#EF4444",
                }}
              >
                <Text
                  style={{ color: "#EF4444", fontSize: 12, fontWeight: "600" }}
                >
                  {upgradeError}
                </Text>
              </View>
            )}

            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                style={[
                  garageStyles.modalButton,
                  garageStyles.cancelButton,
                  { flex: 1 },
                ]}
                onPress={() => {
                  setSelectedMechanicForUpgrade(null);
                  setUpgradeError(null);
                }}
              >
                <Text style={garageStyles.modalButtonText}>Отмена</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};
