import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { marketStyles } from '@styles/styles';
import { useBalance } from '@hooks/useBalance';
import { useGarageContext } from '@hooks/GarageContext';
import { colors } from '@styles/colors';
import { calculateMaxCondition } from '../utils/priceCalculator';
import type { Car } from '@/types';

const AVAILABLE_CARS: Car[] = [
  {
    id: 'car-1',
    name: 'VW Golf 2000',
    price: 5000,
    emoji: '🚗',
    speed: 180,
    description: 'Надежная немецкая компактная машина',
    year: 2000,
    mileage: 180000,
    condition: 35.0,
  },
  {
    id: 'car-2',
    name: 'Honda Civic',
    price: 8000,
    emoji: '🚙',
    speed: 195,
    description: 'Японская спортивная компактная',
    year: 2005,
    mileage: 140000,
    condition: 45.0,
  },
  {
    id: 'car-3',
    name: 'Toyota Corolla',
    price: 10000,
    emoji: '🚗',
    speed: 190,
    description: 'Самая надежная машина в мире',
    year: 2010,
    mileage: 95000,
    condition: 60.0,
  },
  {
    id: 'car-4',
    name: 'Ford Mustang',
    price: 18000,
    emoji: '🏎️',
    speed: 240,
    description: 'Легендарный американский спортсмен',
    year: 2015,
    mileage: 65000,
    condition: 72.0,
  },
  {
    id: 'car-5',
    name: 'BMW 330i',
    price: 25000,
    emoji: '🚘',
    speed: 250,
    description: 'Немецкий премиум с отличным дизайном',
    year: 2018,
    mileage: 32000,
    condition: 85.0,
  },
  {
    id: 'car-6',
    name: 'Porsche 911',
    price: 40000,
    emoji: '🏎️',
    speed: 300,
    description: 'Икона спортивного автомобилестроения',
    year: 2019,
    mileage: 18000,
    condition: 92.0,
  },
  {
    id: 'car-7',
    name: 'Ferrari F430',
    price: 60000,
    emoji: '🏁',
    speed: 330,
    description: 'Красная машина мечты каждого',
    year: 2020,
    mileage: 8000,
    condition: 96.0,
  },
  {
    id: 'car-8',
    name: 'Bugatti Veyron',
    price: 100000,
    emoji: '⚡',
    speed: 407,
    description: 'Самая быстрая серийная машина в мире',
    year: 2023,
    mileage: 500,
    condition: 99.0,
  },
];

export const MarketScreen = () => {
  const { balance, removeBalance } = useBalance();
  const { addCar, hasCar } = useGarageContext();

  const getConditionColor = (condition: number) => {
    if (condition >= 80) return colors.primary;
    if (condition >= 50) return '#F59E0B';
    if (condition >= 20) return '#EF4444';
    return '#991B1B';
  };

  const handleBuyCar = (car: Car) => {
    if (removeBalance(car.price)) {
      addCar(car);
    }
  };

  return (
    <ScrollView style={marketStyles.container}>
      <Text style={marketStyles.title}>Авторынок</Text>

      <View style={marketStyles.carsList}>
        {AVAILABLE_CARS.map((car) => {
          const owned = hasCar(car.id);
          const canAfford = balance >= car.price && !owned;
          const maxCondition = calculateMaxCondition(car.year, car.mileage);

          return (
            <View key={car.id} style={marketStyles.carCard}>
              <View style={marketStyles.carHeader}>
                <Text style={marketStyles.carEmoji}>{car.emoji}</Text>
                <View style={marketStyles.carInfo}>
                  <Text style={marketStyles.carName}>{car.name}</Text>
                  <Text style={marketStyles.carSpeed}>⚡ {car.speed} км/ч</Text>
                  <Text style={marketStyles.carMeta}>📅 {car.year} • 📏 {car.mileage.toLocaleString()} км</Text>
                  
                  <View style={marketStyles.conditionContainer}>
                    <View style={marketStyles.conditionBar}>
                      {/* Текущее состояние */}
                      <View
                        style={[
                          marketStyles.conditionFill,
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
                          marketStyles.conditionMaxFill,
                          {
                            width: `${maxCondition}%`,
                            backgroundColor: colors.border,
                            position: 'absolute',
                            left: 0,
                          },
                        ]}
                      />
                      {/* Недостижимая часть */}
                      <View
                        style={[
                          marketStyles.conditionUnachievableFill,
                          {
                            width: `${100 - maxCondition}%`,
                            backgroundColor: '#27272A',
                            position: 'absolute',
                            right: 0,
                          },
                        ]}
                      />
                    </View>
                    <View style={marketStyles.conditionLabelContainer}>
                      <Text style={[marketStyles.conditionText, { color: getConditionColor(car.condition) }]}>
                        {car.condition.toFixed(0)}% состояние
                      </Text>
                      <Text style={marketStyles.maxConditionText}>макс {maxCondition.toFixed(1)}%</Text>
                    </View>
                  </View>
                </View>
                <Text style={marketStyles.carPrice}>${car.price.toLocaleString()}</Text>
              </View>

              <Text style={marketStyles.carDescription}>{car.description}</Text>

              <TouchableOpacity
                style={[marketStyles.buyButton, !canAfford && marketStyles.buyButtonDisabled]}
                onPress={() => handleBuyCar(car)}
                disabled={!canAfford}
              >
                <Text style={owned ? marketStyles.buyButtonOwnedText : marketStyles.buyButtonText}>
                  {owned ? '✓ Владеешь' : 'Купить'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
};
