import { eslintConfigFactory } from '@enhanced-dom/lint'

export default eslintConfigFactory({
  ignore: ['**/*.d.ts', '**/*.config.js'],
  env: ['node', 'jest']
})
