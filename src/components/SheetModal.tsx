import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

const NATIVE = Platform.OS !== 'web';
const OPEN_MS = 260;
const CLOSE_MS = 200;

interface SheetModalProps {
  visible: boolean;
  onRequestClose: () => void;
  /** Окно снизу (по умолчанию) или по центру экрана */
  align?: 'bottom' | 'center';
  /** Цвет затемнения */
  backdropColor?: string;
  children: React.ReactNode;
}

/**
 * Модальное окно с раздельной анимацией: затемнение всего экрана плавно проявляется на месте,
 * а само окно выезжает снизу (или проявляется по центру). Стандартный Modal с animationType="slide"
 * вёз затемнение вместе с окном — снизу выезжала чёрная маска.
 */
export const SheetModal = ({ visible, onRequestClose, align = 'bottom', backdropColor = 'rgba(0, 0, 0, 0.7)', children }: SheetModalProps) => {
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const backdrop = useRef(new Animated.Value(0)).current;
  const sheet = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      backdrop.setValue(0);
      sheet.setValue(0);
      const anim = Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: OPEN_MS, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }),
        Animated.timing(sheet, { toValue: 1, duration: OPEN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }),
      ]);
      anim.start();
      // Страховка: если кадры не идут (приложение свернули посреди анимации), окно всё равно откроется целиком
      const done = setTimeout(() => {
        anim.stop();
        backdrop.setValue(1);
        sheet.setValue(1);
      }, OPEN_MS + 150);
      return () => clearTimeout(done);
    }
    if (!mounted) return;
    // Закрытие тоже раздельное: окно уезжает вниз, затемнение гаснет; Modal убираем после анимации
    const anim = Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: CLOSE_MS, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE }),
      Animated.timing(sheet, { toValue: 0, duration: CLOSE_MS, easing: Easing.in(Easing.cubic), useNativeDriver: NATIVE }),
    ]);
    anim.start();
    // Невидимое окно не должно остаться поверх игры и перехватывать нажатия — убираем по таймеру в любом случае
    const done = setTimeout(() => {
      anim.stop();
      setMounted(false);
    }, CLOSE_MS + 150);
    return () => clearTimeout(done);
  }, [visible]);

  if (!mounted) return null;

  const contentAnim =
    align === 'bottom'
      ? { transform: [{ translateY: sheet.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }] }
      : { opacity: sheet, transform: [{ scale: sheet.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onRequestClose} statusBarTranslucent>
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
