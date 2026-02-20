import React from 'react';
import { View, Text } from 'react-native';
import { commonStyles } from '../styles/styles';

export const MarketScreen = () => {
  return (
    <View style={commonStyles.screenContainer}>
      <Text style={commonStyles.screenTitle}>Авторынок</Text>
      <Text style={commonStyles.screenText}>Купи новую машину</Text>
    </View>
  );
};
