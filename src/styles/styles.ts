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
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    color: colors.textDark,
  },
  screenText: {
    fontSize: 16,
    color: colors.textGray,
  },
});

export const menuStyles = StyleSheet.create({
  bottomMenu: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    justifyContent: 'space-around',
  },
  menuButton: {
    width: 60,
    height: 50,
    borderRadius: 10,
    backgroundColor: colors.light,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  menuButtonActive: {
    backgroundColor: colors.primary,
  },
});
