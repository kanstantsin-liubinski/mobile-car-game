import { useEconomy } from '@hooks/EconomyContext';
import { requiredXp } from '../economy/progression';
import { TIER_UNLOCK_LEVELS } from '../data/carModels';

/**
 * Опыт и уровень игрока. Хранятся в экономике (src/economy) вместе с деньгами,
 * поэтому награды за продажи, ремонт и месяц начисляются атомарно и ровно один раз.
 */
export const useExperienceContext = () => {
  const { state } = useEconomy();
  const { level, xp, totalXp } = state.player.xp;

  const getRequiredLevelForTier = (tier: number): number => TIER_UNLOCK_LEVELS[tier] ?? 0;

  return {
    level,
    totalExperience: totalXp,
    getLevel: () => level,
    getProgress: () => {
      const required = requiredXp(level);
      return { current: xp, required, percentage: Math.min(100, (xp / required) * 100) };
    },
    isTierUnlocked: (tier: number) => level >= getRequiredLevelForTier(tier),
    getRequiredLevelForTier,
  };
};
