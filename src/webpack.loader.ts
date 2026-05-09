import { validate } from 'schema-utils'
import { type JSONSchema4 } from 'json-schema'

import { trackedFiles } from './constants'

const schema: JSONSchema4 = {
  type: 'object',
  properties: {
    filenameFilter: {
      description: 'A filter for the file names of the files to include in the intl extraction compilation',
      anyOf: [
        {
          instanceof: 'RegExp',
        },
        {
          instanceof: 'Function',
        },
      ],
    },
  },
}

const LOADER_NAME = '@enhanced-dom/intl'

export default function loader(...args: any[]) {
  // @ts-expect-error
  const options = this.getOptions()

  validate(schema, options, {
    name: LOADER_NAME,
    baseDataPath: 'options',
  })

  let filepathFilter = options.filepathFilter ?? ((filepath: string) => filepath.endsWith('.intl.ts'))
  if (filepathFilter instanceof RegExp) {
    const filepathRegExp = filepathFilter
    filepathFilter = (filepath: string) => filepathRegExp.test(filepath)
  }

  // @ts-expect-error
  if (filepathFilter(this.resourcePath)) {
    // @ts-expect-error
    trackedFiles.add(this.resourcePath)
  }
  // @ts-expect-error
  this.callback(null, ...args)
}
