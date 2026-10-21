import { useEffect } from 'react';
import { useEconomy } from '@hooks/EconomyContext';
import { useLegacy } from '@hooks/LegacyContext';
import { useToast } from '@components/toast/ToastContext';
import { ICONS } from '@img/gameIcons';
import { LADDER } from '../../economy/balance';

/** Вехи карьеры, которые хранятся в «Наследии»: 100 уровень — «Легенда автобизнеса» (условие цели «Концерн») */
export const LegacyWatcher = () => {
  const { state } = useEconomy();
  const { legacy, isLoaded, update } = useLegacy();
  const { showToast } = useToast();
  const level = state.player.xp.level;

  useEffect(() => {
    if (!isLoaded || level < LADDER.milestone || legacy.reachedLevel100) return;
    update((l) => ({ ...l, reachedLevel100: true, achievements: Array.from(new Set([...l.achievements, 'level100'])) }));
    showToast({
      title: '🏆 Легенда автобизнеса',
      message: '100 уровень! Это засчитано в «Наследии» — шаг к цели «Автомобильный концерн».',
      icon: ICONS.money,
      tone: 'success',
    });
  }, [isLoaded, level, legacy.reachedLevel100, update, showToast]);

  return null;
};
