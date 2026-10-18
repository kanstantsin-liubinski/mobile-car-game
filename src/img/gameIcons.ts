import type { ImageSourcePropType } from 'react-native';

/**
 * Все картинки-иконки игры (assets/icons). Подключайте через <GameIcon source={ICONS.money} />.
 */
export const ICONS = {
  // Интерфейс
  money: require('../../assets/icons/ui/money.png'),
  xp: require('../../assets/icons/ui/xp.png'),
  skills: require('../../assets/icons/ui/skills.png'),
  navGarage: require('../../assets/icons/ui/nav_garage.png'),
  navCity: require('../../assets/icons/ui/nav_city.png'),

  // Характеристики машины
  speed: require('../../assets/icons/stats/speed.png'),
  year: require('../../assets/icons/stats/year.png'),
  mileage: require('../../assets/icons/stats/mileage.png'),
  timer: require('../../assets/icons/stats/timer.png'),

  // Действия
  repair: require('../../assets/icons/actions/repair.png'),
  sell: require('../../assets/icons/actions/sell.png'),
  hireMechanic: require('../../assets/icons/actions/hire_mechanic.png'),
  upgradeSkill: require('../../assets/icons/actions/upgrade_skill.png'),
} satisfies Record<string, ImageSourcePropType>;

/** Здания города по id из cityBuildings.ts */
export const BUILDING_ICONS: Record<string, ImageSourcePropType> = {
  garage_1: require('../../assets/icons/buildings/garage_1.png'),
  garage_2: require('../../assets/icons/buildings/garage_2.png'),
  garage_3: require('../../assets/icons/buildings/garage_3.png'),
  garage_4: require('../../assets/icons/buildings/garage_4.png'),
  market: require('../../assets/icons/buildings/market.png'),
  dealership: require('../../assets/icons/buildings/dealership.png'),
};

const CLASS_HYPER = require('../../assets/icons/classes/class_hyper.png');

/** Классы авто (тиры из carModels.ts) */
export const TIER_ICONS: Record<number, ImageSourcePropType> = {
  1: require('../../assets/icons/classes/class_economy.png'),
  2: require('../../assets/icons/classes/class_middle.png'),
  3: require('../../assets/icons/classes/class_premium.png'),
  4: require('../../assets/icons/classes/class_luxury.png'),
  5: CLASS_HYPER, // TODO: отдельная иконка для класса «Спорт»
  6: CLASS_HYPER,
};

export const MECHANIC_AVATARS: ImageSourcePropType[] = [
  require('../../assets/icons/mechanics/mechanic_01.png'),
  require('../../assets/icons/mechanics/mechanic_02.png'),
  require('../../assets/icons/mechanics/mechanic_03.png'),
  require('../../assets/icons/mechanics/mechanic_04.png'),
  require('../../assets/icons/mechanics/mechanic_05.png'),
  require('../../assets/icons/mechanics/mechanic_06.png'),
  require('../../assets/icons/mechanics/mechanic_07.png'),
  require('../../assets/icons/mechanics/mechanic_08.png'),
  require('../../assets/icons/mechanics/mechanic_09.png'),
  require('../../assets/icons/mechanics/mechanic_10.png'),
];

/** Аватар механика: стабильно выбирается по id, поэтому не меняется между запусками */
export const getMechanicAvatar = (mechanicId: string): ImageSourcePropType => {
  let hash = 0;
  for (let i = 0; i < mechanicId.length; i++) {
    hash = (hash * 31 + mechanicId.charCodeAt(i)) | 0;
  }
  return MECHANIC_AVATARS[Math.abs(hash) % MECHANIC_AVATARS.length];
};
