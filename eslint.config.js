const js = require('@eslint/js');

const nodeGlobals = Object.fromEntries([
  'require', 'module', 'exports', 'process', 'Buffer', '__dirname', '__filename', 'console',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate',
  'fetch', 'URL', 'URLSearchParams', 'AbortController', 'structuredClone',
].map((name) => [name, 'readonly']));

module.exports = [
  { ignores: ['node_modules/**', 'data/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: nodeGlobals },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
