import { Image, Platform, type ImageSourcePropType } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { BUILDING_ICONS, ICONS, MECHANIC_AVATARS, TIER_ICONS } from './gameIcons';
import { CITY_BACKGROUND } from '../data/cityBuildings';

/** Все картинки игры — грузятся один раз при запуске, до главного меню */
const ALL_IMAGES: ImageSourcePropType[] = [
  CITY_BACKGROUND,
  ...Object.values(ICONS),
  ...Object.values(BUILDING_ICONS),
  ...Object.values(TIER_ICONS),
  ...MECHANIC_AVATARS,
];

/** Дольше этого не держим игрока на экране загрузки: недогруженное догрузится само */
const PRELOAD_TIMEOUT_MS = 10_000;

/** Декодированные картинки держим в памяти (веб), чтобы браузер не выгрузил их до показа */
const keepAlive: unknown[] = [];
let preloadPromise: Promise<void> | null = null;

const uriOf = (source: ImageSourcePropType): string | null => {
  try {
    return Image.resolveAssetSource(source as never)?.uri ?? null;
  } catch {
    return null;
  }
};

/**
 * Одна картинка: в кэш expo-image в памяти и на диске (тогда GameIcon рисует её сразу,
 * без пустого кадра, на любом экране и при каждом новом показе) и, в браузере,
 * ещё и полное декодирование — чтобы при показе не было мигания.
 */
const loadOne = async (uri: string): Promise<void> => {
  const prefetch = ExpoImage.prefetch(uri, 'memory-disk').catch(() => false);
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Image' in window) {
    const img = new window.Image();
    img.src = uri;
    keepAlive.push(img);
    const decoded = img.decode ? img.decode().catch(() => undefined) : Promise.resolve();
    await Promise.all([prefetch, decoded]);
    return;
  }
  await prefetch;
};

/** Загрузить все картинки игры; onProgress — доля готового 0…1. Повторный вызов ждёт ту же загрузку */
export const preloadAllImages = (onProgress?: (done: number) => void): Promise<void> => {
  if (preloadPromise) {
    onProgress?.(1);
    return preloadPromise;
  }
  const uris = Array.from(new Set(ALL_IMAGES.map(uriOf).filter((u): u is string => !!u)));
  let done = 0;
  const all = Promise.all(
    uris.map((uri) =>
      loadOne(uri)
        .catch(() => undefined)
        .finally(() => {
          done += 1;
          onProgress?.(uris.length ? done / uris.length : 1);
        }),
    ),
  ).then(() => undefined);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, PRELOAD_TIMEOUT_MS));
  preloadPromise = Promise.race([all, timeout]);
  return preloadPromise;
};
