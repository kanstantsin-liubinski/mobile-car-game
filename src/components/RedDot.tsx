import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

/** Красная точка-индикатор поверх кнопки */
export const RedDot = ({ style }: { style?: StyleProp<ViewStyle> }) => (
  <View style={[styles.dot, style]} pointerEvents="none" />
);

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#0F172A',
  },
});
