import webpackUtils from '@enhanced-dom/webpack'
import { configFactory as babelConfigFactory } from '@enhanced-dom/babel'
import path from 'path'
import { fileURLToPath } from 'url'

// @ts-ignore
import { trackedFiles } from '../dist/constants'
// @ts-ignore
import IntlWebpackPlugin, { IntlResourcesRepository } from '../dist/webpack.plugin'
import { getTestCompilerConfig, writeTestFiles, runCompiler } from './testUtils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url)) // eslint-disable-line @typescript-eslint/naming-convention

describe.only('webpack plugin', () => {
  test(
    'extracts messages from tracked files',
    async () => {
      const testFolder = path.join(__dirname, 'testFolder')
      const testCompiler = webpackUtils.compiler.getInMemoryCompiler(
        getTestCompilerConfig(
          testFolder,
          [
            {
              test: /\.(t|j)s$/,
              exclude: /node_modules/,
              use: webpackUtils.loaders.babelConfigFactory({ babel: babelConfigFactory() }),
            },
          ],
          [
            new IntlWebpackPlugin({
              exportPath: testFolder,
            }),
          ],
        ),
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
          import { defineTranslations } from '@enhanced-dom/intl';
          defineTranslations({
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

      trackedFiles.add(path.join(testFolder, 'file1.js'))
      trackedFiles.add(path.join(testFolder, 'file2.js'))

      await runCompiler(testCompiler)
      expect(testCompiler.outputFileSystem.existsSync(path.join(testFolder, 'out.js'))).toEqual(true)
      expect(
        testCompiler.outputFileSystem.existsSync(
          path.join(
            testFolder,
            IntlResourcesRepository.defaultOpts.translationFilenameTemplate.expand(IntlResourcesRepository.defaultOpts.defaultLanguage),
          ),
        ),
      ).toEqual(true)
    },
    60 * 1000,
  )
})
