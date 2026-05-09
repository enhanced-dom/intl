const path = require('path')
const jestConfigFactory = require('@enhanced-dom/jest').jestConfigFactory


const ESM_STUB = path.join(__dirname, '__mocks__', 'esm-stub.cjs')

module.exports = {
  ...jestConfigFactory({ ts: true, processorConfigPath: path.join(__dirname, 'tsconfig.json'), testEnvironment: 'node' }),
  moduleNameMapper: {
    '^remark-code-import$': ESM_STUB, // imported as umd by @enhanced-dom/webpack but not needed here
    '^rehype-unwrap-images$': ESM_STUB, // imported as umd by @enhanced-dom/webpack but not needed here
    '^remark-embed-images$': ESM_STUB, // imported as umd by @enhanced-dom/webpack but not needed here
  },
}
