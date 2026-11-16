import { defineProtocol, ruleCodec, type Rule, type RuleValue } from '@omne-harness/public-contract'

type Fields = Readonly<Record<string, { readonly rule: Rule; readonly optional?: true }>>

const text = { kind: 'text' } as const
const anyText = { kind: 'string' } as const
const tenant = { kind: 'tenant' } as const
const json = { kind: 'json' } as const
const nothing = { kind: 'null' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly string[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const nullable = <const R extends Rule>(rule: R) =>
  ({ kind: 'one-of', rules: [rule, nothing] }) as const
const array = <const R extends Rule>(item: R) => ({ kind: 'array', item }) as const

const target = { tenant: { rule: tenant }, reference: { rule: text } } as const

const terminal = object({
  kind: { rule: literal('completed', 'failed', 'unavailable', 'interrupted', 'no-response') },
  detail: { rule: nullable(anyText) },
})

const control = object({
  operation: { rule: text },
  intent: { rule: literal('stop', 'withdraw', 'background') },
  progress: {
    rule: literal(
      'pending',
      'unknown',
      'accepted',
      'stopped',
      'already-ended',
      'relation-changed',
      'rejected',
    ),
  },
})

const call = object({
  phase: {
    rule: literal('accepted', 'preparing', 'queued', 'starting', 'running', 'suspended', 'settled'),
  },
  relation: { rule: literal('foreground', 'background') },
  result: { rule: nullable(text) },
  terminal: { rule: nullable(terminal) },
  effect: { rule: literal('not-started', 'not-occurred', 'occurred', 'unknown') },
  controls: { rule: array(control) },
})

const resultPage = object({
  result: { rule: text },
  terminal: { rule: terminal },
  effect: { rule: literal('not-started', 'not-occurred', 'occurred', 'unknown') },
  content: { rule: json },
  next: { rule: nullable(text) },
})

const observeCallFrame = {
  kind: 'one-of',
  rules: [
    object({ kind: { rule: literal('snapshot') }, call: { rule: call }, process: { rule: json } }),
    object({ kind: { rule: literal('delta') }, call: { rule: call }, process: { rule: json } }),
    object({ kind: { rule: literal('gap') } }),
  ],
} as const

// A reference of another tenant, one the login may not read and one that does not exist all
// answer `denied`, the same as a session that does not exist.
export const toolProtocol = defineProtocol({
  name: 'tool',
  major: 1,
  operations: {
    'read-call': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(object(target)),
      outcomes: { succeeded: ruleCodec(object({ call: { rule: call } })) },
      countsAsAccess: true,
    },
    'read-call-result': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(
        object({ ...target, result: { rule: text }, cursor: { rule: nullable(text) } }),
      ),
      outcomes: { succeeded: ruleCodec(resultPage) },
      countsAsAccess: true,
    },
  },
  observations: {
    'observe-call': {
      identity: 'login',
      open: ruleCodec(object(target)),
      frame: ruleCodec(observeCallFrame),
      ends: ['closed', 'stale-instance'],
      countsAsAccess: true,
    },
  },
})

export type ToolProtocol = typeof toolProtocol
export type ToolCallView = RuleValue<typeof call>
export type ToolCallResultPage = RuleValue<typeof resultPage>
export type ObserveCallFrame = RuleValue<typeof observeCallFrame>
