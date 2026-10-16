import webpackUtils from '@enhanced-dom/webpack'
import { type Configuration, type Stats } from 'webpack'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url)) // eslint-disable-line @typescript-eslint/naming-convention

type InMemoryCompiler = ReturnType<typeof webpackUtils.compiler.getInMemoryCompiler>

export const getTestCompilerConfig = (
  testFolder: string,
  rules: NonNullable<Configuration['module']>['rules'],
  plugins: Configuration['plugins'] = [],
): Configuration => ({
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
  module: { rules },
  optimization: { emitOnErrors: false },
  plugins,
})

export const writeTestFiles = (testCompiler: InMemoryCompiler, testFolder: string, files: Record<string, string>) => {
  if (!testCompiler.inputFileSystem.existsSync(testFolder)) {
    testCompiler.inputFileSystem.mkdirpSync(testFolder)
  }
  Object.entries(files).forEach(([name, content]) => {
    testCompiler.inputFileSystem.writeFileSync(path.join(testFolder, name), content)
  })
}

export const runCompiler = (testCompiler: InMemoryCompiler): Promise<Stats> =>
  new Promise((resolve, reject) => {
    testCompiler.run((error, stats) => {
      if (error || stats?.hasErrors()) {
        reject(error || stats?.toJson('errors-only').errors?.[0])
      } else {
        resolve(stats as Stats)
      }
    })
  })
