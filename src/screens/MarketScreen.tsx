import { formatMoney } from '../economy/format';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { TouchableOpacity } from '@components/Touchable';
import { marketStyles } from '@styles/styles';
import { useEconomy } from '@hooks/EconomyContext';
import { useGarageContext } from '@hooks/GarageContext';
import { useSoldCarsContext } from '@hooks/SoldCarsContext';
import { useMarketContext, type HotOffer } from '@hooks/MarketContext';
import type { MarketFocus } from '@hooks/useNavigation';
import { colors } from '@styles/colors';
import { ListingDiagnostics } from '@components/ListingDiagnostics';
import { tradePurchaseBonus, tradePurchasePrice } from '../economy/carCondition';
import type { MarketListing } from '../utils/marketGenerator';
import { TIER_NAMES, TIER_UNLOCK_LEVELS } from '../data/carModels';
import { useExperienceContext } from '@hooks/ExperienceContext';
import { getMarketById } from '../data/cityBuildings';
import { LocationHeader } from '@components/LocationHeader';
import { SlotPickerModal } from '@components/SlotPickerModal';
import { AuctionCard } from '@components/market/AuctionCard';
import { GameIcon } from '@components/GameIcon';
import { CarImage } from '@components/CarImage';
import { CarSpecs } from '@components/CarSpecs';
import { ICONS, BUILDING_ICONS } from '@img/gameIcons';
import { TierTabs } from '@components/TierTabs';
import { DAY_MS } from '../economy/economy';
import { formatHotTimer } from '../economy/format';
import type { Car } from '@/types';

const HOT_COLOR = '#F97316';


interface MarketScreenProps {
  marketId: string;
  onBack: () => void;
  /** Открыть сразу на нужном классе (тап по уведомлению о горящем предложении) */
  focus?: MarketFocus | null;
}

export const MarketScreen = ({ marketId, onBack, focus }: MarketScreenProps) => {
  const { balance, buyCar, state: economy } = useEconomy();
  const tradeLevel = economy.player.trade.level;
  /** Цена для игрока: цена объявления (уже с коэффициентом продавца и скидкой горящего) × навык «Торговля» */
  const priceFor = (car: Car) => tradePurchasePrice(car.price, tradeLevel);
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

  // В покупку уходит машина с итоговой ценой: скидка навыка применяется один раз, здесь
  const handleBuyCar = (car: Car) => {
    const finalPrice = priceFor(car);
    if (balance >= finalPrice) {
      setCarToBuy({ ...car, price: finalPrice });
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

    const finalPrice = priceFor(car);
    const canAfford = balance >= finalPrice;
    const timeRemaining = getTimeRemaining(car.id);
    const isUrgent = timeRemaining > 0 && timeRemaining < (hot ? 1 : 3) * DAY_MS;

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
            {formatHotTimer(timeRemaining, DAY_MS)}
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
            <Text style={[marketStyles.carPrice, hot && { color: HOT_COLOR }]}>{formatMoney(finalPrice * 100)}</Text>
            {hot && <Text style={styles.normalPrice}>{formatMoney(hot.normalPrice * 100)}</Text>}
            {tradeLevel > 1 && (
              <Text style={styles.tradeNote}>
                Торговля −{(tradePurchaseBonus(tradeLevel) * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%
              </Text>
            )}
          </View>
        </View>

        {hot && (
          <Text style={styles.hotNote}>
            Обычная цена {formatMoney(hot.normalPrice * 100)} — экономия {formatMoney((hot.normalPrice - hot.price) * 100)}
          </Text>
        )}

        <ListingDiagnostics listing={listing} />

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
      {/* Аукцион (с 30 уровня) — над классами */}
      <AuctionCard />

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
  tradeNote: {
    fontSize: 11,
    color: '#22C55E',
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
