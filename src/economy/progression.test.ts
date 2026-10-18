/// <reference types="node" />
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COURSE_COOLDOWN_MS,
  SKILL_MAX_LEVEL,
  addPractice,
  addXp,
  applyCourse,
  courseCapacity,
  createPlayerXp,
  createSkill,
  fullRepairXp,
  monthXp,
  playerCourseCost,
  previewCourse,
  requiredPractice,
  requiredXp,
  saleXp,
  saleXpMultiplier,
  skillMultiplier,
  weekdayOf,
  workerCourseCost,
  type SkillState,
} from './progression.ts';

function must<T>(value: T | null | undefined): T {
  assert.ok(value);
  return value as T;
}

describe('уровни игрока', () => {
  it('пороги из таблицы ТЗ', () => {
    const table: Record<number, number> = { 1: 100, 2: 124, 3: 156, 4: 196, 9: 516, 15: 1164, 20: 1924, 30: 4044, 50: 10684 };
    for (const [level, xp] of Object.entries(table)) assert.equal(requiredXp(Number(level)), xp);
  });

  it('остаток переносится, большая награда поднимает несколько уровней', () => {
    const p = addXp(createPlayerXp(), 100 + 124 + 156 + 10);
    assert.deepEqual(p, { level: 4, xp: 10, totalXp: 390 });
  });

  it('нет искусственного максимума и потери точности', () => {
    const p = addXp(createPlayerXp(), 50_000_000);
    assert.ok(p.level > 200);
    assert.ok(p.xp < requiredXp(p.level));
    assert.equal(p.totalXp, 50_000_000);
  });
});

describe('XP за продажу', () => {
  it('множители из таблицы ТЗ', () => {
    const table: [number, number][] = [[0, 0], [-0.1, 0], [0.05, 0.2], [0.1, 0.4], [0.25, 1], [0.5, 2], [1, 4], [1.25, 5], [1.5, 6], [3, 6]];
    for (const [roi, mult] of table) assert.ok(Math.abs(saleXpMultiplier(roi) - mult) < 1e-9, `ROI ${roi}`);
  });

  it('множитель растёт плавно через границу 100%', () => {
    assert.ok(Math.abs(saleXpMultiplier(1.001) - saleXpMultiplier(0.999)) < 0.02);
  });

  it('убыток и ноль не дают XP; цена покупки 0 не ломает расчёт', () => {
    assert.equal(saleXp(1, 900, 1000), 0);
    assert.equal(saleXp(1, 1000, 1000), 0);
    assert.equal(saleXp(1, 5000, 0), 0);
  });

  it('XP зависит от класса и доходности, прямые затраты уменьшают прибыль', () => {
    assert.equal(saleXp(1, 1250, 1000), 50);
    assert.equal(saleXp(6, 2500, 1000), 280 * 6);
    assert.equal(saleXp(1, 1250, 1000, 250), 0);
  });
});

describe('XP за ремонт и месяц', () => {
  it('полный бонус от износа 30, треть при износе 10, ноль без износа', () => {
    assert.equal(fullRepairXp(1, 30), 10);
    assert.equal(fullRepairXp(1, 10), 3);
    assert.equal(fullRepairXp(1, 0), 0);
    assert.equal(fullRepairXp(6, 45), 56);
  });

  it('месяц: 10% XP продаж до 80, только при прибыли', () => {
    assert.equal(monthXp(100, 300), 30);
    assert.equal(monthXp(100, 5000), 80);
    assert.equal(monthXp(0, 300), 0);
    assert.equal(monthXp(-1, 300), 0);
    assert.equal(monthXp(100, 0), 0);
  });
});

