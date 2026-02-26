/**
 * База моделей автомобилей по уровням (тирам).
 * 6 уровней, по 10 моделей в каждом.
 */

export interface CarModel {
  modelId: string;
  name: string;
  emoji: string;
  speed: number;       // Максимальная скорость
  basePrice: number;   // Цена нового авто при 100% состоянии
  description: string;
  tier: number;
}

// ─── Тир 1: Эконом-класс ────────────────────────────────────────────
const TIER_1: CarModel[] = [
  { modelId: 't1-golf', name: 'VW Golf', emoji: '🚗', speed: 180, basePrice: 18000, description: 'Надёжная немецкая классика', tier: 1 },
  { modelId: 't1-solaris', name: 'Hyundai Solaris', emoji: '🚗', speed: 175, basePrice: 14000, description: 'Корейская бестселлер-легенда', tier: 1 },
  { modelId: 't1-rio', name: 'Kia Rio', emoji: '🚗', speed: 172, basePrice: 14500, description: 'Компактный и экономичный', tier: 1 },
  { modelId: 't1-logan', name: 'Renault Logan', emoji: '🚗', speed: 165, basePrice: 12000, description: 'Простой и неубиваемый', tier: 1 },
  { modelId: 't1-rapid', name: 'Skoda Rapid', emoji: '🚗', speed: 178, basePrice: 15000, description: 'Практичный чешский седан', tier: 1 },
  { modelId: 't1-vesta', name: 'Lada Vesta', emoji: '🚗', speed: 170, basePrice: 11000, description: 'Новая российская гордость', tier: 1 },
  { modelId: 't1-aveo', name: 'Chevrolet Aveo', emoji: '🚗', speed: 168, basePrice: 13000, description: 'Американская экономия', tier: 1 },
  { modelId: 't1-focus', name: 'Ford Focus', emoji: '🚗', speed: 185, basePrice: 17000, description: 'Спортивный хэтчбек', tier: 1 },
  { modelId: 't1-almera', name: 'Nissan Almera', emoji: '🚗', speed: 170, basePrice: 13500, description: 'Японская надёжность', tier: 1 },
  { modelId: 't1-308', name: 'Peugeot 308', emoji: '🚗', speed: 177, basePrice: 16000, description: 'Французский шик', tier: 1 },
];

// ─── Тир 2: Средний класс ───────────────────────────────────────────
const TIER_2: CarModel[] = [
  { modelId: 't2-mondeo', name: 'Ford Mondeo', emoji: '🚙', speed: 210, basePrice: 28000, description: 'Комфортный бизнес-седан', tier: 2 },
  { modelId: 't2-malibu', name: 'Chevrolet Malibu', emoji: '🚙', speed: 205, basePrice: 27000, description: 'Американский стиль и комфорт', tier: 2 },
  { modelId: 't2-camry', name: 'Toyota Camry', emoji: '🚙', speed: 210, basePrice: 30000, description: 'Король бизнес-класса', tier: 2 },
  { modelId: 't2-mazda6', name: 'Mazda 6', emoji: '🚙', speed: 215, basePrice: 29000, description: 'Стильный и динамичный', tier: 2 },
  { modelId: 't2-sonata', name: 'Hyundai Sonata', emoji: '🚙', speed: 200, basePrice: 26000, description: 'Технологичный седан', tier: 2 },
  { modelId: 't2-optima', name: 'Kia Optima', emoji: '🚙', speed: 205, basePrice: 25000, description: 'Корейский премиум-дизайн', tier: 2 },
  { modelId: 't2-superb', name: 'Skoda Superb', emoji: '🚙', speed: 210, basePrice: 28000, description: 'Просторный и практичный', tier: 2 },
  { modelId: 't2-passat', name: 'VW Passat', emoji: '🚙', speed: 215, basePrice: 30000, description: 'Немецкий бизнес-стандарт', tier: 2 },
  { modelId: 't2-accord', name: 'Honda Accord', emoji: '🚙', speed: 210, basePrice: 28000, description: 'Надёжная японская гармония', tier: 2 },
  { modelId: 't2-teana', name: 'Nissan Teana', emoji: '🚙', speed: 200, basePrice: 26000, description: 'Комфорт на каждый день', tier: 2 },
];

