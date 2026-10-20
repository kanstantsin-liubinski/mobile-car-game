import React, { useCallback, useRef, useState } from 'react';
import { Pressable, type GestureResponderEvent, type Insets, type StyleProp, type ViewStyle } from 'react-native';

/** Сколько минимум держится эффект нажатия: быстрый тап тоже должен быть заметен */
const MIN_PRESSED_MS = 120;

export interface TouchableProps {
  style?: StyleProp<ViewStyle>;
  onPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean | null;
  /** Прозрачность в нажатом состоянии (как у TouchableOpacity) */
  activeOpacity?: number;
  hitSlop?: Insets | number;
  accessibilityLabel?: string;
  children?: React.ReactNode;
}

/**
 * Замена TouchableOpacity с хорошо заметным нажатием: кнопка чуть сжимается и тускнеет.
 * Тот же API, поэтому используется во всей игре вместо TouchableOpacity.
 */
export const TouchableOpacity = ({ style, onPress, disabled, activeOpacity, hitSlop, accessibilityLabel, children }: TouchableProps) => {
  const [pressed, setPressed] = useState(false);
  const pressedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onPressIn = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    pressedAt.current = Date.now();
    setPressed(true);
  }, []);

  const onPressOut = useCallback(() => {
    const left = MIN_PRESSED_MS - (Date.now() - pressedAt.current);
    if (left <= 0) setPressed(false);
    else timer.current = setTimeout(() => setPressed(false), left);
  }, []);

  return (
    <Pressable
      style={[style, pressed && !disabled && { opacity: Math.min(activeOpacity ?? 0.55, 0.6), transform: [{ scale: 0.96 }] }]}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled ?? undefined}
      hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      {children}
    </Pressable>
  );
};
