import path from 'path'
import { fileURLToPath } from 'url'
import { jestConfigFactory } from '@enhanced-dom/jest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const ESM_STUB = path.join(__dirname, '__mocks__', 'esm-stub.cjs') // Jest always loads moduleNameMapper targets via require(), so this stub must stay CommonJS

export default {
  ...jestConfigFactory({
    ts: true,
    processorConfigPath: path.join(__dirname, 'tsconfig.json'),
    testEnvironment: 'node',
    transformersConfig: { useESM: true },
  }),
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1', // let Jest's resolver find the .ts source for extensioned relative imports (required under ESM)
    '^remark-code-import$': ESM_STUB, // imported as umd by @enhanced-dom/webpack but not needed here
    '^rehype-unwrap-images$': ESM_STUB, // imported as umd by @enhanced-dom/webpack but not needed here
    '^remark-embed-images$': ESM_STUB, // imported as umd by @enhanced-dom/webpack but not needed here
  },
}
