const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Добавляем поддержку path aliases
const { resolver } = config;

config.resolver = {
  ...resolver,
  extraNodeModules: new Proxy(
    {},
    {
      get: (target, name) => {
        if (name === '@') {
          return path.join(__dirname, 'src');
        }
        if (name === '@img') {
          return path.join(__dirname, 'src/img');
        }
        if (name === '@screens') {
          return path.join(__dirname, 'src/screens');
        }
        if (name === '@components') {
          return path.join(__dirname, 'src/components');
        }
        if (name === '@styles') {
          return path.join(__dirname, 'src/styles');
        }
        if (name === '@hooks') {
          return path.join(__dirname, 'src/hooks');
        }
        if (name === '@types') {
          return path.join(__dirname, 'src/types');
        }
        return target[name];
      },
    }
  ),
};

module.exports = config;
