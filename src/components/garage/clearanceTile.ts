import type { TileSpec } from '@components/ActionTiles';
import { TIER_NAMES } from '../../data/carModels';
import { clearanceUpgradeCostCents, contractSalary, salaryForLevel, type Contract } from '../../economy/economy';
import { formatMoney } from '../../economy/format';

/** Название класса допуска: «Эконом», «Средний»… */
export const clearanceName = (clearance: number | undefined): string => TIER_NAMES[clearance ?? 1] ?? TIER_NAMES[1];

/**
 * Плитка повышения допуска сотрудника к следующему классу машин: разовая плата, оклад растёт.
 * Без допуска сотрудник работает с машинами старших классов вдвое медленнее.
 */
export const clearanceTile = (c: Contract | undefined, balanceCents: number, onUpgrade: () => void): TileSpec | null => {
  if (!c || c.profession === 'manager') return null;
  const current = c.clearance ?? 1;
  if (current >= 6) {
    return {
      key: 'clearance',
      emoji: '🎓',
      title: 'Допуск',
      subtitle: 'все классы',
      state: 'done',
      info: 'Сотрудник допущен ко всем классам машин.',
      onPress: () => {},
    };
  }
  const cost = clearanceUpgradeCostCents(c);
  const nextSalary = salaryForLevel(c.skill.level, c.profession, current + 1);
  return {
    key: 'clearance',
    emoji: '🎓',
    title: 'Допуск',
    subtitle: `${clearanceName(current + 1)} · ${formatMoney(cost)}`,
    state: balanceCents >= cost ? 'ready' : 'locked',
    accent: '#F59E0B',
    info: `Сейчас допуск до класса «${clearanceName(current)}»: машины старше он ремонтирует вдвое медленнее. Обучение до «${clearanceName(
      current + 1,
    )}» стоит ${formatMoney(cost)} (расход «Обучение»), оклад вырастет с ${formatMoney(contractSalary(c))} до ${formatMoney(nextSalary)} в месяц — это плата за работу с более дорогими машинами.`,
    onPress: onUpgrade,
  };
};
