import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal } from 'react-native';
import { colors } from '@styles/colors';

interface MainMenuProps {
  hasSaveData: boolean;
  onContinue: () => void;
  onNewGame: () => void;
  onExit: () => void;
}

interface SettingsState {
  difficulty: 'easy' | 'normal' | 'hard';
}

export const MainMenu: React.FC<MainMenuProps> = ({
  hasSaveData,
  onContinue,
  onNewGame,
  onExit,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showConfirmNewGame, setShowConfirmNewGame] = useState(false);
  const [settings, setSettings] = useState<SettingsState>({
    difficulty: 'normal',
  });

  const handleNewGame = () => {
    if (hasSaveData) {
      setShowConfirmNewGame(true);
    } else {
      onNewGame();
    }
  };

  const handleConfirmNewGame = async () => {
    setShowConfirmNewGame(false);
    await onNewGame();
  };

  const getDifficultyLabel = (difficulty: string): string => {
    switch (difficulty) {
      case 'easy':
        return 'Легко';
      case 'hard':
        return 'Сложно';
      default:
        return 'Нормально';
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>CAR GAME</Text>
          <Text style={styles.subtitle}>Игра про машины</Text>
        </View>

        <View style={styles.buttonContainer}>
          {hasSaveData && (
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={onContinue}
            >
              <Text style={styles.buttonText}>Продолжить</Text>
              <Text style={styles.buttonSubtext}>Из последнего сохранения</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={handleNewGame}
          >
            <Text style={styles.buttonText}>Новая Игра</Text>
            {hasSaveData && <Text style={styles.buttonSubtext}>Предыдущая игра будет удалена</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.tertiaryButton]}
            onPress={() => setShowSettings(true)}
          >
            <Text style={styles.buttonText}>Настройки</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.dangerButton]}
            onPress={onExit}
          >
            <Text style={styles.buttonText}>Выход</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Settings Modal */}
      <Modal
        visible={showSettings}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSettings(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Настройки</Text>
              <TouchableOpacity
                onPress={() => setShowSettings(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.settingGroup}>
              <Text style={styles.settingLabel}>Сложность для новой игры:</Text>
              <View style={styles.difficultyOptions}>
                {(['easy', 'normal', 'hard'] as const).map((difficulty) => (
                  <TouchableOpacity
                    key={difficulty}
                    style={[
                      styles.difficultyButton,
                      settings.difficulty === difficulty && styles.difficultyButtonActive,
                    ]}
                    onPress={() =>
                      setSettings((prev) => ({ ...prev, difficulty }))
                    }
                  >
                    <Text
                      style={[
                        styles.difficultyButtonText,
                        settings.difficulty === difficulty &&
                          styles.difficultyButtonTextActive,
                      ]}
                    >
                      {getDifficultyLabel(difficulty)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={styles.closeSettingsButton}
              onPress={() => setShowSettings(false)}
            >
              <Text style={styles.closeSettingsButtonText}>Готово</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Confirm New Game Modal */}
      <Modal
        visible={showConfirmNewGame}
        animationType="fade"
        transparent
        onRequestClose={() => setShowConfirmNewGame(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalContent}>
            <Text style={styles.confirmModalTitle}>Начать новую игру?</Text>
            <Text style={styles.confirmModalMessage}>
              Ваше текущее сохранение будет удалено и не сможет быть восстановлено.
            </Text>

            <View style={styles.confirmModalButtons}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.cancelButton]}
                onPress={() => setShowConfirmNewGame(false)}
              >
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, styles.deleteButton]}
                onPress={handleConfirmNewGame}
              >
                <Text style={styles.deleteButtonText}>Удалить сохранение</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 60,
  },
  title: {
    fontSize: 48,
    fontWeight: '900',
    color: colors.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  buttonContainer: {
    gap: 16,
  },
  button: {
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: colors.buttonBg,
    borderColor: colors.border,
  },
  tertiaryButton: {
    backgroundColor: colors.darkBg,
    borderColor: colors.border,
  },
  dangerButton: {
    backgroundColor: colors.darkBg,
    borderColor: colors.border,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  buttonSubtext: {
    fontSize: 12,
    color: colors.textTertiary,
    fontWeight: '400',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.darkBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  closeButton: {
    fontSize: 28,
    color: colors.textTertiary,
    fontWeight: '300',
  },
  settingGroup: {
    marginBottom: 32,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  difficultyOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  difficultyButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.buttonBg,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
  },
  difficultyButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  difficultyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  difficultyButtonTextActive: {
    color: colors.textPrimary,
  },
  closeSettingsButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeSettingsButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // Confirm modal styles
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  confirmModalContent: {
    backgroundColor: colors.darkBg,
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: 'center',
  },
  confirmModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  confirmModalMessage: {
    fontSize: 14,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: 28,
  },
  confirmModalButtons: {
    width: '100%',
    gap: 12,
  },
  confirmButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
  },
  cancelButton: {
    backgroundColor: colors.darkBg,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  deleteButton: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
