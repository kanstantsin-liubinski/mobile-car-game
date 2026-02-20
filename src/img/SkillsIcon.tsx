import React from 'react';
import { MaterialIcons } from '@expo/vector-icons';

interface IconProps {
  size?: number;
  color: string;
}

/**
 * Икона Навыков
 * TODO: Заменить на свою кастомную иконку
 * Поддерживаемые форматы: PNG, SVG
 * Рекомендуемый размер: 24x24 px
 */
export const SkillsIcon = ({ size = 24, color }: IconProps) => {
  return <MaterialIcons name="emoji-events" size={size} color={color} />;
};
