import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TouchableOpacity } from '@components/Touchable';
import { GameIcon } from '@components/GameIcon';
import { colors } from '@styles/colors';
import { CARD_RADIUS, SCREEN_INSET } from '@styles/styles';
import { MECHANIC_AVATARS } from '@img/gameIcons';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { useGarageContext } from '@hooks/GarageContext';
import { useSetTutorialInset } from '@hooks/TutorialInset';
import type { Screen } from '@/types';
import { LEGACY_MIN_LEVEL, LEGACY_MIN_NET_WORTH } from '../../economy/balance';
import { formatMoney } from '../../economy/format';

const TUTORIAL_KEY = 'game_tutorial';
/** Карточка висит над меню на таком расстоянии */
const WRAP_BOTTOM = 8;
/** Наставник — седой механик в очках из набора аватаров */
const MENTOR_AVATAR = MECHANIC_AVATARS[7];
const MENTOR_NAME = 'Дядя Миша';

interface Progress {
  step: number;
  done: boolean;
}

/** Что видит обучение, чтобы понять, сделал ли игрок шаг */
interface World {
  screen: Screen;
  inspected: boolean;
  carsInGarage: number;
  /** Хотя бы один тап «Ремонт» или ремонт механиком */
  repaired: boolean;
  atMax: boolean;
  selling: boolean;
  sold: boolean;
}

interface Step {
  text: string;
  /** Шаг закрывается действием игрока; без него — кнопкой «Дальше» */
  doneWhen?: (w: World) => boolean;
  /** Подсказка, что нажать (под репликой) */
  hint?: string;
  /** Кнопка в самой карточке: наставник ведёт туда, куда говорит */
  action?: { label: string; run: 'openMarket' };
}

/**
 * Первый цикл перекупщика в репликах наставника: каждый шаг — одно действие, и засчитывается он
 * по самому действию, а не по нажатию «понятно». Раньше игру начинали в пустом гараже без
 * единой подсказки — где рынок, что значат шкалы и откуда берутся деньги.
 */
const STEPS: Step[] = [
  {
    text: 'Привет! Я дядя Миша, тридцать лет кручу гайки. Этот гараж теперь твой. Научу, как тут зарабатывают: покупаешь подержанную машину, чинишь и продаёшь дороже.',
  },
  {
    text: 'Сперва нужна машина. Загляни на авторынок — там продают подержанные.',
    hint: 'Потом сам найдёшь его в «Город» → «Авторынок»',
    doneWhen: (w) => w.screen === 'market',
    action: { label: 'Пойдём на рынок', run: 'openMarket' },
  },
  {
    text: 'Смотри на шкалы. «Тех. состояние» — какая машина сейчас, «Тех. максимум» — до скольких её можно починить, ЛКП — краска. Чем больше разрыв между состоянием и максимумом, тем больше заработаешь на ремонте. Глянь любую поближе.',
    hint: 'Нажми «Осмотреть» — это бесплатно',
    doneWhen: (w) => w.inspected,
  },
  {
    text: 'Выбирай машину с большим разрывом и ценой по карману — и бери. Денег на старте немного, не трать всё на одну.',
    hint: 'Нажми «Купить» на объявлении',
    doneWhen: (w) => w.carsInGarage > 0,
  },
  {
    text: 'Машина в гараже. Чини её: каждый тап «Ремонт» поднимает состояние, а детали стоят денег — цена тапа написана на кнопке. Палец можно просто держать.',
    hint: 'Гараж → «Ремонт»',
    doneWhen: (w) => w.repaired || w.atMax || w.selling || w.sold,
  },
  {
    text: 'Дотяни до максимума — дальше чинить некуда — и выставляй на продажу. Ползунок: дешевле — уйдёт быстрее, дороже — придётся подождать.',
    hint: '«Продать» на карточке машины',
    doneWhen: (w) => w.selling || w.sold,
  },
  {
    text: 'Пока машина продаётся, загляни в «Заказы»: клиенты платят за ремонт, и это тоже опыт. А когда устанешь тапать — найми механика. Он чинит сам, но оклад платишь каждый месяц, даже если он скучает.',
  },
  {
    text: 'За прибыльные сделки растёт уровень — значок XP наверху. Уровни открывают новое: гаражи побольше, классы машин, филиалы, аукцион. В гараже загляни в «Оборудование»: сканер для точного осмотра на рынке, покрасочная камера, инструменты для сложных заказов. А во вкладке «Навыки» — твои пять умений: Механик, Маляр, Подборщик, Торговля и Менеджмент. Они растут от практики, а курсы помогают быстрее.',
  },
  {
    text: `И про «Наследие». С ${LEGACY_MIN_LEVEL} уровня, если нет кредита, а бизнес стоит от ${formatMoney(
      LEGACY_MIN_NET_WORTH * 100,
    )}, карьеру можно начать заново. Деньги, гаражи, машины, персонал, уровень и навыки сбросятся, зато за прибыль этой карьеры ты получишь очки наследия — они навсегда увеличат прибыль со сделок и заказов и опыт. Чем больше заработаешь до перезапуска, тем больше очков. Без нескольких перезапусков не купить главную цель — автомобильный концерн за $1 млрд. Открывается через значок XP → «Наследие». Ну всё, напарник, дальше сам — удачи!`,
  },
];

