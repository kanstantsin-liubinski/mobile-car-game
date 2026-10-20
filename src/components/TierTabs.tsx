import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { TouchableOpacity } from '@components/Touchable';
import { marketStyles } from '@styles/styles';
import { useExperienceContext } from '@hooks/ExperienceContext';
import { TIER_NAMES, TOTAL_TIERS, TIER_UNLOCK_LEVELS } from '../data/carModels';
import { GameIcon } from '@components/GameIcon';
import { TIER_ICONS } from '@img/gameIcons';

interface TierTabsProps {
  selectedTier: number;
  onSelect: (tier: number) => void;
  /** Класс, где сейчас горящее предложение — помечается огоньком */
  hotTier?: number | null;
}

/** Горизонтальные вкладки классов авто (авторынок, автосалон) с замками по уровню */
export const TierTabs = ({ selectedTier, onSelect, hotTier }: TierTabsProps) => {
  const { isTierUnlocked } = useExperienceContext();

  // Custom scrollbar state for tier tabs
  const [scrollIndicator, setScrollIndicator] = useState({ thumbWidth: 0, thumbLeft: 0, visible: false });
  const tierScrollContentWidth = useRef(0);
  const tierScrollViewWidth = useRef(0);

  const updateScrollIndicator = (scrollX: number) => {
    const contentW = tierScrollContentWidth.current;
    const viewW = tierScrollViewWidth.current;
    if (contentW <= viewW || viewW === 0) {
      setScrollIndicator({ thumbWidth: 0, thumbLeft: 0, visible: false });
      return;
    }
    const trackWidth = viewW;
    const thumbW = Math.max((viewW / contentW) * trackWidth, 30);
    const maxScroll = contentW - viewW;
    const scrollFraction = scrollX / maxScroll;
    const thumbLeft = scrollFraction * (trackWidth - thumbW);
    setScrollIndicator({ thumbWidth: thumbW, thumbLeft, visible: true });
  };

  const onTierScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    updateScrollIndicator(e.nativeEvent.contentOffset.x);
  };

  return (
    <View style={marketStyles.tierTabsContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={marketStyles.tierTabsContent}
        onScroll={onTierScroll}
        scrollEventThrottle={16}
        onContentSizeChange={(w) => {
          tierScrollContentWidth.current = w;
          updateScrollIndicator(0);
        }}
        onLayout={(e) => {
          tierScrollViewWidth.current = e.nativeEvent.layout.width;
          updateScrollIndicator(0);
        }}
      >
        {Array.from({ length: TOTAL_TIERS }, (_, i) => i + 1).map((tier) => {
          const isActive = selectedTier === tier;
          const unlocked = isTierUnlocked(tier);
          return (
            <TouchableOpacity
              key={tier}
              style={[
                marketStyles.tierTab,
                isActive && marketStyles.tierTabActive,
                !unlocked && marketStyles.tierTabLocked,
              ]}
              onPress={() => onSelect(tier)}
            >
              {!unlocked && (
                <Text style={{ position: 'absolute', top: 4, right: 6, fontSize: 10 }}>🔒</Text>
              )}
              {hotTier === tier && (
                <Text style={{ position: 'absolute', top: 4, left: 6, fontSize: 12 }}>🔥</Text>
              )}
              <GameIcon source={TIER_ICONS[tier]} size={40} style={!unlocked && { opacity: 0.4 }} />
              <Text
                style={[
                  marketStyles.tierTabText,
                  isActive && marketStyles.tierTabTextActive,
                  !unlocked && { opacity: 0.4 },
                ]}
              >
                {TIER_NAMES[tier]}
              </Text>
              <Text
                style={[
                  marketStyles.tierTabLevel,
                  isActive && marketStyles.tierTabLevelActive,
                  !unlocked && { opacity: 0.4 },
                ]}
              >
                {unlocked ? `Ур. ${tier}` : `🔒 Ур. ${TIER_UNLOCK_LEVELS[tier]}`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {scrollIndicator.visible && (
        <View style={marketStyles.scrollTrack}>
          <View
            style={[
              marketStyles.scrollThumb,
              { width: scrollIndicator.thumbWidth, left: scrollIndicator.thumbLeft },
            ]}
          />
        </View>
      )}
    </View>
  );
};
