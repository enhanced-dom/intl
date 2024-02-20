import fs from 'fs'
import path from 'path'
import { type WebpackOptionsNormalized, type Compiler, type Configuration, type Stats, webpack } from 'webpack'
import isEqualDeep from 'lodash.isequal'
import requireFromString from 'require-from-string'
import crypto from 'crypto'
import { compiler as compilerUtils } from '@enhanced-dom/webpack'

import { trackedFiles } from './constants'
import { defineTranslations } from './translations'

const PLUGIN_NAME = '@enhanced-dom/intl'
const IMPORT_NAME = Object.keys({ defineTranslations })[0]

interface ILogger {
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}

interface IIntlResourcesRepositoryOptions {
  translationFilenameTemplate?: ISingleArgumentTemplate
  exportPath?: string
  defaultLanguage?: string
  checkOnly?: boolean
}

interface ISingleArgumentTemplate {
  matches: (str: string) => boolean
  expand: (value: string) => string
  extract: (str: string) => string
}

interface ISyncFileSystem {
  existsSync: (pathOfItem: string) => boolean
  readFileSync: (pathOfItem: string) => Buffer
  writeFileSync: (pathOfItem: string, contents: string) => void
  mkdirSync: (pathOfItem: string) => void
  readdirSync: (pathOfItem: string) => string[]
}

class DuplicateTranslationError extends Error {}
class UnexpectedChangesDetectedError extends Error {}

const isSyncFileSystem = (fileSystem: any = {}): fileSystem is ISyncFileSystem => {
  return ['existsSync', 'readFileSync', 'writeFileSync', 'mkdirSync', 'readdirSync'].every((prop) => !!fileSystem[prop])
}

export class IntlResourcesRepository {
  static defaultOpts: IIntlResourcesRepositoryOptions = {
    defaultLanguage: 'en-US',
    exportPath: './intl',
    checkOnly: false,
    translationFilenameTemplate: {
      matches: (str: string) => /^intl\.([a-zA-Z]+(_[a-zA-Z]+){0,1})\.json$/.test(str),
      extract: (str: string) => str.match(/^intl\.([a-zA-Z]+(_[a-zA-Z]+){0,1})\.json$/)[1],
      expand: (value: string) => `intl.${value}.json`,
    },
  }
  private _opts: IIntlResourcesRepositoryOptions
  private _logger: ILogger
  private _fileSystem: ISyncFileSystem
  constructor(logger: ILogger, fileSystem: ISyncFileSystem = fs, opts: IIntlResourcesRepositoryOptions = {}) {
    this._opts = { ...IntlResourcesRepository.defaultOpts, ...opts }
    this._opts.exportPath = path.resolve(process.cwd(), this._opts.exportPath)
    this._logger = logger
    if (!isSyncFileSystem(fileSystem)) {
      throw 'incompatible file system'
    }
    this._fileSystem = fileSystem
  }
  private _resources = null
  public get resources() {
    if (!this._resources) {
      const loadedResources = {}
      const exportedMessagesPaths =
        this._opts.exportPath && this._fileSystem.existsSync(this._opts.exportPath)
          ? this._fileSystem.readdirSync(this._opts.exportPath).filter((f) => this._opts.translationFilenameTemplate.matches(f))
          : []

      exportedMessagesPaths.forEach((p) => {
        loadedResources[this._opts.translationFilenameTemplate.extract(p)] = require(path.join(process.cwd(), this._opts.exportPath, p))
      })
      this._resources = loadedResources
    }
    return this._resources
  }

  private _validate = (newResources: Record<string, Record<string, string>>): boolean => {
    const messageKeysMap: Record<string, string[]> = {}
    Object.keys(newResources).forEach((fileName) => {
      const messagesInThatFile = newResources[fileName]
      Object.keys(messagesInThatFile).forEach((messageKey) => {
        if (!messageKeysMap[messageKey]) {
          messageKeysMap[messageKey] = []
        }
        messageKeysMap[messageKey].push(fileName)
      })
    })
    const duplicateMessageIds = Object.keys(messageKeysMap).filter((messageKey) => messageKeysMap[messageKey].length > 1)
    if (duplicateMessageIds.length) {
      duplicateMessageIds.forEach((messageKey) =>
        this._logger.error(`Message with key ${messageKey} appears in multiple files: ${messageKeysMap[messageKey].join(', ')}`),
      )
      return false
    }
    this._logger.info('No duplicate messages found')
    return true
  }

