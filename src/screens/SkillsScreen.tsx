import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { skillsStyles } from '@styles/styles';
import { useSkillsContext } from '@hooks/SkillsContext';

export const SkillsScreen = () => {
  const { skills, upgradeSkill } = useSkillsContext();

  return (
    <ScrollView style={skillsStyles.container}>
      <Text style={skillsStyles.title}>Мои навыки</Text>

      <View>
        {skills.map((skill) => {
          const progressPercent = (skill.progress / 100) * 100;

          return (
            <View key={skill.id} style={skillsStyles.skillCard}>
              <View style={skillsStyles.skillHeader}>
                <Text style={skillsStyles.skillName}>{skill.name}</Text>
                <Text style={skillsStyles.skillLevel}>Уровень {skill.level}</Text>
              </View>

              <View style={skillsStyles.progressContainer}>
                <Text style={skillsStyles.progressLabel}>
                  Прогресс: {skill.progress} / 100
                </Text>
                <View style={skillsStyles.progressBar}>
                  <View
                    style={[
                      skillsStyles.progressFill,
                      { width: `${progressPercent}%` },
                    ]}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={skillsStyles.upgradeButton}
                onPress={() => upgradeSkill(skill.id)}
              >
                <Text style={skillsStyles.upgradeButtonText}>
                  Прокачать (+1) 🔧
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
};
