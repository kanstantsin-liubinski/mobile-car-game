/** Деньги из центов: «$1 234», «−$500», с флагом sign — «+$300». Центы показываются, только если они есть. */
export const formatMoney = (cents: number, options: { sign?: boolean } = {}): string => {
  const abs = Math.abs(cents);
  const hasCents = abs % 100 !== 0;
  const text = (abs / 100).toLocaleString('ru-RU', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
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

/** Игровое время в днях, с округлением вверх: остаток 1 мс — это ещё «1 день» */
export const formatGameDays = (ms: number, dayMs: number): string =>
  ms <= 0 ? 'сейчас' : pluralDays(Math.ceil(ms / dayMs));

/** Оставшаяся перезарядка в игровых месяцах и днях: «2 мес. 14 дн.» */
export const formatGameCooldown = (ms: number, dayMs: number, daysInMonth: number): string => {
  const totalDays = Math.max(0, Math.ceil(ms / dayMs));
  const months = Math.floor(totalDays / daysInMonth);
  const days = totalDays % daysInMonth;
  if (months === 0) return pluralDays(days);
  return days === 0 ? `${months} мес.` : `${months} мес. ${days} дн.`;
};
