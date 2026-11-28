import { defineProtocol, ruleCodec, type Rule } from '@omne-harness/public-contract'

type Fields = Readonly<Record<string, { readonly rule: Rule; readonly optional?: true }>>

const text = { kind: 'text' } as const
const anyText = { kind: 'string' } as const
const tenant = { kind: 'tenant' } as const
const session = { kind: 'session' } as const
const nothing = { kind: 'null' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly string[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const nullable = <const R extends Rule>(rule: R) =>
  ({ kind: 'one-of', rules: [rule, nothing] }) as const
const array = <const R extends Rule>(item: R) => ({ kind: 'array', item }) as const

const target = { tenant: { rule: tenant }, session: { rule: session } } as const

const unknownValue = object({
  kind: { rule: literal('unknown') },
  reason: {
    rule: literal(
      'unsupported',
      'unavailable',
      'denied',
      'not-accepted',
      'not-found',
      'not-recorded',
      'retention-expired',
    ),
  },
})

const known = <const K extends string>(field: K) =>
  ({
    kind: 'one-of',
    rules: [
      object({
        kind: { rule: literal('known') },
        ...({ [field]: { rule: text } } as { readonly [P in K]: { readonly rule: typeof text } }),
      }),
      object({ kind: { rule: literal('unknown') } }),
    ],
  }) as const

const withUnknown = <const R extends Rule>(rule: R) =>
  ({ kind: 'one-of', rules: [rule, unknownValue] }) as const

const adoptionRef = object({
  owner: { rule: text },
  name: { rule: text },
  revision: { rule: text },
  digest: { rule: text },
})

const counted = array(object({ kind: { rule: text }, count: { rule: text } }))

const runCause = {
  kind: 'one-of',
  rules: [
    object({
      kind: { rule: literal('node-failed') },
      node: { rule: text },
      category: { rule: literal('exception', 'invariant', 'unsupported-path', 'rejected') },
      failureKind: { rule: text },
      diagnostic: { rule: text, optional: true, since: 3 },
    }),
    unknownValue,
    object({ kind: { rule: literal('none') } }),
    object({
      kind: { rule: literal('no-failure') },
      conclusion: { rule: literal('complete', 'fail', 'cancelled') },
    }),
    object({
      kind: { rule: literal('model-refused') },
      failure: { rule: withUnknown(literal('denied', 'invalid', 'unsupported', 'capacity')) },
    }),
    object({
      kind: { rule: literal('no-reply') },
      cause: { rule: nullable(text) },
      upstreamStatus: { rule: nullable(text) },
      throttled: { rule: literal('yes'), optional: true, since: 3 },
    }),
    object({ kind: { rule: literal('request-rejected') } }),
    object({
      kind: { rule: literal('cannot-fit') },
      reason: { rule: withUnknown(literal('fixed', 'protected-floor', 'after-compaction')) },
    }),
    object({ kind: { rule: literal('compaction-invalid') } }),
    object({ kind: { rule: literal('compaction-failed') } }),
    object({ kind: { rule: literal('message-rejected') } }),
    object({ kind: { rule: literal('extension-stop') } }),
    object({ kind: { rule: literal('guard') } }),
  ],
} as const

const runControl = object({
  position: { rule: text },
  kind: { rule: literal('requested', 'progress') },
  target: { rule: nullable(literal('run', 'producer', 'session')) },
  intent: { rule: nullable(literal('control', 'interrupt', 'auto-archive')) },
  state: { rule: nullable(literal('committed', 'propagating', 'reconciled')) },
})

const amountState = literal('unknown', 'known', 'provisional')

const accountView = object({
  kind: { rule: literal('account') },
  usage: {
    rule: array(
      object({
        name: { rule: text },
        unit: { rule: anyText },
        state: { rule: amountState },
        lexeme: { rule: nullable(text) },
      }),
    ),
  },
  cost: {
    rule: array(
      object({
        source: { rule: text },
        unit: { rule: anyText },
        state: { rule: amountState },
        lexeme: { rule: nullable(text) },
      }),
    ),
  },
  duration: { rule: known('value') },
  receipt: { rule: literal('received', 'late') },
})

const attempt = object({
  dispatch: { rule: text },
  revision: { rule: text },
  adapter: { rule: adoptionRef },
  send: { rule: literal('not-sent', 'sent', 'unknown') },
  firstContent: { rule: literal('none-proven', 'observed', 'uncertain') },
  outcome: {
    rule: {
      kind: 'one-of',
      rules: [
        object({ kind: { rule: literal('pending') } }),
        object({
          kind: { rule: literal('completed') },
          reason: { rule: literal('stop', 'limit', 'tool-suggestions') },
        }),
        object({ kind: { rule: literal('interrupted') } }),
        object({
          kind: { rule: literal('failed') },
          cause: { rule: text },
          upstreamStatus: { rule: nullable(text) },
        }),
      ],
    },
  },
  /** The moments of the dispatch as Model kept them; absent from a server that does not keep them. */
  instants: {
    rule: object({
      prepared: { rule: known('instant') },
      sent: { rule: known('instant') },
      responseStarted: { rule: known('instant') },
      firstContent: { rule: known('instant') },
      ended: { rule: known('instant') },
    }),
    optional: true,
  },
  timing: {
    rule: object({
      materialize: { rule: known('milliseconds') },
      sendToResponse: { rule: known('milliseconds'), optional: true },
      sendToFirstContent: { rule: known('milliseconds') },
      execution: { rule: known('milliseconds') },
    }),
  },
  /** Each time the transport connected again before the request went out, with why. */
  connectRetries: { rule: array(literal('connect-failed', 'connect-timeout')), optional: true },
  account: { rule: withUnknown(accountView) },
  /** Whether the request of this attempt carried reasoning state back; unknown before it was materialized. */
  reasoning: { rule: literal('carried', 'not-carried', 'unknown'), optional: true },
  /** The profile the dispatch was made under, as Model kept it: its name is the model. */
  profile: { rule: withUnknown(adoptionRef), optional: true, since: 2 },
  effort: {
    rule: withUnknown(
      object({
        value: { rule: nullable(literal('low', 'medium', 'high', 'xhigh', 'none', 'max')) },
        basis: { rule: literal('selection', 'preference', 'provider') },
      }),
    ),
    optional: true,
    since: 2,
  },
})

const modelCall = object({
  reference: { rule: text },
  purpose: { rule: text },
  call: {
    rule: withUnknown(
      object({
        kind: { rule: literal('found') },
        call: { rule: text },
        phase: { rule: literal('accepted', 'running', 'retry-decision', 'settled') },
        /** How many real dispatches the call allows, how many it made, and why the last one failed. */
        progress: {
          rule: object({
            allowed: { rule: text },
            made: { rule: text },
            last: {
              rule: nullable(
                object({ cause: { rule: text }, upstreamStatus: { rule: nullable(text) } }),
              ),
            },
          }),
          optional: true,
        },
      }),
    ),
  },
  dispatches: { rule: array(attempt) },
  coverage: { rule: literal('complete-through-snapshot', 'expired-prefix', 'unknown') },
  /** For each block of the fixed request with a content reference, which form of it the model read. */
  reads: {
    rule: array(
      object({
        message: { rule: text },
        block: { rule: text },
        read: { rule: literal('original', 'fitted', 'derived', 'transcript') },
      }),
    ),
  },
  facts: { rule: counted },
})

const toolCall = object({
  reference: { rule: text },
  state: {
    rule: withUnknown(
      object({
        kind: { rule: literal('found') },
        call: { rule: text },
        phase: {
          rule: literal(
            'accepted',
            'preparing',
            'queued',
            'starting',
            'running',
            'suspended',
            'settled',
          ),
        },
        relation: { rule: literal('foreground', 'background') },
        terminal: {
          rule: nullable(
            object({
              kind: {
                rule: literal('completed', 'failed', 'unavailable', 'interrupted', 'no-response'),
              },
              cause: { rule: nullable(text) },
            }),
          ),
        },
      }),
    ),
  },
  account: { rule: withUnknown(accountView) },
  facts: { rule: counted },
  diagnostics: {
    rule: withUnknown(
      array(
        object({
          operation: { rule: text },
          phase: { rule: anyText },
          code: { rule: anyText },
        }),
      ),
    ),
  },
})

const runDiagnostic = object({
  run: { rule: text },
  entry: { rule: literal('interactive', 'dispatch') },
  execution: { rule: text },
  started: { rule: object({ position: { rule: text }, at: { rule: known('instant') } }) },
  attempts: {
    rule: object({
      started: { rule: text },
      released: {
        rule: object({
          ended: { rule: text },
          bounded: { rule: text },
          cancelled: { rule: text },
          released: { rule: text },
          superseded: { rule: text },
        }),
      },
      exited: { rule: text },
    }),
  },
  controls: { rule: array(runControl) },
  terminal: {
    rule: nullable(
      object({
        outcome: { rule: literal('completed', 'failed', 'cancelled') },
        cause: {
          rule: object({ record: { rule: nullable(text) }, structured: { rule: runCause } }),
        },
      }),
    ),
  },
  calls: { rule: object({ registered: { rule: text }, projected: { rule: text } }) },
  modelCalls: { rule: array(modelCall) },
  toolCalls: { rule: array(toolCall) },
  messages: { rule: counted },
  facts: { rule: counted },
})

const readSessionDiagnostics = {
  kind: 'one-of',
  rules: [
    object({
      ...target,
      cursor: { rule: nothing },
      run: { rule: nullable(text) },
      pageBytes: { rule: { kind: 'page-bytes' } },
    }),
    object({ ...target, cursor: { rule: text } }),
  ],
} as const

const diagnosticsPage = object({
  runs: { rule: array(runDiagnostic) },
  next: { rule: nullable(text) },
  exhausted: { rule: { kind: 'boolean' } },
  scannedThrough: { rule: anyText },
  basis: { rule: object({ upper: { rule: anyText } }) },
  gaps: {
    rule: array(
      object({
        source: { rule: literal('session', 'agent', 'model', 'tool') },
        subject: { rule: text },
        reason: {
          rule: literal(
            'unsupported',
            'unavailable',
            'denied',
            'not-disclosed',
            'not-accepted',
            'not-found',
            'not-recorded',
            'retention-expired',
            'truncated',
          ),
        },
      }),
    ),
  },
})

export const sessionDiagnosticsProtocol = defineProtocol({
  name: 'session-diagnostics',
  major: 1,
  operations: {
    'read-session-diagnostics': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(readSessionDiagnostics),
      outcomes: {
        succeeded: ruleCodec(diagnosticsPage),
        invalid: ruleCodec(object({})),
      },
      countsAsAccess: true,
    },
  },
  observations: {},
})

export type SessionDiagnosticsProtocol = typeof sessionDiagnosticsProtocol
