import { useEffect, useRef } from 'react';
import { useEconomy } from '@hooks/EconomyContext';
import { useGarageContext } from '@hooks/GarageContext';
import { useToast } from '@components/toast/ToastContext';
import { ICONS, getMechanicAvatar } from '@img/gameIcons';
import { skillMultiplier } from '../../economy/progression';

const bonus = (level: number) => `+${Math.round((skillMultiplier(level) - 1) * 100)}%`;

/** Тосты о повышениях: общий уровень игрока, навык игрока и навыки механиков (на любом экране) */
export const ProgressionToasts = () => {
  const { state, isLoaded } = useEconomy();
  const { mechanics } = useGarageContext();
  const { showToast } = useToast();

  const playerLevel = state.player.xp.level;
  const playerSkill = state.player.skill.level;
  const prev = useRef<{ level: number; skill: number; workers: Record<string, number> } | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    // Контракты, ждущие переноса уровня из старого сохранения, не считаем — их «рост» не повышение
    const workers = Object.fromEntries(
      Object.values(state.contracts)
        .filter((c) => !c.legacySkillPending)
        .map((c) => [c.mechanicId, c.skill.level]),
    );
    const before = prev.current;
    prev.current = { level: playerLevel, skill: playerSkill, workers };
    // Первое значение после загрузки — это не повышение
    if (!before) return;

    if (playerLevel > before.level) {
      showToast({
        title: `Новый уровень: ${playerLevel}`,
        message: 'Проверьте город — могли открыться новые гаражи и классы машин.',
        icon: ICONS.xp,
        tone: 'success',
      });
    }
    if (playerSkill > before.skill) {
      showToast({
        title: `Навык «Механик»: уровень ${playerSkill}`,
        message: `Ручной ремонт теперь ${bonus(playerSkill)} эффективнее.`,
        icon: ICONS.repair,
        tone: 'success',
      });
    }
    for (const [id, level] of Object.entries(workers)) {
      const was = before.workers[id];
      if (was !== undefined && level > was) {
        const name = mechanics.find((m) => m.id === id)?.name ?? 'Механик';
        showToast({
          title: `${name}: навык ${level} уровня`,
          message: `Скорость ремонта ${bonus(level)}, оклад пересчитан.`,
          icon: getMechanicAvatar(id),
          tone: 'success',
        });
      }
    }
  }, [isLoaded, playerLevel, playerSkill, state.contracts]);

  return null;
};
