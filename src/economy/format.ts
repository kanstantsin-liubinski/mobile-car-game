/**
 * Деньги из центов — единый формат во всей игре: «$1 234», «−$500», с флагом sign — «+$300».
 * От $100 — целые доллары (округление); меньше — с центами, если они есть («$0,14», «$12,50»).
 */
export const formatMoney = (cents: number, options: { sign?: boolean } = {}): string => {
  const abs = Math.abs(cents);
  const small = abs < 10_000;
  const hasCents = small && abs % 100 !== 0;
  const text = (small ? abs / 100 : Math.round(abs / 100)).toLocaleString('ru-RU', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  });
  const sign = cents < 0 ? '−' : options.sign && cents > 0 ? '+' : '';
  return `${sign}$${text}`;
};

/** Игровое время «м:сс» */
export const formatDuration = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

/** Реальное время: «3 ч 12 мин», «45 мин», «меньше минуты» */
export const formatRealSpan = (ms: number): string => {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return 'меньше минуты';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? (m > 0 ? `${h} ч ${m} мин` : `${h} ч`) : `${m} мин`;
};

export const formatPercent = (value: number | null): string =>
  value === null ? '—' : `${Math.round(value * 100)}%`;

/** «1 день», «3 дня», «5 дней» */
export const pluralDays = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} дня`;
  return `${n} дней`;
};

/**
 * Все таймеры игры — в игровых днях. От суток и больше — целые дни с округлением вверх
 * («3 дня»), в последний день — десятые доли («0,4 дня»), чтобы было видно, что время идёт.
 */
export const formatGameDays = (ms: number, dayMs = 10_000): string => {
  if (ms <= 0) return 'сейчас';
  if (ms >= dayMs) return pluralDays(Math.ceil(ms / dayMs));
  const tenths = Math.ceil((ms / dayMs) * 10);
  return tenths >= 10 ? '1 день' : `${(tenths / 10).toLocaleString('ru-RU')} дня`;
};

/** Длительность в игровых днях с одним знаком: «3,5 дня», «12 дней» */
export const formatGameSpan = (ms: number, dayMs = 10_000): string => {
  const days = Math.round((Math.max(0, ms) / dayMs) * 10) / 10;
  if (Number.isInteger(days)) return pluralDays(days);
  return `${days.toLocaleString('ru-RU')} дня`;
};

/** Оставшаяся перезарядка в игровых месяцах и днях: «2 мес. 14 дн.» */
export const formatGameCooldown = (ms: number, dayMs: number, daysInMonth: number): string => {
  const totalDays = Math.max(0, Math.ceil(ms / dayMs));
  const months = Math.floor(totalDays / daysInMonth);
  const days = totalDays % daysInMonth;
  if (months === 0) return pluralDays(days);
  return days === 0 ? `${months} мес.` : `${months} мес. ${days} дн.`;
};

/** Таймер горящего предложения — как все таймеры, в игровых днях */
export const formatHotTimer = (ms: number, dayMs: number): string => formatGameDays(ms, dayMs);