// ─── Тир 3: Премиум ─────────────────────────────────────────────────
const TIER_3: CarModel[] = [
  { modelId: 't3-3series', name: 'BMW 3 Series', emoji: '🚘', speed: 250, basePrice: 48000, description: 'Баварская классика драйва', tier: 3 },
  { modelId: 't3-cclass', name: 'Mercedes C-Class', emoji: '🚘', speed: 250, basePrice: 50000, description: 'Роскошь в компактном формате', tier: 3 },
  { modelId: 't3-a4', name: 'Audi A4', emoji: '🚘', speed: 245, basePrice: 47000, description: 'Прогрессивный немецкий дизайн', tier: 3 },
  { modelId: 't3-is', name: 'Lexus IS', emoji: '🚘', speed: 240, basePrice: 45000, description: 'Японский люкс с характером', tier: 3 },
  { modelId: 't3-s60', name: 'Volvo S60', emoji: '🚘', speed: 235, basePrice: 44000, description: 'Скандинавский комфорт и безопасность', tier: 3 },
  { modelId: 't3-q50', name: 'Infiniti Q50', emoji: '🚘', speed: 245, basePrice: 43000, description: 'Японский спорт-премиум', tier: 3 },
  { modelId: 't3-ats', name: 'Cadillac ATS', emoji: '🚘', speed: 240, basePrice: 42000, description: 'Американский премиум-спорт', tier: 3 },
  { modelId: 't3-xe', name: 'Jaguar XE', emoji: '🚘', speed: 250, basePrice: 46000, description: 'Британская элегантность', tier: 3 },
  { modelId: 't3-giulia', name: 'Alfa Romeo Giulia', emoji: '🚘', speed: 255, basePrice: 48000, description: 'Итальянская страсть', tier: 3 },
  { modelId: 't3-g70', name: 'Genesis G70', emoji: '🚘', speed: 245, basePrice: 44000, description: 'Новая звезда премиума', tier: 3 },
];

// ─── Тир 4: Люкс ────────────────────────────────────────────────────
const TIER_4: CarModel[] = [
  { modelId: 't4-5series', name: 'BMW 5 Series', emoji: '🏎️', speed: 270, basePrice: 72000, description: 'Бизнес-спорт высшего класса', tier: 4 },
  { modelId: 't4-eclass', name: 'Mercedes E-Class', emoji: '🏎️', speed: 265, basePrice: 75000, description: 'Эталон люкс-седана', tier: 4 },
  { modelId: 't4-a6', name: 'Audi A6', emoji: '🏎️', speed: 265, basePrice: 70000, description: 'Технологический флагман', tier: 4 },
  { modelId: 't4-gs', name: 'Lexus GS', emoji: '🏎️', speed: 260, basePrice: 68000, description: 'Изысканный гранд-турер', tier: 4 },
  { modelId: 't4-panamera', name: 'Porsche Panamera', emoji: '🏎️', speed: 290, basePrice: 95000, description: 'Спорткар в теле седана', tier: 4 },
  { modelId: 't4-ghibli', name: 'Maserati Ghibli', emoji: '🏎️', speed: 280, basePrice: 85000, description: 'Итальянский роскошный рык', tier: 4 },
  { modelId: 't4-models', name: 'Tesla Model S', emoji: '🏎️', speed: 260, basePrice: 90000, description: 'Электрическое будущее', tier: 4 },
  { modelId: 't4-g80', name: 'Genesis G80', emoji: '🏎️', speed: 255, basePrice: 65000, description: 'Восточный люкс нового поколения', tier: 4 },
  { modelId: 't4-s90', name: 'Volvo S90', emoji: '🏎️', speed: 250, basePrice: 62000, description: 'Скандинавская роскошь', tier: 4 },
  { modelId: 't4-xf', name: 'Jaguar XF', emoji: '🏎️', speed: 265, basePrice: 70000, description: 'Британский аристократ', tier: 4 },
];

// ─── Тир 5: Спорткары ───────────────────────────────────────────────
const TIER_5: CarModel[] = [
  { modelId: 't5-911', name: 'Porsche 911', emoji: '🏁', speed: 310, basePrice: 130000, description: 'Икона мирового автоспорта', tier: 5 },
  { modelId: 't5-m4', name: 'BMW M4', emoji: '🏁', speed: 290, basePrice: 100000, description: 'Баварский зверь на треке', tier: 5 },
  { modelId: 't5-amggt', name: 'Mercedes AMG GT', emoji: '🏁', speed: 310, basePrice: 140000, description: 'Мощь и безудержная скорость', tier: 5 },
  { modelId: 't5-gtr', name: 'Nissan GT-R', emoji: '🏁', speed: 315, basePrice: 115000, description: 'Годзилла японского автоспорта', tier: 5 },
  { modelId: 't5-corvette', name: 'Chevrolet Corvette', emoji: '🏁', speed: 305, basePrice: 105000, description: 'Американская мечта на треке', tier: 5 },
  { modelId: 't5-gt500', name: 'Ford Mustang GT500', emoji: '🏁', speed: 295, basePrice: 95000, description: 'Мустанг с невероятной мощью', tier: 5 },
  { modelId: 't5-r8', name: 'Audi R8', emoji: '🏁', speed: 320, basePrice: 160000, description: 'Немецкий суперкар на каждый день', tier: 5 },
  { modelId: 't5-huracan', name: 'Lamborghini Huracán', emoji: '🏁', speed: 325, basePrice: 200000, description: 'Итальянский бык на свободе', tier: 5 },
  { modelId: 't5-570s', name: 'McLaren 570S', emoji: '🏁', speed: 320, basePrice: 180000, description: 'Британская инженерия скорости', tier: 5 },
  { modelId: 't5-488', name: 'Ferrari 488', emoji: '🏁', speed: 325, basePrice: 220000, description: 'Красная мечта каждого', tier: 5 },
];

