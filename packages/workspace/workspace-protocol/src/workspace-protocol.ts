import { defineProtocol, ruleCodec, type Rule, type RuleValue } from '@omne-harness/public-contract'

type Fields = Readonly<Record<string, { readonly rule: Rule; readonly optional?: true }>>

const text = { kind: 'text' } as const
const tenant = { kind: 'tenant' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly string[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const array = <const R extends Rule>(item: R) => ({ kind: 'array', item }) as const
const oneOf = <const R extends readonly Rule[]>(...rules: R) => ({ kind: 'one-of', rules }) as const
const kind = <const K extends string>(value: K) => ({ rule: literal(value) })

const ofTenant = { tenant: { rule: tenant } } as const
const none = ruleCodec(object({}))
/** The reason is a code of the workspace domain or of the management type that refused. */
const refused = ruleCodec(object({ reason: { rule: text } }))

const registration = {
  ...ofTenant,
  operation: { rule: text },
  address: { rule: text },
  type: { rule: text, optional: true },
} as const
const registered = ruleCodec(
  object({ workspace: { rule: text }, instance: { rule: text }, type: { rule: text } }),
)

const standing = literal('participant', 'admin', 'owner')
const summaryFields = {
  workspace: { rule: text },
  type: { rule: text },
  standing: { rule: standing },
} as const
const summary = object(summaryFields)
const availability = oneOf(
  object({ kind: kind('available'), directory: { rule: text }, basis: { rule: text } }),
  object({ kind: kind('unavailable'), reason: { rule: text } }),
  object({ kind: kind('unknown') }),
)
const instance = object({
  instance: { rule: text },
  address: { rule: text },
  availability: { rule: availability },
})
const view = object({ ...summaryFields, instances: { rule: array(instance) } })

const read = { identity: 'login', effect: 'read', limit: 'small', countsAsAccess: true } as const
const commit = {
  identity: 'login',
  effect: 'commit',
  limit: 'small',
  countsAsAccess: true,
} as const

const changeFields = { ...ofTenant, operation: { rule: text }, workspace: { rule: text } } as const
const changes = <const F extends Fields>(fields: F) => ({
  change: {
    ...commit,
    body: ruleCodec(object(fields)),
    outcomes: { succeeded: none, 'no-change': none, invalid: refused, conflict: none },
  },
  query: {
    ...read,
    body: ruleCodec(object(fields)),
    outcomes: { succeeded: none, 'not-committed': none },
  },
})
const onTarget = changes({ ...changeFields, target: { rule: tenant } })
const onSelf = changes(changeFields)

/** A commit names itself with `operation`: after `unknown`, the query with the same body says what was done. */
export const workspaceProtocol = defineProtocol({
  name: 'workspace',
  major: 1,
  operations: {
    /** Makes a directory of the server's machine a workspace. Nothing in the directory is touched. */
    register: {
      ...commit,
      body: ruleCodec(object(registration)),
      outcomes: {
        succeeded: registered,
        'no-change': registered,
        invalid: refused,
        conflict: none,
      },
    },
    'query-register': {
      ...read,
      body: ruleCodec(object(registration)),
      outcomes: { succeeded: registered, 'not-committed': none },
    },
    list: {
      ...read,
      body: ruleCodec(object(ofTenant)),
      outcomes: { succeeded: ruleCodec(object({ workspaces: { rule: array(summary) } })) },
    },
    /** A workspace the tenant has no relation with answers the same as one that does not exist. */
    describe: {
      ...read,
      body: ruleCodec(object({ ...ofTenant, workspace: { rule: text } })),
      outcomes: { succeeded: ruleCodec(view), 'not-found': none },
    },
    'grant-participation': onTarget.change,
    'query-grant-participation': onTarget.query,
    'grant-admin': onTarget.change,
    'query-grant-admin': onTarget.query,
    'revoke-admin': onTarget.change,
    'query-revoke-admin': onTarget.query,
    remove: onTarget.change,
    'query-remove': onTarget.query,
    leave: onSelf.change,
    'query-leave': onSelf.query,
    destroy: onSelf.change,
    'query-destroy': onSelf.query,
  },
  observations: {},
})

export type WorkspaceProtocol = typeof workspaceProtocol
export type WorkspaceSummaryBody = RuleValue<typeof summary>
export type WorkspaceViewBody = RuleValue<typeof view>
export type WorkspaceInstanceBody = RuleValue<typeof instance>
