/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@drop/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^@drop/tokens$': '<rootDir>/../../packages/tokens/src/index.ts',
  },
};
