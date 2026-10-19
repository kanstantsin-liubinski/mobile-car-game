// 'market' и 'dealership' — подэкраны города (открываются из CityScreen)
export type Screen = 'garage' | 'city' | 'market' | 'dealership' | 'skills' | 'orders';

export interface Car {
  id: string;
  name: string;
  price: number; // Текущая цена на авторынке (с учётом состояния)
  emoji: string;
  speed: number;
  description: string;
  year: number;
  mileage: number;
  /** Техническое состояние, 0–100% (реальное; на авторынке игрок видит только интервал) */
  condition: number;
  /** Состояние ЛКП, 0–100%. Нет у старых сохранений — тогда считается равным техническому */
  paintCondition?: number;
  /** Реальный технический максимум экземпляра (у объявлений; в гараже — maxCondition машины) */
  maxCondition?: number;
  /** Цена модели при 100% состоянии — чтобы не восстанавливать её обратным счётом */
  basePrice?: number;
  /** Рыночная стоимость, если она отличается от цены покупки (например, наценка автосалона) */
  marketPrice?: number;
  /** Класс авто (тир из carModels.ts); у старых сохранений может отсутствовать */
  tier?: number;
}

export interface GarageCar extends Car {
  basePrice: number; // Цена при состоянии 100% (вычисляется при покупке)
  maxCondition: number; // Технический максимум: у своей машины — реальный, у клиентской — цель ремонта
  slotIndex: number; // Индекс слота гаража (-1 = не назначена)
  /** Машина клиента по ремонтному заказу: не актив игрока, продать нельзя */
  clientOrderId?: string;
  /** Цель покраски клиентской машины (по заказу на покраску) */
  paintTarget?: number;
}

export interface Mechanic {
  id: string;
  name: string;
  slotIndex: number; // Индекс слота гаража, которому назначен механик
  skillLevel: number; // Уровень скилла механика (множитель для ремонта)
  experience: number; // Опыт механика
  hired: boolean; // Нанят ли механик
  /** Профессия: механик (по умолчанию) или маляр */
  profession?: 'mechanic' | 'painter';
}
