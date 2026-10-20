import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  Image,
  Platform,
  StyleSheet,
  Animated,
  PanResponder,
  Easing,
  type LayoutChangeEvent,
} from 'react-native';
import { SheetModal } from '@components/SheetModal';
import { TouchableOpacity } from '@components/Touchable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { garageStyles } from '@styles/styles';
import { colors } from '@styles/colors';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { useGarageContext } from '@hooks/GarageContext';
import { useEconomy } from '@hooks/EconomyContext';
import { useExperienceContext } from '@hooks/ExperienceContext';
import { useMarketContext } from '@hooks/MarketContext';
import { RedDot } from '@components/RedDot';
import { Image as ExpoImage } from 'expo-image';
import { LocationHeader } from '@components/LocationHeader';
import { SheetHeader } from '@components/SheetHeader';
import { GameIcon } from '@components/GameIcon';
import { ICONS, BUILDING_ICONS } from '@img/gameIcons';
import {
  CITY_BACKGROUND,
  CITY_BG_REF_SIZE,
  CITY_BUILDINGS,
  getGarageById,
  getGarageRank,
  type CityBuilding,
  type GarageBuilding,
} from '../data/cityBuildings';

// ─── Размеры карты ───────────────────────────────────────────────────
// Карта больше экрана, её можно свободно перетаскивать в любом направлении.
// Ширина следует пропорциям фона, чтобы картинка не искажалась.
const CITY_MAP_HEIGHT = 900;
const CITY_MAP_WIDTH = Math.round((CITY_MAP_HEIGHT * CITY_BG_REF_SIZE.width) / CITY_BG_REF_SIZE.height);
const CITY_BG_COLOR = '#1F2937';

// ─── Перетаскивание карты ────────────────────────────────────────────
const DRAG_THRESHOLD = 5; // px, после которых касание считается перетаскиванием, а не тапом
const INERTIA_FACTOR = 250; // насколько далеко карта «докатывается» после броска
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

// ─── Фонтан ──────────────────────────────────────────────────────────
const FOUNTAIN_COIN_CHANCE = 0.1; // шанс выловить монетку за тап
const FOUNTAIN_COIN_AMOUNT = 0.1; // $0.10
const FLOATING_TEXT_DURATION = 900;

type Point = { x: number; y: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Допустимое смещение карты; если карта меньше экрана по оси — центрируем её */
const getPanBounds = (viewWidth: number, viewHeight: number) => {
  const boundsFor = (view: number, map: number) =>
    map <= view ? { min: (view - map) / 2, max: (view - map) / 2 } : { min: view - map, max: 0 };
  const x = boundsFor(viewWidth, CITY_MAP_WIDTH);
  const y = boundsFor(viewHeight, CITY_MAP_HEIGHT);
  return { minX: x.min, maxX: x.max, minY: y.min, maxY: y.max };
};

/**
 * active    — текущий гараж игрока
 * inactive  — гараж слабее текущего, с ним нельзя взаимодействовать
 * available — можно купить (переезд)
 * locked    — не хватает уровня
 */
type GarageState = 'active' | 'inactive' | 'available' | 'locked';

const pluralizePlaces = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'место';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'места';
  return 'мест';
};

interface FloatingPopup {
  id: number;
  text: string;
  success: boolean;
  /** Смещение по горизонтали, чтобы частые тапы не накладывались */
  offsetX: number;
}

/** Всплывающий текст над фонтаном: поднимается и исчезает */
const FloatingText = ({ popup, onDone }: { popup: FloatingPopup; onDone: (id: number) => void }) => {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: FLOATING_TEXT_DURATION,
      easing: Easing.out(Easing.quad),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(() => onDone(popup.id));
  }, []);

  return (
    <Animated.Text
      pointerEvents="none"
      style={[
        styles.floatingText,
        popup.success ? styles.floatingTextSuccess : styles.floatingTextMiss,
        {
          opacity: progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
          transform: [
            { translateX: popup.offsetX },
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -50] }) },
          ],
        },
      ]}
    >
      {popup.text}
    </Animated.Text>
  );
};

