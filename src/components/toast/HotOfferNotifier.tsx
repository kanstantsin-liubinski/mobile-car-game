import { useEffect } from 'react';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { useMarketContext } from '@hooks/MarketContext';
import { useToast } from '@components/toast/ToastContext';
import { TIER_ICONS } from '@img/gameIcons';
import { getMarketById } from '../../data/cityBuildings';
import { HOT_OFFER_NOTIFY_LEVEL } from '../../economy/progression';

/**
 * Уведомление о горящем предложении (навык «Менеджмент» от 2 уровня): один раз на предложение,
 * не поверх зарплатного дня и банкротства — тогда оно ждёт, пока экран освободится.
 */
export const HotOfferNotifier = ({ onOpen }: { onOpen: (marketId: string, tier: number) => void }) => {
  const { state, isLoaded } = useEconomy();
  const { paydayPending } = useGameClock();
  const { hotOffer, markHotNotified } = useMarketContext();
  const { showToast } = useToast();

  const managementLevel = state.player.management.level;
  const blocked = paydayPending || !!state.bankruptcy;

  useEffect(() => {
    if (!isLoaded || !hotOffer || hotOffer.notified) return;
    // Предложение появилось до открытия уведомлений: тоста не будет, его покажет красная точка
    if (managementLevel < HOT_OFFER_NOTIFY_LEVEL) {
      markHotNotified(hotOffer.id);
      return;
    }
    if (blocked) return;
    const { car } = hotOffer.listing;
    showToast({
      title: '🔥 Горящее предложение',
      message: `${getMarketById(hotOffer.marketId)?.name ?? 'Авторынок'}: ${car.name} за $${hotOffer.price.toLocaleString()} вместо $${hotOffer.normalPrice.toLocaleString()} (−${Math.round(hotOffer.discount * 100)}%). Нажмите, чтобы посмотреть.`,
      icon: TIER_ICONS[hotOffer.tier],
      tone: 'hot',
      onPress: () => onOpen(hotOffer.marketId, hotOffer.tier),
    });
    markHotNotified(hotOffer.id);
  }, [isLoaded, hotOffer?.id, hotOffer?.notified, managementLevel, blocked]);

  return null;
};