  private _serializeExtractedTranslations = (translationsByFile: Record<string, Record<string, string>>) => {
    const result = {} as Record<string, string>
    Object.keys(translationsByFile).forEach((fileName) => {
      const translationsInFile = translationsByFile[fileName]
      Object.keys(translationsInFile).forEach((translationKey) => {
        result[translationKey] = translationsInFile[translationKey]
      })
    })
    return result
  }

  private _detectChanges = (masterTranslations: Record<string, string>) => {
    const mergedTranslations = {}
    const addedKeys = []
    const renamedKeys = {}
    Object.keys(masterTranslations).forEach((key) => {
      const mergedTranslation = {
        default: masterTranslations[key],
      }
      let matchingKey = key
      if (this.resources[this._opts.defaultLanguage]) {
        if (!this.resources[this._opts.defaultLanguage][matchingKey]) {
          const possibleCandidates = Object.keys(this.resources[this._opts.defaultLanguage]).filter(
            (possibleKey) =>
              this.resources[this._opts.defaultLanguage][possibleKey] === masterTranslations[matchingKey] &&
              !Object.keys(masterTranslations).includes(possibleKey),
          )
          if (possibleCandidates.length === 1) {
            matchingKey = possibleCandidates[0]
            renamedKeys[matchingKey] = key
            mergedTranslations[this._opts.defaultLanguage] = this.resources[this._opts.defaultLanguage][matchingKey]
            delete this.resources[this._opts.defaultLanguage][matchingKey]
          } else {
            addedKeys.push(matchingKey)
            mergedTranslation[this._opts.defaultLanguage] = mergedTranslation.default
          }
        } else {
          mergedTranslation[this._opts.defaultLanguage] = this.resources[this._opts.defaultLanguage][matchingKey]
          delete this.resources[this._opts.defaultLanguage][matchingKey]
        }

        Object.keys(this.resources)
          .filter((language) => language !== this._opts.defaultLanguage)
          .filter((language) => !!this.resources[language][matchingKey])
          .map((language) => [language, this.resources[language][matchingKey]])
          .reduce((acc, [language, value]) => {
            acc[language] = value
            delete this.resources[language][matchingKey]
            return acc
          }, mergedTranslation)

        if (Object.keys(mergedTranslation).length === 1) {
          addedKeys.push(matchingKey)
        }
      } else {
        mergedTranslation[this._opts.defaultLanguage] = masterTranslations[key]
        addedKeys.push(key)
      }

      mergedTranslations[key] = mergedTranslation
    })

    const removedKeys = Object.keys(this.resources[this._opts.defaultLanguage] || {})

    return {
      merged: mergedTranslations,
      added: addedKeys,
      removed: removedKeys,
      renamed: renamedKeys,
    }
  }

  public exportTranslations(masterTranslations: Record<string, Record<string, string>>) {
    if (!this._validate(masterTranslations)) {
      throw new DuplicateTranslationError()
    }
    let changesDetected = false
    const { added, removed, renamed, merged } = this._detectChanges(this._serializeExtractedTranslations(masterTranslations))
    if (added.length) {
      this._logger.info(`We found ${added.length} new translations. These translations were added to the exports:\n${added.join('\n')}`)
      changesDetected = true
    }

    if (removed.length) {
      this._logger.warn(
        `We found ${removed.length} unused translations. These translations were removed from the exports:\n${removed.join('\n')}`,
      )
      changesDetected = true
    }

    if (Object.keys(renamed).length) {
      this._logger.warn(`We found ${Object.keys(renamed).length} translations which were renamed:\n
        ${Object.keys(renamed)
          .map((renamedId) => `${renamedId} => ${renamed[renamedId]}`)
          .join('\n')}`)
      changesDetected = true
    }
    if (!this._opts.checkOnly) {
      this._saveJsonExports(merged)
    } else if (changesDetected) {
      throw new UnexpectedChangesDetectedError()
    }
  }

  private _saveJsonExport = (messages: Record<string, any>, filePath: string) => {
    const messagesJson = JSON.stringify(messages, Object.keys(messages).sort(), 2)
    if (this._fileSystem.existsSync(filePath)) {
      const oldContent = this._fileSystem.readFileSync(filePath).toString()
      if (oldContent === messagesJson) {
        return false
      }
    }
    this._fileSystem.writeFileSync(filePath, messagesJson)
    return true
  }

