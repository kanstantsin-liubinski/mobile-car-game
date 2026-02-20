import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { headerStyles } from '@styles/styles';
import { colors } from '@styles/colors';
import { useExperienceContext } from '@hooks/ExperienceContext';

interface TopMenuProps {
  balance: number;
  insets?: { top: number; right: number; bottom: number; left: number };
}

const CircularProgressBar = ({ progress, required, level }: { progress: number; required: number; level: number }) => {
  const size = 56;
  const radius = size / 2;
  const centerX = radius;
  const centerY = radius;
  
  // Calculate progress percentage: (current XP in level / required for next level) * 100
  const progressPercent = (progress / required) * 100;
  
  // Total segments (one per percent)
  const totalSegments = 100;
  const filledSegments = Math.round((progressPercent / 100) * totalSegments);
  const segmentRadius = radius - 5; // Distance from center to segment

  return (
    <View style={headerStyles.levelCircleContainer}>
      {/* Background circle */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: radius,
          borderWidth: 2,
          borderColor: colors.border,
        }}
      />
      
      {/* Progress segments - 100 segments in a circle */}
      {Array.from({ length: totalSegments }).map((_, index) => {
        const isFilled = index < filledSegments;
        // Calculate angle in radians (start at 12 o'clock = -90 degrees = -PI/2)
        const angleDegrees = (index / totalSegments) * 360 - 90;
        const angleRad = (angleDegrees * Math.PI) / 180;
        
        // Calculate position on circle
        const x = centerX + segmentRadius * Math.cos(angleRad);
        const y = centerY + segmentRadius * Math.sin(angleRad);
        
        return (
          <View
            key={index}
            style={{
              position: 'absolute',
              width: 1.8,
              height: 5,
              backgroundColor: isFilled ? colors.primary : colors.border,
              borderRadius: 0.9,
              left: x - 0.9,
              top: y - 2.5,
              transform: [{ rotateZ: `${angleDegrees + 90}deg` }],
            }}
          />
        );
      })}
      
      {/* Center circle with level */}
      <View
        style={{
          position: 'absolute',
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: colors.darkBg,
          borderWidth: 1.5,
          borderColor: colors.border,
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10,
          left: centerX - 18,
          top: centerY - 18,
        }}
      >
        <Text style={headerStyles.levelText}>{level}</Text>
      </View>
    </View>
  );
};

export const TopMenu = ({ balance, insets }: TopMenuProps) => {
  const { level, getProgress } = useExperienceContext();
  const { current, required } = getProgress();

  const formatBalance = (amount: number) => {
    return amount.toLocaleString('ru-RU');
  };

  return (
    <View style={[headerStyles.topMenu, insets && { paddingTop: insets.top }]}>
      <View style={headerStyles.balanceContainer}>
        <MaterialIcons name="account-balance-wallet" size={24} color={colors.primary} />
        <Text style={headerStyles.balanceValue}>${formatBalance(balance)}</Text>
      </View>

      <View style={headerStyles.levelIndicatorContainer}>
        <MaterialIcons name="bolt" size={16} color={colors.textTertiary} />
        
        {/* Circular Progress Bar */}
        <CircularProgressBar 
          progress={current}
          required={required}
          level={level}
        />
        
        {/* Counter text */}
        <View style={{ gap: 1 }}>
          <Text style={[headerStyles.levelCounterText, { fontWeight: '700', color: colors.primary, fontSize: 12 }]}>
            {current}
          </Text>
          <Text style={[headerStyles.levelCounterText, { fontSize: 10 }]}>
            /{required}
          </Text>
        </View>
      </View>
    </View>
  );
};
