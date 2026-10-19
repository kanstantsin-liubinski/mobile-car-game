import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { skillsStyles } from '@styles/styles';
import { LocationHeader } from '@components/LocationHeader';
import { SkillCard } from '@components/SkillCard';
import { useToast } from '@components/toast/ToastContext';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { ICONS } from '@img/gameIcons';
import { HOT_OFFER_NOTIFY_LEVEL, hotOfferChance, requiredManagementPractice } from '../economy/progression';

const noteStyle = { color: '#94A3B8', fontSize: 12, lineHeight: 17, marginBottom: 16 };

/** «22%», «23,1%» */
const chanceText = (level: number) =>
  `${(Math.round(hotOfferChance(level) * 1000) / 10).toLocaleString('ru-RU')}%`;

/**
 * Навыки игрока. «Механик» растёт от ручных тапов ремонта и курсов, усиливает каждый тап.
 * «Менеджмент» растёт от прибыльных сделок и месяцев, повышает шанс горящих предложений на авторынке.
 */
export const SkillsScreen = () => {
  const { state, playerCourseOffer, buyPlayerCourse, managementCourseOffer, buyManagementCourse } = useEconomy();
  useGameClock(); // перезарядка курса идёт по игровому времени
  const { showToast } = useToast();
  const skill = state.player.skill;
  const management = state.player.management;
  const offer = playerCourseOffer();
  const managementOffer = managementCourseOffer();

  const courseToast = (name: string, level: number, granted: number, levelsUp: boolean) =>
    showToast({
      title: 'Курс пройден',
      message: levelsUp
        ? `Навык «${name}» повышен до уровня ${level + 1}`
        : `+${granted.toLocaleString('ru-RU')} практики навыка «${name}»`,
      icon: ICONS.upgradeSkill,
      tone: 'success',
    });

  const handleBuyCourse = () => {
    const { granted, levelsUp } = offer.preview;
    if (!buyPlayerCourse()) return;
    courseToast('Механик', skill.level, granted, levelsUp);
  };

  const handleBuyManagementCourse = () => {
    const { granted, levelsUp } = managementOffer.preview;
    if (!buyManagementCourse()) return;
    courseToast('Менеджмент', management.level, granted, levelsUp);
  };

  const notifyOn = management.level >= HOT_OFFER_NOTIFY_LEVEL;

  return (
    <View style={{ flex: 1 }}>
      <LocationHeader title="Навыки" icon={ICONS.skills} />
      <ScrollView style={[skillsStyles.container, { paddingTop: 8 }]}>
        <SkillCard
          title="Механик"
          icon={ICONS.repair}
          skill={skill}
          practice={skill.practice}
          bonusLabel="Эффективность ручного ремонта"
          offer={offer}
          onBuyCourse={handleBuyCourse}
          extraRows={[{ label: 'Ручных ремонтов всего', value: state.player.manualTaps.toLocaleString('ru-RU') }]}
        />
        <Text style={noteStyle}>
          Каждый успешный тап «Ремонт» в гараже даёт 1 практику. Навык не влияет на общий уровень игрока —
          уровень растёт от опыта за прибыльные продажи, полное восстановление машин и прибыльные месяцы.
        </Text>

        <SkillCard
          title="Менеджмент"
          icon={ICONS.money}
          skill={management}
          practice={management.practice}
          curve={requiredManagementPractice}
          bonusLabel="Шанс горящего предложения"
          bonusValue={chanceText}
          note={
            notifyOn
              ? undefined
              : 'На уровне 2 открываются уведомления о выгодных предложениях и индикатор авторынка'
          }
          offer={managementOffer}
          onBuyCourse={handleBuyManagementCourse}
          extraRows={[
            {
              label: 'Уведомления и индикатор авторынка',
              value: notifyOn ? 'включены' : `с ${HOT_OFFER_NOTIFY_LEVEL} уровня`,
            },
          ]}
        />
        <Text style={noteStyle}>
          Практика: +80 за продажу с доходностью от 10%, +20 — с меньшей прибылью, +160 за прибыльный месяц.
          Раз в 10 игровых дней на авторынке может появиться горящее предложение — машина на 15–30% дешевле
          обычной цены, всего на 2–4 игровых дня. Если предложений не было 90 дней, следующее гарантировано.
        </Text>
      </ScrollView>
    </View>
  );
};
