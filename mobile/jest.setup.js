/* eslint-env jest */
jest.mock('react-native-linear-gradient', () => {
  const {View} = require('react-native');
  return View;
});

jest.mock('react-native-vector-icons/Ionicons', () => {
  const React = require('react');
  const {Text} = require('react-native');
  return ({name, ...props}) => React.createElement(Text, props, name);
});

jest.mock('react-native-safe-area-context', () => {
  const mock = require('react-native-safe-area-context/jest/mock');
  return mock.default ?? mock;
});
