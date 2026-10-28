import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FEMALE_NAMES, isFemaleName, isFemaleStaff, nameMatchingAvatar, staffFirstName, staffFullName } from './staffNames.ts';

describe('имена сотрудников под аватар', () => {
  const ids = Array.from({ length: 400 }, (_, i) => `mechanic_${i}_x`);

  it('у женского аватара — женское имя, у мужского — мужское', () => {
    for (const id of ids) assert.equal(isFemaleName(staffFirstName(id)), isFemaleStaff(id), id);
    assert.ok(ids.some(isFemaleStaff), 'женщины среди сотрудников встречаются');
  });

  it('старое мужское имя у женского аватара меняется, фамилия — в женский род', () => {
    const femaleId = ids.find(isFemaleStaff)!;
    const fixed = nameMatchingAvatar(femaleId, 'Алексей Петров');
    assert.ok(FEMALE_NAMES.includes(fixed.split(' ')[0]));
    assert.equal(fixed.split(' ')[1], 'Петрова');
    const maleId = ids.find((id) => !isFemaleStaff(id))!;
    assert.equal(nameMatchingAvatar(maleId, 'Алексей Петров'), 'Алексей Петров', 'подходящее имя не трогаем');
  });

  it('полное имя филиала согласовано с аватаром', () => {
    for (const id of ids.slice(0, 100)) {
      const name = staffFullName(id, ['Петров', 'Смирнов']);
      assert.equal(isFemaleName(name), isFemaleStaff(id));
      assert.equal(/ова$/.test(name), isFemaleStaff(id));
    }
  });
});
