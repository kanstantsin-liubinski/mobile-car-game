import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Car, GarageCar, Mechanic } from '@/types';
import { calculateBasePrice, calculateMaxCondition } from '../utils/priceCalculator';
import { DEFAULT_GARAGE_ID, getGarageById, getGarageRank } from '../data/cityBuildings';
import { nameMatchingAvatar, staffFirstName } from '../data/staffNames';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { useSoldCarsContext } from '@hooks/SoldCarsContext';
import { useToast } from '@components/toast/ToastContext';
import { useGameEvents } from '@components/events/GameEvents';
import { getCarTier } from '@components/CarImage';
import { ICONS, TIER_ICONS, getMechanicAvatar } from '@img/gameIcons';

const ICONS_PAINT = ICONS.repair;
import {
  assetCostCents,
  clientWorkMultiplier,
  ownPaintMaterialsShare,
  parkingSpots,
  clearanceSpeedFactor,
  hasEquipment,
  repairToolsMultiplier,
  toCents,
  workerSpeedMultiplier,
} from '../economy/economy';
import { saleXp } from '../economy/progression';
import { formatMoney } from '../economy/format';
import { carValue, overallCondition, paintValueGain, repairPartsCents } from '../economy/carCondition';
import * as BAL from '../economy/balance';
import { DAY_MS } from '../economy/time';
import type { ServiceOrder } from '../economy/orders';
import { offerPrice, rollSaleOffer, type SaleOffer } from '../economy/events';

/** Ремонт механиком. Время — игровое (мс активной игры), поэтому в фоне и на паузе ремонт стоит. */
export interface MechanicRepairInfo {
  mechanicId: string;
  startCondition: number;
  maxCondition: number;
  startedAtMs: number;
  durationMs: number;
  /** Скорость ремонта (% в секунду) с учётом навыка механика на момент старта/повышения */
  speedPerSec?: number;
  /** Уровень навыка механика, с которым считается текущая скорость */
  skillLevel?: number;
  /** Множитель инструментов, с которым считается скорость */
  toolsMult?: number;
  /** Старые сохранения: детали, оплаченные сразу за весь ремонт (возвращаются при остановке) */
  partsCents?: number;
  /** С какого состояния считался план деталей — для возврата неиспользованного при остановке */
  partsFromCondition?: number;
  /**
   * До какого состояния детали уже оплачены (своя машина). Механик платит за детали по ходу работы,
   * как игрок за тапы; нет денег — останавливается на оплаченном.
   */
  billedCondition?: number;
  /** Множитель допуска (вдвое медленнее, если класс машины выше допуска механика) */
  clearanceMult?: number;
}

/** Покраска своей машины в стороннем сервисе: машина занята, по окончании ЛКП = цель */
export interface ServicePaintJob {
  startPaint: number;
  targetPaint: number;
  startedAtMs: number;
  durationMs: number;
  costCents: number;
}

/** Работа в своей покрасочной камере: материалы оплачены, красит игрок тапами или маляр */
export interface BoothJob {
  carId: string;
  targetPaint: number;
  materialsCents: number;
  startedAtMs: number;
}

/** Маляр красит машину в камере. Время — игровое */
export interface PainterRun {
  painterId: string;
  startPaint: number;
  startedAtMs: number;
  speedPerSec: number;
  skillLevel: number;
}

/** Выставленная на продажу машина. Время — игровое. */
export interface ActiveSellInfo {
  sellPrice: number;
  boughtPrice: number;
  startedAtMs: number;
  durationMs: number;
  /** Покупатель с предложением придёт посреди продажи (events.ts) */
  offer?: SaleOffer;
}

const GARAGE_KEY = 'game_garage';
const GARAGE_CONFIG_KEY = 'game_garage_config';
/** Базовая скорость ремонта механиком: % состояния в секунду игрового времени (×1 на 1-м уровне навыка) */
const MECHANIC_REPAIR_SPEED = BAL.MECHANIC_SPEED_PER_SEC;
/** Базовая эффективность ручного тапа, % состояния (умножается на навык игрока) */
const PLAYER_TAP_REPAIR = 0.1;

const paintAt = (run: PainterRun, target: number, now: number): number =>
  Math.min(target, Math.round((run.startPaint + (Math.max(0, now - run.startedAtMs) / 1000) * run.speedPerSec) * 100) / 100);

/** Механик оплачивает детали порциями — каждые столько пунктов состояния (как ручной тап) */
const MECHANIC_BILL_STEP = PLAYER_TAP_REPAIR;

const repairConditionAt = (repair: MechanicRepairInfo, now: number): number => {
  const elapsedSec = Math.max(0, now - repair.startedAtMs) / 1000;
  const speed = repair.speedPerSec ?? MECHANIC_REPAIR_SPEED;
  const condition = Math.round((repair.startCondition + elapsedSec * speed) * 100) / 100;
  return Math.min(repair.maxCondition, condition);
};

const progressAt = (startedAtMs: number, durationMs: number, now: number): number =>
  durationMs <= 0 ? 100 : Math.min(100, Math.max(0, ((now - startedAtMs) / durationMs) * 100));

const without = <T,>(record: Record<string, T>, key: string): Record<string, T> => {
  const { [key]: _removed, ...rest } = record;
  return rest;
};

