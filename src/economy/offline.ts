/**
 * Работа автоматизированных филиалов, пока игра закрыта.
 *
 * Игровое время идёт только в открытой игре, поэтому закрытые часы не симулируются заказ за заказом:
 * филиал зарабатывает со своей фактической скоростью — средней чистой прибылью (оплата − детали −
 * оклады) за последние закрытые месяцы и текущий месяц. Минута отсутствия = минута работы
 * (в открытой игре 1 секунда — тоже 1 секунда игрового времени), но не больше OFFLINE_MAX_MS.
 *
 * Работают только филиалы, автоматизированные в момент закрытия (управляющий в штате, автоматизация
 * включена). Убыточный филиал вне игры денег не теряет и не приносит. Деньги — отдельной строкой
 * учёта «Филиалы вне игры», они входят в чистую прибыль месяца.
 */
import * as E from './economy.ts';
import type { BranchState } from './branchModel.ts';
import { currentBranchReport, reportOf } from './branches.ts';
import { DAY_MS, MONTH_MS } from './time.ts';

/** Сколько реального времени после закрытия игры работают филиалы */
export const OFFLINE_MAX_MS = 4 * 60 * 60 * 1000;
/** Короче этого — отсутствием не считается (переключился на другое приложение и вернулся) */
export const OFFLINE_MIN_MS = 60 * 1000;
/** Сколько закрытых месяцев филиала берётся для средней скорости */
export const OFFLINE_RATE_MONTHS = 3;
/** Меньше стольких игровых дней работы — скорость филиала ещё неизвестна */
export const OFFLINE_MIN_HISTORY_MS = 5 * DAY_MS;

export interface OfflineBranchLine {
  garageId: string;
  name: string;
  cents: number;
}

export interface OfflineReport {
  /** Сколько игры не было (реальное время) */
  awayMs: number;
  /** Сколько из этого засчитано филиалам (не больше OFFLINE_MAX_MS) */
  workedMs: number;
  totalCents: number;
  lines: OfflineBranchLine[];
}

const isAutomated = (s: E.EconomyState, b: BranchState): boolean => b.automation && !!b.managerId && !!s.contracts[b.managerId];

/**
 * Средняя чистая прибыль филиала, центов за миллисекунду работы: последние закрытые месяцы
 * и текущий. null — данных меньше OFFLINE_MIN_HISTORY_MS.
 */
export const offlineBranchRate = (s: E.EconomyState, b: BranchState, now: number): number | null => {
  const slots = Math.max(1, b.slots.length);
  let net = 0;
  let activeMs = 0;
  for (const m of b.history.slice(-OFFLINE_RATE_MONTHS)) {
    const r = reportOf(m);
    net += r.netCents;
    // Месяц открытия филиала — неполный: время работы берём из учёта слотов
    activeMs += Math.min(MONTH_MS, m.slotMs / slots);
  }
  const current = currentBranchReport(s, b, now);
  net += current.netCents;
  activeMs += Math.max(0, now - Math.max(E.monthStartMs(s), b.openedAtMs));
  if (activeMs < OFFLINE_MIN_HISTORY_MS) return null;
  return net / activeMs;
};

/** Сколько заработает филиал за workedMs вне игры (0 — не автоматизирован, убыточен или нет данных) */
export const offlineBranchCents = (s: E.EconomyState, b: BranchState, now: number, workedMs: number): number => {
  if (!isAutomated(s, b)) return 0;
  const rate = offlineBranchRate(s, b, now);
  return rate === null || rate <= 0 ? 0 : Math.round(rate * workedMs);
};

/**
 * Зачислить работу филиалов за время отсутствия. Отчёт — null, если отсутствие короткое
 * или ни один филиал ничего не заработал.
 */
export const applyOfflineBranches = (
  s: E.EconomyState,
  now: number,
  awayMs: number,
  names: Record<string, string>,
): { state: E.EconomyState; report: OfflineReport | null } => {
  if (s.bankruptcy || !(awayMs >= OFFLINE_MIN_MS)) return { state: s, report: null };
  const workedMs = Math.min(awayMs, OFFLINE_MAX_MS);
  const lines: OfflineBranchLine[] = Object.values(s.branches ?? {})
    .map((b) => ({ garageId: b.garageId, name: names[b.garageId] ?? b.garageId, cents: offlineBranchCents(s, b, now, workedMs) }))
    .filter((l) => l.cents > 0);
  const totalCents = lines.reduce((sum, l) => sum + l.cents, 0);
  if (totalCents <= 0) return { state: s, report: null };
  return {
    state: {
      ...s,
      balanceCents: s.balanceCents + totalCents,
      ledger: { ...s.ledger, offlineIncomeCents: (s.ledger.offlineIncomeCents ?? 0) + totalCents },
    },
    report: { awayMs, workedMs, totalCents, lines },
  };
};
