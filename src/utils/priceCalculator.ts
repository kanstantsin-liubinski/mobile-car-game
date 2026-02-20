/**
 * Вычислить максимальное состояние для автомобиля
 * На основе года выпуска и пробега
 * Результат уже округлён до одного знака после запятой
 */
export function calculateMaxCondition(year: number, mileage: number): number {
  const CURRENT_YEAR = 2026;
  const yearsSinceMake = Math.max(0, CURRENT_YEAR - year);
  
  // За каждый год отнимаем 0.5% от максимального состояния
  const yearsPenalty = yearsSinceMake * 0.5;
  
  // За каждые 10000 км отнимаем 1% (округляем в большую сторону)
  const mileagePenaltyUnits = Math.ceil(mileage / 10000);
  const mileagePenalty = mileagePenaltyUnits * 1;
  
  // Максимальное состояние, но не менее 10%
  const maxCondition = Math.max(10, 100 - yearsPenalty - mileagePenalty);
  
  // Округляем до одного знака после запятой для точности
  return Math.round(maxCondition * 10) / 10;
}

/**
 * Расчёт текущей стоимости автомобиля на основе:
 * - Базовой цены (при 100% состоянии)
 * - Пробега
 * - Года выпуска
 * - Состояния (0-100%)
 */

const CURRENT_YEAR = 2026;
const MAX_MILEAGE = 500000; // км, при котором цена падает почти к нулю

function getConditionFactor(condition: number): number {
  // Фактор состояния: от 30% при 0% состояния до 130% при 100% состояния
  return 0.3 + (condition / 100) * 1.0;
}

function getMileageFactor(mileage: number): number {
  // Фактор пробега: каждые 1000 км = 0.2% потери стоимости (максимум 50%)
  return Math.max(0.2, 1 - (mileage / MAX_MILEAGE) * 0.5);
}

function getYearFactor(year: number): number {
  // Фактор возраста: каждый год = 5% потери стоимости
  const yearsSinceMake = Math.max(0, CURRENT_YEAR - year);
  return Math.max(0.3, 1 - (yearsSinceMake / 20) * 0.5);
}

export function calculateCarPrice(basePrice: number, car: {
  year: number;
  mileage: number;
  condition: number;
}): number {
  const conditionFactor = getConditionFactor(car.condition);
  const mileageFactor = getMileageFactor(car.mileage);
  const yearFactor = getYearFactor(car.year);

  const currentPrice = basePrice * conditionFactor * mileageFactor * yearFactor;
  return Math.round(currentPrice);
}

/**
 * Вычислить базовую цену (при 100% состоянии) на основе текущей цены на авторынке
 */
export function calculateBasePrice(currentPrice: number, car: {
  year: number;
  mileage: number;
  condition: number;
}): number {
  const conditionFactor = getConditionFactor(car.condition);
  const mileageFactor = getMileageFactor(car.mileage);
  const yearFactor = getYearFactor(car.year);

  const basePrice = currentPrice / (conditionFactor * mileageFactor * yearFactor);
  return Math.round(basePrice);
}

/**
 * Получить диапазон возможной цены продажи
 * (показать игроку, что он может получить)
 */
export function getSellPriceRange(basePrice: number, car: {
  year: number;
  mileage: number;
  condition: number;
}): { min: number; max: number; current: number } {
  const currentPrice = calculateCarPrice(basePrice, car);
  
  return {
    min: Math.round(currentPrice * 0.9), // На 10% меньше
    max: Math.round(currentPrice * 1.1), // На 10% больше (если повезёт торговаться)
    current: currentPrice,
  };
}