interface CityScreenProps {
  onOpenMarket: (marketId: string) => void;
  onOpenDealership: () => void;
  onOpenGarage: (garageId: string) => void;
}

export const CityScreen = ({ onOpenMarket, onOpenDealership, onOpenGarage }: CityScreenProps) => {
  const { garageId, buyGarage } = useGarageContext();
  const { balance, addOtherIncome, buyGarage: payForGarage } = useEconomy();
  const { level } = useExperienceContext();
  const { marketHasAlert } = useMarketContext();
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;

  const [garageToBuy, setGarageToBuy] = useState<GarageBuilding | null>(null);
  const [fountainPopups, setFountainPopups] = useState<FloatingPopup[]>([]);
  const popupId = useRef(0);

  // ─── Свободное перетаскивание карты ───────────────────────────────
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const position = useRef<Point>({ x: 0, y: 0 });
  const dragStart = useRef<Point>({ x: 0, y: 0 });
  const viewport = useRef<{ width: number; height: number } | null>(null);
  const viewportRef = useRef<View>(null);

  useEffect(() => {
    const id = pan.addListener((value) => {
      position.current = value;
    });
    return () => pan.removeListener(id);
  }, [pan]);

  const clampToBounds = (point: Point): Point => {
    if (!viewport.current) return point;
    const b = getPanBounds(viewport.current.width, viewport.current.height);
    return { x: clamp(point.x, b.minX, b.maxX), y: clamp(point.y, b.minY, b.maxY) };
  };

  const moveTo = (point: Point) => {
    const next = clampToBounds(point);
    pan.setValue(next);
    position.current = next;
  };

  const handleViewportLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    // Пока город скрыт (смонтирован заранее), размер нулевой — центрируем при первом настоящем показе
    if (width <= 0 || height <= 0) return;
    const isFirstLayout = viewport.current === null;
    viewport.current = { width, height };
    // Первый раз стартуем с центра карты, дальше просто не даём уехать за края
    moveTo(
      isFirstLayout
        ? { x: (width - CITY_MAP_WIDTH) / 2, y: (height - CITY_MAP_HEIGHT) / 2 }
        : position.current,
    );
  };

  const panResponder = useMemo(() => {
    const isDrag = (dx: number, dy: number) =>
      Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD;

    return PanResponder.create({
      // Забираем жест у зданий, только когда палец реально сдвинулся — иначе это тап
      onMoveShouldSetPanResponder: (_, g) => isDrag(g.dx, g.dy),
      onMoveShouldSetPanResponderCapture: (_, g) => isDrag(g.dx, g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        pan.stopAnimation();
        dragStart.current = { ...position.current };
      },
      onPanResponderMove: (_, g) => {
        moveTo({ x: dragStart.current.x + g.dx, y: dragStart.current.y + g.dy });
      },
      onPanResponderRelease: (_, g) => {
        // Небольшая инерция после броска
        const target = clampToBounds({
          x: dragStart.current.x + g.dx + g.vx * INERTIA_FACTOR,
          y: dragStart.current.y + g.dy + g.vy * INERTIA_FACTOR,
        });
        Animated.timing(pan, {
          toValue: target,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start();
      },
    });
  }, [pan]);

  // На вебе карту можно двигать ещё и колесом мыши / тачпадом
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = viewportRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      pan.stopAnimation();
      moveTo({ x: position.current.x - e.deltaX, y: position.current.y - e.deltaY });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [pan]);

  // ─── Гаражи ───────────────────────────────────────────────────────
  const activeGarageRank = getGarageRank(garageId);
  const activeGarage = getGarageById(garageId);

  const getGarageState = (building: GarageBuilding): GarageState => {
    const rank = getGarageRank(building.id);
    if (rank === activeGarageRank) return 'active';
    if (rank < activeGarageRank) return 'inactive';
    return level >= building.requiredLevel ? 'available' : 'locked';
  };

  // Каждый тап по фонтану с шансом 10% приносит 10 центов
  const handleFountainTap = () => {
    const success = Math.random() < FOUNTAIN_COIN_CHANCE;
    if (success) addOtherIncome(FOUNTAIN_COIN_AMOUNT);
    popupId.current += 1;
    const popup: FloatingPopup = {
      id: popupId.current,
      text: success ? '+$0.10' : '💧',
      success,
      offsetX: Math.round((Math.random() - 0.5) * 40),
    };
    setFountainPopups((prev) => [...prev, popup]);
  };

  const removeFountainPopup = (id: number) =>
    setFountainPopups((prev) => prev.filter((p) => p.id !== id));

  const handleBuildingPress = (building: CityBuilding) => {
    switch (building.type) {
      case 'market':
        onOpenMarket(building.id);
        return;
      case 'dealership':
        onOpenDealership();
        return;
      case 'fountain':
        handleFountainTap();
        return;
    }
    const state = getGarageState(building);
    if (state === 'active') {
      onOpenGarage(building.id);
    } else if (state !== 'inactive') {
      setGarageToBuy(building);
    }
  };

  const handleBuyGarage = () => {
    if (!garageToBuy) return;
    if (level < garageToBuy.requiredLevel) return;
    if (!payForGarage(garageToBuy.price)) return;
    buyGarage(garageToBuy.id);
    setGarageToBuy(null);
  };

  const getStatusText = (building: CityBuilding): string => {
    if (building.type === 'market') return marketHasAlert(building.id) ? '🔥 Горящее предложение' : 'Подержанные авто';
    if (building.type === 'dealership') return 'Новые авто';
    if (building.type === 'fountain') return '';
    switch (getGarageState(building)) {
      case 'active':
        return `Ваш гараж · ${building.slots} ${pluralizePlaces(building.slots)}`;
      case 'inactive':
        return 'Неактивен';
      case 'locked':
        return `🔒 Ур. ${building.requiredLevel}`;
      case 'available':
        return `$${building.price.toLocaleString('ru-RU')}`;
    }
  };

  const buyLevelOk = garageToBuy ? level >= garageToBuy.requiredLevel : false;
  const buyMoneyOk = garageToBuy ? balance >= garageToBuy.price : false;

  return (
    <View style={styles.container}>
      <View
        ref={viewportRef}
        style={styles.viewport}
        onLayout={handleViewportLayout}
        {...panResponder.panHandlers}
      >
        <Animated.View style={[styles.map, { transform: pan.getTranslateTransform() }]}>
          {/* expo-image: карта из памяти рисуется сразу, без повторной загрузки */}
          <ExpoImage source={CITY_BACKGROUND} style={styles.background} contentFit="fill" cachePolicy="memory-disk" transition={0} loading="eager" priority="high" />

          {CITY_BUILDINGS.map((building) => {
            const garageState = building.type === 'garage' ? getGarageState(building) : null;
            const dimmed = garageState !== null && garageState !== 'active';
            const { area } = building;

            return (
              <Pressable
                key={building.id}
                disabled={garageState === 'inactive'}
                onPress={() => handleBuildingPress(building)}
                style={({ pressed }) => [
                  styles.building,
                  {
                    left: area.x * CITY_MAP_WIDTH,
                    top: area.y * CITY_MAP_HEIGHT,
                    width: area.w * CITY_MAP_WIDTH,
                    height: area.h * CITY_MAP_HEIGHT,
                  },
                  building.type === 'fountain' && styles.fountain,
                  pressed && styles.buildingPressed,
                ]}
              >
                {building.type === 'fountain' ? (
                  // У фонтана нет ярлыка — только всплывающие монетки и брызги
                  fountainPopups.map((popup) => (
                    <FloatingText key={popup.id} popup={popup} onDone={removeFountainPopup} />
                  ))
                ) : (
                  // Ярлык висит над центром здания
                  <View style={[styles.label, dimmed && styles.labelDimmed]}>
                    <View style={styles.labelTitle}>
                      {BUILDING_ICONS[building.id] ? (
                        <GameIcon source={BUILDING_ICONS[building.id]} size={26} />
                      ) : (
                        <Text style={styles.labelName}>{building.emoji}</Text>
                      )}
                      <Text style={styles.labelName}>{building.name}</Text>
                    </View>
                    <Text style={[styles.labelStatus, dimmed && styles.labelStatusDimmed]}>
                      {getStatusText(building)}
                    </Text>
                    {building.type === 'market' && marketHasAlert(building.id) && <RedDot />}
                  </View>
                )}
              </Pressable>
            );
          })}
        </Animated.View>
      </View>

      <LocationHeader title="Город" icon={ICONS.navCity} overlay />

      {/* Garage Purchase Modal */}
      <SheetModal visible={garageToBuy !== null} onRequestClose={() => setGarageToBuy(null)}>
          <View style={[garageStyles.modalContent, { paddingBottom: insets.bottom + 14 }]}>
            {garageToBuy && (
              <>
                {BUILDING_ICONS[garageToBuy.id] && (
                  <GameIcon source={BUILDING_ICONS[garageToBuy.id]} size={140} style={styles.modalImage} />
                )}
                <SheetHeader title={garageToBuy.name} onClose={() => setGarageToBuy(null)} />

                <View style={styles.infoRow}>
                  <View style={styles.infoCell}>
                    <Text style={styles.infoLabel}>МЕСТА</Text>
                    <Text style={styles.infoValue}>{garageToBuy.slots}</Text>
                  </View>
                  <View style={styles.infoCell}>
                    <Text style={styles.infoLabel}>УРОВЕНЬ</Text>
                    <Text style={[styles.infoValue, !buyLevelOk && styles.infoValueBad]}>
                      {garageToBuy.requiredLevel}
                    </Text>
                  </View>
                  <View style={styles.infoCell}>
                    <Text style={styles.infoLabel}>ЦЕНА</Text>
                    <Text style={[styles.infoValue, !buyMoneyOk && styles.infoValueBad]}>
                      ${garageToBuy.price.toLocaleString('ru-RU')}
                    </Text>
                  </View>
                </View>

                {!buyLevelOk && (
                  <Text style={styles.warningText}>
                    Гараж откроется на {garageToBuy.requiredLevel} уровне
                  </Text>
                )}
                {buyLevelOk && !buyMoneyOk && (
                  <Text style={styles.warningText}>Недостаточно денег</Text>
                )}
                {buyLevelOk && buyMoneyOk && activeGarage && (
                  <Text style={styles.noteText}>
                    Машины и механики переедут сюда, а {activeGarage.name} станет неактивным
                  </Text>
                )}

                <View style={garageStyles.modalButtonsContainer}>
                  <TouchableOpacity
                    style={[garageStyles.modalButton, garageStyles.cancelButton]}
                    onPress={() => setGarageToBuy(null)}
                  >
                    <Text style={garageStyles.modalButtonText}>Отмена</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      garageStyles.modalButton,
                      garageStyles.confirmButton,
                      !(buyLevelOk && buyMoneyOk) && { opacity: 0.5 },
                    ]}
                    onPress={handleBuyGarage}
                    disabled={!(buyLevelOk && buyMoneyOk)}
                  >
                    <Text style={[garageStyles.modalButtonText, { color: '#FFF' }]}>Купить</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
      </SheetModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CITY_BG_COLOR,
  },
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
  map: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: CITY_MAP_WIDTH,
    height: CITY_MAP_HEIGHT,
    backgroundColor: CITY_BG_COLOR,
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: CITY_MAP_WIDTH,
    height: CITY_MAP_HEIGHT,
  },
  building: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  buildingPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  fountain: {
    borderRadius: 999,
  },
  floatingText: {
    position: 'absolute',
    fontSize: 18,
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  floatingTextSuccess: {
    color: '#FACC15',
  },
  floatingTextMiss: {
    fontSize: 16,
  },
  label: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  labelDimmed: {
    borderColor: colors.border,
    opacity: 0.85,
  },
  labelTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalImage: {
    alignSelf: 'center',
    marginBottom: 4,
  },
  labelName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  labelStatus: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  labelStatusDimmed: {
    color: colors.textTertiary,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  infoCell: {
    flex: 1,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  infoLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  infoValue: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  infoValueBad: {
    color: '#EF4444',
  },
  noteText: {
    color: colors.textTertiary,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  warningText: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
