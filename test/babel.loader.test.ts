import webpackUtils from '@enhanced-dom/webpack'
import { configFactory as babelConfigFactory } from '@enhanced-dom/babel'
import path from 'path'
import { fileURLToPath } from 'url'

// @ts-ignore
import { trackedFiles } from '../dist/constants'
import { getTestCompilerConfig, writeTestFiles, runCompiler } from './testUtils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url)) // eslint-disable-line @typescript-eslint/naming-convention

describe.only('babel loader', () => {
  test(
    'loads only files which import the defineTranslations',
    async () => {
      const testFolder = path.join(__dirname, 'loader_test')
      const testCompiler = webpackUtils.compiler.getInMemoryCompiler(
        getTestCompilerConfig(testFolder, [
          {
            test: /\.(t|j)s$/,
            exclude: /node_modules/,
            use: [
              ...webpackUtils.loaders.babelConfigFactory({
                babel: babelConfigFactory({ plugins: [path.resolve(__dirname, '../dist/babel.plugin.js')] }),
              }),
              {
                loader: path.resolve(__dirname, '../dist/webpack.loader.js'),
                options: {
                  filepathFilter: /file1/,
                },
              },
            ],
          },
        ]),
      )
      writeTestFiles(testCompiler, testFolder, {
        'file1.js': `
          import { defineTranslations } from '@enhanced-dom/intl';
          defineTranslations({
            lala1: {
              key: 'myid1',
              default: 'mydefault1'
            }
          });
        `,
        'file2.js': `
          import { defineTranslations as lala } from '@enhanced-dom/intl';
          lala({
            lala2: {
              key: 'myid2',
              default: 'mydefault2'
            }
          });
        `,
        'file3.js': `
          console.log('aaa');
        `,
        'index.js': `
          import './file1.js';
          import './file2.js';
          import './file3.js';
        `,
      })

      await runCompiler(testCompiler)
      expect(testCompiler.outputFileSystem.existsSync(path.join(testFolder, 'out.js'))).toEqual(true)
      expect(trackedFiles).toEqual(new Set([path.join(testFolder, 'file1.js'), path.join(testFolder, 'file2.js')]))
    },
    60 * 1000,
  )
})
