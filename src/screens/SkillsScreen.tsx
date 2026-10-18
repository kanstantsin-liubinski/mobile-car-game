import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { skillsStyles } from '@styles/styles';
import { LocationHeader } from '@components/LocationHeader';
import { SkillCard } from '@components/SkillCard';
import { useToast } from '@components/toast/ToastContext';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { ICONS } from '@img/gameIcons';

/** Навык игрока «Механик»: растёт от ручных тапов ремонта и курсов, усиливает каждый тап */
export const SkillsScreen = () => {
  const { state, playerCourseOffer, buyPlayerCourse } = useEconomy();
  useGameClock(); // перезарядка курса идёт по игровому времени
  const { showToast } = useToast();
  const skill = state.player.skill;
  const offer = playerCourseOffer();

  const handleBuyCourse = () => {
    const { granted, levelsUp } = offer.preview;
    if (!buyPlayerCourse()) return;
    showToast({
      title: 'Курс пройден',
      message: levelsUp
        ? `Навык «Механик» повышен до уровня ${skill.level + 1}`
        : `+${granted.toLocaleString('ru-RU')} практики навыка «Механик»`,
      icon: ICONS.upgradeSkill,
      tone: 'success',
    });
  };

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
        <Text style={{ color: '#94A3B8', fontSize: 12, lineHeight: 17 }}>
          Каждый успешный тап «Ремонт» в гараже даёт 1 практику. Навык не влияет на общий уровень игрока —
          уровень растёт от опыта за прибыльные продажи, полное восстановление машин и прибыльные месяцы.
        </Text>
      </ScrollView>
    </View>
  );
};
