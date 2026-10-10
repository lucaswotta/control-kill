// SPDX-License-Identifier: GPL-3.0-or-later

import js from '@eslint/js';
import globals from 'globals';

export default [
    {ignores: ['build/', 'node_modules/']},
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.es2021,
                // Provided by GJS and GNOME Shell.
                global: 'readonly',
                log: 'readonly',
                logError: 'readonly',
                print: 'readonly',
                printerr: 'readonly',
                console: 'readonly',
            },
        },
        rules: {
            'eqeqeq': 'error',
            'no-var': 'error',
            'prefer-const': 'error',
            'curly': ['error', 'multi-or-nest', 'consistent'],
            'indent': ['error', 4, {SwitchCase: 1}],
            'quotes': ['error', 'single', {avoidEscape: true}],
            'semi': ['error', 'always'],
            'comma-dangle': ['error', 'always-multiline'],
            'no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
        },
    },
    {
        files: ['eslint.config.js'],
        languageOptions: {globals: globals.node},
    },
];
