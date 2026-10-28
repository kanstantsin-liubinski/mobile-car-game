import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TouchableOpacity } from '@components/Touchable';
import { CarImage } from '@components/CarImage';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { useGarageContext } from '@hooks/GarageContext';
import { colors } from '@styles/colors';
import { SCREEN_INSET } from '@styles/styles';
import { TIER_NAMES } from '../../data/carModels';
import * as A from '../../economy/auctions';
import { LADDER } from '../../economy/balance';
import { formatGameDays, formatMoney } from '../../economy/format';

/** За сколько уровней до открытия аукциона показывать анонс */
const AUCTION_TEASER_LEVELS = 5;

const LEADER_TEXT: Record<A.AuctionLeader, string> = {
  none: 'ставок ещё нет',
  player: '🟢 ты лидируешь',
  bot: '🔴 лидирует другой покупатель',
};

/**
 * Аукцион (с 30 уровня): один лот за раз, машина проверена аукционным домом (точные данные).
 * Ставка — на шаг выше текущей; соперник отвечает сразу, пока не упрётся в свой скрытый предел.
 * Выигранный лот выкупается за 3 дня в свободное место гаража или стоянки.
 */
export const AuctionCard = () => {
  const { state, auctionBid, claimAuctionLot } = useEconomy();
  const { gameTimeMs: now } = useGameClock();
  const { garage, allSlots, addCar } = useGarageContext();
  const level = state.player.xp.level;

  // Анонс — только когда аукцион уже близко: новичку закрытая карточка над рынком лишь мешала
  if (level < LADDER.auctions - AUCTION_TEASER_LEVELS) return null;
  if (level < LADDER.auctions) {
    return (
      <View style={[styles.card, styles.locked]}>
        <Text style={styles.title}>🔨 Аукцион</Text>
        <Text style={styles.text}>Откроется на {LADDER.auctions} уровне: редкие машины старших классов, торги против других покупателей.</Text>
      </View>
    );
  }

  const lot = state.auction.current;
  if (!lot) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>🔨 Аукцион</Text>
        <Text style={styles.text}>Следующий лот через {formatGameDays(state.auction.nextLotAtMs - now)}.</Text>
      </View>
    );
  }

  const car = lot.car;
  const freeSlot = allSlots.some((i) => !garage.some((c) => c.slotIndex === i));
  const block = A.bidBlock(state.auction, now, state.balanceCents);
  const next = A.nextPlayerBidCents(lot);

  const handleClaim = () => {
    const bought = claimAuctionLot();
    if (bought) addCar(bought);
  };

  return (
    <View style={[styles.card, lot.status === 'won' && styles.won]}>
      <View style={styles.head}>
        <Text style={styles.title}>🔨 Аукцион</Text>
        <Text style={styles.timer}>
          {lot.status === 'open'
            ? `до конца ${formatGameDays(lot.endsAtMs - now)}`
            : `выкупить за ${formatGameDays((lot.claimUntilMs ?? now) - now)}`}
        </Text>
      </View>
      <View style={styles.carRow}>
        <CarImage car={car} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{car.name}</Text>
          <Text style={styles.text}>
            {TIER_NAMES[lot.tier]} · {car.year} · {car.mileage.toLocaleString('ru-RU')} км
          </Text>
          <Text style={styles.text}>
            Проверено: техника {car.condition}% из {car.maxCondition}%, ЛКП {Math.round(car.paintCondition ?? car.condition)}%
          </Text>
        </View>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Рыночная стоимость</Text>
        <Text style={styles.value}>{formatMoney(lot.marketCents)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Текущая ставка</Text>
        <Text style={styles.value}>{formatMoney(lot.currentCents)}</Text>
      </View>
      <Text style={styles.text}>{lot.status === 'won' ? '🏆 Лот твой — выкупи его, пока не истёк срок' : LEADER_TEXT[lot.leader]}</Text>

      {lot.status === 'open' ? (
        <TouchableOpacity style={[styles.button, !!block && styles.disabled]} disabled={!!block} onPress={() => auctionBid()}>
          <Text style={styles.buttonText}>
            {block === 'leading'
              ? 'Ты лидируешь'
              : block === 'money'
                ? `Не хватает денег на ${formatMoney(next)}`
                : `Ставка ${formatMoney(next)}`}
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.button, styles.claim, (!freeSlot || state.balanceCents < lot.currentCents) && styles.disabled]}
          disabled={!freeSlot || state.balanceCents < lot.currentCents}
          onPress={handleClaim}
        >
          <Text style={styles.buttonText}>
            {!freeSlot ? 'Нет свободного места' : state.balanceCents < lot.currentCents ? 'Не хватает денег' : `Выкупить за ${formatMoney(lot.currentCents)}`}
          </Text>
        </TouchableOpacity>
      )}
      <Text style={styles.hint}>
        Шаг ставки {formatMoney(A.bidStepCents(lot))}. Соперник перебивает сразу, пока не дойдёт до своего предела (85–108% рыночной цены).
        Деньги списываются только при выкупе.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A855F7',
    padding: 12,
    // Карточка стоит прямо в ScrollView рынка, у которого нет бокового отступа
    marginHorizontal: SCREEN_INSET,
    marginBottom: 12,
    gap: 6,
  },
  locked: { borderColor: colors.border, opacity: 0.7 },
  won: { borderColor: '#22C55E' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  timer: { fontSize: 12, fontWeight: '700', color: '#A855F7' },
  carRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  text: { fontSize: 12, color: colors.textTertiary, lineHeight: 17 },
  hint: { fontSize: 11, color: colors.textTertiary, lineHeight: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 13, color: colors.textTertiary },
  value: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  button: { backgroundColor: '#A855F7', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  claim: { backgroundColor: '#22C55E' },
  buttonText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  disabled: { opacity: 0.45 },
});
