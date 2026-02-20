import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { garageStyles } from '@styles/styles';
import { useGarageContext } from '@hooks/GarageContext';
import { colors } from '@styles/colors';

export const GarageScreen = () => {
  const { garage, repairCar } = useGarageContext();

  const getConditionColor = (condition: number) => {
    if (condition >= 80) return colors.primary;
    if (condition >= 50) return '#F59E0B';
    if (condition >= 20) return '#EF4444';
    return '#991B1B';
  };

  return (
    <ScrollView style={garageStyles.container}>
      <Text style={garageStyles.title}>Мой гараж</Text>

      {garage.length === 0 ? (
        <Text style={garageStyles.emptyText}>Ещё нет машин. Купи её на авторынке!</Text>
      ) : (
        <View style={garageStyles.carsList}>
          {garage.map((car) => (
            <TouchableOpacity key={car.id} onPress={() => repairCar(car.id)}>
              <View style={garageStyles.carCard}>
                <Text style={garageStyles.carEmoji}>{car.emoji}</Text>
                <View style={garageStyles.carInfo}>
                  <Text style={garageStyles.carName}>{car.name}</Text>
                  <Text style={garageStyles.carSpeed}>⚡ {car.speed} км/ч</Text>
                  <Text style={garageStyles.carMeta}>📅 {car.year} • 📏 {car.mileage.toLocaleString()} км</Text>
                  
                  <View style={garageStyles.conditionContainer}>
                    <View style={garageStyles.conditionBar}>
                      <View
                        style={[
                          garageStyles.conditionFill,
                          {
                            width: `${car.condition}%`,
                            backgroundColor: getConditionColor(car.condition),
                          },
                        ]}
                      />
                    </View>
                    <Text style={[garageStyles.conditionText, { color: getConditionColor(car.condition) }]}>
                      {car.condition.toFixed(1)}%
                    </Text>
                  </View>

                  <Text style={garageStyles.repairHint}>💡 Тапни для восстановления</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
};