export const useGarage = () => {
  const economy = useEconomy();
  const { gameTimeMs } = useGameClock();
  const { markAsSold } = useSoldCarsContext();
  const { showToast } = useToast();
  const { pushEvent } = useGameEvents();

  // Машины как они сохранены; во время ремонта состояние машины вычисляется из времени
  const [storedGarage, setGarage] = useState<GarageCar[]>([]);
  // Активный гараж игрока. Гаражи с меньшим рангом считаются неактивными (см. cityBuildings.ts)
  const [garageId, setGarageId] = useState(DEFAULT_GARAGE_ID);
  const garageSlots = getGarageById(garageId)?.slots ?? 1;
  // Коммерческая стоянка: места с индексами PARKING_BASE…, только хранение и продажа
  const parkingCount = parkingSpots(economy.state);
  const parkingSlots = useMemo(() => Array.from({ length: parkingCount }, (_, i) => BAL.PARKING_BASE + i), [parkingCount]);
  const isParkingSlot = useCallback((i: number) => i >= BAL.PARKING_BASE && i < BAL.PARKING_BASE + parkingCount, [parkingCount]);
  /** Все места: рабочие слоты гаража и места стоянки */
  const allSlots = useMemo(() => [...Array.from({ length: garageSlots }, (_, i) => i), ...parkingSlots], [garageSlots, parkingSlots]);
  const slotLabel = useCallback((i: number) => (i >= BAL.PARKING_BASE ? `P${i - BAL.PARKING_BASE + 1}` : String(i + 1)), []);
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const reconciledRef = useRef(false);
  const partsWarnAt = useRef(0);

  // Ремонты и продажи хранятся вместе с гаражом и продолжаются после перезапуска
  const [mechanicRepairs, setMechanicRepairs] = useState<Record<string, MechanicRepairInfo>>({});
  const [activeSells, setActiveSells] = useState<Record<string, ActiveSellInfo>>({});
  // Покраска: сторонний сервис, своя камера, маляр
  const [painters, setPainters] = useState<Mechanic[]>([]);
  const [servicePaints, setServicePaints] = useState<Record<string, ServicePaintJob>>({});
  const [boothJob, setBoothJob] = useState<BoothJob | null>(null);
  const [painterRun, setPainterRun] = useState<PainterRun | null>(null);
  const [painterPaused, setPainterPaused] = useState(false);
  const boothSlot = economy.state.equipment.boothSlot;

  /** Кандидат в механики: имя под его аватар (женский портрет — женское имя) */
  const newMechanicCandidate = (): Mechanic => {
    const id = generateMechanicId();
    return { id, name: staffFirstName(id), slotIndex: -1, skillLevel: 1, experience: 0, hired: false };
  };

  const generateMechanicId = (): string => {
    return `mechanic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Загружаем гараж при монтировании
  useEffect(() => {
    loadGarage();
    loadGarageConfig();
  }, []);

  // Сохраняем гараж при изменении
  useEffect(() => {
    if (isLoaded) {
      saveGarage(storedGarage);
    }
  }, [storedGarage, isLoaded]);

  // Сохраняем конфиг гаража при изменении
  useEffect(() => {
    if (isConfigLoaded) {
      saveGarageConfig();
    }
  }, [garageId, mechanics, mechanicRepairs, activeSells, painters, servicePaints, boothJob, painterRun, painterPaused, isConfigLoaded]);

  // Машины вне диапазона слотов активного гаража (старые сохранения) переставляем в свободные слоты
  useEffect(() => {
    if (!isLoaded || !isConfigLoaded) return;
    setGarage((prev) => {
      if (!prev.some((c) => c.slotIndex >= garageSlots && !isParkingSlot(c.slotIndex))) return prev;
      const used = new Set(prev.filter((c) => c.slotIndex >= 0 && c.slotIndex < garageSlots).map((c) => c.slotIndex));
      return prev.map((car) => {
        if (car.slotIndex < garageSlots || isParkingSlot(car.slotIndex)) return car;
        let free = -1;
        for (let i = 0; i < garageSlots; i++) {
          if (!used.has(i)) { free = i; break; }
        }
        if (free !== -1) used.add(free);
        return { ...car, slotIndex: free };
      });
    });
  }, [isLoaded, isConfigLoaded, garageSlots, isParkingSlot]);

  const loadGarage = async () => {
    try {
      const saved = await AsyncStorage.getItem(GARAGE_KEY);
      if (saved !== null) {
        let garageData = JSON.parse(saved) as GarageCar[];
        // Добавляем slotIndex для старых машин, если его нет
        garageData = garageData.map((car) => ({
          ...car,
          slotIndex: car.slotIndex !== undefined ? car.slotIndex : -1,
        }));
        setGarage(garageData);
      }
    } catch (error) {
      console.error('Error loading garage:', error);
    } finally {
      setIsLoaded(true);
    }
  };

  const saveGarage = async (garageData: GarageCar[]) => {
    try {
      await AsyncStorage.setItem(GARAGE_KEY, JSON.stringify(garageData));
    } catch (error) {
      console.error('Error saving garage:', error);
    }
  };

  const loadGarageConfig = async () => {
    try {
      const saved = await AsyncStorage.getItem(GARAGE_CONFIG_KEY);
      if (saved !== null) {
        const config = JSON.parse(saved);

        let loadedGarageId: string;
        if (typeof config.garageId === 'string' && getGarageById(config.garageId)) {
          loadedGarageId = config.garageId;
        } else if (Array.isArray(config.ownedGarageIds) && config.ownedGarageIds.length > 0) {
          // Формат с несколькими гаражами: активным становится самый крутой из купленных
          loadedGarageId = config.ownedGarageIds.reduce(
            (best: string, id: string) => (getGarageRank(id) > getGarageRank(best) ? id : best),
            DEFAULT_GARAGE_ID,
          );
        } else if ((config.garageSlots || 1) > 1) {
          // Старый формат (апгрейд слотов до 3): выдаём Гараж 2, чтобы машины во 2-м слоте не потерялись
          loadedGarageId = 'garage_2';
        } else {
          loadedGarageId = DEFAULT_GARAGE_ID;
        }
        setGarageId(loadedGarageId);
        const slotsCount = getGarageById(loadedGarageId)?.slots ?? 1;

        // Обработка старого формата данных (mechanics как число)
        if (typeof config.mechanics === 'number') {
          // Конвертируем старый формат (число) в новый (массив)
          // Создаем массив механиков на основе количества слотов
          const newMechanics: Mechanic[] = [];

          for (let i = 0; i < slotsCount; i++) {
            newMechanics.push(newMechanicCandidate());
          }

          setMechanics(newMechanics);
        } else if (Array.isArray(config.mechanics)) {
          const updatedMechanics = config.mechanics.map((m: any) => ({
            ...m,
            name: nameMatchingAvatar(m.id, m.name ?? ''),
            hired: m.hired !== undefined ? m.hired : false,
          }));
          setMechanics(updatedMechanics);
        } else {
          setMechanics([]);
        }

        // Ремонты и продажи старого формата (на реальных часах) не переносим — они не сохранялись
        const isGameTimeRecord = (r: any) => r && typeof r.startedAtMs === 'number' && typeof r.durationMs === 'number';
        if (config.mechanicRepairs && typeof config.mechanicRepairs === 'object') {
          setMechanicRepairs(
            Object.fromEntries(Object.entries(config.mechanicRepairs).filter(([, r]) => isGameTimeRecord(r))) as Record<
              string,
              MechanicRepairInfo
            >,
          );
        }
        // Имена из старых сохранений приводим к полу аватара
        if (Array.isArray(config.painters)) setPainters(config.painters.map((p: Mechanic) => ({ ...p, name: nameMatchingAvatar(p.id, p.name) })));
        if (config.servicePaints && typeof config.servicePaints === 'object') setServicePaints(config.servicePaints);
        if (config.boothJob) setBoothJob(config.boothJob);
        if (config.painterRun) setPainterRun(config.painterRun);
        setPainterPaused(!!config.painterPaused);
        if (config.activeSells && typeof config.activeSells === 'object') {
          setActiveSells(
            Object.fromEntries(Object.entries(config.activeSells).filter(([, r]) => isGameTimeRecord(r))) as Record<
              string,
              ActiveSellInfo
            >,
          );
        }
      }
    } catch (error) {
      console.error('Error loading garage config:', error);
    } finally {
      setIsConfigLoaded(true);
    }
  };

  const saveGarageConfig = async () => {
    try {
      await AsyncStorage.setItem(
        GARAGE_CONFIG_KEY,
        JSON.stringify({
          garageId,
          mechanics,
          mechanicRepairs,
          activeSells,
          painters,
          servicePaints,
          boothJob,
          painterRun,
          painterPaused,
        }),
      );
    } catch (error) {
      console.error('Error saving garage config:', error);
    }
  };

  // ─── Живое состояние машин и прогресс по игровому времени ──────────
  const garage = useMemo(
    () =>
      storedGarage.map((car) => {
        const repair = mechanicRepairs[car.id];
        let live = repair ? { ...car, condition: repairConditionAt(repair, gameTimeMs) } : car;
        if (painterRun && boothJob?.carId === car.id) {
          live = { ...live, paintCondition: paintAt(painterRun, boothJob.targetPaint, gameTimeMs) };
        }
        return live;
      }),
    [storedGarage, mechanicRepairs, painterRun, boothJob, gameTimeMs],
  );

  const { mechanicRepairsProgress, mechanicRepairsCondition, mechanicRepairsRemaining } = useMemo(() => {
    const progress: Record<string, number> = {};
    const condition: Record<string, number> = {};
    const remaining: Record<string, number> = {};
    for (const [carId, r] of Object.entries(mechanicRepairs)) {
      progress[carId] = progressAt(r.startedAtMs, r.durationMs, gameTimeMs);
      condition[carId] = repairConditionAt(r, gameTimeMs);
      remaining[carId] = Math.max(0, r.startedAtMs + r.durationMs - gameTimeMs);
    }
    return { mechanicRepairsProgress: progress, mechanicRepairsCondition: condition, mechanicRepairsRemaining: remaining };
  }, [mechanicRepairs, gameTimeMs]);

  const { activeSellsProgress, activeSellsRemaining } = useMemo(() => {
    const progress: Record<string, number> = {};
    const remaining: Record<string, number> = {};
    for (const [carId, sell] of Object.entries(activeSells)) {
      progress[carId] = progressAt(sell.startedAtMs, sell.durationMs, gameTimeMs);
      remaining[carId] = Math.max(0, sell.startedAtMs + sell.durationMs - gameTimeMs);
    }
    return { activeSellsProgress: progress, activeSellsRemaining: remaining };
  }, [activeSells, gameTimeMs]);

  // ─── Машины ───────────────────────────────────────────────────────
  const addCar = useCallback((car: Car, slotIndex?: number) => {
    // Базовая цена (при 100%) — из объявления; для старых объявлений — обратным счётом от рыночной стоимости
    const basePrice =
      car.basePrice ??
      calculateBasePrice(car.marketPrice ?? car.price, {
        year: car.year,
        mileage: car.mileage,
        condition: overallCondition(car.condition, car.paintCondition),
      });

    // Реальный технический максимум экземпляра (после покупки он раскрывается полностью)
    const maxConditionRaw = car.maxCondition ?? calculateMaxCondition(car.year, car.mileage);
    const maxCondition = Math.round(maxConditionRaw * 10) / 10;
    const paintCondition = car.paintCondition ?? car.condition;

    // Округляем исходное состояние до одного знака для точности
    const roundedCondition = Math.round(car.condition * 10) / 10;

    setGarage((prevGarage) => {
      // Определяем слот для машины
      let assignedSlot = slotIndex;

      // Если слот не передан или он занят, ищем первый свободный
      if (assignedSlot === undefined || prevGarage.some((c) => c.slotIndex === assignedSlot)) {
        assignedSlot = allSlots.find((i) => !prevGarage.some((c) => c.slotIndex === i));
      }

      const garageCar: GarageCar = {
        ...car,
        paintCondition,
        condition: roundedCondition,
        basePrice,
        maxCondition,
        slotIndex: assignedSlot!, // Назначаем выбранный или первый свободный слот
      };
      return [...prevGarage, garageCar];
    });

    // Покупка проходит через гараж и с авторынка, и из автосалона — уведомление на любом экране
    const tier = getCarTier(car);
    showToast({
      title: `${car.name} куплен`,
      message: `Заплачено ${formatMoney(toCents(car.price))} · техника ${roundedCondition}% из ${maxCondition}%, ЛКП ${Math.round(paintCondition)}%`,
      icon: tier ? TIER_ICONS[tier] : undefined,
    });
  }, [allSlots, showToast]);

  const removeCar = useCallback((carId: string) => {
    setGarage((prev) => prev.filter((car) => car.id !== carId));
  }, []);

  const hasCar = useCallback((carId: string) => garage.some((car) => car.id === carId), [garage]);

  /**
   * Ручной тап «Ремонт». Успешный тап (машина есть, не на максимуме, не у механика и не продаётся)
   * чинит на 0,1% × навык игрока и даёт ровно 1 практику. Первое полное восстановление — бонус XP.
   */
  const repairCar = useCallback((carId: string): boolean => {
    const car = storedGarage.find((c) => c.id === carId);
    if (!car || mechanicRepairs[carId] || activeSells[carId] || servicePaints[carId] || car.condition >= car.maxCondition) return false;
    // В покрасочной камере и на стоянке механический ремонт не ведётся
    if ((boothSlot !== null && car.slotIndex === boothSlot) || isParkingSlot(car.slotIndex)) return false;

    const repairAmount = PLAYER_TAP_REPAIR * economy.playerTapMultiplier * clientWorkMultiplier(economy.state, car.clientOrderId);
    // Точность до тысячных: +5% навыка не теряются при округлении
    const newCondition = Math.min(
      Math.round(car.maxCondition * 1000) / 1000,
      Math.round((car.condition + repairAmount) * 1000) / 1000,
    );
    // Детали за свою машину: OWN_REPAIR_PARTS_SHARE прироста стоимости от этого тапа; нет денег — тап не выполняется
    if (!car.clientOrderId && economy.state.assets[carId]) {
      const parts = repairPartsCents(car, car.condition, newCondition);
      if (!economy.payTapParts(carId, parts)) {
        // Предупреждаем не чаще раза в 3 секунды, чтобы не засыпать тостами при быстрых тапах
        if (Date.now() - partsWarnAt.current > 3000) {
          partsWarnAt.current = Date.now();
          showToast({ title: 'Не хватает денег на детали', message: 'Ремонт своей машины требует запчастей — пополни баланс.', icon: ICONS.repair });
        }
        return false;
      }
    }
    setGarage((prev) => prev.map((c) => (c.id === carId ? { ...c, condition: newCondition } : c)));
    economy.recordPlayerTap();
    if (newCondition >= car.maxCondition) {
      // Клиентская машина: фиксируем момент окончания работы; своя — бонус XP за полное восстановление
      if (car.clientOrderId) economy.markOrderWorkDone(car.clientOrderId);
      else economy.awardFullRepair(carId);
    }
    return true;
  }, [storedGarage, mechanicRepairs, activeSells, servicePaints, boothSlot, isParkingSlot, economy, showToast]);

  const getCar = useCallback((carId: string) => garage.find((car) => car.id === carId), [garage]);

  /**
   * Покупка более крутого гаража: он становится активным, машины и механики
   * переезжают в него (индексы слотов сохраняются — в новом гараже мест не меньше).
   * Списание денег и проверка уровня — на вызывающей стороне.
   */
  const buyGarage = useCallback((newGarageId: string) => {
    setGarageId((prev) => (getGarageRank(newGarageId) > getGarageRank(prev) ? newGarageId : prev));
  }, []);

  // Синхронизируем количество механиков с количеством слотов
  useEffect(() => {
    setMechanics((prevMechanics) => {
      let updatedMechanics = [...prevMechanics];

      // Если слотов больше, добавляем новых механиков
      while (updatedMechanics.length < garageSlots) {
        updatedMechanics.push(newMechanicCandidate());
      }

      // Если слотов меньше, убираем лишних кандидатов. Нанятых не трогаем: штат общий с филиалами,
      // и сотрудников бывает больше, чем мест в гараже
      while (updatedMechanics.length > garageSlots) {
        const lastCandidate = updatedMechanics.map((m) => m.hired).lastIndexOf(false);
        if (lastCandidate < 0) break;
        updatedMechanics = updatedMechanics.filter((_, i) => i !== lastCandidate);
      }

      return updatedMechanics;
    });
  }, [garageSlots]);

  /**
   * Общий штат с филиалами: в списке гаража все механики, где бы они ни работали (нанятые прямо в
   * филиале — тоже). Работающий в филиале не занимает слот гаража.
   */
  useEffect(() => {
    if (!isConfigLoaded) return;
    const { contracts, branches } = economy.state;
    setMechanics((prev) => {
      let next = prev;
      for (const c of Object.values(contracts)) {
        if (c.profession && c.profession !== 'mechanic') continue;
        if (next.some((m) => m.id === c.mechanicId)) continue;
        const name = c.name ?? (c.branchId ? branches?.[c.branchId]?.staffNames[c.mechanicId] : undefined);
        if (!name) continue; // контракты механиков гаража создаются вместе с его списком
        next = [...next, { id: c.mechanicId, name, slotIndex: -1, skillLevel: c.skill.level, experience: 0, hired: true }];
      }
      next = next.map((m) => (contracts[m.id]?.branchId && m.slotIndex !== -1 ? { ...m, slotIndex: -1 } : m));
      // Кандидатов на найм — не больше, чем мест (уволенный через филиал не оставляет лишнего)
      while (next.length > garageSlots) {
        const lastCandidate = next.map((m): boolean => m.hired || !!contracts[m.id]).lastIndexOf(false);
        if (lastCandidate < 0) break;
        next = next.filter((_, i) => i !== lastCandidate);
      }
      return next.length === prev.length && next.every((m, i) => m === prev[i]) ? prev : next;
    });
  }, [isConfigLoaded, economy.state.contracts, economy.state.branches, garageSlots]);

  // ─── Механики ─────────────────────────────────────────────────────
  const changeMechanicSlot = useCallback((mechanicId: string, newSlotIndex: number): boolean => {
    // Разрешаем -1 для открепления и 0-garageSlots для прикрепления
    if (newSlotIndex !== -1 && (newSlotIndex < 0 || newSlotIndex >= garageSlots)) return false;
    // Слот камеры — не место для механика
    if (newSlotIndex !== -1 && newSlotIndex === boothSlot) return false;
    // Работающего в филиале сначала возвращают в гараж
    if (newSlotIndex !== -1 && economy.state.contracts[mechanicId]?.branchId) return false;

    setMechanics((prev) =>
      prev.map((m) => {
        if (m.id === mechanicId) {
          return { ...m, slotIndex: newSlotIndex };
        }
        return m;
      })
    );
    return true;
  }, [garageSlots, boothSlot, economy.state.contracts]);

  /**
   * Наём открывает трудовой контракт: зарплата начисляется с этого момента. Нанятый сразу встаёт
   * на первый свободный слот — без этого он висел «без слота» и получал оклад за простой.
   */
  const hireMechanic = useCallback((mechanicId: string): boolean => {
    const mechanic = mechanics.find((m) => m.id === mechanicId);
    if (!mechanic || mechanic.hired) return false;

    economy.hireMechanic(mechanicId);
    setMechanics((prev) => {
      const taken = new Set(prev.filter((m) => m.id !== mechanicId && m.slotIndex >= 0).map((m) => m.slotIndex));
      const freeSlot = Array.from({ length: garageSlots }, (_, i) => i).find((i) => !taken.has(i) && i !== boothSlot);
      return prev.map((m) =>
        m.id === mechanicId ? { ...m, hired: true, slotIndex: m.slotIndex >= 0 ? m.slotIndex : (freeSlot ?? -1) } : m,
      );
    });
    return true;
  }, [mechanics, economy, garageSlots, boothSlot]);

  /** Останавливает ремонт и сохраняет уже достигнутое состояние машины */
  const stopRepair = useCallback((carId: string, repair: MechanicRepairInfo, now: number) => {
    let reached = repairConditionAt(repair, now);
    // Работа, сделанная с последней оплаты, оплачивается сейчас; не хватает денег — состояние остаётся на оплаченном
    if (repair.billedCondition !== undefined && reached > repair.billedCondition) {
      const car = storedGarage.find((c) => c.id === carId);
      const cents = car ? repairPartsCents(car, repair.billedCondition, reached) : 0;
      if (cents > 0 && !economy.payTapParts(carId, cents)) reached = repair.billedCondition;
    }
    setGarage((prev) => prev.map((car) => (car.id === carId ? { ...car, condition: reached } : car)));
    setMechanicRepairs((prev) => without(prev, carId));
    // Неиспользованные детали возвращаются: оплачено только фактически сделанное
    if (repair.partsCents && repair.partsFromCondition !== undefined) {
      const planned = repair.maxCondition - repair.partsFromCondition;
      const left = Math.max(0, repair.maxCondition - reached);
      const refund = planned > 0 ? Math.floor((repair.partsCents * left) / planned) : 0;
      if (refund > 0) economy.refundOnCar(carId, refund, `refund:${carId}:${repair.startedAtMs}:${repair.partsFromCondition}`);
    }
  }, [economy, storedGarage]);

  /**
   * Увольнение: расчёт (долг по зарплате + оклад) через экономику, затем механик
   * освобождает слот, а его прокачка сбрасывается — повторный наём начинается с нуля.
   */
  const fireMechanic = useCallback((mechanicId: string): boolean => {
    // Работающего в филиале увольняем через филиал: его слот там должен освободиться
    const branchId = economy.state.contracts[mechanicId]?.branchId;
    const fired = branchId ? economy.fireBranchStaff(branchId, mechanicId) : economy.fireMechanic(mechanicId);
    if (!fired) return false;
    const now = economy.getNow();
    for (const [carId, repair] of Object.entries(mechanicRepairs)) {
      if (repair.mechanicId === mechanicId) stopRepair(carId, repair, now);
    }
    setMechanics((prev) =>
      prev.map((m) =>
        m.id === mechanicId ? { ...m, hired: false, slotIndex: -1, skillLevel: 1, experience: 0 } : m,
      ),
    );
    return true;
  }, [economy, mechanicRepairs, stopRepair]);

  const changeCarSlot = useCallback((carId: string, newSlotIndex: number): boolean => {
    // Проверяем, что слот в допустимом диапазоне: рабочий слот или место на стоянке (машины клиентов — не на стоянку)
    const parking = isParkingSlot(newSlotIndex);
    if (newSlotIndex !== -1 && !parking && (newSlotIndex < 0 || newSlotIndex >= garageSlots)) return false;
    if (parking && garage.find((c) => c.id === carId)?.clientOrderId) return false;
    // Машину с начатой покраской из камеры не переставить, пока работа не отменена;
    // во время ремонта механиком и покраски в сервисе — тоже (механик привязан к слоту)
    if (boothJob?.carId === carId || mechanicRepairs[carId] || servicePaints[carId]) return false;

    // Проверяем, что в целевом слоте нет другой машины
    if (newSlotIndex !== -1) {
      const carInSlot = garage.find((car) => car.slotIndex === newSlotIndex && car.id !== carId);
      if (carInSlot) return false;
    }

    setGarage((prev) =>
      prev.map((car) => {
        if (car.id === carId) {
          return { ...car, slotIndex: newSlotIndex };
        }
        return car;
      })
    );
    return true;
  }, [garage, garageSlots, isParkingSlot, boothJob, mechanicRepairs, servicePaints]);

  // ─── Ремонт механиком ─────────────────────────────────────────────
  const startMechanicRepair = useCallback((carId: string, mechanicId: string) => {
    const car = storedGarage.find((c) => c.id === carId);
    if (!car || car.condition >= car.maxCondition || mechanicRepairs[carId]) return;

    const now = economy.getNow();
    const contract = economy.state.contracts[mechanicId];
    const toolsMult = repairToolsMultiplier(economy.state);
    // Допуск к классу × стапель (кузовной ремонт клиента быстрее)
    const clearanceMult = clearanceSpeedFactor(contract, car.tier ?? getCarTier(car)) * clientWorkMultiplier(economy.state, car.clientOrderId);
    const speedPerSec = MECHANIC_REPAIR_SPEED * workerSpeedMultiplier(contract) * toolsMult * clearanceMult;
    const improvementNeeded = car.maxCondition - car.condition;
    const durationMs = Math.ceil((improvementNeeded / speedPerSec) * 1000);

    // Детали своей машины механик оплачивает по ходу работы (как тапы). Начать можно, если хватает на первую порцию
    const ownCar = !car.clientOrderId && !!economy.state.assets[carId];
    const firstPortion = ownCar ? repairPartsCents(car, car.condition, Math.min(car.maxCondition, car.condition + MECHANIC_BILL_STEP)) : 0;
    if (firstPortion > economy.state.balanceCents) {
      showToast({ title: 'Не хватает денег на детали', message: 'Механик платит за запчасти по ходу ремонта — пополни баланс.', icon: ICONS.repair });
      return;
    }

    economy.setMechanicBusy(mechanicId, true, now);
    setMechanicRepairs((prev) => ({
      ...prev,
      [carId]: {
        mechanicId,
        startCondition: car.condition,
        maxCondition: car.maxCondition,
        startedAtMs: now,
        durationMs,
        speedPerSec,
        skillLevel: contract?.skill.level ?? 1,
        toolsMult,
        clearanceMult,
        billedCondition: ownCar ? car.condition : undefined,
      },
    }));
  }, [storedGarage, mechanicRepairs, economy, showToast]);

  /**
   * Свободный механик сам берётся за машину на своём слоте: его нанимали ровно для этого, а кнопку
   * «Механику» новичок не находил и платил оклад за простой. Каждую пару «машина + механик»
   * запускаем один раз — после «Стоп» или нехватки денег на детали повторов не будет.
   */
  const autoStarted = useRef(new Set<string>());
  useEffect(() => {
    if (!isLoaded || !isConfigLoaded) return;
    for (const m of mechanics) {
      if (!m.hired || m.slotIndex < 0) continue;
      if (Object.values(mechanicRepairs).some((r) => r.mechanicId === m.id)) continue;
      const car = storedGarage.find((c) => c.slotIndex === m.slotIndex);
      if (!car || car.condition >= car.maxCondition || mechanicRepairs[car.id]) continue;
      if (activeSells[car.id] || servicePaints[car.id] || boothJob?.carId === car.id) continue;
      const key = `${car.id}:${m.id}`;
      if (autoStarted.current.has(key)) continue;
      autoStarted.current.add(key);
      startMechanicRepair(car.id, m.id);
      // Одна машина за проход: состояние ремонтов обновится, и эффект продолжит со следующей
      return;
    }
  }, [isLoaded, isConfigLoaded, mechanics, mechanicRepairs, storedGarage, activeSells, servicePaints, boothJob, startMechanicRepair]);

  const cancelMechanicRepair = useCallback((carId: string) => {
    const repair = mechanicRepairs[carId];
    if (!repair) return;
    const now = economy.getNow();
    stopRepair(carId, repair, now);
    economy.setMechanicBusy(repair.mechanicId, false, now);
    changeMechanicSlot(repair.mechanicId, -1);
  }, [mechanicRepairs, economy, stopRepair, changeMechanicSlot]);

  // ─── Продажа ──────────────────────────────────────────────────────
  const startSell = useCallback((carId: string, sellPrice: number, duration: number) => {
    const car = storedGarage.find((c) => c.id === carId);
    if (!car || activeSells[carId] || car.clientOrderId || servicePaints[carId] || boothJob?.carId === carId) return;
    const startedAtMs = economy.getNow();
    const durationMs = Math.max(0, Math.round(duration));
    // Иногда посреди продажи придёт покупатель со своим предложением
    const offer = rollSaleOffer(Math.random, { level: economy.state.player.xp.level, tier: getCarTier(car), startedAtMs, durationMs });
    setActiveSells((prev) => ({
      ...prev,
      [carId]: { sellPrice, boughtPrice: car.price, startedAtMs, durationMs, ...(offer ? { offer } : {}) },
    }));
  }, [storedGarage, activeSells, servicePaints, boothJob, economy]);

  const cancelSell = useCallback((carId: string) => {
    setActiveSells((prev) => without(prev, carId));
  }, []);

  /** Ответ на предложение покупателя: согласие — продажа сразу по его цене */
  const answerSaleOffer = useCallback((carId: string, accept: boolean) => {
    const now = economy.getNow();
    setActiveSells((prev) => {
      const sell = prev[carId];
      if (!sell?.offer || sell.offer.answered) return prev;
      const offer = { ...sell.offer, answered: true };
      return {
        ...prev,
        [carId]: accept
          ? { ...sell, offer, sellPrice: offerPrice(sell.sellPrice, sell.offer), durationMs: Math.max(0, now - sell.startedAtMs) }
          : { ...sell, offer },
      };
    });
  }, [economy]);

  // ─── Завершение ремонтов и продаж по игровому времени ─────────────
  useEffect(() => {
    if (!isLoaded || !isConfigLoaded || !economy.isLoaded) return;

    for (const [carId, repair] of Object.entries(mechanicRepairs)) {
      const finishedAt = repair.startedAtMs + repair.durationMs;
      const finished = gameTimeMs >= finishedAt;
      // Детали по ходу ремонта: каждые 0,1 п. состояния (и остаток в конце) — как тапы игрока
      if (repair.billedCondition !== undefined) {
        const current = finished ? repair.maxCondition : repairConditionAt(repair, gameTimeMs);
        if (finished ? current > repair.billedCondition : current - repair.billedCondition >= MECHANIC_BILL_STEP) {
          const car = storedGarage.find((c) => c.id === carId);
          const cents = car ? repairPartsCents(car, repair.billedCondition, current) : 0;
          if (cents > 0 && !economy.payTapParts(carId, cents)) {
            // Денег нет — механик останавливается на оплаченном состоянии и освобождается
            const billed = repair.billedCondition;
            setGarage((prev) => prev.map((c) => (c.id === carId ? { ...c, condition: billed } : c)));
            setMechanicRepairs((prev) => without(prev, carId));
            economy.setMechanicBusy(repair.mechanicId, false, gameTimeMs);
            const mechanicName = mechanics.find((m) => m.id === repair.mechanicId)?.name ?? 'Механик';
            showToast({
              title: `${mechanicName} остановился`,
              message: 'Не хватает денег на детали. Пополни баланс и снова нажми «Механику».',
              icon: ICONS.repair,
            });
            continue;
          }
          setMechanicRepairs((prev) => (prev[carId] === repair ? { ...prev, [carId]: { ...repair, billedCondition: current } } : prev));
        }
      }
      if (!finished) continue;
      setGarage((prev) => prev.map((car) => (car.id === carId ? { ...car, condition: repair.maxCondition } : car)));
      setMechanicRepairs((prev) => without(prev, carId));
      economy.setMechanicBusy(repair.mechanicId, false, finishedAt);
      economy.recordMechanicJob(repair.mechanicId);
      const car = storedGarage.find((c) => c.id === carId);
      if (car?.clientOrderId) economy.markOrderWorkDone(car.clientOrderId, finishedAt);
      else economy.awardFullRepair(carId);
      changeMechanicSlot(repair.mechanicId, -1);

      // Два уведомления на любом экране: механик освободился и машина готова
      const mechanicName = mechanics.find((m) => m.id === repair.mechanicId)?.name ?? 'Механик';
      const tier = car ? getCarTier(car) : undefined;
      showToast({
        title: `${mechanicName} закончил работу`,
        message: 'Теперь он бездействует — назначь его на следующую машину.',
        icon: getMechanicAvatar(repair.mechanicId),
      });
      showToast({
        title: `${car?.name ?? 'Автомобиль'} готов`,
        message: car?.clientOrderId
          ? 'Работа по заказу клиента готова — сдай её в разделе «Заказы».'
          : `Отремонтирован до ${repair.maxCondition}% — можно продавать.`,
        icon: tier ? TIER_ICONS[tier] : undefined,
        tone: 'success',
      });
    }

    // Сторонний сервис закончил покраску
    for (const [carId, job] of Object.entries(servicePaints)) {
      if (gameTimeMs < job.startedAtMs + job.durationMs) continue;
      setServicePaints((prev) => without(prev, carId));
      setGarage((prev) => prev.map((c) => (c.id === carId ? { ...c, paintCondition: job.targetPaint } : c)));
      const car = storedGarage.find((c) => c.id === carId);
      showToast({
        title: `${car?.name ?? 'Автомобиль'} покрашен`,
        message: `Сервис вернул машину: ЛКП ${Math.round(job.targetPaint)}%.`,
        icon: ICONS_PAINT,
        tone: 'success',
      });
    }

    // Маляр докрасил машину в камере
    if (painterRun && boothJob) {
      const finishedAt =
        painterRun.startedAtMs +
        Math.ceil((Math.max(0, boothJob.targetPaint - painterRun.startPaint) / painterRun.speedPerSec) * 1000);
      if (gameTimeMs >= finishedAt) finishBoothJob(boothJob, finishedAt, painterRun.painterId);
    }

    for (const [carId, sell] of Object.entries(activeSells)) {
      // Покупатель пришёл с предложением — спросить игрока (после перезапуска спросит снова)
      const offer = sell.offer;
      if (offer && !offer.answered && gameTimeMs >= offer.atMs && gameTimeMs < sell.startedAtMs + sell.durationMs) {
        const car = storedGarage.find((c) => c.id === carId);
        if (car) {
          const price = offerPrice(sell.sellPrice, offer);
          const tier = getCarTier(car);
          pushEvent({
            id: `offer:${carId}:${sell.startedAtMs}`,
            title: offer.kind === 'collector' ? 'Пришёл коллекционер' : 'Покупатель торгуется',
            message:
              offer.kind === 'collector'
                ? `Коллекционер давно ищет ${car.name} и готов забрать её прямо сейчас за ${formatMoney(toCents(price))} — это на ${formatMoney(toCents(price - sell.sellPrice))} больше твоей цены.`
                : `Покупатель готов забрать ${car.name} прямо сейчас за ${formatMoney(toCents(price))} — на ${formatMoney(toCents(sell.sellPrice - price))} меньше твоей цены. Откажешься — продажа продолжится как шла.`,
            icon: tier ? TIER_ICONS[tier] : undefined,
            accent: offer.kind === 'collector' ? '#F59E0B' : '#38BDF8',
            buttons: [
              { label: 'Отказать', tone: 'secondary', onPress: () => answerSaleOffer(carId, false) },
              { label: `Продать · ${formatMoney(toCents(price))}`, onPress: () => answerSaleOffer(carId, true) },
            ],
          });
        }
      }
      if (gameTimeMs < sell.startedAtMs + sell.durationMs) continue;
      const car = storedGarage.find((c) => c.id === carId);
      setActiveSells((prev) => without(prev, carId));
      if (!car) continue;
      // Экономика запоминает продажу по id машины: повтор после перезапуска не начислит ни деньги, ни XP
      const alreadyRecorded = economy.state.processedOps.includes(`sale:${carId}`);
      const asset = economy.state.assets[carId];
      economy.recordCarSale(car, sell.sellPrice);
      markAsSold(carId);
      removeCar(carId);

      if (!alreadyRecorded) {
        const priceCents = toCents(sell.sellPrice);
        const costCents = asset ? assetCostCents(asset) : toCents(car.price);
        const profitCents = priceCents - costCents;
        const tier = asset?.tier ?? getCarTier(car);
        const xp = saleXp(tier, priceCents, asset ? asset.purchaseCents : toCents(car.price), asset?.extraCostsCents ?? 0);
        showToast({
          title: `${car.name} продан за ${formatMoney(priceCents)}`,
          message: `${profitCents >= 0 ? 'Прибыль' : 'Убыток'} ${formatMoney(profitCents, { sign: true })}${xp > 0 ? ` · +${xp} XP` : ''}`,
          icon: tier ? TIER_ICONS[tier] : undefined,
          tone: profitCents > 0 ? 'success' : 'info',
        });
      }
    }
  }, [gameTimeMs, isLoaded, isConfigLoaded]);

  // ─── Механик повысил навык во время ремонта: с момента повышения — новая скорость ──
  useEffect(() => {
    for (const [carId, repair] of Object.entries(mechanicRepairs)) {
      const contract = economy.state.contracts[repair.mechanicId];
      const toolsMult = repairToolsMultiplier(economy.state);
      if (!contract) continue;
      const levelChanged = contract.skill.level !== (repair.skillLevel ?? 1);
      if (!levelChanged && toolsMult === (repair.toolsMult ?? 1)) continue;
      // Новый уровень — с момента повышения; новые инструменты — с текущего момента
      const at = levelChanged ? Math.min(gameTimeMs, Math.max(repair.startedAtMs, contract.levelChangedAtMs)) : gameTimeMs;
      const reached = repairConditionAt(repair, at);
      const speedPerSec = MECHANIC_REPAIR_SPEED * workerSpeedMultiplier(contract) * toolsMult * (repair.clearanceMult ?? 1);
      setMechanicRepairs((prev) =>
        prev[carId] === repair
          ? {
              ...prev,
              [carId]: {
                ...repair,
                startCondition: reached,
                startedAtMs: at,
                speedPerSec,
                skillLevel: contract.skill.level,
                toolsMult,
                durationMs: Math.ceil((Math.max(0, repair.maxCondition - reached) / speedPerSec) * 1000),
              },
            }
          : prev,
      );
    }
  }, [economy.state.contracts, mechanicRepairs, gameTimeMs]);

  // ─── Занятость машины ─────────────────────────────────────────────
  /** Почему с машиной сейчас нельзя начать новую работу (null — свободна) */
  const carBusyReason = useCallback(
    (carId: string): string | null => {
      if (mechanicRepairs[carId]) return 'Идёт ремонт';
      if (activeSells[carId]) return 'Выставлена на продажу';
      if (servicePaints[carId]) return 'В покраске у стороннего сервиса';
      if (boothJob?.carId === carId) return 'Красится в камере';
      return null;
    },
    [mechanicRepairs, activeSells, servicePaints, boothJob],
  );

  // ─── Покраска в стороннем сервисе ─────────────────────────────────
  /** Цена и срок сторонней покраски до 100%: сервис берёт 80% прироста стоимости */
  const servicePaintQuote = useCallback(
    (carId: string) => {
      const car = storedGarage.find((c) => c.id === carId);
      if (!car) return null;
      const from = car.paintCondition ?? car.condition;
      const target = 100;
      const gain = paintValueGain(car.basePrice, car.year, car.mileage, from, target);
      const costCents = Math.max(100, Math.round(gain * BAL.SERVICE_PAINT_SHARE * 100));
      const days = BAL.SERVICE_PAINT_BASE_DAYS + Math.ceil(Math.max(0, target - from) / BAL.SERVICE_PAINT_POINTS_PER_DAY);
      return { from, target, gainCents: Math.round(gain * 100), costCents, days };
    },
    [storedGarage],
  );

  const startServicePaint = useCallback(
    (carId: string): boolean => {
      const car = storedGarage.find((c) => c.id === carId);
      const quote = servicePaintQuote(carId);
      if (!car || !quote || car.clientOrderId || carBusyReason(carId) || quote.from >= quote.target) return false;
      if (isParkingSlot(car.slotIndex)) return false;
      const now = economy.getNow();
      // Затраты на свою машину — в её себестоимость
      if (!economy.spendOnCar(carId, quote.costCents, `svcpaint:${carId}:${now}`)) return false;
      setServicePaints((prev) => ({
        ...prev,
        [carId]: {
          startPaint: quote.from,
          targetPaint: quote.target,
          startedAtMs: now,
          durationMs: quote.days * DAY_MS,
          costCents: quote.costCents,
        },
      }));
      return true;
    },
    [storedGarage, servicePaintQuote, carBusyReason, isParkingSlot, economy],
  );

  // ─── Тюнинг (диностенд) ───────────────────────────────────────────
  /** Цена тюнинга: доля прироста стоимости, который даст поднятый технический максимум */
  const tuningQuote = useCallback(
    (carId: string) => {
      const car = storedGarage.find((c) => c.id === carId);
      if (!car || car.clientOrderId || car.tuned || car.maxCondition >= 100) return null;
      const to = Math.min(100, Math.round((car.maxCondition + BAL.TUNING_MAX_BONUS) * 10) / 10);
      const gain = carValue(car.basePrice, { ...car, condition: to }) - carValue(car.basePrice, { ...car, condition: car.maxCondition });
      return { from: car.maxCondition, to, costCents: Math.max(100, Math.round(gain * BAL.TUNING_COST_SHARE * 100)) };
    },
    [storedGarage],
  );

  const tuneCar = useCallback(
    (carId: string): boolean => {
      const quote = tuningQuote(carId);
      if (!quote || !economy.state.equipment.owned.includes('dyno') || carBusyReason(carId)) return false;
      if (!economy.spendOnCar(carId, quote.costCents, `tune:${carId}`)) return false;
      setGarage((prev) => prev.map((c) => (c.id === carId ? { ...c, maxCondition: quote.to, tuned: true } : c)));
      return true;
    },
    [tuningQuote, carBusyReason, economy],
  );

  // ─── Своя покрасочная камера ──────────────────────────────────────
  /** Материалы для покраски в своей камере: доля прироста стоимости (подбор краски — дешевле; у клиента — уже оплачены деталями заказа) */
  const boothPaintQuote = useCallback(
    (carId: string) => {
      const car = storedGarage.find((c) => c.id === carId);
      if (!car) return null;
      const from = car.paintCondition ?? car.condition;
      const target = car.paintTarget ?? 100;
      if (car.clientOrderId) return { from, target, materialsCents: 0, gainCents: 0 };
      const gain = paintValueGain(car.basePrice, car.year, car.mileage, from, target);
      return {
        from,
        target,
        materialsCents: Math.round(gain * ownPaintMaterialsShare(economy.state) * 100),
        gainCents: Math.round(gain * 100),
      };
    },
    [storedGarage, economy.state],
  );

  const startBoothJob = useCallback(
    (carId: string): boolean => {
      const car = storedGarage.find((c) => c.id === carId);
      const quote = boothPaintQuote(carId);
      if (!car || !quote || boothSlot === null || car.slotIndex !== boothSlot || boothJob) return false;
      if (carBusyReason(carId) || quote.from >= quote.target) return false;
      if (car.clientOrderId) {
        const order = economy.state.orders.active.find((o) => o.id === car.clientOrderId);
        if (!order || order.kind !== 'service' || order.type !== 'paint') return false;
      }
      const now = economy.getNow();
      if (quote.materialsCents > 0 && !economy.spendOnCar(carId, quote.materialsCents, `booth:${carId}:${now}`)) return false;
      setBoothJob({ carId, targetPaint: quote.target, materialsCents: quote.materialsCents, startedAtMs: now });
      return true;
    },
    [storedGarage, boothPaintQuote, boothSlot, boothJob, carBusyReason, economy],
  );

  /** Остановить маляра, сохранив докрашенное */
  const stopPainterRun = useCallback(
    (run: PainterRun, job: BoothJob, now: number) => {
      const reached = paintAt(run, job.targetPaint, now);
      setGarage((prev) => prev.map((c) => (c.id === job.carId ? { ...c, paintCondition: reached } : c)));
      setPainterRun(null);
      economy.setMechanicBusy(run.painterId, false, now);
    },
    [economy],
  );

  /** Отменить покраску в камере: материалы потрачены, достигнутое ЛКП остаётся */
  const cancelBoothJob = useCallback(() => {
    if (!boothJob) return;
    if (painterRun) stopPainterRun(painterRun, boothJob, economy.getNow());
    setBoothJob(null);
  }, [boothJob, painterRun, stopPainterRun, economy]);

  /** Покраска закончена: ЛКП = цель; у клиентской машины фиксируется момент выполнения заказа */
  const finishBoothJob = useCallback(
    (job: BoothJob, at: number, painterId?: string) => {
      setGarage((prev) => prev.map((c) => (c.id === job.carId ? { ...c, paintCondition: job.targetPaint } : c)));
      setBoothJob(null);
      setPainterRun(null);
      if (painterId) {
        economy.setMechanicBusy(painterId, false, at);
        economy.recordMechanicJob(painterId);
      }
      const car = storedGarage.find((c) => c.id === job.carId);
      if (car?.clientOrderId) economy.markOrderWorkDone(car.clientOrderId, at);
      showToast({
        title: `${car?.name ?? 'Автомобиль'} покрашен`,
        message: car?.clientOrderId
          ? 'Покраска по заказу готова — сдай её в разделе «Заказы».'
          : `ЛКП ${Math.round(job.targetPaint)}% — машина стала дороже.`,
        icon: painterId ? getMechanicAvatar(painterId) : ICONS_PAINT,
        tone: 'success',
      });
    },
    [economy, storedGarage, showToast],
  );

  /** Ручной тап покраски: только в камере, при оплаченной работе и пока маляр не красит */
  const paintTap = useCallback((): boolean => {
    if (!boothJob || painterRun) return false;
    const car = storedGarage.find((c) => c.id === boothJob.carId);
    if (!car) return false;
    const from = car.paintCondition ?? car.condition;
    if (from >= boothJob.targetPaint) return false;
    const next = Math.min(
      boothJob.targetPaint,
      Math.round((from + BAL.PLAYER_PAINT_PER_TAP * economy.paintTapMultiplier) * 1000) / 1000,
    );
    setGarage((prev) => prev.map((c) => (c.id === car.id ? { ...c, paintCondition: next } : c)));
    economy.recordPaintTap();
    if (next >= boothJob.targetPaint) finishBoothJob(boothJob, economy.getNow());
    return true;
  }, [boothJob, painterRun, storedGarage, economy, finishBoothJob]);

  // ─── Маляры ───────────────────────────────────────────────────────
  // Кандидат в маляры один: камера одна, на неё — один маляр
  useEffect(() => {
    if (!isConfigLoaded || painters.length > 0) return;
    const painterId = `painter_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    setPainters([
      {
        id: painterId,
        name: staffFirstName(painterId),
        slotIndex: -1,
        skillLevel: 1,
        experience: 0,
        hired: false,
        profession: 'painter',
      },
    ]);
  }, [isConfigLoaded, painters.length]);

  /** Маляр работает только при установленной камере */
  const hirePainter = useCallback(
    (painterId: string): boolean => {
      const painter = painters.find((p) => p.id === painterId);
      if (!painter || painter.hired || boothSlot === null) return false;
      economy.hirePainter(painterId);
      setPainters((prev) => prev.map((p) => (p.id === painterId ? { ...p, hired: true } : p)));
      return true;
    },
    [painters, boothSlot, economy],
  );

  /** Увольнение маляра: расчёт по общим правилам, прокачка сбрасывается */
  const firePainter = useCallback(
    (painterId: string): boolean => {
      if (painterRun?.painterId === painterId && boothJob) stopPainterRun(painterRun, boothJob, economy.getNow());
      if (!economy.fireMechanic(painterId)) return false;
      setPainters((prev) =>
        prev.map((p) => (p.id === painterId ? { ...p, hired: false, skillLevel: 1, experience: 0 } : p)),
      );
      return true;
    },
    [painterRun, boothJob, stopPainterRun, economy],
  );

  // Маляр сам берётся за оплаченную покраску в камере; без работы — простаивает (практика не идёт)
  useEffect(() => {
    if (!isLoaded || !isConfigLoaded || !economy.isLoaded) return;
    const painter = painters.find((p) => p.hired && economy.state.contracts[p.id]);
    if (painterRun) {
      const stillWorks = boothJob && !painterPaused && economy.state.contracts[painterRun.painterId];
      if (!stillWorks && boothJob) stopPainterRun(painterRun, boothJob, economy.getNow());
      else if (!stillWorks) setPainterRun(null);
      return;
    }
    if (!painter || !boothJob || painterPaused) return;
    const car = storedGarage.find((c) => c.id === boothJob.carId);
    const from = car?.paintCondition ?? 0;
    if (!car || from >= boothJob.targetPaint) return;
    const contract = economy.state.contracts[painter.id];
    const now = economy.getNow();
    economy.setMechanicBusy(painter.id, true, now);
    setPainterRun({
      painterId: painter.id,
      startPaint: from,
      startedAtMs: now,
      speedPerSec: BAL.PAINTER_SPEED_PER_SEC * workerSpeedMultiplier(contract) * clearanceSpeedFactor(contract, car.tier ?? getCarTier(car)),
      skillLevel: contract.skill.level,
    });
  }, [isLoaded, isConfigLoaded, economy.isLoaded, painters, boothJob, painterRun, painterPaused, economy.state.contracts]);

  // Маляр повысил навык во время работы — новая скорость с момента повышения
  useEffect(() => {
    if (!painterRun || !boothJob) return;
    const contract = economy.state.contracts[painterRun.painterId];
    const paintedCar = storedGarage.find((c) => c.id === boothJob.carId);
    if (!contract || contract.skill.level === painterRun.skillLevel) return;
    const at = Math.min(gameTimeMs, Math.max(painterRun.startedAtMs, contract.levelChangedAtMs));
    setPainterRun({
      ...painterRun,
      startPaint: paintAt(painterRun, boothJob.targetPaint, at),
      startedAtMs: at,
      speedPerSec:
        BAL.PAINTER_SPEED_PER_SEC *
        workerSpeedMultiplier(contract) *
        clearanceSpeedFactor(contract, paintedCar ? paintedCar.tier ?? getCarTier(paintedCar) : undefined),
      skillLevel: contract.skill.level,
    });
  }, [economy.state.contracts, painterRun, boothJob, gameTimeMs]);

  // ─── Установка и демонтаж камеры ──────────────────────────────────
  /** Почему камеру нельзя поставить в этот слот (null — можно) */
  const boothBlockReason = useCallback(
    (slot: number): string | null => {
      if (!hasEquipment(economy.state, 'paint_booth')) return 'Камера не куплена';
      if (boothSlot !== null) return 'Камера уже установлена';
      if (garageSlots - 1 < 1) return 'Нужно оставить хотя бы один обычный слот — переезжай в гараж побольше';
      if (garage.some((c) => c.slotIndex === slot)) return 'Слот занят машиной';
      if (mechanics.some((m) => m.slotIndex === slot)) return 'К слоту прикреплён механик';
      return null;
    },
    [economy.state, boothSlot, garageSlots, garage, mechanics],
  );

  const installBooth = useCallback(
    (slot: number): boolean => !boothBlockReason(slot) && economy.installBooth(slot, garageSlots),
    [boothBlockReason, economy, garageSlots],
  );

  /** Демонтаж — когда камера не работает; маляр остаётся в штате и простаивает */
  const uninstallBooth = useCallback((): boolean => {
    if (boothSlot === null || boothJob || painterRun) return false;
    if (garage.some((c) => c.slotIndex === boothSlot && c.clientOrderId)) return false;
    economy.uninstallBooth();
    return true;
  }, [boothSlot, boothJob, painterRun, garage, economy]);

  // ─── Заказы клиентов ──────────────────────────────────────────────
  /** Слот для машины клиента: покраска — свободная камера, остальное — свободный обычный слот */
  const findSlotForOrder = useCallback(
    (order: ServiceOrder): number | null => {
      const occupied = new Set(garage.map((c) => c.slotIndex));
      if (order.type === 'paint') return boothSlot !== null && !occupied.has(boothSlot) ? boothSlot : null;
      for (let i = 0; i < garageSlots; i++) if (i !== boothSlot && !occupied.has(i)) return i;
      return null;
    },
    [garage, garageSlots, boothSlot],
  );

  const placeClientCar = useCallback((order: ServiceOrder, slot: number) => {
    const isPaint = order.type === 'paint';
    const car: GarageCar = {
      id: `client-${order.id}`,
      name: order.car.name,
      price: 0,
      emoji: order.car.emoji,
      speed: order.car.speed,
      description: order.description,
      year: order.car.year,
      mileage: order.car.mileage,
      condition: order.car.condition,
      paintCondition: order.car.paintCondition,
      basePrice: order.car.basePrice,
      // Для ремонта «максимум» — это цель работы; покраска техническое состояние не трогает
      maxCondition: isPaint ? order.car.condition : Math.round((order.car.condition + order.workPoints) * 10) / 10,
      paintTarget: isPaint ? 100 : undefined,
      slotIndex: slot,
      tier: order.tier,
      clientOrderId: order.id,
    };
    setGarage((prev) => (prev.some((c) => c.id === car.id) ? prev : [...prev, car]));
  }, []);

  /** Принять ремонтный заказ: нужен свободный подходящий слот, детали оплачиваются сразу */
  const acceptServiceOrder = useCallback(
    (orderId: string): 'ok' | 'no-slot' | 'failed' => {
      const order = economy.state.orders.board.find((o) => o.id === orderId);
      if (!order || order.kind !== 'service') return 'failed';
      const slot = findSlotForOrder(order);
      if (slot === null) return 'no-slot';
      if (!economy.acceptOrder(orderId)) return 'failed';
      placeClientCar(order, slot);
      return 'ok';
    },
    [economy, findSlotForOrder, placeClientCar],
  );

  // Машина клиента уезжает, когда заказ закрыт (сдан, провален, отменён); принятая — стоит в гараже
  useEffect(() => {
    if (!isLoaded || !isConfigLoaded || !economy.isLoaded) return;
    const active = economy.state.orders.active.filter((o): o is ServiceOrder => o.kind === 'service');
    const activeIds = new Set(active.map((o) => o.id));
    const now = economy.getNow();
    for (const car of storedGarage) {
      if (!car.clientOrderId || activeIds.has(car.clientOrderId)) continue;
      const repair = mechanicRepairs[car.id];
      if (repair) {
        setMechanicRepairs((prev) => without(prev, car.id));
        economy.setMechanicBusy(repair.mechanicId, false, now);
        changeMechanicSlot(repair.mechanicId, -1);
      }
      if (boothJob?.carId === car.id) {
        if (painterRun) economy.setMechanicBusy(painterRun.painterId, false, now);
        setPainterRun(null);
        setBoothJob(null);
      }
      removeCar(car.id);
    }
    for (const order of active) {
      if (storedGarage.some((c) => c.clientOrderId === order.id)) continue;
      const slot = findSlotForOrder(order);
      if (slot !== null) placeClientCar(order, slot);
    }
  }, [economy.state.orders.active, isLoaded, isConfigLoaded, economy.isLoaded, storedGarage.length]);

  /** Данные своей машины для проверки требований заказа на подбор */
  const pickingCandidate = useCallback(
    (carId: string) => {
      const car = garage.find((c) => c.id === carId);
      if (!car) return null;
      return {
        tier: car.tier ?? getCarTier(car),
        name: car.name,
        mileage: car.mileage,
        overall: overallCondition(car.condition, car.paintCondition),
        paintCondition: car.paintCondition ?? car.condition,
      };
    },
    [garage],
  );

  /** Передать свою машину клиенту по заказу на подбор: продажа сразу по согласованной цене */
  const deliverPicking = useCallback(
    (orderId: string, carId: string): boolean => {
      const car = storedGarage.find((c) => c.id === carId);
      const candidate = pickingCandidate(carId);
      if (!car || car.clientOrderId || !candidate || carBusyReason(carId)) return false;
      const order = economy.state.orders.active.find((o) => o.id === orderId);
      if (!economy.deliverPickingOrder(orderId, carId, candidate)) return false;
      markAsSold(carId);
      removeCar(carId);
      const price = order && order.kind === 'picking' ? order.priceCents : 0;
      showToast({
        title: `${car.name} передан клиенту`,
        message: `Заказ на подбор выполнен: ${formatMoney(price)}.`,
        icon: TIER_ICONS[candidate.tier ?? 1],
        tone: 'success',
      });
      return true;
    },
    [storedGarage, pickingCandidate, carBusyReason, economy, markAsSold, removeCar, showToast],
  );


  // ─── Сверка с экономикой после загрузки (и перенос старых сохранений) ──
  useEffect(() => {
    if (reconciledRef.current || !isLoaded || !isConfigLoaded || !economy.isLoaded) return;
    reconciledRef.current = true;

    let employed: Set<string>;
    if (!economy.state.contractsMigrated) {
      // Сохранение до финансовой системы: нанятые механики получают контракт с текущего момента
      const hiredIds = mechanics.filter((m) => m.hired).map((m) => m.id);
      economy.migrateContracts(hiredIds);
      employed = new Set(hiredIds);
    } else {
      // Контракт — единственный признак работы в штате. Нет контракта — механик не нанят и без прокачки.
      employed = new Set(Object.keys(economy.state.contracts));
      setMechanics((prev) =>
        prev.map((m) => {
          const isEmployed = employed.has(m.id);
          if (isEmployed === m.hired) return m;
          return isEmployed
            ? { ...m, hired: true }
            : { ...m, hired: false, slotIndex: -1, skillLevel: 1, experience: 0 };
        }),
      );
    }

    // Ремонт без механика в штате прекращаем; занятость механиков синхронизируем с ремонтами
    const now = economy.getNow();
    const busy = new Set<string>();
    for (const [carId, repair] of Object.entries(mechanicRepairs)) {
      if (employed.has(repair.mechanicId)) busy.add(repair.mechanicId);
      else stopRepair(carId, repair, now);
    }
    if (painterRun && employed.has(painterRun.painterId)) busy.add(painterRun.painterId);
    setPainters((prev) =>
      prev.map((p) => (employed.has(p.id) === p.hired ? p : { ...p, hired: employed.has(p.id), skillLevel: 1 })),
    );
    // Сотрудники филиалов работают по своим заказам — их занятость ведёт модуль филиалов
    for (const id of employed) {
      if (!economy.state.contracts[id]?.branchId) economy.setMechanicBusy(id, busy.has(id), now);
    }

    // Контракты до системы навыков: уровень берётся из прежней прокачки механика (не выше 20)
    for (const m of mechanics) {
      if (employed.has(m.id)) economy.initLegacyWorkerSkill(m.id, Math.min(20, m.skillLevel || 1));
    }

    // Машины из старых сохранений становятся активами по цене покупки (машины клиентов — не активы)
    economy.ensureAssets(storedGarage.filter((c) => !c.clientOrderId));
  }, [isLoaded, isConfigLoaded, economy.isLoaded]);

  const staffPainters = useMemo(
    () =>
      painters.map((p) => {
        const contract = economy.state.contracts[p.id];
        return { ...p, profession: 'painter' as const, skillLevel: contract ? contract.skill.level : 1 };
      }),
    [painters, economy.state.contracts],
  );

  const staffMechanics = useMemo(
    () =>
      mechanics.map((m) => {
        const contract = economy.state.contracts[m.id];
        return { ...m, skillLevel: contract ? contract.skill.level : 1 };
      }),
    [mechanics, economy.state.contracts],
  );

  return useMemo(
    () => ({
      garage,
      garageSlots,
      parkingSlots,
      allSlots,
      isParkingSlot,
      slotLabel,
      tuningQuote,
      tuneCar,
      garageId,
      mechanics: staffMechanics,
      mechanicRepairs,
      mechanicRepairsProgress,
      mechanicRepairsCondition,
      mechanicRepairsRemaining,
      activeSells,
      activeSellsProgress,
      activeSellsRemaining,
      addCar,
      removeCar,
      hasCar,
      repairCar,
      getCar,
      changeCarSlot,
      buyGarage,
      changeMechanicSlot,
      hireMechanic,
      fireMechanic,
      startMechanicRepair,
      cancelMechanicRepair,
      startSell,
      cancelSell,
      boothSlot,
      painters: staffPainters,
      servicePaints,
      boothJob,
      painterRun,
      painterPaused,
      servicePaintQuote,
      startServicePaint,
      boothPaintQuote,
      startBoothJob,
      cancelBoothJob,
      paintTap,
      setPainterPaused,
      hirePainter,
      firePainter,
      installBooth,
      uninstallBooth,
      boothBlockReason,
      findSlotForOrder,
      acceptServiceOrder,
      deliverPicking,
      pickingCandidate,
      carBusyReason,
    }),
    [
      garage,
      garageSlots,
      parkingSlots,
      allSlots,
      isParkingSlot,
      slotLabel,
      tuningQuote,
      tuneCar,
      garageId,
      staffMechanics,
      mechanicRepairs,
      mechanicRepairsProgress,
      mechanicRepairsCondition,
      mechanicRepairsRemaining,
      activeSells,
      activeSellsProgress,
      activeSellsRemaining,
      addCar,
      removeCar,
      hasCar,
      repairCar,
      getCar,
      changeCarSlot,
      buyGarage,
      changeMechanicSlot,
      hireMechanic,
      fireMechanic,
      startMechanicRepair,
      cancelMechanicRepair,
      startSell,
      cancelSell,
      boothSlot,
      staffPainters,
      servicePaints,
      boothJob,
      painterRun,
      painterPaused,
      servicePaintQuote,
      startServicePaint,
      boothPaintQuote,
      startBoothJob,
      cancelBoothJob,
      paintTap,
      hirePainter,
      firePainter,
      installBooth,
      uninstallBooth,
      boothBlockReason,
      findSlotForOrder,
      acceptServiceOrder,
      deliverPicking,
      pickingCandidate,
      carBusyReason,
    ],
  );
};

export type GarageState = ReturnType<typeof useGarage>;
