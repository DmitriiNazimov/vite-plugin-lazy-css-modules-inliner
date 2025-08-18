import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
    { ignores: ['dist/**', 'node_modules/**', '**/tplStyleRuntimeInjector.js'] },
    js.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: { sourceType: 'module', ecmaVersion: 'latest' },
            globals: { __dirname: 'readonly' },
        },
        plugins: { '@typescript-eslint': tsPlugin },
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
            'max-len': [
                'warn',
                {
                    code: 120,
                    ignoreStrings: true,
                    ignoreTemplateLiterals: true,
                    ignoreComments: true,
                },
            ],
            'no-control-regex': 'off',
        },
    },
    eslintConfigPrettier,
];


