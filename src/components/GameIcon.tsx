import React from 'react';
import { Image, type ImageSourcePropType, type ImageStyle, type StyleProp } from 'react-native';

interface GameIconProps {
  source: ImageSourcePropType;
  /** Сторона квадрата, в который вписывается картинка (пропорции сохраняются) */
  size: number;
  style?: StyleProp<ImageStyle>;
}

/** Картинка-иконка из assets/icons, вписанная в квадрат size×size */
export const GameIcon = ({ source, size, style }: GameIconProps) => (
  <Image source={source} style={[{ width: size, height: size }, style]} resizeMode="contain" />
);