  private _saveJsonExports = (translationsByKey: Record<string, Record<string, string>>) => {
    const translationsByLanguage: Record<string, Record<string, string>> = {}
    let exportsSaved = false
    Object.keys(translationsByKey).forEach((key) => {
      Object.keys(translationsByKey[key])
        .filter((language) => language !== 'default')
        .forEach((language) => {
          translationsByLanguage[language] = translationsByLanguage[language] ?? {}
          translationsByLanguage[language][key] = translationsByKey[key][language]
        })
    })

    if (this._opts.exportPath) {
      if (!this._fileSystem.existsSync(this._opts.exportPath)) {
        this._fileSystem.mkdirSync(this._opts.exportPath)
      }
      Object.keys(translationsByLanguage).forEach((language) => {
        const filePath = path.join(this._opts.exportPath, this._opts.translationFilenameTemplate.expand(language))
        exportsSaved = exportsSaved || this._saveJsonExport(translationsByLanguage[language], filePath)
      })
      this._logger.info(`Saved exported translations to ${this._opts.exportPath}`)
    }
  }
}

class SkipExtractionError extends Error {}
class CompilationError extends Error {}
class FilesInaccessibleError extends Error {
  public files: string[] = []
  constructor(files: string[], ...rest: any[]) {
    super(...rest)
    this.files = files
  }
}

class IntlWebpackPlugin {
  private _cached: Record<string, string | null> = {}
  private _logger: {
    info: (message: string) => void
    warn: (message: string) => void
    error: (message: string) => void
  } = {
    info: (message) => console.info(`[${PLUGIN_NAME}]: ${message}`),
    warn: (message) => console.warn(`[${PLUGIN_NAME}]: ${message}`),
    error: (message) => console.error(`[${PLUGIN_NAME}]: ${message}`),
  }
  private _repositoryOpts: IIntlResourcesRepositoryOptions
  constructor(opts: IIntlResourcesRepositoryOptions = {}) {
    this._repositoryOpts = opts
  }

  private _getConfig = (
    outputName: string,
    entry: string,
    originalContext: string,
    originalConfig: WebpackOptionsNormalized,
  ): Configuration => {
    return {
      mode: 'development',
      target: 'node',
      entry,
      context: originalConfig.context,
      resolve: originalConfig.resolve,
      output: {
        filename: outputName,
        path: path.resolve(originalContext, './intl_temp'),
        libraryTarget: 'commonjs2',
      },
      module: originalConfig.module,
      devtool: 'source-map',
    }
  }

  private _checkForErrors = (err: Error, stats: Stats) => {
    if (err) {
      this._logger.error(err.toString())
      return true
    }

    const jsonStats = stats.toJson()
    if (jsonStats.errors.length > 0) {
      jsonStats.errors.forEach((e) => {
        this._logger.error(JSON.stringify(e))
      })
      return true
    }

    if (jsonStats.warnings.length > 0) {
      jsonStats.warnings.forEach((w) => {
        this._logger.warn(JSON.stringify(w))
      })
    } else {
      this._logger.info('Compiled ok')
    }
    return false
  }

  private _compileIfNotCached = (
    originalCompiler: Compiler,
    onSuccess: (messages: Record<string, Record<string, string>>) => void,
    onError: (error: Error) => void,
  ) => {
    const newCache: Record<string, string | null> = {}
    const statErrors = []
    const trackedFilesArray = [...trackedFiles]
    const readCallbackFactory = (filepath: string) => (err: Error, contents: string | Buffer) => {
      if (err) {
        newCache[filepath] = null
        statErrors.push(filepath)
      } else {
        const hashSum = crypto.createHash('sha512')
        hashSum.update(contents)
        newCache[filepath] = hashSum.digest('hex')
      }
      if (trackedFilesArray.every((p) => newCache[p] !== undefined)) {
        if (isEqualDeep(this._cached, newCache)) {
          onError(new SkipExtractionError())
        } else {
          this._cached = newCache
          if (statErrors.length) {
            onError(new FilesInaccessibleError(statErrors))
          } else {
            this._compile(originalCompiler, onSuccess, onError)
          }
        }
      }
    }
    trackedFiles.forEach((filepath) => {
      originalCompiler.inputFileSystem.readFile(filepath, readCallbackFactory(filepath))
    })
  }

