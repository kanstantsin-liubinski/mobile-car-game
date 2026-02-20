export type Screen = 'garage' | 'market';

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
