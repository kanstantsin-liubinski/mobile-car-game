import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { marketStyles } from '@styles/styles';
import { colors } from '@styles/colors';
import { useEconomy } from '@hooks/EconomyContext';
import { useGarageContext } from '@hooks/GarageContext';
import { useExperienceContext } from '@hooks/ExperienceContext';
import { LocationHeader } from '@components/LocationHeader';
import { SlotPickerModal } from '@components/SlotPickerModal';
import { TierTabs } from '@components/TierTabs';
import { CarImage } from '@components/CarImage';
import { CarSpecs } from '@components/CarSpecs';
import { BUILDING_ICONS } from '@img/gameIcons';
import { CAR_MODELS_BY_TIER, TIER_NAMES, TIER_UNLOCK_LEVELS, type CarModel } from '../data/carModels';
import { DEALERSHIP } from '../data/cityBuildings';
import { calculateCarPrice } from '../utils/priceCalculator';
import { tradePurchasePrice } from '../economy/carCondition';
import type { Car } from '@/types';

const NEW_CAR_YEAR = 2026; // совпадает с CURRENT_YEAR в priceCalculator
const NEW_CAR_MILEAGE = 0;
const NEW_CAR_CONDITION = 100;

/**
 * Наценка дилера. Новая машина в гараже стоит столько же, сколько её рыночная цена,
 * поэтому без наценки её можно было бы сразу перепродать с +10% без риска.
 */
const DEALER_MARKUP = 1.15;

/** Рыночная стоимость новой машины (столько она стоит в гараже) */
const getNewCarMarketPrice = (model: CarModel): number =>
  calculateCarPrice(model.basePrice, {
    year: NEW_CAR_YEAR,
    mileage: NEW_CAR_MILEAGE,
    condition: NEW_CAR_CONDITION,
  });

/** Цена в автосалоне — рыночная стоимость плюс наценка дилера */
const getNewCarPrice = (model: CarModel): number => Math.round(getNewCarMarketPrice(model) * DEALER_MARKUP);

let newCarCounter = 0;

/** Новая машина из салона: текущий год, без пробега, 100% состояние */
const createNewCar = (model: CarModel): Car => {
  newCarCounter++;
  return {
    id: `dealer-${model.modelId}-${Date.now()}-${newCarCounter}`,
    name: model.name,
    price: getNewCarPrice(model),
    marketPrice: getNewCarMarketPrice(model),
    emoji: model.emoji,
    speed: model.speed,
    description: model.description,
    year: NEW_CAR_YEAR,
    mileage: NEW_CAR_MILEAGE,
    condition: NEW_CAR_CONDITION,
    // Новая машина: ЛКП заводское, максимум — 100%
    paintCondition: 100,
    maxCondition: 100,
    basePrice: model.basePrice,
    tier: model.tier,
  };
};

interface DealershipScreenProps {
  onBack: () => void;
}

export const DealershipScreen = ({ onBack }: DealershipScreenProps) => {
  const { balance, buyCar, state: economy } = useEconomy();
  const tradeLevel = economy.player.trade.level;
  const { addCar } = useGarageContext();
  const { isTierUnlocked } = useExperienceContext();

  const [selectedTier, setSelectedTier] = useState(1);
  const [carToBuy, setCarToBuy] = useState<Car | null>(null);

  const unlocked = isTierUnlocked(selectedTier);
  const models = CAR_MODELS_BY_TIER[selectedTier] ?? [];

  const confirmPurchase = (car: Car, slotIndex: number) => {
    if (!buyCar(car)) return;
    addCar(car, slotIndex);
    setCarToBuy(null);
  };

  return (
    <View style={{ flex: 1 }}>
      <LocationHeader title={DEALERSHIP.name} icon={BUILDING_ICONS[DEALERSHIP.id]} emoji={DEALERSHIP.emoji} onBack={onBack} />
      <ScrollView style={[marketStyles.container, { paddingTop: 8 }]}>
        <TierTabs selectedTier={selectedTier} onSelect={setSelectedTier} />

        <View style={marketStyles.carsList}>
          {!unlocked && (
            <View style={marketStyles.emptyContainer}>
              <Text style={{ fontSize: 36, marginBottom: 12 }}>🔒</Text>
              <Text style={[marketStyles.emptyText, { fontSize: 15, fontWeight: '600' }]}>
                Класс «{TIER_NAMES[selectedTier]}» откроется на {TIER_UNLOCK_LEVELS[selectedTier]} уровне
              </Text>
            </View>
          )}

          {unlocked &&
            models.map((model) => {
              // Навык «Торговля» снижает цену покупки и в салоне
              const price = tradePurchasePrice(getNewCarPrice(model), tradeLevel);
              const canAfford = balance >= price;

              return (
                <View key={model.modelId} style={marketStyles.carCard}>
                  <View style={marketStyles.carHeader}>
                    <CarImage car={{ id: model.modelId, tier: model.tier, emoji: model.emoji }} size={64} />
                    <View style={marketStyles.carInfo}>
                      <Text style={marketStyles.carName}>{model.name}</Text>
                      <CarSpecs
                        speed={model.speed}
                        year={NEW_CAR_YEAR}
                        mileage={NEW_CAR_MILEAGE}
                        speedStyle={marketStyles.carSpeed}
                        metaStyle={marketStyles.carMeta}
                        suffix="✨ Новая"
                      />
                    </View>
                    <Text style={marketStyles.carPrice}>${price.toLocaleString('ru-RU')}</Text>
                  </View>

                  <Text style={marketStyles.carDescription}>{model.description}</Text>

                  <TouchableOpacity
                    style={[marketStyles.buyButton, !canAfford && marketStyles.buyButtonDisabled]}
                    onPress={() => setCarToBuy({ ...createNewCar(model), price })}
                    disabled={!canAfford}
                  >
                    <Text style={[marketStyles.buyButtonText, !canAfford && { color: colors.textTertiary }]}>
                      Купить новую
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
