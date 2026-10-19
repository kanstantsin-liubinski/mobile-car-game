/**
 * Генератор автомобилей для авторынка.
 * Создаёт объявления с рандомными характеристиками на основе моделей.
 */

import type { Car } from '@/types';
import type { CarModel } from '../data/carModels';
import { CAR_MODELS_BY_TIER } from '../data/carModels';
import { calculateCarPrice } from './priceCalculator';
import { generateTraits, overallCondition } from '../economy/carCondition';

export interface MarketListing {
  car: Car;
  modelId: string;
  tier: number;
  expiresAt: number;   // игровое время (мс активной игры), когда объявление исчезнет
  createdAt: number;    // игровое время, когда появилось
}

/** Диапазоны годов выпуска по тирам */
const YEAR_RANGES: Record<number, [number, number]> = {
  1: [1998, 2018],
  2: [2003, 2020],
  3: [2008, 2022],
  4: [2012, 2023],
  5: [2015, 2024],
  6: [2020, 2025],
};

/** Мин/макс таймера исчезновения (в мс) */
const MIN_LISTING_DURATION = 5 * 60 * 1000;   // 5 минут
const MAX_LISTING_DURATION = 20 * 60 * 1000;  // 20 минут

/** Кол-во объявлений на тир */
export const MIN_LISTINGS_PER_TIER = 5;
export const MAX_LISTINGS_PER_TIER = 7;

/** Источник случайности: по умолчанию Math.random, для горящих предложений — детерминированный */
export type Rng = () => number;

/** Случайное целое число в диапазоне [min, max] включительно */
function randInt(min: number, max: number, rng: Rng = Math.random): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** Случайное число с плавающей точкой [min, max) */
function randFloat(min: number, max: number, rng: Rng = Math.random): number {
  return rng() * (max - min) + min;
}

/** Уникальный ID для сгенерированного объявления */
let listingCounter = 0;
function generateListingId(modelId: string): string {
  listingCounter++;
  return `market-${modelId}-${Date.now()}-${listingCounter}`;
}

/**
 * Генерирует случайный пробег на основе года выпуска.
 * Старые машины → больше пробег
 */
function generateMileage(year: number, rng: Rng): number {
  const CURRENT_YEAR = 2026;
  const age = CURRENT_YEAR - year;
  
  // В среднем 12000-20000 км/год, но с рандомом
  const avgPerYear = randInt(8000, 22000, rng);
  const base = age * avgPerYear;
  
  // Разброс ±30%
  const variance = base * randFloat(-0.3, 0.3, rng);
  const mileage = Math.max(100, Math.round(base + variance));
  
  return mileage;
}

/**
 * Генерирует одно объявление на основе модели.
 */
 /**
 * Сначала создаются реальные характеристики экземпляра (тех. состояние, максимум со скрытым
 * отклонением, ЛКП, коэффициент цены продавца), затем цена: рыночная стоимость по общему
 * состоянию × коэффициент продавца. Что из этого увидит игрок, решает диагностика.
 */
export function generateListing(model: CarModel, now: number, rng: Rng = Math.random): MarketListing {
  const [minYear, maxYear] = YEAR_RANGES[model.tier];
  const year = randInt(minYear, maxYear, rng);
  const mileage = generateMileage(year, rng);
  const traits = generateTraits(year, mileage, 2026, rng);
  const condition = traits.condition;
  const fairPrice = calculateCarPrice(model.basePrice, {
    year,
    mileage,
    condition: overallCondition(traits.condition, traits.paintCondition),
  });
  const price = Math.max(1, Math.round(fairPrice * traits.sellerFactor));
  
  const duration = randInt(MIN_LISTING_DURATION, MAX_LISTING_DURATION, rng);
  
  const car: Car = {
    id: generateListingId(model.modelId),
    name: model.name,
    price,
    emoji: model.emoji,
    speed: model.speed,
    description: model.description,
    year,
    mileage,
    condition,
    paintCondition: traits.paintCondition,
    maxCondition: traits.maxCondition,
    basePrice: model.basePrice,
    marketPrice: fairPrice,
    tier: model.tier,
  };
  
  return {
    car,
    modelId: model.modelId,
    tier: model.tier,
    expiresAt: now + duration,
    createdAt: now,
  };
}

/**
 * Генерирует случайное объявление для указанного тира.
 * Учитывает, какие модели уже есть в текущих объявлениях (чтобы не дублировать).
 */
export function generateRandomListing(
  tier: number,
  now: number,
  existingModelIds: string[] = [],
  rng: Rng = Math.random
): MarketListing {
  const models = CAR_MODELS_BY_TIER[tier];
  
  // Пытаемся выбрать модель, которой нет в текущих объявлениях
  const available = models.filter((m) => !existingModelIds.includes(m.modelId));
  const pool = available.length > 0 ? available : models;
  
  const model = pool[randInt(0, pool.length - 1, rng)];
  return generateListing(model, now, rng);
}

/**
 * Генерирует начальный набор объявлений для одного тира.
 */
export function generateInitialListings(tier: number, now: number): MarketListing[] {
  const count = randInt(MIN_LISTINGS_PER_TIER, MAX_LISTINGS_PER_TIER);
  const listings: MarketListing[] = [];
  const usedModelIds: string[] = [];
  
  for (let i = 0; i < count; i++) {
    const listing = generateRandomListing(tier, now, usedModelIds);
    listings.push(listing);
    usedModelIds.push(listing.modelId);
  }
  
  return listings;
}

/**
 * Генерирует начальные объявления для всех тиров.
 */
export function generateAllInitialListings(now: number): Record<number, MarketListing[]> {
  const result: Record<number, MarketListing[]> = {};
  
  for (let tier = 1; tier <= 6; tier++) {
    result[tier] = generateInitialListings(tier, now);
  }
  
  return result;
}
