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

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Keychain: in-memory store, inspectable from tests via __store.
jest.mock('react-native-keychain', () => {
  const store = new Map();
  return {
    __store: store,
    ACCESSIBLE: {AFTER_FIRST_UNLOCK: 'AccessibleAfterFirstUnlock'},
    setGenericPassword: jest.fn(async (username, password, opts = {}) => {
      store.set(opts.service ?? 'default', {username, password});
      return true;
    }),
    getGenericPassword: jest.fn(async (opts = {}) => store.get(opts.service ?? 'default') ?? false),
    resetGenericPassword: jest.fn(async (opts = {}) => {
      store.delete(opts.service ?? 'default');
      return true;
    }),
  };
});

jest.mock('react-native-video', () => {
  const React = require('react');
  const {View} = require('react-native');
  const Video = props => React.createElement(View, {testID: 'video', ...props});
  return {__esModule: true, default: Video};
});

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(async () => ({didCancel: true})),
  launchImageLibrary: jest.fn(async () => ({didCancel: true})),
}));

// socket.io-client: fake socket recording handlers/emits.
jest.mock('socket.io-client', () => {
  const sockets = [];
  const io = jest.fn((url, opts) => {
    const handlers = {};
    const socket = {
      url,
      opts,
      connected: false,
      handlers,
      emitted: [],
      on: jest.fn((ev, fn) => {
        (handlers[ev] = handlers[ev] || []).push(fn);
        return socket;
      }),
      emit: jest.fn((ev, payload) => socket.emitted.push([ev, payload])),
      connect: jest.fn(() => socket),
      disconnect: jest.fn(() => socket),
      removeAllListeners: jest.fn(),
      /** test helper: simulate a server event */
      __receive: (ev, payload) => (handlers[ev] || []).forEach(fn => fn(payload)),
    };
    sockets.push(socket);
    return socket;
  });
  io.__sockets = sockets;
  return {io, __esModule: true, default: io};
});
