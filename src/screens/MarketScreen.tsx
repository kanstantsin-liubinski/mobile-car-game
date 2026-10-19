import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { marketStyles } from '@styles/styles';
import { useEconomy } from '@hooks/EconomyContext';
import { useGarageContext } from '@hooks/GarageContext';
import { useSoldCarsContext } from '@hooks/SoldCarsContext';
import { useMarketContext, type HotOffer } from '@hooks/MarketContext';
import type { MarketFocus } from '@hooks/useNavigation';
import { colors } from '@styles/colors';
import { calculateMaxCondition } from '../utils/priceCalculator';
import type { MarketListing } from '../utils/marketGenerator';
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
import { DAY_MS } from '../economy/economy';
import { formatHotTimer } from '../economy/format';
import type { Car } from '@/types';

const HOT_COLOR = '#F97316';

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
  /** Открыть сразу на нужном классе (тап по уведомлению о горящем предложении) */
  focus?: MarketFocus | null;
}

export const MarketScreen = ({ marketId, onBack, focus }: MarketScreenProps) => {
  const { balance, buyCar } = useEconomy();
  const { addCar, hasCar } = useGarageContext();
  const { isSold } = useSoldCarsContext();
  const { getListingsForTier, removeListing, getTimeRemaining, hotOffer, getHotListing } = useMarketContext();
  const { isTierUnlocked } = useExperienceContext();

  const [selectedTier, setSelectedTier] = useState(focus?.tier ?? 1);
  const [carToBuy, setCarToBuy] = useState<Car | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Каждый новый запрос фокуса переключает вкладку и прокручивает к началу, где стоит горящее предложение
  useEffect(() => {
    if (!focus) return;
    setSelectedTier(focus.tier);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [focus?.nonce]);

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
  const hotListing = getHotListing(marketId, selectedTier);
  const market = getMarketById(marketId);
  const hotHere = hotOffer && hotOffer.marketId === marketId ? hotOffer : null;

  const renderCard = (listing: MarketListing, hot: HotOffer | null) => {
    const { car } = listing;
    if (hasCar(car.id) || isSold(car.id)) return null;

    const canAfford = balance >= car.price;
    const maxCondition = calculateMaxCondition(car.year, car.mileage);
    const timeRemaining = getTimeRemaining(car.id);
    const isUrgent = hot ? timeRemaining < DAY_MS : timeRemaining > 0 && timeRemaining < 2 * 60 * 1000; // < 2 мин

    return (
      <View key={car.id} style={[marketStyles.carCard, hot && styles.hotCard]}>
        {hot && (
          <View style={styles.hotBadgeRow}>
            <Text style={styles.hotBadge}>🔥 Срочная продажа</Text>
            <Text style={styles.hotDiscount}>−{Math.round(hot.discount * 100)}%</Text>
          </View>
        )}

        {/* Таймер */}
        <View style={[marketStyles.timerContainer, hot && styles.hotTimer]}>
          <GameIcon source={ICONS.timer} size={16} />
          <Text style={[marketStyles.timerText, isUrgent && marketStyles.timerTextUrgent, hot && styles.hotTimerText]}>
            {hot ? formatHotTimer(timeRemaining, DAY_MS) : formatTimeRemaining(timeRemaining)}
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
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[marketStyles.carPrice, hot && { color: HOT_COLOR }]}>${car.price.toLocaleString()}</Text>
            {hot && <Text style={styles.normalPrice}>${hot.normalPrice.toLocaleString()}</Text>}
          </View>
        </View>

        {hot && (
          <Text style={styles.hotNote}>
            Обычная цена ${hot.normalPrice.toLocaleString()} — экономия ${(hot.normalPrice - hot.price).toLocaleString()}
          </Text>
        )}

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
          style={[marketStyles.buyButton, hot && { backgroundColor: HOT_COLOR }, !canAfford && marketStyles.buyButtonDisabled]}
          onPress={() => handleBuyCar(car)}
          disabled={!canAfford}
        >
          <Text style={[marketStyles.buyButtonText, !canAfford && { color: colors.textTertiary }]}>
            Купить
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
    <LocationHeader title={market?.name ?? 'Авторынок'} icon={BUILDING_ICONS[marketId]} emoji={market?.emoji ?? '🏪'} onBack={onBack} />
    <ScrollView ref={scrollRef} style={[marketStyles.container, { paddingTop: 8 }]}>
      {/* ─── Tier Tabs ──────────────────────────────────────────── */}
      <TierTabs selectedTier={selectedTier} onSelect={setSelectedTier} hotTier={hotHere?.tier ?? null} />

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

        {isTierUnlocked(selectedTier) && tierListings.length === 0 && !hotListing && (
          <View style={marketStyles.emptyContainer}>
            <Text style={marketStyles.emptyText}>
              Нет доступных автомобилей. Новые появятся скоро!
            </Text>
          </View>
        )}

        {/* Горящее предложение — первым в списке своего класса */}
        {isTierUnlocked(selectedTier) && hotListing && hotHere && renderCard(hotListing, hotHere)}
        {isTierUnlocked(selectedTier) && tierListings.map((listing) => renderCard(listing, null))}
      </View>

      <SlotPickerModal car={carToBuy} onCancel={() => setCarToBuy(null)} onConfirm={confirmPurchase} />
    </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  hotCard: {
    borderColor: HOT_COLOR,
    borderWidth: 2,
    backgroundColor: 'rgba(249, 115, 22, 0.08)',
  },
  hotBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  hotBadge: {
    fontSize: 14,
    fontWeight: '800',
    color: HOT_COLOR,
  },
  hotDiscount: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    backgroundColor: '#EF4444',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  hotTimer: {
    top: 14,
  },
  hotTimerText: {
    color: HOT_COLOR,
    fontWeight: '700',
  },
  normalPrice: {
    fontSize: 13,
    color: colors.textTertiary,
    textDecorationLine: 'line-through',
  },
  hotNote: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: -8,
    marginBottom: 12,
  },
});
