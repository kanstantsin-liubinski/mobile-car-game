import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Вибрация (только телефон; в браузере — тихо ничего). Ошибки движка вибрации игре не мешают.
 * Тап по большой кнопке — лёгкий щелчок не чаще раза в TAP_GAP_MS: при удержании кнопка жмётся
 * автоповтором, и непрерывное жужжание раздражало бы.
 */
const ENABLED = Platform.OS === 'ios' || Platform.OS === 'android';
const TAP_GAP_MS = 60;
let lastTap = 0;

const safe = (fn: () => Promise<void>) => {
  if (!ENABLED) return;
  fn().catch(() => {});
};

export const haptics = {
  /** Тап ремонта или покраски */
  tap: () => {
    const now = Date.now();
    if (now - lastTap < TAP_GAP_MS) return;
    lastTap = now;
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  /** Обычная кнопка-действие (плитка, вкладка) */
  select: () => safe(() => Haptics.selectionAsync()),
  /** Хорошее событие: продажа, готовая машина, награда */
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Важное событие, требующее внимания: предложение покупателя, дефект */
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
