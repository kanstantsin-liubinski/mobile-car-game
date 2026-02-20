import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { marketStyles } from '@styles/styles';
import { useBalance } from '@hooks/useBalance';
import { useGarageContext } from '@hooks/GarageContext';
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
  },
];

export const MarketScreen = () => {
  const { balance, removeBalance } = useBalance();
  const { addCar, hasCar } = useGarageContext();

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

          return (
            <View key={car.id} style={marketStyles.carCard}>
              <View style={marketStyles.carHeader}>
                <Text style={marketStyles.carEmoji}>{car.emoji}</Text>
                <View style={marketStyles.carInfo}>
                  <Text style={marketStyles.carName}>{car.name}</Text>
                  <Text style={marketStyles.carSpeed}>⚡ {car.speed} км/ч</Text>
                  <Text style={marketStyles.carMeta}>📅 {car.year} • 📏 {car.mileage.toLocaleString()} км</Text>
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
