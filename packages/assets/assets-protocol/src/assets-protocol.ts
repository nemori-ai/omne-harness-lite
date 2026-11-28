import { defineProtocol, ruleCodec, type Rule, type RuleValue } from '@omne-harness/public-contract'

type Fields = Readonly<Record<string, { readonly rule: Rule; readonly optional?: true }>>

const text = { kind: 'text' } as const
const anyText = { kind: 'string' } as const
const tenant = { kind: 'tenant' } as const
const revision = { kind: 'revision' } as const
const boolean = { kind: 'boolean' } as const
const json = { kind: 'json' } as const
const nothing = { kind: 'null' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly string[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const nullable = <const R extends Rule>(rule: R) =>
  ({ kind: 'one-of', rules: [rule, nothing] }) as const

const assetQuery = object({ category: { rule: text, optional: true }, name: { rule: text } })
const independentRef = {
  kind: { rule: literal('independent') },
  providerId: { rule: text },
  definitionId: { rule: text },
} as const
const ownerQuery = {
  kind: 'one-of',
  rules: [
    object({
      kind: { rule: literal('asset') },
      category: { rule: text, optional: true },
      name: { rule: text },
    }),
    object(independentRef),
  ],
} as const
const owner = {
  kind: 'one-of',
  rules: [
    object({ kind: { rule: literal('asset') }, category: { rule: text }, name: { rule: text } }),
    object(independentRef),
  ],
} as const
const listScope = {
  kind: 'one-of',
  rules: [
    object({ kind: { rule: literal('asset') }, asset: { rule: assetQuery, optional: true } }),
    object({ kind: { rule: literal('independent') } }),
  ],
} as const
const count = { kind: 'count' } as const
const array = <const R extends Rule>(item: R) => ({ kind: 'array', item }) as const
const oneOf = <const R extends readonly Rule[]>(...rules: R) => ({ kind: 'one-of', rules }) as const

const creation = literal('none', 'data', 'directory')
const categoryView = object({
  category: { rule: text },
  title: { rule: text },
  summary: { rule: text },
  creation: { rule: creation },
})
const creationDetail = oneOf(
  object({ kind: { rule: literal('none') } }),
  object({ kind: { rule: literal('data') }, schema: { rule: json } }),
  object({
    kind: { rule: literal('directory') },
    limits: {
      rule: object({
        files: { rule: count },
        fileBytes: { rule: count },
        totalBytes: { rule: count },
      }),
    },
  }),
)

const capability = { category: { rule: text }, name: { rule: text } } as const
const ofTenant = { tenant: { rule: tenant } } as const
const assetSummary = object({
  title: { rule: anyText },
  description: { rule: anyText },
  facts: {
    rule: {
      kind: 'array',
      item: object({ name: { rule: anyText }, text: { rule: anyText } }),
      max: 8,
    },
  },
})
const assetRow = object({
  ...capability,
  version: { rule: text },
  selection: { rule: literal('follow', 'pinned') },
  enabled: { rule: boolean },
  holding: { rule: text },
  origin: { rule: literal('customized', 'official') },
  summary: { rule: nullable(assetSummary) },
  from: { rule: text, optional: true, since: 2 },
})
/** What a line of an effect says: empty where there is nothing to say, such as a place in effect. */
const said = { kind: 'string' } as const
const impactLine = object({
  mark: { rule: literal('+', '-', '~', '!') },
  of: { rule: nullable(text) },
  point: { rule: text },
  key: { rule: said },
  id: { rule: nullable(text) },
  says: { rule: said },
})
/** Where a held one is placed and whether each place is in effect, and what disabling or removing it takes back. */
const assetEffect = object({
  places: {
    rule: array(
      object({
        point: { rule: text },
        key: { rule: said },
        id: { rule: nullable(text) },
        side: { rule: nullable(literal('client', 'server')) },
        category: { rule: nullable(text) },
        categoryTitle: { rule: nullable(text) },
        standing: { rule: text },
        says: { rule: said },
      }),
    ),
  },
  clients: { rule: nullable(array(object({ label: { rule: text }, says: { rule: said } }))) },
  advice: { rule: nullable(text) },
  disable: { rule: nullable(array(impactLine)) },
  remove: { rule: nullable(array(impactLine)) },
})
const assetContent = oneOf(
  object({ kind: { rule: literal('data') }, body: { rule: json } }),
  object({
    kind: { rule: literal('directory') },
    entries: { rule: array(object({ path: { rule: text }, bytes: { rule: count } })) },
  }),
)
const standing = oneOf(
  object({ kind: { rule: literal('selected') } }),
  object({
    kind: { rule: literal('filtered') },
    reason: { rule: literal('disabled', 'ineligible', 'blocked') },
    by: { rule: nullable(text) },
  }),
  object({ kind: { rule: literal('unavailable') }, layer: { rule: text } }),
)
const manifest = array(object({ path: { rule: text }, bytes: { rule: count } }))
const received = array(object({ path: { rule: text }, bytes: { rule: count } }))

const createRequest = { ...capability, body: { rule: json } } as const
const beginRequest = { ...capability, manifest: { rule: manifest } } as const
const holdingRequest = { holding: { rule: text } } as const
const assetRequest = oneOf(
  object({ kind: { rule: literal('create-asset') }, ...createRequest }),
  object({ kind: { rule: literal('begin-asset-upload') }, ...beginRequest }),
  object({ kind: { rule: literal('commit-asset-upload') } }),
  object({
    kind: { rule: literal('set-asset-enabled') },
    ...holdingRequest,
    enabled: { rule: boolean },
  }),
  object({ kind: { rule: literal('remove-asset') }, ...holdingRequest }),
)

const publishedFields = {
  version: { rule: text },
  holding: { rule: text },
  changed: { rule: boolean },
} as const
const uploadFields = { partBytes: { rule: count }, received: { rule: received } } as const

const itemTarget = { tenant: { rule: tenant }, owner: { rule: ownerQuery }, item: { rule: text } }
const writeTarget = {
  ...itemTarget,
  operation: { rule: text },
  expectedRevision: { rule: revision },
} as const

const presence = {
  kind: 'one-of',
  rules: [
    object({ kind: { rule: literal('unset') } }),
    object({ kind: { rule: literal('set') }, value: { rule: json } }),
  ],
} as const
const editable = {
  kind: 'one-of',
  rules: [
    object({ kind: { rule: literal('yes') } }),
    object({
      kind: { rule: literal('no') },
      reason: { rule: literal('locked', 'not-a-source', 'prohibited-above') },
    }),
  ],
} as const
const secretState = literal('unset', 'available', 'revoked', 'unreadable')
const layer = literal('default', 'organization', 'tenant')

const head = {
  owner: { rule: owner },
  item: { rule: text },
  revision: { rule: revision },
  declaration: {
    rule: object({
      title: { rule: anyText },
      purpose: { rule: anyText },
      appliesAt: { rule: anyText },
      clearEffect: { rule: anyText },
      group: {
        rule: object({
          id: { rule: text },
          title: { rule: anyText },
          description: { rule: anyText },
        }),
      },
    }),
  },
} as const

const settingView = {
  kind: 'one-of',
  rules: [
    object({
      ...head,
      kind: { rule: literal('ordinary') },
      valueSchema: { rule: json },
      default: { rule: presence },
      own: { rule: presence },
      effective: { rule: object({ value: { rule: presence }, source: { rule: nullable(layer) } }) },
      lockedBy: { rule: nullable(literal('organization')) },
      editable: { rule: editable },
    }),
    object({
      ...head,
      kind: { rule: literal('permission') },
      choices: {
        rule: {
          kind: 'array',
          item: object({
            value: { rule: text },
            label: { rule: anyText },
            description: { rule: anyText },
            permitsOperation: { rule: boolean },
          }),
        },
      },
      default: { rule: text },
      own: { rule: nullable(text) },
      effective: {
        rule: {
          kind: 'one-of',
          rules: [
            object({
              kind: { rule: literal('value') },
              value: { rule: text },
              source: { rule: layer },
            }),
            object({
              kind: { rule: literal('prohibited') },
              by: { rule: literal('organization', 'tenant') },
            }),
            object({ kind: { rule: literal('empty-bound') } }),
          ],
        },
      },
      bound: { rule: nullable({ kind: 'array', item: text }) },
      editable: { rule: editable },
    }),
    object({
      ...head,
      kind: { rule: literal('secret') },
      own: { rule: secretState },
      official: { rule: secretState },
      editable: { rule: editable },
    }),
  ],
} as const

const settingInput = {
  kind: 'one-of',
  rules: [
    object({ kind: { rule: literal('ordinary') }, value: { rule: json } }),
    object({ kind: { rule: literal('permission') }, pick: { rule: text } }),
    object({ kind: { rule: literal('secret') }, secret: { rule: text } }),
  ],
} as const

const empty = ruleCodec(object({}))
const written = ruleCodec(object({ revision: { rule: revision } }))
const notWritable = ruleCodec(
  object({
    reason: { rule: literal('locked', 'out-of-bound', 'prohibited-above', 'not-a-source') },
  }),
)

const refused = ruleCodec(
  object({ reason: { rule: anyText }, missing: { rule: array(text), optional: true } }),
)
const published = ruleCodec(object(publishedFields))
const holdingNotWritable = ruleCodec(object({ reason: { rule: literal('official', 'removed') } }))
const holdingNotFound = ruleCodec(object({ broughtBy: { rule: text, optional: true, since: 2 } }))
const holdingOutcomes = {
  succeeded: empty,
  'no-change': empty,
  'not-found': holdingNotFound,
  'not-writable': holdingNotWritable,
  conflict: empty,
} as const
const publishOutcomes = {
  succeeded: published,
  invalid: refused,
  'not-found': empty,
  conflict: empty,
} as const

const assetRead = { identity: 'login', effect: 'read', limit: 'small' } as const
const assetWrite = { identity: 'login', effect: 'commit', limit: 'small' } as const

export type SettingView = RuleValue<typeof settingView>
export type SettingInput = RuleValue<typeof settingInput>
export type CategoryView = RuleValue<typeof categoryView>
export type CreationDetail = RuleValue<typeof creationDetail>
export type AssetRowView = RuleValue<typeof assetRow>
export type AssetContentView = RuleValue<typeof assetContent>
export type AssetStandingView = RuleValue<typeof standing>
export type AssetRequest = RuleValue<typeof assetRequest>

export const assetsProtocol = defineProtocol({
  name: 'assets',
  major: 1,
  operations: {
    'list-settings': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(
        object({
          tenant: { rule: tenant },
          scope: { rule: listScope },
          after: { rule: nullable(text) },
          limit: { rule: { kind: 'page-limit' } },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(
          object({
            items: { rule: { kind: 'array', item: settingView } },
            next: { rule: nullable(text) },
            completeness: { rule: literal('complete', 'partial') },
          }),
        ),
        'not-visible': empty,
        conflict: empty,
      },
    },
    'describe-setting': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(object(itemTarget)),
      outcomes: {
        succeeded: ruleCodec(object({ item: { rule: settingView } })),
        'not-visible': empty,
        conflict: empty,
      },
    },
    'set-setting': {
      identity: 'login',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(object({ ...writeTarget, value: { rule: settingInput } })),
      outcomes: {
        succeeded: written,
        'no-change': empty,
        'not-visible': empty,
        invalid: empty,
        conflict: empty,
        'not-writable': notWritable,
      },
    },
    'clear-setting': {
      identity: 'login',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(object(writeTarget)),
      outcomes: {
        succeeded: written,
        'no-change': empty,
        'not-visible': empty,
        invalid: empty,
        conflict: empty,
        'not-writable': notWritable,
      },
    },
    'list-categories': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(
        object({
          after: { rule: nullable(text) },
          limit: { rule: { kind: 'page-limit' } },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(
          object({
            items: { rule: { kind: 'array', item: categoryView } },
            next: { rule: nullable(text) },
          }),
        ),
      },
    },
    'describe-category': {
      ...assetRead,
      body: ruleCodec(object({ category: { rule: text } })),
      outcomes: {
        succeeded: ruleCodec(
          object({
            category: { rule: text },
            title: { rule: text },
            summary: { rule: text },
            hint: { rule: nullable(anyText) },
            creation: { rule: creationDetail },
          }),
        ),
        'not-found': empty,
      },
    },
    'list-assets': {
      ...assetRead,
      body: ruleCodec(
        object({
          ...ofTenant,
          category: { rule: text },
          after: { rule: nullable(text) },
          limit: { rule: { kind: 'page-limit' } },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(
          object({
            items: { rule: array(assetRow) },
            next: { rule: nullable(text) },
            completeness: { rule: literal('complete', 'partial') },
          }),
        ),
        'not-found': empty,
        invalid: empty,
      },
    },
    'describe-asset': {
      ...assetRead,
      body: ruleCodec(object({ ...ofTenant, ...capability })),
      outcomes: {
        succeeded: ruleCodec(
          object({
            item: { rule: assetRow },
            revision: { rule: count },
            content: { rule: assetContent },
            standing: { rule: standing },
            settings: { rule: boolean },
            effect: { rule: assetEffect, optional: true, since: 2 },
          }),
        ),
        'not-found': empty,
      },
    },
    'create-asset': {
      ...assetWrite,
      limit: 'input',
      body: ruleCodec(object({ ...ofTenant, operation: { rule: text }, ...createRequest })),
      outcomes: publishOutcomes,
    },
    'begin-asset-upload': {
      ...assetWrite,
      limit: 'input',
      body: ruleCodec(object({ ...ofTenant, operation: { rule: text }, ...beginRequest })),
      outcomes: {
        succeeded: ruleCodec(object(uploadFields)),
        invalid: refused,
        'not-found': empty,
        conflict: empty,
        limited: empty,
      },
    },
    'append-asset-upload': {
      ...assetWrite,
      limit: 'input',
      body: ruleCodec(
        object({
          ...ofTenant,
          upload: { rule: text },
          path: { rule: text },
          offset: { rule: count },
          bytes: { rule: { kind: 'bytes' } },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(object({ received: { rule: count } })),
        'not-found': empty,
        invalid: refused,
      },
    },
    'commit-asset-upload': {
      ...assetWrite,
      body: ruleCodec(object({ ...ofTenant, upload: { rule: text } })),
      outcomes: publishOutcomes,
    },
    'set-asset-enabled': {
      ...assetWrite,
      body: ruleCodec(
        object({
          ...ofTenant,
          operation: { rule: text },
          ...holdingRequest,
          enabled: { rule: boolean },
        }),
      ),
      outcomes: holdingOutcomes,
    },
    'remove-asset': {
      ...assetWrite,
      body: ruleCodec(object({ ...ofTenant, operation: { rule: text }, ...holdingRequest })),
      outcomes: holdingOutcomes,
    },
    'query-asset-operation': {
      ...assetRead,
      limit: 'input',
      body: ruleCodec(
        object({ ...ofTenant, operation: { rule: text }, request: { rule: assetRequest } }),
      ),
      outcomes: {
        succeeded: ruleCodec(oneOf(object(publishedFields), object(uploadFields), object({}))),
        'no-change': empty,
        'not-committed': empty,
        'not-found': empty,
        'not-writable': holdingNotWritable,
        invalid: refused,
        conflict: empty,
        limited: empty,
      },
    },
  },
  observations: {
    'observe-assets': {
      identity: 'login',
      open: ruleCodec(object(ofTenant)),
      frame: ruleCodec(object({ kind: { rule: literal('changed') } })),
      ends: [],
    },
  },
})

export type AssetsProtocol = typeof assetsProtocol
