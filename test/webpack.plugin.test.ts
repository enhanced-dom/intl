import { compiler, loaders } from '@enhanced-dom/webpack'
import { configFactory as babelConfigFactory } from '@enhanced-dom/babel'
import type webpack from 'webpack'
import path from 'path'
import { trackedFiles } from '../dist/constants'
import IntlWebpackPlugin, { IntlResourcesRepository } from '../dist/webpack.plugin'

describe.only('webpack plugin', () => {
  test(
    'extracts messages from tracked files',
    (done) => {
      const testFolder = path.join(__dirname, 'testFolder')
      const testCompilerConfig: webpack.Configuration = {
        mode: 'development',
        target: 'node',
        entry: [path.join(testFolder, 'index.js')],
        output: {
          filename: 'out.js',
          publicPath: '/',
          libraryTarget: 'commonjs2',
          path: testFolder,
        },
        resolve: {
          modules: ['./node_modules', path.resolve(__dirname, '../node_modules')],
          extensions: ['.ts', '.js'],
          alias: {
            '@enhanced-dom/intl': path.resolve(__dirname, '../dist/translations.js'),
          },
        },
        module: {
          rules: [
            {
              test: /\.(t|j)s$/,
              exclude: /node_modules/,
              use: loaders.babelConfigFactory({ babel: babelConfigFactory() }),
            },
          ],
        },
        optimization: {
          emitOnErrors: false,
        },
        plugins: [
          new IntlWebpackPlugin({
            exportPath: testFolder,
          }),
        ],
      }
      const testCompiler = compiler.getInMemoryCompiler(testCompilerConfig)
      const file1 = `
        import { defineTranslations } from '@enhanced-dom/intl';
        defineTranslations({
          lala1: {
            key: 'myid1',
            default: 'mydefault1'
          }
        });
      `
      const file2 = `
        import { defineTranslations } from '@enhanced-dom/intl';
        defineTranslations({
          lala2: {
            key: 'myid2',
            default: 'mydefault2'
          }
        });
      `

      const file3 = `
        console.log('aaa');
      `
      const indexJs = `
        import './file1';
        import './file2';
        import './file3';
      `
      if (!testCompiler.inputFileSystem.existsSync(testFolder)) {
        testCompiler.inputFileSystem.mkdirpSync(testFolder)
      }
      testCompiler.inputFileSystem.writeFileSync(path.join(testFolder, 'file1.js'), file1)
      testCompiler.inputFileSystem.writeFileSync(path.join(testFolder, 'file2.js'), file2)
      testCompiler.inputFileSystem.writeFileSync(path.join(testFolder, 'file3.js'), file3)
      testCompiler.inputFileSystem.writeFileSync(path.join(testFolder, 'index.js'), indexJs)

      trackedFiles.add(path.join(testFolder, 'file1.js'))
      trackedFiles.add(path.join(testFolder, 'file2.js'))

      testCompiler.run((error, stats) => {
        if (error || stats.hasErrors()) {
          const resolvedError = error || stats.toJson('errors-only').errors[0]

          done(resolvedError)
        } else {
          try {
            expect(testCompiler.outputFileSystem.existsSync(path.join(testFolder, 'out.js'))).toEqual(true)
            expect(
              testCompiler.outputFileSystem.existsSync(
                path.join(
                  testFolder,
                  IntlResourcesRepository.defaultOpts.translationFilenameTemplate.expand(
                    IntlResourcesRepository.defaultOpts.defaultLanguage,
                  ),
                ),
              ),
            ).toEqual(true)
            done()
          } catch (e) {
            done(e)
          }
        }
      })
    },
    60 * 1000,
  )
})
