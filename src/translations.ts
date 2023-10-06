class TranslateableString extends String {
  isTranslateable = true
  public values?: Record<string, any>

  public withValues = (values: Record<string, any>) => {
    return new TranslateableString(this.toString(), values)
  }

  constructor(key: string, values?: Record<string, any>) {
    super(key)
    this.values = values
  }
}

export type ITranslateableString = string & {
  isTranslateable?: true
  withValues?: (values: Record<string, any>) => TranslateableString
  values?: Record<string, any>
}

export type ITranslateable = string & {
  isTranslateable: true
  withValues: (values: Record<string, any>) => TranslateableString
  values?: Record<string, any>
}

export const makeTranslateable = (s: string, values?: Record<string, any>) => {
  return new TranslateableString(s, values) as ITranslateable
}

export const isTranslateable = (possibleTranslateable: ITranslateableString): possibleTranslateable is ITranslateable =>
  !!possibleTranslateable.isTranslateable

class TranslationsRegistry {
  private _translations: Record<string, string> = {}
  public add = (translations: Record<string, { key: string; default: string }>) => {
    Object.values(translations).forEach((translation) => (this._translations[translation.key] = translation.default))
  }
  public get translations() {
    return this._translations
  }
  public clear = () => (this._translations = {})
}

export const defineTranslations = <KeyType extends string>(translations: Record<KeyType, { key: string; default: string }>) => {
  defineTranslations.registry.add(translations)
  return Object.keys(translations).reduce((acc, translationName) => {
    acc[translationName] = makeTranslateable(translations[translationName].key)
    return acc
  }, {} as Record<KeyType, ITranslateable>)
}

defineTranslations.registry = new TranslationsRegistry()
