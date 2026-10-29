import React from 'react';
import { TutorialSpacer } from '@hooks/TutorialInset';
import { View, Text, ScrollView } from 'react-native';
import { skillsStyles } from '@styles/styles';
import { LocationHeader } from '@components/LocationHeader';
import { SkillCard } from '@components/SkillCard';
import { useToast } from '@components/toast/ToastContext';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { ICONS } from '@img/gameIcons';
import { HOT_OFFER_NOTIFY_LEVEL, hotOfferChance, skillMultiplier } from '../economy/progression';
import { SKILL_CURVES, hasEquipment, playerSkill, type SkillKey } from '../economy/economy';
import { pickerAccuracyFactor, scannerAccuracy, tradePurchaseBonus, tradeSaleBonus } from '../economy/carCondition';
import * as B from '../economy/balance';

const noteStyle = { color: '#94A3B8', fontSize: 12, lineHeight: 17, marginBottom: 16 };

const pct = (v: number, digits = 1) => `${(Math.round(v * 10 ** (digits + 2)) / 10 ** digits).toLocaleString('ru-RU')}%`;

/** «22%», «23,1%» */
const chanceText = (level: number) => pct(hotOfferChance(level));
const bonusText = (level: number) => `+${Math.round((skillMultiplier(level) - 1) * 100)}%`;
const pickerText = (level: number) => `−${Math.round((1 - pickerAccuracyFactor(level)) * 100)}% погрешности`;
const tradeText = (level: number) => `−${pct(tradePurchaseBonus(level))} / +${pct(tradeSaleBonus(level), 2)}`;

const NAMES: Record<SkillKey, string> = {
  mechanic: 'Механик',
  painter: 'Маляр',
  picker: 'Подборщик',
  trade: 'Торговля',
  management: 'Менеджмент',
};

/**
 * Пять навыков игрока на общей инфраструктуре практики и курсов: у каждого свой источник практики,
 * свой порог и своя перезарядка курса.
 */
export const SkillsScreen = () => {
  const { state, skillCourseOffer, buySkillCourse } = useEconomy();
  useGameClock(); // перезарядка курсов идёт по игровому времени
  const { showToast } = useToast();
  const hasScanner = hasEquipment(state, 'scanner');
  const hasBooth = hasEquipment(state, 'paint_booth');
  const management = state.player.management;
  const notifyOn = management.level >= HOT_OFFER_NOTIFY_LEVEL;

  const handleBuy = (key: SkillKey) => {
    const skill = playerSkill(state, key);
    const { granted, levelsUp } = skillCourseOffer(key).preview;
    if (!buySkillCourse(key)) return;
    showToast({
      title: 'Курс пройден',
      message: levelsUp
        ? `Навык «${NAMES[key]}» повышен до уровня ${skill.level + 1}`
        : `+${granted.toLocaleString('ru-RU')} практики навыка «${NAMES[key]}»`,
      icon: ICONS.upgradeSkill,
      tone: 'success',
    });
  };

  const card = (key: SkillKey, props: Partial<React.ComponentProps<typeof SkillCard>>, note: string) => {
    const skill = playerSkill(state, key);
    return (
      <View key={key}>
        <SkillCard
          title={NAMES[key]}
          skill={skill}
          practice={skill.practice}
          curve={SKILL_CURVES[key]}
          bonusLabel=""
          offer={skillCourseOffer(key)}
          onBuyCourse={() => handleBuy(key)}
          {...props}
        />
        <Text style={noteStyle}>{note}</Text>
      </View>
    );
  };

  const scan = scannerAccuracy(state.player.picker.level);

  return (
    <View style={{ flex: 1 }}>
      <LocationHeader title="Навыки" icon={ICONS.skills} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={skillsStyles.scrollContent}>
        {card(
          'mechanic',
          {
            icon: ICONS.repair,
            bonusLabel: 'Эффективность ручного ремонта',
            bonusValue: bonusText,
            extraRows: [{ label: 'Ручных ремонтов всего', value: state.player.manualTaps.toLocaleString('ru-RU') }],
          },
          'Практика: 1 за каждый успешный тап «Ремонт» в гараже. Навык не влияет на общий уровень игрока.',
        )}

        {card(
          'painter',
          {
            bonusLabel: 'Эффективность ручной покраски',
            bonusValue: bonusText,
            extraRows: [
              {
                label: 'Тап покраски',
                value: `+${(B.PLAYER_PAINT_PER_TAP * skillMultiplier(state.player.painter.level)).toLocaleString('ru-RU', { maximumFractionDigits: 3 })} п. ЛКП`,
              },
              { label: 'Покрасочная камера', value: hasBooth ? 'есть' : `с ${B.EQUIPMENT.find((e) => e.id === 'paint_booth')!.requiredLevel} уровня` },
            ],
          },
          'Практика: 1 за каждый успешный тап покраски в своей камере. Нанятый маляр прокачивает свой навык сам — 2 практики за секунду работы.',
        )}

        {card(
          'picker',
          {
            bonusLabel: 'Точность своего сканера',
            bonusValue: pickerText,
            extraRows: [
              {
                label: 'Сканер: тех. / максимум / ЛКП',
                value: `±${scan.tech.toFixed(1)} / ±${scan.max.toFixed(1)} / ±${scan.paint.toFixed(1)}`,
              },
              { label: 'Компьютерный сканер', value: hasScanner ? 'есть' : 'не куплен (с 3 уровня)' },
              {
                label: 'Оценка сделки в объявлениях',
                value: state.player.picker.level >= B.PICKER_FORECAST_LEVEL ? 'есть' : `с ${B.PICKER_FORECAST_LEVEL} уровня навыка`,
              },
              {
                label: 'Практика за осмотры в этом месяце',
                value: `${state.ledger.inspectPractice} / ${B.PICKER_INSPECT_MONTHLY_CAP}`,
              },
            ],
          },
          `Практика: +5 за первый осмотр объявления (до 30 в месяц), +40 за первую диагностику объявления своим сканером. Сторонняя диагностика практики не даёт. С ${B.PICKER_FORECAST_LEVEL} уровня в объявлениях появляется оценка: цена после ремонта и прибыль.`,
        )}

        {card(
          'trade',
          {
            bonusLabel: 'Скидка при покупке / прибавка к продаже',
            bonusValue: tradeText,
          },
          'Практика: +80 за продажу с доходностью от 10%, +20 — с меньшей прибылью, +40 за выполненный заказ на подбор. Бонусы применяются к реальным сделкам один раз; ползунок цены продажи по-прежнему ±10%.',
        )}

        {card(
          'management',
          {
            icon: ICONS.money,
            bonusLabel: 'Шанс горящего предложения',
            bonusValue: chanceText,
            note: notifyOn ? undefined : 'На уровне 2 открываются уведомления о выгодных предложениях и индикатор авторынка',
            extraRows: [
              { label: 'Уведомления и индикатор авторынка', value: notifyOn ? 'включены' : `с ${HOT_OFFER_NOTIFY_LEVEL} уровня` },
            ],
          },
          'Практика: +80 за продажу с доходностью от 10%, +20 — с меньшей прибылью, +160 за прибыльный месяц, +200 за выполненный заказ клиента. Раз в 10 игровых дней на авторынке может появиться горящее предложение — машина на 15–30% дешевле, всего на 2–4 игровых дня.',
        )}
        {/* Просвет над карточкой обучения: нижний отступ экрана и подписи последнего навыка */}
        <TutorialSpacer slack={Number(skillsStyles.scrollContent.paddingBottom) + noteStyle.marginBottom} />
    </ScrollView>
    </View>
  );
};
