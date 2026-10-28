/**
 * Данные филиалов (без логики): состояние, работа в слоте, месячная статистика и её закрытие
 * в зарплатный день. Логика — в branches.ts; этот модуль не зависит от economy.ts, поэтому его
 * может импортировать сама экономика (сохранение, закрытие месяца) без циклических импортов.
 */
import type * as B from './balance.ts';
import type * as O from './orders.ts';

export type ManagerStrategy = B.ManagerStrategy;

export interface BranchSlot {
  /** Механик филиала на этом слоте (id контракта) */
  mechanicId: string | null;
}

/** Работа по заказу в слоте филиала. Сам заказ — в branch.orders.active */
export interface BranchJob {
  slot: number;
  orderId: string;
  /** Взят управляющим (а не игроком вручную) */
  byManager: boolean;
  startAtMs: number;
  /** С какого момента занятость ещё не учтена в статистике месяца */
  busyFromMs: number;
  /** Когда механик закончит; null — механика нет, работа стоит */
  doneAtMs: number | null;
  /** Сколько пунктов работы осталось на момент остановки (когда doneAtMs === null) */
  remainingPts: number;
  /** Механик уже закончил (занятость снята, ждёт сдачи) */
  finished: boolean;
  /** Оценка управляющего при принятии: оплата − детали − оклад механика за дни работы */
  expectedProfitCents: number;
  /** Сколько оклада механика пришлось на дни работы (для фактической прибыли) */
  laborCentsPerDay: number;
}

export interface BranchMonth {
  month: number;
  revenueCents: number;
  partsCents: number;
  /** Оклады сотрудников филиала за месяц (заполняется в зарплатный день) */
  salaryCents: number;
  /** Время работы механиков филиала над заказами и доступное время слотов */
  busyMs: number;
  slotMs: number;
  completed: number;
  late: number;
  failed: number;
  cancelled: number;
  managerErrors: number;
  expectedProfitCents: number;
  actualProfitCents: number;
}

export interface BranchEvent {
  atMs: number;
  text: string;
  kind: 'ok' | 'warn' | 'info';
}

export interface BranchState {
  garageId: string;
  openedAtMs: number;
  /** Управляющий сам берёт и сдаёт заказы (игрок может выключить в любой момент) */
  automation: boolean;
  strategy: ManagerStrategy;
  /** Минимальный остаток свободных денег, ниже которого управляющий ничего не оплачивает, центы */
  reserveCents: number;
  /** Автоматизированные слоты */
  slots: BranchSlot[];
  /** Купленное в филиал оборудование (B.BRANCH_EQUIPMENT): открывает управляющему сложные заказы */
  equipment?: B.EquipmentId[];
  managerId: string | null;
  /** Имена сотрудников филиала по id контракта */
  staffNames: Record<string, string>;
  /** Доска и активные заказы филиала (репутация — копия общей) */
  orders: O.OrdersState;
  jobs: BranchJob[];
  /** Следующий момент, когда управляющий посмотрит на дела */
  nextDecisionAtMs: number;
  /** Счётчик решений — индекс детерминированного RNG ошибок */
  decisions: number;
  /** Счётчик наймов — для уникальных id и имён */
  hires: number;
  month: BranchMonth;
  history: BranchMonth[];
  log: BranchEvent[];
  totals: { revenueCents: number; partsCents: number; completed: number; failed: number };
}

export const BRANCH_LOG_LIMIT = 20;
export const BRANCH_HISTORY_MONTHS = 12;

export const emptyBranchMonth = (month: number): BranchMonth => ({
  month,
  revenueCents: 0,
  partsCents: 0,
  salaryCents: 0,
  busyMs: 0,
  slotMs: 0,
  completed: 0,
  late: 0,
  failed: 0,
  cancelled: 0,
  managerErrors: 0,
  expectedProfitCents: 0,
  actualProfitCents: 0,
});

/** Закрытие месяца филиалов: оклады за месяц, загрузка, история — вызывается из closeMonth */
export const rollBranchMonths = (
  branches: Record<string, BranchState>,
  salaries: Record<string, number>,
  monthStart: number,
  monthEnd: number,
  nextMonth: number,
): Record<string, BranchState> => {
  const out: Record<string, BranchState> = {};
  for (const b of Object.values(branches)) {
    const start = Math.max(monthStart, b.openedAtMs);
    const closed: BranchMonth = {
      ...b.month,
      salaryCents: salaries[b.garageId] ?? 0,
      slotMs: b.slots.length * Math.max(0, monthEnd - start),
      busyMs:
        b.month.busyMs +
        b.jobs
          .filter((j) => !j.finished && j.doneAtMs !== null && j.busyFromMs < monthEnd)
          .reduce((sum, j) => sum + Math.max(0, monthEnd - Math.max(j.busyFromMs, start)), 0),
    };
    // Работа, начатая в этом месяце и идущая дальше, в следующем месяце считается с его начала
    const jobs = b.jobs.map((j) => (!j.finished && j.doneAtMs !== null && j.busyFromMs < monthEnd ? { ...j, busyFromMs: monthEnd } : j));
    out[b.garageId] = { ...b, jobs, month: emptyBranchMonth(nextMonth), history: [...b.history, closed].slice(-BRANCH_HISTORY_MONTHS) };
  }
  return out;
};
