import React from 'react';
import { MaterialIcons } from '@expo/vector-icons';

interface IconProps {
  size?: number;
  color: string;
}

/**
 * Икона Авторынка
 * TODO: Заменить на свою кастомную иконку
 * Поддерживаемые форматы: PNG, SVG
 * Рекомендуемый размер: 24x24 px
 */
export const MarketIcon = ({ size = 24, color }: IconProps) => {
  return <MaterialIcons name="store" size={size} color={color} />;
};
