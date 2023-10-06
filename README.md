TL;DR;

Utilities for managing translation keys inside the app.

# What?

There are (at least) 2 separate parts in translations management of a webpage: <span id="problem1">'inserting the translations in the html'</a> and <span id="problem2">'managing translations content'</span>. This code has nothing to do with _"how does the text end up in html in the right language?"_, but rather focuses on _"what translateable text do we have in our website?"_. This code represents some tooling around: defining translations in code, extracting them to some json files, comparing changes across keys we have in code and the different translations we have already extracted. The flow is imagined as such:

- translations are defined in code (using the `defineTranslations` function)
- they are extracted from code (during `webpack` build), and compared with a set of per-language `.json` resource files residing at a certain (configurable) path (expected structure of the json is `{ translationKey: translation_in_one_language }`)
- a new set of json files is saved at same path (with changes due to added / removed / renamed translation keys)

# Why?

There seems to be a gap for a dedicated package that syncs code translations with exported resources. The code needed for this is more than several lines, because ideally, we'd like several things:

1. Manage keys separate from their representations
   The devs use keys (unique identifiers of translation messages), while the 'translation team' uses 'language packs'. It makes sense to group things by language, and not by translation key, as the translation is usually specialized per-language, and from a performance standpoint, it's better to load 1 language pack at a time (depending on what the user's language is set to...). The 'translation team' will possibly use a 3rd party app to manage these translations (and in most cases these support importing json). If not, the 'translation team' is usually less happy to touch js/ts files. They might require csv / excel, but perhaps `json` is a decent compromise.
2. Enforce static typing on translation key usage:
   If everything is used as 'magical string' in code, then figuring out _'where is a message used'_ and _'which messages were added by the dev team'_ becomes problematic. When using typescript, one can easily trace the usage of a translation key in the code, by definig (& importing) it as a constant. If the original translation message definition is removed, all areas of the code using this would be automatically flaged. This is preffered to e.g. _"magic string in component prop"_, which is why there is a `defineTranslations` function, which returns a subclass of `String` - with some... enhancements.
3. Group parameters with the template key:
   Say we have something like `{ "myKey1": "You have {{count}} errors"}`. In the code, this 'translation' has 2 parts: the key, and the parameters (in this case, just one named 'count'). If we think of this as an object of type '<ITranslateableString>', we're saying that this is not just a '<string>', it's a '<translation_key_strin+some_params>' type. And this is magical because it can be passed through our code in 1 piece. It's a bonus if it can be implicitly converted to a string, while retaining the ability to identify itself as "not a string". To do this in js, we need to subclass '<String>' - but then we get most of the stuff we wanted.
4. Easier translation key change management:
   Say we want to rename a translation key in the code. Not only do we have to rename it in the code, but also in all the translation files we might have. If done manually, this is prone to error.
5. Give a feeling to the translator about where each message is used:
   If you know you need to translate a certain text in e.g. japanese. It's easier to come up with a correct description if you know where the text is used in the app. If the translations are keyed by their version in a 'default' language, the 'context' is lost. Ideally, the keys should contain the context (e.g. something like `mypage1.confirmationDialog.buttons.save.label`)
6. Supports module inheritence:
   Say we are coding in an agile way, and our app has 1 modal, on 1 page, with a button that has a translation like this: `{ "my1page.my1modal.my1confirm": "Confirm!" }`. So far so good, no reason to 'pollute' the upper scope with the message (because current author thinks easy-to-delete grouped-together ducks-structured code is better than 1 big file with all translations). The issue happens if suddenly we have 3 more pages, each with a bunch of different "confirm" buttons. One of the things translation teams dislike is translating the same text many times (unlike translate once, use everywhere). So, we move the message to a higher scope, and it becomes something like `{ "general.buttons.confirm": "Confirm!" }`. We use this in all 4 places. But now, suddenly, on 1 page, we'd like the confirm buttons to say "ok". At this point in time, we realize that this page needs a different "confirm" message, so we have to change all the imports from this page. We can do better than that: each page can have it's own 'translations' registry, which extends the global one, and possibly overwrites some of the messages in the global one... This way, we don't have to change imports when we want to 'overrule' a global translation locally.

