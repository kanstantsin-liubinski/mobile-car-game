/**
 * Генератор автомобилей для авторынка.
 * Создаёт объявления с рандомными характеристиками на основе моделей.
 */

import type { Car } from '@/types';
import type { CarModel } from '../data/carModels';
import { CAR_MODELS_BY_TIER } from '../data/carModels';
import { calculateCarPrice, calculateMaxCondition } from './priceCalculator';

export interface MarketListing {
  car: Car;
  modelId: string;
  tier: number;
  expiresAt: number;   // timestamp когда объявление исчезнет
  createdAt: number;    // timestamp когда появилось
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

/** Случайное целое число в диапазоне [min, max] включительно */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Случайное число с плавающей точкой [min, max) */
function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
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
function generateMileage(year: number): number {
  const CURRENT_YEAR = 2026;
  const age = CURRENT_YEAR - year;
  
  // В среднем 12000-20000 км/год, но с рандомом
  const avgPerYear = randInt(8000, 22000);
  const base = age * avgPerYear;
  
  // Разброс ±30%
  const variance = base * randFloat(-0.3, 0.3);
  const mileage = Math.max(100, Math.round(base + variance));
  
  return mileage;
}

/**
 * Генерирует состояние на основе года, пробега и maxCondition.
 * Состояние не может быть больше maxCondition.
 */
function generateCondition(year: number, mileage: number): number {
  const maxCondition = calculateMaxCondition(year, mileage);

  // Состояние от 30% до 95% от maxCondition
  const ratio = randFloat(0.3, 0.95);
  const condition = maxCondition * ratio;
  
  return Math.round(condition * 10) / 10;
}

/**
 * Генерирует одно объявление на основе модели.
 */
export function generateListing(model: CarModel): MarketListing {
  const [minYear, maxYear] = YEAR_RANGES[model.tier];
  const year = randInt(minYear, maxYear);
  const mileage = generateMileage(year);
  const condition = generateCondition(year, mileage);
  
  const price = calculateCarPrice(model.basePrice, { year, mileage, condition });
  
  const now = Date.now();
  const duration = randInt(MIN_LISTING_DURATION, MAX_LISTING_DURATION);
  
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
  existingModelIds: string[] = []
): MarketListing {
  const models = CAR_MODELS_BY_TIER[tier];
  
  // Пытаемся выбрать модель, которой нет в текущих объявлениях
  const available = models.filter((m) => !existingModelIds.includes(m.modelId));
  const pool = available.length > 0 ? available : models;
  
  const model = pool[randInt(0, pool.length - 1)];
  return generateListing(model);
}

/**
 * Генерирует начальный набор объявлений для одного тира.
 */
export function generateInitialListings(tier: number): MarketListing[] {
  const count = randInt(MIN_LISTINGS_PER_TIER, MAX_LISTINGS_PER_TIER);
  const listings: MarketListing[] = [];
  const usedModelIds: string[] = [];
  
  for (let i = 0; i < count; i++) {
    const listing = generateRandomListing(tier, usedModelIds);
    listings.push(listing);
    usedModelIds.push(listing.modelId);
  }
  
  return listings;
}

/**
 * Генерирует начальные объявления для всех тиров.
 */
export function generateAllInitialListings(): Record<number, MarketListing[]> {
  const result: Record<number, MarketListing[]> = {};
  
  for (let tier = 1; tier <= 6; tier++) {
    result[tier] = generateInitialListings(tier);
  }
  
  return result;
}
