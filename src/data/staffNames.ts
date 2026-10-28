/**
 * Имена сотрудников и их пол. Аватар выбирается по id (стабильно между запусками), а имя
 * подбирается под аватар: у женского аватара — женское имя, у мужского — мужское. Раньше имена
 * были только мужские, и на женском портрете стояло «Алексей».
 *
 * Модуль без картинок: им пользуются и иконки (gameIcons), и экономика в Node-симуляторе.
 */

export const MALE_NAMES = [
  'Иван',
  'Сергей',
  'Дмитрий',
  'Пётр',
  'Анатолий',
  'Владимир',
  'Алексей',
  'Юрий',
  'Николай',
  'Валентин',
  'Михаил',
  'Андрей',
  'Павел',
  'Олег',
  'Виктор',
  'Егор',
  'Роман',
];

export const FEMALE_NAMES = ['Анна', 'Мария', 'Ольга', 'Елена', 'Наталья', 'Ирина', 'Светлана', 'Татьяна'];

/** Сколько аватаров механиков (assets/icons/mechanics) и какие из них женские (индексы с нуля) */
export const MECHANIC_AVATAR_COUNT = 10;
const FEMALE_AVATARS = new Set([6]);

const hash = (text: string): number => {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
};

/** Номер аватара сотрудника — тот же расчёт, что был в getMechanicAvatar, чтобы портреты не сменились */
export const avatarIndex = (staffId: string): number => hash(staffId) % MECHANIC_AVATAR_COUNT;

export const isFemaleStaff = (staffId: string): boolean => FEMALE_AVATARS.has(avatarIndex(staffId));

const firstNameOf = (fullName: string) => fullName.split(' ')[0];
export const isFemaleName = (fullName: string): boolean => FEMALE_NAMES.includes(firstNameOf(fullName));

/** Имя под аватар сотрудника, детерминированно по id */
export const staffFirstName = (staffId: string): string => {
  const list = isFemaleStaff(staffId) ? FEMALE_NAMES : MALE_NAMES;
  return list[hash(`${staffId}#name`) % list.length];
};

/** Фамилия в нужном роде: «Петров» ↔ «Петрова» (фамилии сотрудников — на -ов/-ев/-ин) */
const surnameFor = (surname: string, female: boolean): string => {
  const isFemaleForm = /(ова|ева|ина)$/.test(surname);
  if (female && !isFemaleForm && /(ов|ев|ин)$/.test(surname)) return `${surname}а`;
  if (!female && isFemaleForm) return surname.slice(0, -1);
  return surname;
};

/**
 * Имя, согласованное с аватаром: подходящее оставляем как есть, неподходящее (старые сохранения,
 * где имена были только мужские) меняем на имя нужного пола, фамилию — на нужный род.
 */
export const nameMatchingAvatar = (staffId: string, fullName: string): string => {
  const female = isFemaleStaff(staffId);
  if (isFemaleName(fullName) === female) return fullName;
  const [, ...rest] = fullName.split(' ');
  const surname = rest.join(' ');
  return surname ? `${staffFirstName(staffId)} ${surnameFor(surname, female)}` : staffFirstName(staffId);
};

/** Полное имя сотрудника филиала: имя под аватар + фамилия в нужном роде */
export const staffFullName = (staffId: string, surnames: readonly string[]): string => {
  const surname = surnames[hash(`${staffId}#surname`) % surnames.length];
  return `${staffFirstName(staffId)} ${surnameFor(surname, isFemaleStaff(staffId))}`;
};
