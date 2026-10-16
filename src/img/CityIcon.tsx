import React from 'react';
import { MaterialIcons } from '@expo/vector-icons';

interface IconProps {
  size?: number;
  color: string;
}

/**
 * Икона Города
 * TODO: Заменить на свою кастомную иконку
 * Поддерживаемые форматы: PNG, SVG
 * Рекомендуемый размер: 24x24 px
 */
export const CityIcon = ({ size = 24, color }: IconProps) => {
  return <MaterialIcons name="location-city" size={size} color={color} />;
};