describe('навык «Механик»', () => {
  it('пороги практики', () => {
    assert.equal(requiredPractice(1), 1000);
    assert.equal(requiredPractice(2), 1250);
    assert.equal(requiredPractice(10), 3250);
    assert.equal(requiredPractice(19), 5500);
  });

  it('каждый уровень +5% линейно', () => {
    assert.equal(skillMultiplier(1), 1);
    assert.equal(skillMultiplier(2), 1.05);
    assert.ok(Math.abs(skillMultiplier(10) - 1.45) < 1e-9);
    assert.ok(Math.abs(skillMultiplier(20) - 1.95) < 1e-9);
  });

  it('практика переносится в следующий уровень, на 20-м не копится', () => {
    assert.deepEqual(addPractice(createSkill(), 1100), { ...createSkill(), level: 2, practice: 100 });
    const max = addPractice(createSkill(SKILL_MAX_LEVEL), 10_000);
    assert.equal(max.level, 20);
    assert.equal(max.practice, 0);
  });
});

describe('курсы', () => {
  const at = (practice: number): SkillState => ({ ...createSkill(), practice });

  it('курс покрывает не больше 50% порога', () => {
    assert.equal(courseCapacity(1), 500);
    assert.equal(courseCapacity(2), 625);
  });

  it('пример A: 0/1000 → 500/1000', () => {
    const s = must(applyCourse(at(0), 0));
    assert.equal(s.level, 1);
    assert.equal(s.practice, 500);
  });

  it('пример B: 300/1000 → 800/1000', () => {
    const s = must(applyCourse(at(300), 0));
    assert.equal(s.practice, 800);
  });

  for (const [name, practice] of [['C', 500], ['D', 750], ['E', 950]] as const) {
    it(`пример ${name}: ${practice}/1000 → уровень 2, прогресс 0 (избыток не переносится)`, () => {
      const preview = previewCourse(at(practice), 0);
      assert.equal(preview.granted, 1000 - practice);
      const s = must(applyCourse(at(practice), 0));
      assert.equal(s.level, 2);
      assert.equal(s.practice, 0);
    });
  }

  it('второй курс на том же уровне нельзя, даже после перезарядки', () => {
    const s = must(applyCourse(at(0), 0));
    assert.equal(applyCourse(s, COURSE_COOLDOWN_MS * 10), null);
    assert.equal(previewCourse(s, COURSE_COOLDOWN_MS * 10).block, 'already-taken');
  });

  it('перезарядка ровно 900 секунд игрового времени', () => {
    assert.equal(COURSE_COOLDOWN_MS, 900_000);
    const s = must(applyCourse(at(500), 1000)); // повысил уровень — флаг старого уровня не мешает
    assert.equal(previewCourse(s, 1000 + 899_999).block, 'cooldown');
    assert.equal(previewCourse(s, 1000 + 900_000).available, true);
  });

  it('повышение навыка практикой не сбрасывает перезарядку', () => {
    const s = addPractice(must(applyCourse(at(0), 0)), 600);
    assert.equal(s.level, 2);
    assert.equal(previewCourse(s, 100).block, 'cooldown');
  });

  it('на 20-м уровне курсов нет', () => {
    assert.equal(previewCourse(createSkill(20), 0).block, 'max-level');
  });

  it('стоимость курсов игрока по таблице ТЗ', () => {
    const table: Record<number, number> = { 1: 1000, 2: 1250, 3: 1550, 5: 2450, 10: 7450, 15: 22750, 19: 55500 };
    for (const [level, cost] of Object.entries(table)) assert.equal(playerCourseCost(Number(level)), cost);
  });

  it('стоимость курса механика: от оклада, минимум $100', () => {
    assert.equal(workerCourseCost(36_000, 1), 200);
    assert.equal(workerCourseCost(1000, 1), 100);
  });
});

describe('день недели', () => {
  it('месяц 1: день 1 — ПН, 2 — ВТ, 6 — СБ, 20 — СБ', () => {
    assert.equal(weekdayOf(1, 1), 'ПН');
    assert.equal(weekdayOf(1, 2), 'ВТ');
    assert.equal(weekdayOf(1, 6), 'СБ');
    assert.equal(weekdayOf(1, 20), 'СБ');
  });

  it('неделя непрерывна между месяцами', () => {
    assert.equal(weekdayOf(1, 30), 'ВТ');
    assert.equal(weekdayOf(2, 1), 'СР');
    assert.equal(weekdayOf(2, 20), 'ПН');
  });
});
