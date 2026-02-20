import React from 'react';
import { View, Text } from 'react-native';
import { commonStyles } from '@styles/styles';

export const GarageScreen = () => {
  return (
    <View style={commonStyles.screenContainer}>
      <Text style={commonStyles.screenTitle}>Гараж</Text>
      <Text style={commonStyles.screenText}>Твои машины здесь да</Text>
    </View>
  );
};
