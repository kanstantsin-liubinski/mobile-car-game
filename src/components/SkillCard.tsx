import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type ImageSourcePropType } from 'react-native';
import { colors } from '@styles/colors';
import { GameIcon } from '@components/GameIcon';
import { ICONS } from '@img/gameIcons';
import { formatGameCooldown, formatMoney } from '../economy/format';
import { DAY_MS, DAYS_IN_MONTH, type CourseOffer } from '../economy/economy';
import { COURSE_COOLDOWN_MS, SKILL_MAX_LEVEL, requiredPractice, skillMultiplier, type SkillState } from '../economy/progression';

interface SkillCardProps {
  title: string;
  icon?: ImageSourcePropType;
  skill: SkillState;
  /** Практика сейчас (у механиков копится во время ремонта и может быть ещё не сохранена) */
  practice: number;
  /** Подпись бонуса: «Эффективность тапа» или «Скорость ремонта» */
  bonusLabel: string;
  offer: CourseOffer | null;
  onBuyCourse: () => void;
  /** Дополнительные строки (скорость, зарплата механика) */
  extraRows?: { label: string; value: string }[];
}

const bonusText = (level: number) => `+${Math.round((skillMultiplier(level) - 1) * 100)}%`;

/** Навык «Механик»: уровень, практика, бонус и курс — всё из текущего состояния игры */
export const SkillCard = ({ title, icon, skill, practice, bonusLabel, offer, onBuyCourse, extraRows }: SkillCardProps) => {
  const isMax = skill.level >= SKILL_MAX_LEVEL;
  const required = requiredPractice(skill.level);
  const current = Math.min(required, Math.floor(practice));
  const preview = offer?.preview;

  let courseStatus: string | null = null;
  if (preview && !preview.available) {
    if (preview.block === 'already-taken') courseStatus = 'Курс на этом уровне уже пройден — дальше только практика';
    else if (preview.block === 'cooldown')
      courseStatus = `Перезарядка: ещё ${formatGameCooldown(preview.cooldownLeftMs, DAY_MS, DAYS_IN_MONTH)}`;
    else if (preview.block === 'threshold-reached') courseStatus = 'Порог уровня уже достигнут';
  } else if (offer && !offer.affordable) {
    courseStatus = 'Недостаточно свободных денег';
  }
  const canBuy = !!offer && !!preview?.available && offer.affordable;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {icon && <GameIcon source={icon} size={40} />}
        <Text style={styles.title}>
          {title} · уровень {skill.level}
          {isMax ? ' (макс.)' : ''}
        </Text>
      </View>

      {!isMax && (
        <>
          <View style={styles.row}>
            <Text style={styles.label}>Прогресс</Text>
            <Text style={styles.value}>
              {current.toLocaleString('ru-RU')} / {required.toLocaleString('ru-RU')}
            </Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(current / required) * 100}%` }]} />
          </View>
          <Text style={styles.hint}>Осталось {(required - current).toLocaleString('ru-RU')} практики</Text>
        </>
      )}

      <View style={styles.row}>
        <Text style={styles.label}>{bonusLabel}</Text>
        <Text style={styles.value}>{bonusText(skill.level)}</Text>
      </View>
      {!isMax && (
        <View style={styles.row}>
          <Text style={styles.label}>Следующий уровень</Text>
          <Text style={[styles.value, { color: colors.primary }]}>{bonusText(skill.level + 1)}</Text>
        </View>
      )}
      {extraRows?.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={styles.label}>{row.label}</Text>
          <Text style={styles.value}>{row.value}</Text>
        </View>
      ))}

      {!isMax && offer && preview && (
        <View style={styles.course}>
          <View style={styles.row}>
            <Text style={styles.label}>Курс</Text>
            <Text style={styles.value}>{formatMoney(offer.costCents)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Эффект курса</Text>
            <Text style={[styles.value, styles.effect]}>
              +{preview.granted.toLocaleString('ru-RU')} практики
              {preview.levelsUp ? ` (сразу уровень ${skill.level + 1})` : ''}
            </Text>
          </View>
          <Text style={styles.hint}>
            Курс покрывает до половины порога уровня ({preview.capacity.toLocaleString('ru-RU')}), остаток не переносится.
            Перезарядка — {COURSE_COOLDOWN_MS / (DAY_MS * DAYS_IN_MONTH)} игровых месяца.
          </Text>
          {courseStatus && <Text style={styles.status}>{courseStatus}</Text>}
          <TouchableOpacity
            style={[styles.button, !canBuy && styles.buttonDisabled]}
            disabled={!canBuy}
            onPress={onBuyCourse}
          >
            <GameIcon source={ICONS.upgradeSkill} size={22} />
            <Text style={styles.buttonText}>Пройти курс за {formatMoney(offer.costCents)}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 10,
  },
  label: {
    flexShrink: 1,
    fontSize: 13,
    color: colors.textTertiary,
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  effect: {
    flexShrink: 1,
    textAlign: 'right',
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginVertical: 4,
  },
  fill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  hint: {
    fontSize: 11,
    color: colors.textTertiary,
    marginBottom: 4,
  },
  course: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  status: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F59E0B',
    marginBottom: 6,
  },
  button: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