# How does this ideally look like?

Assuming a react project, I'd argue the following is a great setup:

```
- src
    |- components
        |- index.ts
        |- components.intl.ts
        |- SpinnerButton
            |- index.ts
            |- SpinnerButton.component.tsx
            |- SpinnerButton.intl.ts
    |- views
        |- index.ts
        |- views.intl.ts
        |- Page1
            |- index.ts
            |- Page1.component.tsx
            |- Page1.intl.ts
            |- Section1
                |- index.ts
                |- Section1.component.tsx
                |- Section1.intl.ts
    |- intl
        |- index.ts
        |- generic.intl.ts
        |- intl.en-US.json
        |- intl.de-DE.json
```

The contents of (some of) the files are as follows:

**src/intl/generic.intl.ts**

```ts
import { defineTranslations } from '@enhanced-dom/intl'
const namespace = 'generic'
export const translations = defineTranslations({
  confirm: {
    key: `${namespace}.button.confirm`,
    default: 'Confirm!',
  },
})
```

**src/intl/index.ts**

```ts
export * from './generic.intl'
export * as deDeIntl from './intl.de-DE'
export * as enUSIntl from './intl.en-US'
```

**src/components/components.intl.ts**

```ts
import { defineTranslations } from '@enhanced-dom/intl'

import { translations as generalTranslations } from '@myproject/intl' // using an alias here for ../intl

export const namespace = 'components'
export const translations = {
  ...generalTranslations,
  ...defineTranslations({
    discard: {
      key: `${namespace}.generic.button.discard`,
      default: 'Discard',
    },
  }),
}
```

**src/components/SpinnerButton/SpinnerButton.intl.ts**

```ts
import { defineTranslations } from '@enhanced-dom/intl'

import { namespace as parentNamespace, translations as parentTranslations } from '../components.intl'

const namespace = `${parentNamespace}.SpinnerButton` // this is one of the important parts that help with refactoring
export const translations = {
  ...parentTranslations, // the SpinnerButton.component can use the discard translation message from the parent intl scope WITHOUT knowing it comes from the parent scope
  ...defineTranslations({
    confirm: {
      // this will effectively overrule the general confirm
      key: `${namespace}.confirm`,
      default: 'Click me to confirm!',
    },
  }),
}
```

**src/views/views.intl.ts**

```ts
import { defineTranslations } from '@enhanced-dom/intl'

import { translations as generalTranslations } from '../intl'

export const namespace = 'views'
export const translations = {
  ...generalTranslations,
  ...defineTranslations({
    save: {
      key: `${namespace}.generic.button.save`,
      default: 'Save me',
    },
  }),
}
```

**src/views/Page1/Page1.intl.ts**

```ts
import { defineTranslations } from '@enhanced-dom/intl'

import { namespace as parentNamespace, translations as parentTranslations } from '../views.intl'

const namespace = `${parentNamespace}.Page1`
export const translations = {
  ...parentTranslations,
  ...defineTranslations({
    title: {
      key: `${namespace}.title`,
      default: 'My page 1',
    },
  }),
}
```

**src/views/Page1/Section1/Section1.intl.ts**

```ts
import { defineTranslations } from '@enhanced-dom/intl'

import { namespace as parentNamespace, translations as parentTranslations } from '../Page1.intl'

const namespace = `${parentNamespace}.Section1`
export const translations = {
  ...parentTranslations,
  ...defineTranslations({
    confirm: {
      key: `${namespace}.button.confirm`,
      default: 'Some other confirm',
    },
  }),
}
```

Given all these, an export of the translations keys in code, for default language 'en-US' would be something like this:

