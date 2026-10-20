import React from 'react';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { useMarketContext } from '@hooks/MarketContext';
import { InfoBar, InfoRow, InfoSection, InfoSheet, InfoText } from './InfoSheet';
import { DAY_MS, DAYS_IN_MONTH, LOAN_TERM_MONTHS, MONTH_MS } from '../../economy/economy';
import { COURSE_COOLDOWN_MS } from '../../economy/progression';
import { HOT_CHECK_INTERVAL_MS, HOT_MAX_DURATION_MS, HOT_MIN_DURATION_MS } from '../../economy/hotOffers';
import { formatGameDays } from '../../economy/format';

/** Реальное время: «2 мин 30 сек» */
const realTime = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} сек`;
  return s === 0 ? `${m} мин` : `${m} мин ${s} сек`;
};

/** Окно «Календарь»: текущая дата, сколько что длится и ближайшие события по игровому времени */
export const CalendarModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const { state } = useEconomy();
  const { calendar, gameTimeMs } = useGameClock();
  const { hotNextCheckAtMs } = useMarketContext();
  const dayProgress = calendar.msToPayday <= 0 ? 1 : (calendar.msIntoMonth % DAY_MS) / DAY_MS;
  const dayLeft = calendar.msToPayday <= 0 ? 0 : DAY_MS - (calendar.msIntoMonth % DAY_MS);
  const ordersLeft = Math.max(0, state.orders.nextCheckAtMs - gameTimeMs);
  const hotLeft = hotNextCheckAtMs !== null ? Math.max(0, hotNextCheckAtMs - gameTimeMs) : null;

  return (
    <InfoSheet visible={visible} title="Календарь" onClose={onClose}>
      <InfoSection title="Сегодня">
        <InfoRow label="День недели" value={calendar.weekday} />
        <InfoRow label="День месяца" value={`${calendar.day} из ${DAYS_IN_MONTH}`} />
        <InfoRow label="Месяц" value={String(calendar.month)} />
        <InfoRow label="До конца дня" value={`${formatGameDays(dayLeft, DAY_MS)} · ${realTime(dayLeft)}`} />
        <InfoBar progress={dayProgress} color="#FBBF24" />
        <InfoRow label="До зарплатного дня" value={`${formatGameDays(calendar.msToPayday, DAY_MS)} · ${realTime(calendar.msToPayday)}`} />
        <InfoBar progress={calendar.monthProgress} color="#6366F1" />
      </InfoSection>

      <InfoSection title="Сколько длится">
        <InfoRow label="1 игровой день" value={realTime(DAY_MS)} />
        <InfoRow label="1 неделя (7 дней)" value={realTime(DAY_MS * 7)} />
        <InfoRow label={`1 месяц (${DAYS_IN_MONTH} дней)`} value={realTime(MONTH_MS)} />
        <InfoRow label="Перезарядка курса (3 месяца)" value={realTime(COURSE_COOLDOWN_MS)} />
        <InfoRow label={`Срок кредита (${LOAN_TERM_MONTHS} месяцев)`} value={realTime(MONTH_MS * LOAN_TERM_MONTHS)} />
        <InfoText>
          Время идёт только пока игра открыта. Оно останавливается, когда приложение свёрнуто или закрыто, в зарплатный
          день (пока не подтверждена выплата) и при банкротстве. Все таймеры игры — в игровых днях.
        </InfoText>
      </InfoSection>

      <InfoSection title="Ближайшие события">
        <InfoRow label="Зарплатный день" value={formatGameDays(calendar.msToPayday, DAY_MS)} />
        {hotLeft !== null && <InfoRow label="Проверка горящего предложения" value={formatGameDays(hotLeft, DAY_MS)} />}
        <InfoRow label="Проверка новых заказов" value={formatGameDays(ordersLeft, DAY_MS)} />
        {state.loan && <InfoRow label="Погасить кредит" value={`до конца месяца ${state.loan.dueMonth}`} accent="#EF4444" />}
      </InfoSection>

      <InfoSection title="Что происходит по календарю">
        <InfoText>
          • В конце каждого месяца — зарплатный день: отчёт за месяц и выплата зарплат механикам и малярам. Следующий месяц
          начнётся только после подтверждения.
        </InfoText>
        <InfoText>
          • Раз в {HOT_CHECK_INTERVAL_MS / DAY_MS} дней на авторынке может появиться горящее предложение (на{' '}
          {HOT_MIN_DURATION_MS / DAY_MS}–{HOT_MAX_DURATION_MS / DAY_MS} дня). Шанс растёт с навыком «Менеджмент».
        </InfoText>
        <InfoText>
          • Каждый игровой день клиенты могут принести новый заказ, и не реже раза в 3 дня — обязательно. Шанс зависит
          от репутации, оплата — от репутации и вашего уровня.
        </InfoText>
        <InfoText>• Объявления на авторынке живут 30–120 дней, продажа машины занимает 0–30 дней в зависимости от цены.</InfoText>
      </InfoSection>
    </InfoSheet>
  );
};
