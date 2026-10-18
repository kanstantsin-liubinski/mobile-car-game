import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { marketStyles } from '@styles/styles';
import { useEconomy } from '@hooks/EconomyContext';
import { useGarageContext } from '@hooks/GarageContext';
import { useSoldCarsContext } from '@hooks/SoldCarsContext';
import { useMarketContext } from '@hooks/MarketContext';
import { colors } from '@styles/colors';
import { calculateMaxCondition } from '../utils/priceCalculator';
import { TIER_NAMES, TIER_UNLOCK_LEVELS } from '../data/carModels';
import { useExperienceContext } from '@hooks/ExperienceContext';
import { getMarketById } from '../data/cityBuildings';
import { LocationHeader } from '@components/LocationHeader';
import { SlotPickerModal } from '@components/SlotPickerModal';
import { GameIcon } from '@components/GameIcon';
import { CarImage } from '@components/CarImage';
import { CarSpecs } from '@components/CarSpecs';
import { ICONS, BUILDING_ICONS } from '@img/gameIcons';
import { TierTabs } from '@components/TierTabs';
import type { Car } from '@/types';

/** Форматирует оставшееся время: MM:SS */
function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

interface MarketScreenProps {
  marketId: string;
  onBack: () => void;
}

export const MarketScreen = ({ marketId, onBack }: MarketScreenProps) => {
  const { balance, buyCar } = useEconomy();
  const { addCar, hasCar } = useGarageContext();
  const { isSold } = useSoldCarsContext();
  const { getListingsForTier, removeListing, getTimeRemaining, currentTime } = useMarketContext();
  const { isTierUnlocked, getRequiredLevelForTier } = useExperienceContext();

  const [selectedTier, setSelectedTier] = useState(1);
  const [carToBuy, setCarToBuy] = useState<Car | null>(null);

  const getConditionColor = (condition: number) => {
    if (condition >= 80) return colors.primary;
    if (condition >= 50) return '#F59E0B';
    if (condition >= 20) return '#EF4444';
    return '#991B1B';
  };

  const handleBuyCar = (car: Car) => {
    if (balance >= car.price) {
      setCarToBuy(car);
    }
  };

  // Деньги списываем только после выбора слота, чтобы «Отмена» ничего не стоила
  const confirmPurchase = (car: Car, slotIndex: number) => {
    // Деньги уходят, машина становится активом бизнеса
    if (!buyCar(car)) return;
    addCar(car, slotIndex);
    removeListing(car.id);
    setCarToBuy(null);
  };

  const tierListings = getListingsForTier(marketId, selectedTier);
  const market = getMarketById(marketId);

  return (
    <View style={{ flex: 1 }}>
    <LocationHeader title={market?.name ?? 'Авторынок'} icon={BUILDING_ICONS[marketId]} emoji={market?.emoji ?? '🏪'} onBack={onBack} />
    <ScrollView style={[marketStyles.container, { paddingTop: 8 }]}>
      {/* ─── Tier Tabs ──────────────────────────────────────────── */}
      <TierTabs selectedTier={selectedTier} onSelect={setSelectedTier} />

      {/* ─── Cars List ──────────────────────────────────────────── */}
      <View style={marketStyles.carsList}>
        {!isTierUnlocked(selectedTier) && (
          <View style={marketStyles.emptyContainer}>
            <Text style={{ fontSize: 36, marginBottom: 12 }}>🔒</Text>
            <Text style={[marketStyles.emptyText, { fontSize: 15, fontWeight: '600' }]}>
              Класс «{TIER_NAMES[selectedTier]}» откроется на {TIER_UNLOCK_LEVELS[selectedTier]} уровне
            </Text>
            <Text style={[marketStyles.emptyText, { marginTop: 6, fontSize: 13 }]}>
              Продавайте машины и зарабатывайте опыт, чтобы повысить уровень!
            </Text>
          </View>
        )}

        {isTierUnlocked(selectedTier) && tierListings.length === 0 && (
          <View style={marketStyles.emptyContainer}>
            <Text style={marketStyles.emptyText}>
              Нет доступных автомобилей. Новые появятся скоро!
            </Text>
          </View>
        )}

        {isTierUnlocked(selectedTier) && tierListings.map((listing) => {
          const { car } = listing;
          const owned = hasCar(car.id);
          const sold = isSold(car.id);

          if (owned || sold) return null;

          const canAfford = balance >= car.price;
          const maxCondition = calculateMaxCondition(car.year, car.mileage);
          const timeRemaining = getTimeRemaining(car.id);
          const isUrgent = timeRemaining > 0 && timeRemaining < 2 * 60 * 1000; // < 2 мин

          return (
            <View key={car.id} style={marketStyles.carCard}>
              {/* Таймер */}
              <View style={marketStyles.timerContainer}>
                <GameIcon source={ICONS.timer} size={16} />
                <Text style={[marketStyles.timerText, isUrgent && marketStyles.timerTextUrgent]}>
                  {formatTimeRemaining(timeRemaining)}
                </Text>
              </View>

              <View style={marketStyles.carHeader}>
                <CarImage car={car} size={64} />
                <View style={marketStyles.carInfo}>
                  <Text style={marketStyles.carName}>{car.name}</Text>
                  <CarSpecs
                    speed={car.speed}
                    year={car.year}
                    mileage={car.mileage}
                    speedStyle={marketStyles.carSpeed}
                    metaStyle={marketStyles.carMeta}
                  />
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

      <SlotPickerModal car={carToBuy} onCancel={() => setCarToBuy(null)} onConfirm={confirmPurchase} />
    </ScrollView>
    </View>
  );
};
