const eslintConfigFactory = require('@enhanced-dom/lint').eslintConfigFactory

module.exports = eslintConfigFactory({
  ignore: ['**/*.d.ts', '**/*.config.js'],
  env: ['node', 'jest']
})
