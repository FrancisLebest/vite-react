/**
 * Live integration run against a real backend (not part of `npm test`):
 *   API_URL=http://localhost:4000 npx jest -c jest.integration.config.js
 */
module.exports = {
  testEnvironment: 'node',
  transform: {'^.+\\.[jt]sx?$': 'babel-jest'},
  testMatch: ['<rootDir>/integration/**/*.integration.ts'],
  testTimeout: 60000,
};
