/* eslint-env node */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { browser: true, es2022: true, webextensions: true },
  ignorePatterns: ['dist', 'node_modules', '*.config.ts', '*.cjs'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'warn',
  },
  overrides: [
    {
      // The domain layer must stay pure: no importing of outer layers.
      files: ['src/domain/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          { patterns: ['@application/*', '@infrastructure/*', '@presentation/*'] },
        ],
      },
    },
  ],
};