**src/intl/intl.en-US.json**

```json
{
  "generic.button.confirm": "Confirm!",
  "components.generic.button.discard": "Discard",
  "components.SpinnerButton.confirm": "Click me to confirm!",
  "views.generic.button.save": "Save me",
  "views.Page1.title": "My page 1",
  "views.Page1.Section1.button.confirm": "Some other confirm"
}
```

Notice no duplicates despite the fact that `Section1.component.tsx` will have access to all of the messages defined in the scopes above (e.g. Page1) + the generic messages.

# Build configuration

Current version supports only `webpack`. Add the @enhanced-dom/intl/webpack.plugin to the webpack config, together with the @enhanced-dom/intl/babel.plugin if using `babel`, or with @enhanced-dom/intl/webpack.loader otherwise.

# Translation manipulation

Given the setup from previous section, let's assume our sales team keeps selling the product to different customers who need different languages. The translation team will keep adding languages, while the dev team will keep changing code. Let's look at some scenarios:

## Removing a component

Say we realise we don't need Section1 anymore, and we need to 'get rig' of it. Ideally, all the Section1 translation keys should "go away" otherwise there may be confusion around _"where is this translation used?"_. Ideally, code should be easy to remove, and in our case, we can hopefully remove the src/views/Page1/Section1 folder, and not have to change things in a lot of other places. Page1.component.tsx is expected to change, but ideally we should not have to go diggin in our intl resource packs to remove all messages that were defined in Section1 module. Separately, the translation team received a request to translate the product in e.g. Spanish, so they add a new intl.es-ES.json file. On build, the Section1 translation keys will be automatically removed from all the intl.\*.json files.

## Moving messages to a different component

Say we realise we want to use the `views.Page1.Section1.button.confirm` message in e.g. Page2. We can move this to src/views/intl.ts, and we don't need to change code in Section1.component.tsx, but if the translation key stays the same, it will be confusing, as this is no longer a message specific to only Section1 of Page1, it's more... general. In our current setup, moving it will change its key to `views.generic.button.confirm`. However, the intl.\*.json files still have the old key in them. The expectation is that on build, the code will try to 'figure out' that translation key `views.Page1.Section1.button.confirm` was renamed to `views.generic.button.confirm` by comparing the translation value in the code with the translation value in the default language intl.\*.json file, and change the key in all other language packs accordingly.

# Comparison with react-intl

The idea of extracting translations from code is not novel. It has been implemented by other packages - e.g. react-intl. This package focuses more on [problem #1](#problem1), but offers solutions for [problem #2](#problem2) as well, in the shape of a cli extractor. This builds on past logic where they were using a babel plugin (still active it seems) to identify usages of react-intl's `defineTranslations` equivalent function, and extract the messages. However, the logic for that extraction needs the messages to be "statically parseable". This means that a translation key / value needs to be an expression that can be fed as a string to `eval`, and it will compile ok. Things like `import {namespace} from '../lala'` + `myKey = namepace + "someString"` will not get extracted. To be able to extract the messages from the file structure we have described above, we'd need to resolve dependencies in the code and 'compile it' in 1 module we can evaluate. Things get even more complex, as we might be importing "non-js" files like ".css", and we might love webpack / typescript aliases (to avoid too many ../../../../ imports). So, to compile the code needed to extract the messages, it's safe to assume we need to be able to compile the entire project. Which we actually do... during the original webpack compilation. So, the approach we take here is to spawn a subsequent webpack compilation using a very similar config (there are some important differences though) to what we initially had. The entry point of this subsequent compilation is not the original entry point, but rather a 'synthetic' file that does not import all the files in the project, just the ones containing messages... The result of this second compilation is built into a module, which exports a map of messages-per-file-path. We process this map and compare it to the json language packs. Because of this subsequent compilation we can 'build' our translation keys by 'incrementing' their namespace.
