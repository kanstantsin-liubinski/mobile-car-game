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
export const CITY_BG_REF_SIZE = { width: 2700, height: 3900 };

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

export type CityBuildingType = 'market' | 'garage';

interface CityBuildingBase {
  id: string;
  type: CityBuildingType;
  name: string;
  emoji: string;
  /** Где здание нарисовано на фоне — по этой области тапают, над ней висит ярлык */
  area: CityArea;
}

export interface MarketBuilding extends CityBuildingBase {
  type: 'market';
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

export type CityBuilding = MarketBuilding | GarageBuilding;

export const MARKETS: MarketBuilding[] = [
  {
    id: 'market_south',
    type: 'market',
    name: 'Авторынок Южный',
    emoji: '🏪',
    area: bgArea(310, 2588, 1060, 543), // большой салон внизу у набережной
  },
  {
    id: 'market_north',
    type: 'market',
    name: 'Авторынок Северный',
    emoji: '🏬',
    area: bgArea(1461, 129, 1022, 492), // салон вверху справа
  },
];

export const GARAGES: GarageBuilding[] = [
  {
    id: 'garage_1',
    type: 'garage',
    name: 'Гараж 1',
    emoji: '🏠',
    area: bgArea(220, 996, 595, 414), // маленькая мастерская слева
    slots: 1,
    price: 0,
    requiredLevel: 0,
  },
  {
    id: 'garage_2',
    type: 'garage',
    name: 'Гараж 2',
    emoji: '🏭',
    area: bgArea(1707, 1475, 944, 621), // автосервис с боксами справа
    slots: 2,
    price: 25000,
    requiredLevel: 2,
  },
];

export const CITY_BUILDINGS: CityBuilding[] = [...MARKETS, ...GARAGES];

export const DEFAULT_MARKET_ID = MARKETS[0].id;
/** Стартовый гараж игрока */
export const DEFAULT_GARAGE_ID = GARAGES[0].id;

export const getMarketById = (id: string): MarketBuilding | undefined =>
  MARKETS.find((m) => m.id === id);

export const getGarageById = (id: string): GarageBuilding | undefined =>
  GARAGES.find((g) => g.id === id);

/** Ранг гаража (чем больше, тем круче). -1 — неизвестный id */
export const getGarageRank = (id: string): number => GARAGES.findIndex((g) => g.id === id);
