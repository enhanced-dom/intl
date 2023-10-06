import { declare, type BabelAPI } from '@babel/helper-plugin-utils'
import { isImportSpecifier, isStringLiteral, type ImportDeclaration } from '@babel/types'

import { trackedFiles } from './constants'
import { defineTranslations } from './translations'

const PLUGIN_NAME = '@enhanced-dom/intl'
const IMPORT_NAME = Object.keys({ defineTranslations })[0]

const isEnhancedDomDefineMessagesImport = (node: ImportDeclaration) =>
  node.source.value.startsWith(PLUGIN_NAME) &&
  node.specifiers.some(
    (spec) =>
      isImportSpecifier(spec) &&
      (isStringLiteral(spec.imported) ? spec.imported.value === IMPORT_NAME : spec.imported.name === IMPORT_NAME),
  )

export default declare((api: BabelAPI) => {
  api.assertVersion(7)
  return {
    visitor: {
      ImportDeclaration(path, state) {
        const { node } = path
        if (isEnhancedDomDefineMessagesImport(node)) {
          trackedFiles.add(state.file.opts.filename)
        }
      },
    },
  }
})
