import React from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * Окно поверх уже открытого окна. На iOS второй Modal рядом с открытым не показывается,
 * поэтому вложенные окна (увольнение, обучение) рисуются слоем внутри родительского Modal.
 * Рендерить последним ребёнком корневого View родительского окна.
 */
export const InnerOverlay = ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
  visible ? <View style={styles.layer}>{children}</View> : null;

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, elevation: 100 },
});
