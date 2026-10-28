import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, type GestureResponderEvent, type Insets, type StyleProp, type ViewStyle } from 'react-native';

/** Сколько минимум держится эффект нажатия: быстрый тап тоже должен быть заметен */
const MIN_PRESSED_MS = 120;
/** Автоповтор при удержании: пауза до первого повтора */
const REPEAT_DELAY_MS = 350;

export interface TouchableProps {
  style?: StyleProp<ViewStyle>;
  onPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean | null;
  /** Прозрачность в нажатом состоянии (как у TouchableOpacity) */
  activeOpacity?: number;
  hitSlop?: Insets | number;
  accessibilityLabel?: string;
  /**
   * Удержание повторяет нажатие с этим интервалом, мс (после короткой паузы). Для действий, которые
   * делаются сериями тапов: ремонт в сотни тапов иначе утомлял пальцы, а не голову.
   */
  repeatMs?: number;
  children?: React.ReactNode;
}

/**
 * Замена TouchableOpacity с хорошо заметным нажатием: кнопка чуть сжимается и тускнеет.
 * Тот же API, поэтому используется во всей игре вместо TouchableOpacity.
 */
export const TouchableOpacity = ({
  style,
  onPress,
  disabled,
  activeOpacity,
  hitSlop,
  accessibilityLabel,
  repeatMs,
  children,
}: TouchableProps) => {
  const [pressed, setPressed] = useState(false);
  const pressedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatDelay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const repeated = useRef(false);
  // Свежий обработчик для интервала: состояние машины меняется с каждым повтором
  const pressRef = useRef(onPress);
  pressRef.current = onPress;

  const stopRepeat = useCallback(() => {
    if (repeatDelay.current) clearTimeout(repeatDelay.current);
    if (repeat.current) clearInterval(repeat.current);
    repeatDelay.current = null;
    repeat.current = null;
  }, []);

  useEffect(() => stopRepeat, [stopRepeat]);
  useEffect(() => {
    if (disabled) stopRepeat();
  }, [disabled, stopRepeat]);

  const onPressIn = useCallback(
    (e: GestureResponderEvent) => {
      if (timer.current) clearTimeout(timer.current);
      pressedAt.current = Date.now();
      setPressed(true);
      repeated.current = false;
      if (!repeatMs) return;
      stopRepeat();
      repeatDelay.current = setTimeout(() => {
        repeated.current = true;
        pressRef.current?.(e);
        repeat.current = setInterval(() => pressRef.current?.(e), repeatMs);
      }, REPEAT_DELAY_MS);
    },
    [repeatMs, stopRepeat],
  );

  const onPressOut = useCallback(() => {
    stopRepeat();
    const left = MIN_PRESSED_MS - (Date.now() - pressedAt.current);
    if (left <= 0) setPressed(false);
    else timer.current = setTimeout(() => setPressed(false), left);
  }, [stopRepeat]);

  // После серии повторов отпускание пальца — не ещё одно нажатие
  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      if (repeated.current) return;
      onPress?.(e);
    },
    [onPress],
  );

  return (
    <Pressable
      style={[style, pressed && !disabled && { opacity: Math.min(activeOpacity ?? 0.55, 0.6), transform: [{ scale: 0.96 }] }]}
      onPress={handlePress}
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
