import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Modal,
  Pressable,
  Platform,
} from "react-native";
import { SheetModal } from "@components/SheetModal";
import { TouchableOpacity } from "@components/Touchable";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { garageStyles } from "@styles/styles";
import { useGarageContext } from "@hooks/GarageContext";
import { useSafeAreaWeb } from "@hooks/useSafeAreaWeb";
import { useEconomy } from "@hooks/EconomyContext";
import { FireMechanicModal } from "@components/finance/FireMechanicModal";
import { SheetHeader } from "@components/SheetHeader";
import { WorkerTrainingModal } from "@components/WorkerTrainingModal";
import { formatGameDays, formatMoney, pluralDays } from "../economy/format";
import { DAY_MS, MECHANIC_MONTHLY_SALARY_CENTS } from "../economy/economy";
import { skillMultiplier } from "../economy/progression";

/** Самая долгая продажа (+10% к цене) в игровых днях; −10% — мгновенно */
const MAX_SELL_DAYS = 30;
import { colors } from "@styles/colors";
import { carValue, tradeSaleBonus, tradeSalePrice } from "../economy/carCondition";
import { ACTION_COLORS, CarActions, CarStatusPanels, PaintBars } from "@components/garage/CarWorkPanels";
import { EquipmentModal, PainterModal } from "@components/garage/EquipmentModal";
import { MechanicsModal } from "@components/garage/MechanicsModal";
import { assetCostCents, hasEquipment } from "../economy/economy";
import type { Mechanic } from "@/types";
import { getGarageById } from "../data/cityBuildings";
import { LocationHeader } from "@components/LocationHeader";
import { GameIcon } from "@components/GameIcon";
import { CarImage } from "@components/CarImage";
import { CarSpecs } from "@components/CarSpecs";
import { ICONS, BUILDING_ICONS, getMechanicAvatar } from "@img/gameIcons";

