import { StyleSheet } from 'react-native';
import { colors } from './colors';

export const commonStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 16,
    color: colors.textPrimary,
  },
  screenText: {
    fontSize: 16,
    color: colors.textTertiary,
    fontWeight: '500',
  },
});

export const headerStyles = StyleSheet.create({
  topMenu: {
    backgroundColor: colors.darkBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  balanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  balanceValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
  },
});

export const menuStyles = StyleSheet.create({
  bottomMenu: {
    flexDirection: 'row',
    backgroundColor: colors.darkBg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 10,
    paddingTop: 12,
    justifyContent: 'space-around',
  },
  menuButton: {
    width: 60,
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.buttonBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuButtonActive: {
    backgroundColor: colors.buttonActive,
    borderColor: colors.primary,
  },
});

export const marketStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 20,
    color: colors.textPrimary,
  },
  carsList: {
    gap: 16,
  },
  carCard: {
    backgroundColor: colors.darkBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  carHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  carEmoji: {
    fontSize: 48,
  },
  carInfo: {
    flex: 1,
    marginLeft: 12,
  },
  carName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  carSpeed: {
    fontSize: 14,
    color: colors.textTertiary,
  },
  carMeta: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
  },
  carPrice: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
  },
  carDescription: {
    fontSize: 14,
    color: colors.textTertiary,
    marginBottom: 12,
  },
  buyButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buyButtonDisabled: {
    backgroundColor: colors.buttonBg,
    opacity: 0.5,
  },
  buyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.darkBg,
  },
  buyButtonOwnedText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textTertiary,
  },
});

export const garageStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 20,
    color: colors.textPrimary,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 40,
  },
  carsList: {
    gap: 16,
  },
  carCard: {
    backgroundColor: colors.darkBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  carEmoji: {
    fontSize: 40,
    marginRight: 12,
    marginTop: 4,
  },
  carInfo: {
    flex: 1,
  },
  carName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  carSpeed: {
    fontSize: 14,
    color: colors.textTertiary,
  },
  carMeta: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
  },
  conditionContainer: {
    marginTop: 12,
    gap: 6,
  },
  conditionBar: {
    height: 8,
    backgroundColor: colors.buttonBg,
    borderRadius: 4,
    overflow: 'hidden',
  },
  conditionFill: {
    height: '100%',
    borderRadius: 4,
  },
  conditionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  repairHint: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 8,
    fontStyle: 'italic',
  },
});
