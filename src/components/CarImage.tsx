import React from 'react';
import { Text, View } from 'react-native';
import { GameIcon } from '@components/GameIcon';
import { TIER_ICONS } from '@img/gameIcons';
import type { Car } from '@/types';

/** Класс машины: из поля tier, а у старых сохранений — из id вида «market-t2-camry-…» */
export const getCarTier = (car: Pick<Car, 'id' | 'tier'>): number | undefined => {
  if (car.tier) return car.tier;
  const match = car.id.match(/-t(\d)-/);
  return match ? Number(match[1]) : undefined;
};

interface CarImageProps {
  car: Pick<Car, 'id' | 'tier' | 'emoji'>;
  size: number;
}

/** Картинка класса машины; если класс неизвестен — прежний эмодзи */
export const CarImage = ({ car, size }: CarImageProps) => {
  const tier = getCarTier(car);
  const icon = tier ? TIER_ICONS[tier] : undefined;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {icon ? (
        <GameIcon source={icon} size={size} />
      ) : (
        <Text style={{ fontSize: size * 0.75 }}>{car.emoji}</Text>
      )}
    </View>
  );
};
