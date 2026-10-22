import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

const NATIVE = Platform.OS !== 'web';
const OPEN_MS = 300;
const CLOSE_MS = 220;
/** Если onShow почему-то не пришёл — запускаем открытие сами через столько */
const SHOW_FALLBACK_MS = 120;

interface SheetModalProps {
  visible: boolean;
  onRequestClose: () => void;
  /** Окно снизу (по умолчанию) или по центру экрана */
  align?: 'bottom' | 'center';
  /** Цвет затемнения */
  backdropColor?: string;
  /**
   * Окно полностью закрыто и убрано. Только после этого можно открывать другое окно:
   * на iOS Modal, открытый во время закрытия соседнего, не показывается, а невидимый слой
   * остаётся поверх игры и перехватывает все нажатия.
   */
  onClosed?: () => void;
  children: React.ReactNode;
}

/**
 * Модальное окно с раздельной анимацией: затемнение всего экрана плавно проявляется на месте,
 * а само окно выезжает снизу (или проявляется по центру).
 *
 * Анимация открытия стартует только когда Modal реально показан (onShow): на iOS он появляется
 * через пару кадров после монтирования, и анимация, запущенная раньше, «съедала» начало выезда —
 * окно появлялось рывком с середины пути.
 */
export const SheetModal = ({
  visible,
  onRequestClose,
  align = 'bottom',
  backdropColor = 'rgba(0, 0, 0, 0.7)',
  onClosed,
  children,
}: SheetModalProps) => {
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const backdrop = useRef(new Animated.Value(0)).current;
  const sheet = useRef(new Animated.Value(0)).current;
  /** Открытие уже запущено для текущего показа */
  const opening = useRef(false);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const wasMounted = useRef(mounted);

  // Сообщаем о полном закрытии один раз — когда Modal действительно убран
  useEffect(() => {
    if (wasMounted.current && !mounted) {
      // Пара кадров на то, чтобы iOS успел снять нативное окно
      const t = setTimeout(() => onClosedRef.current?.(), 60);
      wasMounted.current = mounted;
      return () => clearTimeout(t);
    }
    wasMounted.current = mounted;
  }, [mounted]);

  const startOpen = useCallback(() => {
    if (opening.current) return;
    opening.current = true;
    if (fallback.current) clearTimeout(fallback.current);
    const anim = Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: OPEN_MS, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }),
      // Мягкий разгон и плавное торможение: без огромного скачка в первом кадре
      Animated.timing(sheet, { toValue: 1, duration: OPEN_MS, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: NATIVE }),
    ]);
    anim.start();
    // Страховка: если кадры не идут (приложение свернули посреди анимации), окно всё равно откроется целиком
    fallback.current = setTimeout(() => {
      anim.stop();
      backdrop.setValue(1);
      sheet.setValue(1);
    }, OPEN_MS + 200);
  }, [backdrop, sheet]);

  useEffect(() => {
    if (fallback.current) clearTimeout(fallback.current);
    if (visible) {
      opening.current = false;
      backdrop.setValue(0);
      sheet.setValue(0);
      setMounted(true);
      // Обычно открытие запускает onShow; если его не будет (некоторые платформы) — запустим сами
      fallback.current = setTimeout(startOpen, SHOW_FALLBACK_MS);
      return;
    }
    if (!mounted) return;
    // Закрытие: окно уезжает вниз, затемнение гаснет; Modal убираем после анимации
    const anim = Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: CLOSE_MS, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE }),
      Animated.timing(sheet, { toValue: 0, duration: CLOSE_MS, easing: Easing.in(Easing.cubic), useNativeDriver: NATIVE }),
    ]);
    anim.start(({ finished }) => finished && setMounted(false));
    // Невидимое окно не должно остаться поверх игры и перехватывать нажатия — убираем по таймеру в любом случае
    fallback.current = setTimeout(() => {
      anim.stop();
      setMounted(false);
    }, CLOSE_MS + 200);
  }, [visible]);

  useEffect(
    () => () => {
      if (fallback.current) clearTimeout(fallback.current);
    },
    [],
  );

  if (!mounted) return null;

  const contentAnim =
    align === 'bottom'
      ? { transform: [{ translateY: sheet.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }] }
      : { opacity: sheet, transform: [{ scale: sheet.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] };

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onRequestClose}
      onShow={visible ? startOpen : undefined}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: backdropColor, opacity: backdrop }]} />
        <Animated.View style={[styles.content, align === 'center' && styles.center, contentAnim]}>{children}</Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, justifyContent: 'flex-end' },
  center: { justifyContent: 'center' },
});
