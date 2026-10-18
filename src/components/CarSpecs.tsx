import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { GameIcon } from '@components/GameIcon';
import { ICONS } from '@img/gameIcons';

interface CarSpecsProps {
  speed: number;
  year: number;
  mileage: number;
  speedStyle: StyleProp<TextStyle>;
  metaStyle: StyleProp<TextStyle>;
  /** Дополнительный текст в конце строки года/пробега (например, «100%» у новых авто) */
  suffix?: string;
}

/** Строки «скорость» и «год • пробег» с иконками — для карточек машин */
export const CarSpecs = ({ speed, year, mileage, speedStyle, metaStyle, suffix }: CarSpecsProps) => (
  <>
    <View style={styles.row}>
      <GameIcon source={ICONS.speed} size={20} />
      <Text style={speedStyle}>{speed} км/ч</Text>
    </View>
    <View style={[styles.row, styles.metaRow]}>
      <GameIcon source={ICONS.year} size={18} />
      <Text style={[metaStyle, styles.noMargin]}>{year}</Text>
      <Text style={[metaStyle, styles.noMargin]}> • </Text>
      <GameIcon source={ICONS.mileage} size={30} style={styles.mileageIcon} />
      <Text style={[metaStyle, styles.noMargin]}>{mileage.toLocaleString('ru-RU')} км</Text>
      {suffix && <Text style={[metaStyle, styles.noMargin]}> • {suffix}</Text>}
    </View>
  </>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaRow: {
    marginTop: 2,
    flexWrap: 'wrap',
  },
  noMargin: {
    marginTop: 0,
  },
  // Иконка пробега широкая (счётчик): в квадрате 30 она занимает примерно 30×14
  mileageIcon: {
    height: 16,
  },
});
