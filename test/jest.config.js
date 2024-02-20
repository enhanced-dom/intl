const path = require('path')
const jestConfigFactory = require('@enhanced-dom/jest').jestConfigFactory

module.exports = jestConfigFactory({ ts: true, processorConfigPath: path.join(__dirname, 'tsconfig.json'), testEnvironment: 'node' })
