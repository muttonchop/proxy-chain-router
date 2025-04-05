import { FlatESLintConfig } from 'eslint-define-config';

export default FlatESLintConfig([
  {
    extends: [
      'airbnb-typescript/base', // Use the "base" config to exclude React rules
      'plugin:prettier/recommended', // Integrate Prettier with ESLint
    ],
    parserOptions: {
      project: './tsconfig.json', // Specify the TypeScript configuration file
    },
    rules: {
      // Add any custom rules here
    },
  },
]);