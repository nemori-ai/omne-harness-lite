import { defineProtocol, ruleCodec, type Rule, type RuleValue } from '@omne-harness/public-contract'

// `assets/v1`: the four setting operations of RFC-0015 §9「设置的操作与答复」, in the shapes of the
// tenant settings face (§9「设置读写面的契约」). The rules stay literals: the value types come from
// them through `RuleValue`.

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

/** A caller names an asset by its name; the category may be left out. */
const assetQuery = object({ category: { rule: text, optional: true }, name: { rule: text } })
/** An asset as the face names it back: both parts. */
const assetRef = object({ category: { rule: text }, name: { rule: text } })

/** Every operation names its target tenant in the body; the access plugin checks the login against it. */
const itemTarget = { tenant: { rule: tenant }, asset: { rule: assetQuery }, item: { rule: text } }
/** The original operation of a write and the revision read before it (§9 规定 3). */
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

/** The fields every item view has, whatever its kind. */
const head = {
  asset: { rule: assetRef },
  item: { rule: text },
  revision: { rule: revision },
  declaration: {
    rule: object({
      title: { rule: anyText },
      purpose: { rule: anyText },
      appliesAt: { rule: anyText },
      clearEffect: { rule: anyText },
    }),
  },
} as const

/** `SettingView`. The three options differ in the literal `kind`, so they are disjoint. */
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

/** `SettingInput`. A permission item takes a pick only, never an allowed set. */
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

/** One item of the settings list, as `list-settings` and `describe-setting` give it. */
export type SettingView = RuleValue<typeof settingView>
/** What `set-setting` writes. */
export type SettingInput = RuleValue<typeof settingInput>

/** `assets/v1`. SPEC.md gives the operation table and the outcome of each face result. */
export const assetsProtocol = defineProtocol({
  name: 'assets',
  major: 1,
  operations: {
    'list-settings': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      // `after` is the `next` of the page before, or null for the first page.
      body: ruleCodec(
        object({
          tenant: { rule: tenant },
          asset: { rule: assetQuery, optional: true },
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
  },
  observations: {},
})

export type AssetsProtocol = typeof assetsProtocol
