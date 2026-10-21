/**
 * Здания (монументы) на карте города.
 *
 * Каждое здание — область на фоне города (assets/city/city_bg.webp).
 * Координаты областей сняты в пикселях фона размера CITY_BG_REF_SIZE и хранятся
 * в долях (0..1), поэтому фон можно заменить на версию с другим разрешением
 * (той же картинки) без правки координат.
 */

export const CITY_BACKGROUND = require('../../assets/city/city_bg.webp');

/** Размер фона в пикселях, по которому сняты координаты зданий */
export const CITY_BG_REF_SIZE = { width: 1300, height: 900 };

/** Область на фоне в долях (0..1): левый верхний угол, ширина, высота */
export interface CityArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Переводит прямоугольник в пикселях фона (x, y, ширина, высота) в доли карты */
const bgArea = (x: number, y: number, w: number, h: number): CityArea => ({
  x: x / CITY_BG_REF_SIZE.width,
  y: y / CITY_BG_REF_SIZE.height,
  w: w / CITY_BG_REF_SIZE.width,
  h: h / CITY_BG_REF_SIZE.height,
});

export type CityBuildingType = 'market' | 'dealership' | 'garage' | 'fountain';

interface CityBuildingBase {
  id: string;
  type: CityBuildingType;
  name: string;
  emoji: string;
  /** Где здание нарисовано на фоне — по этой области тапают, над ней висит ярлык */
  area: CityArea;
}

/** Авторынок: подержанные машины из объявлений */
export interface MarketBuilding extends CityBuildingBase {
  type: 'market';
}

/** Автосалон: новые машины всех классов */
export interface DealershipBuilding extends CityBuildingBase {
  type: 'dealership';
}

/** Фонтан: в игре не участвует, но по нему можно тапать ради мелочи */
export interface FountainBuilding extends CityBuildingBase {
  type: 'fountain';
}

/**
 * Гаражи идут по возрастанию «крутости» (порядок в массиве GARAGES).
 * У игрока всегда один активный гараж. При покупке более крутого
 * всё (машины, механики) переезжает в него, а старый становится неактивным.
 * TODO: плюшки гаражей кроме мест под машины
 */
export interface GarageBuilding extends CityBuildingBase {
  type: 'garage';
  /** Количество мест для машин */
  slots: number;
  /** Цена покупки (0 — выдаётся бесплатно) */
  price: number;
  /** Уровень игрока, с которого гараж можно купить */
  requiredLevel: number;
}

export type CityBuilding = MarketBuilding | DealershipBuilding | GarageBuilding | FountainBuilding;

export const MARKETS: MarketBuilding[] = [
  {
    id: 'market',
    type: 'market',
    name: 'Авторынок',
    emoji: '🏪',
    area: bgArea(678, 16, 553, 215), // открытая площадка с навесами вверху справа
  },
];

export const DEALERSHIP: DealershipBuilding = {
  id: 'dealership',
  type: 'dealership',
  name: 'Автосалон',
  emoji: '✨',
  area: bgArea(780, 223, 305, 187), // стеклянный салон под авторынком
};

export const FOUNTAIN: FountainBuilding = {
  id: 'fountain',
  type: 'fountain',
  name: 'Фонтан',
  emoji: '⛲',
  area: bgArea(646, 418, 163, 106), // фонтан на круговом перекрёстке
};

export const GARAGES: GarageBuilding[] = [
  {
    id: 'garage_1',
    type: 'garage',
    name: 'Гараж 1',
    emoji: '🏠',
    area: bgArea(187, 410, 106, 89), // маленький гараж на одну машину слева
    slots: 1,
    price: 0,
    requiredLevel: 0,
  },
  {
    id: 'garage_2',
    type: 'garage',
    name: 'Гараж 2',
    emoji: '🔧',
    area: bgArea(508, 565, 215, 142), // мастерская под фонтаном
    slots: 2,
    price: 25000,
    requiredLevel: 5,
  },
  {
    id: 'garage_3',
    type: 'garage',
    name: 'Гараж 3',
    emoji: '🏭',
    area: bgArea(345, 284, 228, 150), // автосервис слева от фонтана
    slots: 4,
    price: 150_000, // ≈половина денег активного игрока к открытию по уровню (scripts/simulate.ts)
    requiredLevel: 20,
  },
  {
    id: 'garage_4',
    type: 'garage',
    name: 'Гараж 4',
    emoji: '🏢',
    area: bgArea(837, 504, 353, 240), // большой сервисный центр справа внизу
    slots: 8,
    price: 2_000_000,
    requiredLevel: 50,
  },
];

export const CITY_BUILDINGS: CityBuilding[] = [...MARKETS, DEALERSHIP, FOUNTAIN, ...GARAGES];

export const DEFAULT_MARKET_ID = MARKETS[0].id;
/** Стартовый гараж игрока */
export const DEFAULT_GARAGE_ID = GARAGES[0].id;

export const getMarketById = (id: string): MarketBuilding | undefined =>
  MARKETS.find((m) => m.id === id);

export const getGarageById = (id: string): GarageBuilding | undefined =>
  GARAGES.find((g) => g.id === id);

/** Ранг гаража (чем больше, тем круче). -1 — неизвестный id */
export const getGarageRank = (id: string): number => GARAGES.findIndex((g) => g.id === id);