  private _compile = (
    originalCompiler: Compiler,
    onSuccess: (messages: Record<string, Record<string, string>>) => void,
    onError: (error: Error) => void,
  ) => {
    this._logger.info('Starting intl extraction')
    const outputName = 'output.js'
    const entry = path.join(originalCompiler.context, 'input.js')
    const trackedFilesRelativeToContext = [...trackedFiles].map((trackedFile) =>
      trackedFile.replace(originalCompiler.context, '.').replace(new RegExp('\\' + path.sep, 'g'), '/'),
    )
    const input = `
        global.window = {};
        const translationsByFilePath = {};
        const translationsRegistry = require('@enhanced-dom/intl').${IMPORT_NAME}.registry;
        ${trackedFilesRelativeToContext
          .map((filePath) =>
            [
              `require('${filePath}');`,
              `translationsByFilePath['${filePath}']=translationsRegistry.translations;`,
              'translationsRegistry.clear();',
            ].join('\n'),
          )
          .join('\n')}
        module.exports = translationsByFilePath;
      `

    const webpackConfig = this._getConfig(outputName, entry, originalCompiler.context, originalCompiler.options)
    const newCompiler = webpack(webpackConfig)
    newCompiler.inputFileSystem = originalCompiler.inputFileSystem
    const intlExtractionCompiler = compilerUtils.patchCompilerFileSystem(newCompiler, true)
    const rootExists = intlExtractionCompiler.inputFileSystem.existsSync(path.dirname(entry))
    if (!rootExists) {
      intlExtractionCompiler.inputFileSystem.mkdirpSync(path.dirname(entry))
    }
    intlExtractionCompiler.inputFileSystem.writeFileSync(entry, input)

    intlExtractionCompiler.run((err, stats) => {
      if (this._checkForErrors(err, stats)) {
        onError(new CompilationError())
        return
      }
      let extractedTranslationsByFile = {}
      try {
        const source = intlExtractionCompiler.outputFileSystem.readFileSync(path.join(originalCompiler.context, './intl_temp', outputName))
        extractedTranslationsByFile = requireFromString(source.toString(), outputName)
      } catch (e) {
        onError(e)
        return
      }
      onSuccess(extractedTranslationsByFile)
    })
  }

  private _extract = (originalCompiler: Compiler, finalCallback: () => void) => {
    const onSuccess = (extractedTranslationsByFile: Record<string, Record<string, string>>) => {
      const resourceRepository = new IntlResourcesRepository(
        this._logger,
        // yes, this is not great, but the outputFs of a webpack compiler we expect is either... fs or some MemoryFS. IntlResourceRepository will check it.
        originalCompiler.outputFileSystem as unknown as ISyncFileSystem,
        {
          ...this._repositoryOpts,
          exportPath: path.resolve(
            originalCompiler.context,
            this._repositoryOpts.exportPath ?? IntlResourcesRepository.defaultOpts.exportPath,
          ),
        },
      )
      try {
        resourceRepository.exportTranslations(extractedTranslationsByFile)
      } catch (e) {
        if (e instanceof DuplicateTranslationError || e instanceof UnexpectedChangesDetectedError) {
          if (originalCompiler.options.optimization.noEmitOnErrors) {
            process.exit(1)
          }
        } else {
          throw e // unknown error should definitely break compilation
        }
      }
      finalCallback()
    }
    const onFailure = (error: Error) => {
      if (error instanceof SkipExtractionError) {
        this._logger.info('Tracked files have not changed. Skipping extraction')
      } else {
        if (error instanceof CompilationError) {
          this._logger.error('Compilation for extraction has failed')
        } else if (error instanceof FilesInaccessibleError) {
          this._logger.error(`Could not access files ${error.files.join(' ')}`)
        } else {
          this._logger.error(error.toString())
        }
        if (originalCompiler.options.optimization.noEmitOnErrors) {
          process.exit(1)
        } else {
          finalCallback()
        }
      }
    }

    this._compileIfNotCached(originalCompiler, onSuccess, onFailure)
  }

  apply(compiler: Compiler) {
    compiler.hooks.afterEmit.tapAsync(PLUGIN_NAME, (compilation, cb) => {
      if (compilation.getLogger) {
        this._logger = compilation.getLogger(PLUGIN_NAME)
      }

      if (compilation.errors.length) {
        this._logger.info('Initial compilation has errors. Skipping messages extraction')
        cb()
      } else {
        this._extract(compiler, cb)
      }
    })
  }
}

export default IntlWebpackPlugin