export const GarageScreen: React.FC = () => {
  const {
    garage,
    garageSlots,
    garageId,
    mechanics,
    mechanicRepairs,
    mechanicRepairsProgress,
    mechanicRepairsCondition,
    mechanicRepairsRemaining,
    repairCar,
    hireMechanic,
    fireMechanic,
    changeMechanicSlot,
    changeCarSlot,
    startMechanicRepair,
    cancelMechanicRepair,
    activeSells,
    activeSellsProgress,
    activeSellsRemaining,
    startSell,
    cancelSell,
    boothSlot,
    servicePaints,
    boothJob,
    painters,
    firePainter,
  } = useGarageContext();
  const { state: economyState, playerTapMultiplier } = useEconomy();
  const [mechanicToFire, setMechanicToFire] = useState<string | null>(null);
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
  const [mechanicForTraining, setMechanicForTraining] = useState<string | null>(null);
  const [showMechanicsModal, setShowMechanicsModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number>(0); // Выбранный слот гаража
  const [showEquipment, setShowEquipment] = useState(false);
  const [showPainter, setShowPainter] = useState(false);
  const [painterToFire, setPainterToFire] = useState<Mechanic | null>(null);
  const tradeLevel = economyState.player.trade.level;
  const boothOwned = hasEquipment(economyState, "paint_booth");
  const garageInfo = getGarageById(garageId);

  // Ручной тап: 0,1% состояния × навык игрока «Механик» (+5% за уровень)
  const tapRepairPercent = 0.1 * playerTapMultiplier;

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

  /** Прибыль: минус — красный, плюс — зелёный, ноль — белый */
  const profitColor = (v: number) => (v > 0 ? "#22C55E" : v < 0 ? "#EF4444" : colors.textPrimary);

  const getConditionColor = (condition: number) => {
    if (condition >= 80) return colors.primary;
    if (condition >= 50) return "#F59E0B";
    if (condition >= 20) return "#EF4444";
    return "#991B1B";
  };

  // Время продажи в игровых днях в зависимости от корректировки цены:
  // −10% — сразу, 0% — 15 дней, +10% — 30 дней (1 игровой день = 10 сек)
  const calculateSellDays = (adjustment: number): number => {
    const normalizedAdjustment = (adjustment + 10) / 20; // 0..1
    return Math.round(normalizedAdjustment * MAX_SELL_DAYS);
  };
  const calculateSellDuration = (adjustment: number): number => calculateSellDays(adjustment) * DAY_MS;

  // Ползунок ±10% к рыночной цене, затем один раз бонус навыка «Торговля» к итоговой выручке
  const calculateFinalSellPrice = (
    basePrice: number,
    adjustment: number,
  ): number => {
    const adjustmentPercent = adjustment / 100; // Convert to decimal (e.g., 5 -> 0.05)
    return tradeSalePrice(Math.round(basePrice * (1 + adjustmentPercent)), tradeLevel);
  };

  /** Себестоимость машины: цена покупки + затраты после покупки (покраска) */
  const carCost = (carId: string, fallback: number): number => {
    const asset = economyState.assets[carId];
    return asset ? assetCostCents(asset) / 100 : fallback;
  };

  const handleSellCar = (carId: string) => {
    const car = garage.find((c) => c.id === carId);
    if (!car) return;
    const cost = carCost(carId, car.price);

    // Рыночная стоимость по общему состоянию (техника + ЛКП)
    const baseSellPrice = carValue(car.basePrice, car);

    const finalSellPrice = calculateFinalSellPrice(baseSellPrice, 0); // 0% at start
    // Прибыль — от себестоимости (покупка + покраска), как в итогах сделки
    const profit = Math.round((finalSellPrice - cost) * 100) / 100;
    const profitPercent = ((profit / cost) * 100).toFixed(1);

    setSelectedCarForSale({
      id: carId,
      name: car.name,
      boughtPrice: cost,
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
    const profit = Math.round((finalSellPrice - selectedCarForSale.boughtPrice) * 100) / 100;
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


  return (
    <View style={{ flex: 1 }}>
    <LocationHeader title={garageInfo?.name ?? "Гараж"} icon={BUILDING_ICONS[garageId]} emoji={garageInfo?.emoji ?? "🏠"} />
    <ScrollView style={{ flex: 1 }} contentContainerStyle={garageStyles.scrollContent}>
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
              paddingVertical: 8,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
            }}
            onPress={() => setShowMechanicsModal(true)}
          >
            <GameIcon source={ICONS.hireMechanic} size={22} />
            <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "700", flexShrink: 1 }} numberOfLines={1} adjustsFontSizeToFit>
              Механики
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: colors.cardBg,
              borderWidth: 1,
              borderColor: colors.primary,
              borderRadius: 10,
              paddingVertical: 8,
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={() => setShowEquipment(true)}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "700" }} numberOfLines={1} adjustsFontSizeToFit>
              Оборудование
            </Text>
          </TouchableOpacity>
          {boothOwned && (
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: colors.cardBg,
                borderWidth: 1,
                borderColor: "#38BDF8",
                borderRadius: 10,
                paddingVertical: 8,
                alignItems: "center",
                justifyContent: "center",
              }}
              onPress={() => setShowPainter(true)}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "700" }} numberOfLines={1} adjustsFontSizeToFit>
                Маляр
              </Text>
            </TouchableOpacity>
          )}
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
            const isBooth = boothSlot === slotIndex;

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
                {(isBooth || carInSlot?.clientOrderId) && (
                  <Text style={{ position: "absolute", top: 2, right: 4, fontSize: 11 }}>
                    {isBooth ? "🎨" : "👤"}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {boothSlot === selectedSlot && (
          <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 6 }}>
            🎨 Слот занят покрасочной камерой: здесь красят, механический ремонт не ведётся.
          </Text>
        )}
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
              const currentPrice = carValue(car.basePrice, car);
              const isClient = !!car.clientOrderId;
              const inBooth = boothSlot !== null && car.slotIndex === boothSlot;
              const paintBusy = !!servicePaints[car.id] || boothJob?.carId === car.id;
              const cost = carCost(car.id, car.price);
              const priceChange = Math.round(currentPrice - cost);
              const priceChangePercent = (
                (currentPrice / cost - 1) *
                100
              ).toFixed(1);

              // Получаем механика на этом слоте
              const mechanicAtSlot = getMechanicAtSlot(car.slotIndex);
              const canUseMechanic =
                mechanicAtSlot && mechanicAtSlot.hired && car.condition < car.maxCondition && !inBooth && !servicePaints[car.id];

              return (
                <View
                  key={car.id}
              >
                <View style={[garageStyles.carCard]}>
                  <View style={garageStyles.carHeader}>
                    <View style={{ marginRight: 12 }}>
                      <CarImage car={car} size={64} />
                    </View>
                    <View style={garageStyles.carInfo}>
                      <Text style={garageStyles.carName}>{car.name}</Text>
                      <CarSpecs
                        speed={car.speed}
                        year={car.year}
                        mileage={car.mileage}
                        speedStyle={garageStyles.carSpeed}
                        metaStyle={garageStyles.carMeta}
                      />
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
                            fontVariant: ["tabular-nums"],
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

                  <PaintBars car={car} />

                  {!isClient && (
                  <View style={garageStyles.priceContainer}>
                    <Text style={garageStyles.priceLabel}>Текущая цена:</Text>
                    <Text style={[garageStyles.currentPrice, { fontVariant: ["tabular-nums"] }]} numberOfLines={1}>
                      {formatMoney(Math.round(currentPrice * 100))}
                    </Text>
                    <Text
                      style={[
                        garageStyles.priceChange,
                        {
                          color: profitColor(priceChange),
                          fontVariant: ["tabular-nums"],
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {formatMoney(Math.round(priceChange * 100), { sign: true })} ({priceChangePercent}%)
                    </Text>
                  </View>
                  )}

                  <CarStatusPanels car={car} />

                  <CarActions
                    car={car}
                    mechanic={mechanicAtSlot?.hired ? mechanicAtSlot : null}
                    tapRepairPercent={tapRepairPercent}
                    onRepair={() => repairCar(car.id)}
                    onSell={() => handleSellCar(car.id)}
                    onMechanic={() => mechanicAtSlot && handleMechanicRepair(car.id, mechanicAtSlot.id)}
                  />

                </View>
              </View>
            );
          })}
        </View>
      )}

      <SheetModal visible={selectedCarForSale !== null} onRequestClose={() => {
          setSelectedCarForSale(null);
          setPriceAdjustment(10);
        }}>
          <View
            style={[
              garageStyles.modalContent,
              { paddingBottom: insets.bottom + 12 },
            ]}
          >
            <SheetHeader
              title="Продажа машины"
              onClose={() => {
                setSelectedCarForSale(null);
                setPriceAdjustment(10);
              }}
            />

            <View style={garageStyles.modalInfoBlock}>
              <Text style={garageStyles.modalLabel}>Машина:</Text>
              <Text style={garageStyles.modalCarName}>
                {selectedCarForSale?.name}
              </Text>
            </View>

            <View style={garageStyles.modalInfoBlock}>
              <Text style={garageStyles.modalLabel}>Себестоимость (покупка + затраты):</Text>
              <Text style={garageStyles.modalPrice}>
                {formatMoney(Math.round((selectedCarForSale?.boughtPrice ?? 0) * 100))}
              </Text>
            </View>

            <View style={garageStyles.modalInfoBlock}>
              <Text style={garageStyles.modalLabel}>Продаём за:</Text>
              <Text
                style={[garageStyles.modalPrice, { color: colors.primary }]}
              >
                {formatMoney(Math.round((selectedCarForSale?.sellPrice ?? 0) * 100))}
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

            {tradeLevel > 1 && (
              <View style={garageStyles.modalInfoBlock}>
                <Text style={garageStyles.modalLabel}>Навык «Торговля»:</Text>
                <Text style={[garageStyles.modalPrice, { color: "#22C55E" }]}>
                  +{(tradeSaleBonus(tradeLevel) * 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}% к выручке (уже в цене)
                </Text>
              </View>
            )}

            {/* Time to sell display */}
            <View style={garageStyles.modalInfoBlock}>
              <Text style={garageStyles.modalLabel}>Время продажи:</Text>
              <Text
                style={[garageStyles.modalPrice, { color: colors.primary }]}
              >
                {(() => {
                  const days = calculateSellDays(sliderValueToPercent(priceAdjustment));
                  return days === 0 ? "Сразу" : pluralDays(days);
                })()}
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
                    color: profitColor(selectedCarForSale?.profit ?? 0),
                  },
                ]}
              >
                {formatMoney(Math.round((selectedCarForSale?.profit ?? 0) * 100), { sign: true })} (
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
      </SheetModal>

      <MechanicsModal visible={showMechanicsModal} onClose={() => setShowMechanicsModal(false)} />

      <EquipmentModal visible={showEquipment} onClose={() => setShowEquipment(false)} />
      <PainterModal
        visible={showPainter}
        onClose={() => setShowPainter(false)}
        onTraining={(p) => setMechanicForTraining(p.id)}
        onFire={(p) => setPainterToFire(p)}
      >
        {/* Навык маляра и увольнение — слоями внутри окна маляра */}
        <WorkerTrainingModal
          mechanic={painters.find((m) => m.id === mechanicForTraining) ?? null}
          onClose={() => setMechanicForTraining(null)}
        />
        <FireMechanicModal
          mechanic={painterToFire}
          onCancel={() => setPainterToFire(null)}
          onConfirm={(id) => {
            firePainter(id);
            setPainterToFire(null);
          }}
        />
      </PainterModal>
    </ScrollView>
    </View>
  );
};
