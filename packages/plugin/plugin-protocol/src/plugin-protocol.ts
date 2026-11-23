import { defineProtocol, ruleCodec, type Rule } from '@omne-harness/public-contract'

type Fields = Readonly<Record<string, { readonly rule: Rule; readonly optional?: true }>>

const text = { kind: 'text' } as const
const count = { kind: 'count' } as const
const bytes = { kind: 'bytes' } as const
const nothing = { kind: 'null' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly string[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const oneOf = <const R extends readonly Rule[]>(...rules: R) => ({ kind: 'one-of', rules }) as const
const array = <const R extends Rule>(item: R) => ({ kind: 'array', item }) as const

const ofTenant = { tenant: { rule: { kind: 'tenant' } } } as const
const ofSide = { ...ofTenant, side: { rule: literal('client', 'server') } } as const

const file = object({ path: { rule: text }, digest: { rule: text }, bytes: { rule: count } })
/** One plugin a side is to load; `manifest` is the text of its `plugin.json` as the source holds it. */
const wanted = object({
  name: { rule: text },
  version: { rule: text },
  manifest: { rule: text },
  files: { rule: array(file) },
})
const report = object({
  name: { rule: text },
  version: { rule: text },
  state: { rule: literal('loaded', 'failed', 'held') },
  reason: { rule: oneOf(text, nothing) },
})

const empty = ruleCodec(object({}))
const read = { identity: 'login', effect: 'read', limit: 'small', countsAsAccess: true } as const

/** plugin/v1. A client asks what its side is to load, reads the files, and says how each load went. */
export const pluginProtocol = defineProtocol({
  name: 'plugin',
  major: 1,
  operations: {
    'list-wanted': {
      ...read,
      body: ruleCodec(object(ofSide)),
      outcomes: { succeeded: ruleCodec(object({ plugins: { rule: array(wanted) } })) },
    },
    'read-file': {
      ...read,
      body: ruleCodec(
        object({
          ...ofTenant,
          name: { rule: text },
          version: { rule: text },
          path: { rule: text },
          offset: { rule: count },
          limit: { rule: count },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(
          object({
            part: { rule: bytes },
            next: { rule: oneOf(count, nothing) },
            bytes: { rule: count },
          }),
        ),
        'not-found': ruleCodec(object({ reason: { rule: literal('plugin', 'file') } })),
        limited: empty,
      },
    },
    /** Replaces what this client said before; sending it again is safe. */
    'report-loaded': {
      ...read,
      effect: 'commit',
      body: ruleCodec(
        object({ ...ofTenant, client: { rule: text }, plugins: { rule: array(report) } }),
      ),
      outcomes: { succeeded: empty },
    },
  },
  observations: {
    'observe-wanted': {
      identity: 'login',
      open: ruleCodec(object(ofSide)),
      frame: ruleCodec(object({ kind: { rule: literal('changed') } })),
      ends: [],
    },
  },
})
export type PluginProtocol = typeof pluginProtocol
