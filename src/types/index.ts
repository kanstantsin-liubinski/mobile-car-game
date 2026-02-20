export type Screen = 'garage' | 'market';

export interface Car {
  id: string;
  name: string;
  price: number;
  emoji: string;
  speed: number;
  description: string;
  year: number;
  mileage: number;
}

export interface GarageCar extends Car {
  condition: number; // 0-100 процентов состояния
}
