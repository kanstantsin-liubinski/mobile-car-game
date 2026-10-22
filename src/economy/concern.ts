/**
 * Большая цель: «Приобрести автомобильный концерн» за $1 000 000 000.
 *
 * Условия соединяют обе части прогресса: «Наследие» (100 уровень в какой-нибудь карьере, несколько
 * перезапусков, очки) и текущую карьеру (развитая сеть филиалов, нет кредита, свободные деньги).
 * Покупка — вложение из свободных денег; игра после неё продолжается.
 */
import * as B from './balance.ts';
import type { EconomyState } from './economy.ts';
import type { LegacyState } from './legacy.ts';

export interface ConcernRequirement {
  id: 'level100' | 'restarts' | 'points' | 'branches' | 'slots' | 'debt' | 'money';
  text: string;
  done: boolean;
  /** «сейчас / нужно» */
  progress: string;
  /** Доля выполнения 0–1 для полоски */
  share: number;
}

const share = (have: number, need: number) => (need <= 0 ? 1 : Math.max(0, Math.min(1, have / need)));
const money = (dollars: number) => `$${Math.round(dollars).toLocaleString('ru-RU')}`;

export const concernRequirements = (s: EconomyState, legacy: LegacyState): ConcernRequirement[] => {
  const branches = Object.values(s.branches ?? {});
  const slots = branches.reduce((sum, b) => sum + b.slots.length, 0);
  const level100 = legacy.reachedLevel100 || s.player.xp.level >= B.LADDER.milestone;
  const balance = s.balanceCents / 100;
  return [
    {
      id: 'level100',
      text: 'Карьера, дошедшая до 100 уровня',
      done: level100,
      progress: level100 ? 'есть' : `лучший уровень ${Math.max(legacy.records.bestLevel, s.player.xp.level)} / 100`,
      share: level100 ? 1 : share(Math.max(legacy.records.bestLevel, s.player.xp.level), 100),
    },
    {
      id: 'restarts',
      text: `Перезапусков через «Наследие» — не меньше ${B.CONCERN_MIN_RESTARTS}`,
      done: legacy.restarts >= B.CONCERN_MIN_RESTARTS,
      progress: `${legacy.restarts} / ${B.CONCERN_MIN_RESTARTS}`,
      share: share(legacy.restarts, B.CONCERN_MIN_RESTARTS),
    },
    {
      id: 'points',
      text: `Очков наследия — не меньше ${B.CONCERN_MIN_LEGACY_POINTS}`,
      done: legacy.pointsTotal >= B.CONCERN_MIN_LEGACY_POINTS,
      progress: `${legacy.pointsTotal} / ${B.CONCERN_MIN_LEGACY_POINTS}`,
      share: share(legacy.pointsTotal, B.CONCERN_MIN_LEGACY_POINTS),
    },
    {
      id: 'branches',
      text: `Сеть филиалов: не меньше ${B.CONCERN_MIN_BRANCHES}`,
      done: branches.length >= B.CONCERN_MIN_BRANCHES,
      progress: `${branches.length} / ${B.CONCERN_MIN_BRANCHES}`,
      share: share(branches.length, B.CONCERN_MIN_BRANCHES),
    },
    {
      id: 'slots',
      text: `Автоматизированных слотов в филиалах — не меньше ${B.CONCERN_MIN_AUTO_SLOTS}`,
      done: slots >= B.CONCERN_MIN_AUTO_SLOTS,
      progress: `${slots} / ${B.CONCERN_MIN_AUTO_SLOTS}`,
      share: share(slots, B.CONCERN_MIN_AUTO_SLOTS),
    },
    {
      id: 'debt',
      text: 'Нет кредита и банкротства',
      done: !s.loan && !s.bankruptcy,
      progress: s.loan ? `долг ${money(s.loan.principalCents / 100)}` : 'нет',
      share: s.loan ? 0 : 1,
    },
    {
      id: 'money',
      text: `Свободные деньги: ${money(B.CONCERN_PRICE)}`,
      done: balance >= B.CONCERN_PRICE,
      progress: `${money(balance)} / ${money(B.CONCERN_PRICE)}`,
      share: share(balance, B.CONCERN_PRICE),
    },
  ];
};

export const concernAvailable = (s: EconomyState, legacy: LegacyState): boolean =>
  !legacy.concern.purchased && !s.concernPurchased && concernRequirements(s, legacy).every((r) => r.done);
