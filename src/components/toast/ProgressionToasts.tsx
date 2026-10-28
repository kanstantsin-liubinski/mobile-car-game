import { useEffect, useRef } from 'react';
import { useEconomy } from '@hooks/EconomyContext';
import { useGarageContext } from '@hooks/GarageContext';
import { useToast } from '@components/toast/ToastContext';
import { ICONS, getMechanicAvatar } from '@img/gameIcons';
import { HOT_OFFER_NOTIFY_LEVEL, hotOfferChance, levelUpRewardsBetween, skillMultiplier } from '../../economy/progression';
import { LEVEL_LADDER, PICKER_FORECAST_LEVEL } from '../../economy/balance';
import { formatMoney } from '../../economy/format';
import { legacyProfitMultiplier, legacyStartCash, legacyXpMultiplier } from '../../economy/legacy';

const fmtMult = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const pluralPoints = (n: number) => {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return 'очко';
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 'очка';
  return 'очков';
};

const bonus = (level: number) => `+${Math.round((skillMultiplier(level) - 1) * 100)}%`;

/**
 * Что дал новый уровень: награда, что открылось и какая следующая цель. Без цели впереди уровень
 * ощущается пустым — особенно между редкими ступенями лестницы.
 */
const levelUpMessage = (from: number, to: number): string => {
  const reward = `Награда: ${formatMoney(levelUpRewardsBetween(from, to) * 100)}.`;
  const opened = LEVEL_LADDER.filter((s) => s.level > from && s.level <= to).map((s) => s.text);
  const next = LEVEL_LADDER.find((s) => s.level > to);
  return [
    reward,
    opened.length ? `Открыто: ${opened.join('; ')}.` : '',
    next ? `Дальше — на ${next.level} уровне: ${next.text}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
};

/** Тосты о повышениях: общий уровень игрока, навык игрока и навыки механиков (на любом экране) */
export const ProgressionToasts = () => {
  const { state, isLoaded } = useEconomy();
  const { mechanics, painters } = useGarageContext();
  const { showToast } = useToast();

  const playerLevel = state.player.xp.level;
  const playerSkill = state.player.skill.level;
  const management = state.player.management.level;
  const painter = state.player.painter.level;
  const picker = state.player.picker.level;
  const trade = state.player.trade.level;
  const prev = useRef<{
    level: number;
    skill: number;
    management: number;
    others: Record<string, number>;
    workers: Record<string, number>;
  } | null>(null);

  // Новая карьера с наследием: бонусы действуют сразу, но без напоминания их не было видно вовсе
  const heritageShownFor = useRef<string | null>(null);
  useEffect(() => {
    if (!isLoaded || heritageShownFor.current === state.careerId) return;
    heritageShownFor.current = state.careerId;
    const points = state.legacyPoints ?? 0;
    if (points <= 0 || state.completedMonths > 0 || state.player.xp.totalXp > 0) return;
    showToast({
      title: `Наследие: ${points} ${pluralPoints(points)}`,
      message: `Стартовый капитал +${formatMoney(legacyStartCash(points) * 100)}, прибыль ×${fmtMult(
        legacyProfitMultiplier(points),
      )}, опыт ×${fmtMult(legacyXpMultiplier(points))}.`,
      icon: ICONS.xp,
      tone: 'success',
    });
  }, [isLoaded, state.careerId, state.legacyPoints, state.completedMonths, state.player.xp.totalXp, showToast]);

  useEffect(() => {
    if (!isLoaded) return;
    // Контракты, ждущие переноса уровня из старого сохранения, не считаем — их «рост» не повышение
    const workers = Object.fromEntries(
      Object.values(state.contracts)
        .filter((c) => !c.legacySkillPending)
        .map((c) => [c.mechanicId, c.skill.level]),
    );
    const before = prev.current;
    const others = { painter, picker, trade };
    prev.current = { level: playerLevel, skill: playerSkill, management, others, workers };
    // Первое значение после загрузки — это не повышение
    if (!before) return;

    if (playerLevel > before.level) {
      showToast({
        title: `Новый уровень: ${playerLevel}`,
        message: levelUpMessage(before.level, playerLevel),
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
    if (management > before.management) {
      const chance = `${(Math.round(hotOfferChance(management) * 1000) / 10).toLocaleString('ru-RU')}%`;
      showToast({
        title: `Навык «Менеджмент»: уровень ${management}`,
        message:
          before.management < HOT_OFFER_NOTIFY_LEVEL && management >= HOT_OFFER_NOTIFY_LEVEL
            ? `Шанс горящего предложения ${chance}. Открыты уведомления и индикатор авторынка.`
            : `Шанс горящего предложения теперь ${chance}.`,
        icon: ICONS.money,
        tone: 'success',
      });
    }
    const otherText: Record<string, [string, string]> = {
      painter: ['Маляр', `Ручная покраска ${bonus(painter)} эффективнее.`],
      picker: [
        'Подборщик',
        picker === PICKER_FORECAST_LEVEL
          ? 'Теперь в объявлениях видна оценка сделки: цена после ремонта и прибыль.'
          : 'Сканер точнее: интервалы диагностики стали уже.',
      ],
      trade: ['Торговля', 'Покупки дешевле, продажи выгоднее.'],
    };
    for (const [key, level] of Object.entries(others)) {
      if (level > (before.others[key] ?? level)) {
        showToast({
          title: `Навык «${otherText[key][0]}»: уровень ${level}`,
          message: otherText[key][1],
          icon: ICONS.upgradeSkill,
          tone: 'success',
        });
      }
    }
    for (const [id, level] of Object.entries(workers)) {
      const was = before.workers[id];
      if (was !== undefined && level > was) {
        const name = [...mechanics, ...painters].find((m) => m.id === id)?.name ?? 'Сотрудник';
        const isPainter = state.contracts[id]?.profession === 'painter';
        showToast({
          title: `${name}: навык ${level} уровня`,
          message: `Скорость ${isPainter ? 'покраски' : 'ремонта'} ${bonus(level)}, оклад пересчитан.`,
          icon: getMechanicAvatar(id),
          tone: 'success',
        });
      }
    }
  }, [isLoaded, playerLevel, playerSkill, management, painter, picker, trade, state.contracts]);

  return null;
};
