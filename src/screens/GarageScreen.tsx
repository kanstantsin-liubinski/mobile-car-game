import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Alert } from 'react-native';
import { garageStyles } from '@styles/styles';
import { useGarageContext } from '@hooks/GarageContext';
import { useBalance } from '@hooks/useBalance';
import { colors } from '@styles/colors';
import { calculateCarPrice } from '../utils/priceCalculator';

export const GarageScreen = () => {
  const { garage, repairCar, sellCar } = useGarageContext();
  const { addBalance } = useBalance();
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null);

  const getConditionColor = (condition: number) => {
    if (condition >= 80) return colors.primary;
    if (condition >= 50) return '#F59E0B';
    if (condition >= 20) return '#EF4444';
    return '#991B1B';
  };

  const handleSellCar = (carId: string) => {
    const car = garage.find((c) => c.id === carId);
    if (!car) return;

    const sellPrice = calculateCarPrice(car.basePrice, {
      year: car.year,
      mileage: car.mileage,
      condition: car.condition,
    });

    Alert.alert(
      'Продать машину?',
      `${car.name}\nПолучишь: $${sellPrice.toLocaleString()}`,
      [
        {
          text: 'Отмена',
          onPress: () => setSelectedCarId(null),
          style: 'cancel',
        },
        {
          text: 'Продать',
          onPress: () => {
            addBalance(sellPrice);
            sellCar(carId, sellPrice);
            setSelectedCarId(null);
          },
          style: 'destructive',
        },
      ]
    );
  };

  return (
    <ScrollView style={garageStyles.container}>
      <Text style={garageStyles.title}>Мой гараж</Text>

      {garage.length === 0 ? (
        <Text style={garageStyles.emptyText}>Ещё нет машин. Купи её на авторынке!</Text>
      ) : (
        <View style={garageStyles.carsList}>
          {garage.map((car) => {
            const currentPrice = calculateCarPrice(car.basePrice, {
              year: car.year,
              mileage: car.mileage,
              condition: car.condition,
            });
            const priceChange = currentPrice - car.price;
            const priceChangePercent = ((currentPrice / car.price - 1) * 100).toFixed(1);

            return (
              <TouchableOpacity
                key={car.id}
                onPress={() => repairCar(car.id)}
                activeOpacity={0.7}
              >
                <View style={garageStyles.carCard}>
                  <Text style={garageStyles.carEmoji}>{car.emoji}</Text>
                  <View style={garageStyles.carInfo}>
                    <Text style={garageStyles.carName}>{car.name}</Text>
                    <Text style={garageStyles.carSpeed}>⚡ {car.speed} км/ч</Text>
                    <Text style={garageStyles.carMeta}>
                      📅 {car.year} • 📏 {car.mileage.toLocaleString()} км
                    </Text>

                    <View style={garageStyles.conditionContainer}>
                      <View style={garageStyles.conditionBar}>
                        {/* Текущее состояние */}
                        <View
                          style={[
                            garageStyles.conditionFill,
                            {
                              width: `${car.condition}%`,
                              backgroundColor: getConditionColor(car.condition),
                              position: 'absolute',
                              left: 0,
                            },
                          ]}
                        />
                        {/* Максимально возможное состояние */}
                        <View
                          style={[
                            garageStyles.conditionMaxFill,
                            {
                              width: `${car.maxCondition}%`,
                              backgroundColor: colors.border,
                              position: 'absolute',
                              left: 0,
                            },
                          ]}
                        />
                        {/* Недостижимая часть (разница между 100% и максимумом) */}
                        <View
                          style={[
                            garageStyles.conditionUnachievableFill,
                            {
                              width: `${100 - car.maxCondition}%`,
                              backgroundColor: '#27272A',
                              position: 'absolute',
                              right: 0,
                            },
                          ]}
                        />
                      </View>
                      <View style={garageStyles.conditionLabelContainer}>
                        <Text
                          style={[
                            garageStyles.conditionText,
                            { color: getConditionColor(car.condition) },
                          ]}
                        >
                          {car.condition.toFixed(1)}%
                        </Text>
                        <Text style={garageStyles.maxConditionText}>
                          макс {car.maxCondition.toFixed(1)}%
                        </Text>
                      </View>
                    </View>

                    <View style={garageStyles.priceContainer}>
                      <Text style={garageStyles.priceLabel}>Текущая цена:</Text>
                      <Text style={garageStyles.currentPrice}>
                        ${currentPrice.toLocaleString()}
                      </Text>
                      <Text
                        style={[
                          garageStyles.priceChange,
                          { color: priceChange >= 0 ? colors.primary : '#EF4444' },
                        ]}
                      >
                        {priceChange >= 0 ? '+' : ''}{priceChange.toLocaleString()} (
                        {priceChangePercent}%)
                      </Text>
                    </View>

                    <View style={garageStyles.buttonsContainer}>
                      <TouchableOpacity
                        style={[
                          garageStyles.button,
                          garageStyles.repairButton,
                          car.condition >= car.maxCondition && garageStyles.repairButtonDisabled,
                        ]}
                        onPress={() => repairCar(car.id)}
                        disabled={car.condition >= car.maxCondition}
                      >
                        <Text style={garageStyles.buttonText}>
                          {car.condition >= car.maxCondition ? '✓ Макс' : '🔧 Ремонт (+0.1%)'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[garageStyles.button, garageStyles.sellButton]}
                        onPress={() => handleSellCar(car.id)}
                      >
                        <Text style={garageStyles.buttonText}>💰 Продать</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
};