export const MentorTutorial = ({ screen, onOpenMarket }: { screen: Screen; onOpenMarket: () => void }) => {
  const { state, isLoaded } = useEconomy();
  const { paydayPending } = useGameClock();
  const { garage, mechanicRepairs, activeSells } = useGarageContext();
  const [progress, setProgress] = useState<Progress | null>(null);
  const setInset = useSetTutorialInset();

  // Загрузка прогресса. Игрок, который уже торговал до появления обучения, его не увидит
  useEffect(() => {
    if (!isLoaded || progress) return;
    AsyncStorage.getItem(TUTORIAL_KEY)
      .then((raw) => {
        if (raw) return setProgress(JSON.parse(raw) as Progress);
        const veteran = state.totals.carsSold > 0 || state.completedMonths > 0;
        setProgress({ step: 0, done: veteran });
      })
      .catch(() => setProgress({ step: 0, done: false }));
  }, [isLoaded, progress, state.totals.carsSold, state.completedMonths]);

  const save = (next: Progress) => {
    setProgress(next);
    AsyncStorage.setItem(TUTORIAL_KEY, JSON.stringify(next)).catch(() => {});
  };

  const world: World = {
    screen,
    inspected: state.ledger.inspectPractice > 0 || state.player.picker.practice > 0 || state.player.picker.level > 1,
    carsInGarage: garage.filter((c) => !c.clientOrderId).length,
    repaired: Object.keys(mechanicRepairs).length > 0 || state.player.manualTaps >= 1,
    atMax: garage.some((c) => !c.clientOrderId && c.condition >= c.maxCondition),
    selling: Object.keys(activeSells).length > 0,
    sold: state.totals.carsSold + state.ledger.carsSold > 0,
  };

  const step = progress && !progress.done ? STEPS[progress.step] : null;
  const reached = !!step?.doneWhen?.(world);

  // Действие сделано — следующая реплика
  useEffect(() => {
    if (!progress || progress.done || !reached) return;
    const next = progress.step + 1;
    save(next >= STEPS.length ? { step: next, done: true } : { step: next, done: false });
  }, [reached, progress?.step]);

  const visible = !!step && !paydayPending && !state.bankruptcy;
  // Карточка скрыта — экранам не нужен запас снизу
  useEffect(() => {
    if (!visible) setInset(0);
  }, [visible, setInset]);
  useEffect(() => () => setInset(0), [setInset]);

  if (!visible) return null;
  const last = progress!.step === STEPS.length - 1;

  return (
    <View
      style={styles.wrap}
      pointerEvents="box-none"
      // Высота карточки + два отступа как до меню: над карточкой такой же просвет, как под ней
      onLayout={(e) => setInset(Math.ceil(e.nativeEvent.layout.height) + 2 * WRAP_BOTTOM)}
    >
      <View style={styles.card}>
        <GameIcon source={MENTOR_AVATAR} size={48} />
        <View style={styles.body}>
          <Text style={styles.name}>
            {MENTOR_NAME} · {progress!.step + 1}/{STEPS.length}
          </Text>
          <Text style={styles.text}>{step.text}</Text>
          {step.hint && <Text style={styles.hint}>👉 {step.hint}</Text>}
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.skipButton} onPress={() => save({ step: progress!.step, done: true })} hitSlop={8}>
              <Text style={styles.skip}>Пропустить обучение</Text>
            </TouchableOpacity>
            {step.action && (
              <TouchableOpacity style={styles.next} onPress={onOpenMarket}>
                <Text style={styles.nextText}>{step.action.label}</Text>
              </TouchableOpacity>
            )}
            {!step.doneWhen && (
              <TouchableOpacity
                style={styles.next}
                onPress={() => save(last ? { step: progress!.step + 1, done: true } : { step: progress!.step + 1, done: false })}
              >
                <Text style={styles.nextText}>{last ? 'Спасибо!' : 'Дальше'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Карточка лежит поверх экрана над меню: за её рамкой нет полосы фона, углы не обрезаны
  wrap: { position: 'absolute', left: 0, right: 0, bottom: WRAP_BOTTOM, paddingHorizontal: SCREEN_INSET },
  card: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: '#F59E0B',
    backgroundColor: colors.cardBg,
  },
  body: { flex: 1, gap: 4 },
  name: { fontSize: 12, fontWeight: '800', color: '#F59E0B' },
  text: { fontSize: 13, lineHeight: 18, color: colors.textPrimary },
  hint: { fontSize: 12, fontWeight: '700', color: colors.textTertiary },
  // Не помещаются в строку — основная кнопка переносится вниз и остаётся справа
  buttons: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 8, marginTop: 4 },
  skipButton: { flexShrink: 1 },
  skip: { fontSize: 12, color: colors.textTertiary, textDecorationLine: 'underline' },
  next: { marginLeft: 'auto', backgroundColor: '#F59E0B', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 7 },
  nextText: { fontSize: 13, fontWeight: '800', color: '#111827' },
});
