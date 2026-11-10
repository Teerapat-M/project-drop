/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@drop/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^@drop/tokens$': '<rootDir>/../../packages/tokens/src/index.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          rootDir: '.',
          isolatedModules: true,
        },
      },
    ],
  },
};
