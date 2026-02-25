export type Screen = 'garage' | 'market' | 'skills';

export interface Car {
  id: string;
  name: string;
  price: number; // Текущая цена на авторынке (с учётом состояния)
  emoji: string;
  speed: number;
  description: string;
  year: number;
  mileage: number;
  condition: number; // 0-100 процентов состояния на момент продажи
}

export interface GarageCar extends Car {
  basePrice: number; // Цена при состоянии 100% (вычисляется при покупке)
  maxCondition: number; // Максимально возможное состояние (зависит от года и пробега)
}

export interface Mechanic {
  id: string;
  name: string;
  slotIndex: number; // Индекс слота гаража, которому назначен механик
  skillLevel: number; // Уровень скилла механика (множитель для ремонта)
  experience: number; // Опыт механика
  hired: boolean; // Нанят ли механик
}
