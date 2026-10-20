import React from 'react';
import { type ImageSourcePropType, type ImageStyle, type StyleProp } from 'react-native';
import { Image } from 'expo-image';

interface GameIconProps {
  source: ImageSourcePropType;
  /** Сторона квадрата, в который вписывается картинка (пропорции сохраняются) */
  size: number;
  style?: StyleProp<ImageStyle>;
}

/**
 * Картинка-иконка из assets/icons, вписанная в квадрат size×size.
 * expo-image держит картинки в памяти: после предзагрузки при запуске иконка рисуется сразу,
 * в том числе при каждом новом открытии экрана (обычный Image на iOS грузил её заново).
 */
export const GameIcon = ({ source, size, style }: GameIconProps) => (
  <Image
    source={source as number}
    style={[{ width: size, height: size }, style]}
    contentFit="contain"
    cachePolicy="memory-disk"
    transition={0}
    // В браузере — без «ленивой» загрузки: иконка нужна сразу, а не когда долистают
    loading="eager"
    priority="high"
  />
);
