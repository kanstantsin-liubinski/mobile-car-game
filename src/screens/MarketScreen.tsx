import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Platform, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { marketStyles, garageStyles } from '@styles/styles';
import { useBalanceContext } from '@hooks/BalanceContext';
import { useGarageContext } from '@hooks/GarageContext';
import { useSoldCarsContext } from '@hooks/SoldCarsContext';
import { useMarketContext } from '@hooks/MarketContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { colors } from '@styles/colors';
import { calculateMaxCondition } from '../utils/priceCalculator';
import { TIER_NAMES, TIER_EMOJIS, TOTAL_TIERS, TIER_UNLOCK_LEVELS } from '../data/carModels';
import { useExperienceContext } from '@hooks/ExperienceContext';
import type { Car } from '@/types';

/** Форматирует оставшееся время: MM:SS */
function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export const MarketScreen = () => {
  const { balance, removeBalance } = useBalanceContext();
  const { addCar, hasCar, garage, garageSlots } = useGarageContext();
  const { isSold } = useSoldCarsContext();
  const { getListingsForTier, removeListing, getTimeRemaining, currentTime } = useMarketContext();
  const { isTierUnlocked, getRequiredLevelForTier } = useExperienceContext();
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;

  const [selectedTier, setSelectedTier] = useState(1);
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [carToBuy, setCarToBuy] = useState<Car | null>(null);

  // Custom scrollbar state for tier tabs
  const [scrollIndicator, setScrollIndicator] = useState({ thumbWidth: 0, thumbLeft: 0, visible: false });
  const tierScrollContentWidth = useRef(0);
  const tierScrollViewWidth = useRef(0);

  const updateScrollIndicator = (scrollX: number) => {
    const contentW = tierScrollContentWidth.current;
    const viewW = tierScrollViewWidth.current;
    if (contentW <= viewW || viewW === 0) {
      setScrollIndicator({ thumbWidth: 0, thumbLeft: 0, visible: false });
      return;
    }
    const trackWidth = viewW;
    const thumbW = Math.max((viewW / contentW) * trackWidth, 30);
    const maxScroll = contentW - viewW;
    const scrollFraction = scrollX / maxScroll;
    const thumbLeft = scrollFraction * (trackWidth - thumbW);
    setScrollIndicator({ thumbWidth: thumbW, thumbLeft, visible: true });
  };

  const onTierScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    updateScrollIndicator(e.nativeEvent.contentOffset.x);
  };

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
      removeListing(carToBuy.id);
      setShowSlotModal(false);
      setCarToBuy(null);
      setSelectedSlot(null);
    }
  };

  const tierListings = getListingsForTier(selectedTier);

  return (
    <ScrollView style={marketStyles.container}>
      <Text style={marketStyles.title}>Авторынок</Text>

      {/* ─── Tier Tabs ──────────────────────────────────────────── */}
      <View style={marketStyles.tierTabsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={marketStyles.tierTabsContent}
          onScroll={onTierScroll}
          scrollEventThrottle={16}
          onContentSizeChange={(w) => {
            tierScrollContentWidth.current = w;
            updateScrollIndicator(0);
          }}
          onLayout={(e) => {
            tierScrollViewWidth.current = e.nativeEvent.layout.width;
            updateScrollIndicator(0);
          }}
        >
          {Array.from({ length: TOTAL_TIERS }, (_, i) => i + 1).map((tier) => {
            const isActive = selectedTier === tier;
            const unlocked = isTierUnlocked(tier);
            return (
              <TouchableOpacity
                key={tier}
                style={[
                  marketStyles.tierTab,
                  isActive && marketStyles.tierTabActive,
                  !unlocked && marketStyles.tierTabLocked,
                ]}
                onPress={() => setSelectedTier(tier)}
              >
                {!unlocked && (
                  <Text style={{ position: 'absolute', top: 4, right: 6, fontSize: 10 }}>🔒</Text>
                )}
                <Text style={[marketStyles.tierTabEmoji, !unlocked && { opacity: 0.4 }]}>
                  {TIER_EMOJIS[tier]}
                </Text>
                <Text
                  style={[
                    marketStyles.tierTabText,
                    isActive && marketStyles.tierTabTextActive,
                    !unlocked && { opacity: 0.4 },
                  ]}
                >
                  {TIER_NAMES[tier]}
                </Text>
                <Text
                  style={[
                    marketStyles.tierTabLevel,
                    isActive && marketStyles.tierTabLevelActive,
                    !unlocked && { opacity: 0.4 },
                  ]}
                >
                  {unlocked ? `Ур. ${tier}` : `🔒 Ур. ${TIER_UNLOCK_LEVELS[tier]}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {scrollIndicator.visible && (
          <View style={marketStyles.scrollTrack}>
            <View
              style={[
                marketStyles.scrollThumb,
                { width: scrollIndicator.thumbWidth, left: scrollIndicator.thumbLeft },
              ]}
            />
          </View>
        )}
      </View>

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
                <Text style={[marketStyles.timerText, isUrgent && marketStyles.timerTextUrgent]}>
                  ⏱ {formatTimeRemaining(timeRemaining)}
                </Text>
              </View>

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
