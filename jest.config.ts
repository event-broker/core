import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/benchmarks'],
  testMatch: ['**/*.test.ts'],
};

export default config;
