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