// ─── Тир 6: Гиперкары ───────────────────────────────────────────────
const TIER_6: CarModel[] = [
  { modelId: 't6-chiron', name: 'Bugatti Chiron', emoji: '⚡', speed: 420, basePrice: 2800000, description: 'Быстрейший гиперкар на планете', tier: 6 },
  { modelId: 't6-jesko', name: 'Koenigsegg Jesko', emoji: '⚡', speed: 430, basePrice: 3000000, description: 'Шведский мегакар без компромиссов', tier: 6 },
  { modelId: 't6-huayra', name: 'Pagani Huayra', emoji: '⚡', speed: 370, basePrice: 2500000, description: 'Произведение итальянского искусства', tier: 6 },
  { modelId: 't6-p1', name: 'McLaren P1', emoji: '⚡', speed: 350, basePrice: 1800000, description: 'Гибридный гиперкар из будущего', tier: 6 },
  { modelId: 't6-laferrari', name: 'Ferrari LaFerrari', emoji: '⚡', speed: 355, basePrice: 2200000, description: 'Вершина инженерной мысли Ferrari', tier: 6 },
  { modelId: 't6-aventador', name: 'Lamborghini Aventador', emoji: '⚡', speed: 350, basePrice: 500000, description: 'Безудержный итальянский бык', tier: 6 },
  { modelId: 't6-918', name: 'Porsche 918 Spyder', emoji: '⚡', speed: 345, basePrice: 1500000, description: 'Гибридный суперкар Porsche', tier: 6 },
  { modelId: 't6-valkyrie', name: 'Aston Martin Valkyrie', emoji: '⚡', speed: 400, basePrice: 3200000, description: 'Формула-1 для дорог', tier: 6 },
  { modelId: 't6-nevera', name: 'Rimac Nevera', emoji: '⚡', speed: 412, basePrice: 2100000, description: 'Электрический гиперкар рекордов', tier: 6 },
  { modelId: 't6-amgone', name: 'Mercedes AMG One', emoji: '⚡', speed: 355, basePrice: 2600000, description: 'Двигатель Формулы-1 на дороге', tier: 6 },
];

/** Все модели по уровням */
export const CAR_MODELS_BY_TIER: Record<number, CarModel[]> = {
  1: TIER_1,
  2: TIER_2,
  3: TIER_3,
  4: TIER_4,
  5: TIER_5,
  6: TIER_6,
};

/** Все модели плоским списком */
export const ALL_CAR_MODELS: CarModel[] = [
  ...TIER_1,
  ...TIER_2,
  ...TIER_3,
  ...TIER_4,
  ...TIER_5,
  ...TIER_6,
];

/** Названия уровней */
export const TIER_NAMES: Record<number, string> = {
  1: 'Эконом',
  2: 'Средний',
  3: 'Премиум',
  4: 'Люкс',
  5: 'Спорт',
  6: 'Гипер',
};

/** Эмодзи уровней */
export const TIER_EMOJIS: Record<number, string> = {
  1: '🚗',
  2: '🚙',
  3: '🚘',
  4: '🏎️',
  5: '🏁',
  6: '⚡',
};

export const TOTAL_TIERS = 6;

/** Уровень игрока, необходимый для открытия каждого тира */
export const TIER_UNLOCK_LEVELS: Record<number, number> = {
  1: 0,   // Доступен сразу
  2: 5,   // Открывается на 5 уровне
  3: 10,  // Открывается на 10 уровне
  4: 15,  // Открывается на 15 уровне
  5: 20,  // Открывается на 20 уровне
  6: 25,  // Открывается на 25 уровне
};
