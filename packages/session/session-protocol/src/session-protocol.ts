import { defineProtocol, ruleCodec, type Rule, type RuleValue } from '@omne-harness/public-contract'

type Fields = Readonly<Record<string, { readonly rule: Rule; readonly optional?: true }>>

const text = { kind: 'text' } as const
const anyText = { kind: 'string' } as const
const tenant = { kind: 'tenant' } as const
const session = { kind: 'session' } as const
const boolean = { kind: 'boolean' } as const
const json = { kind: 'json' } as const
const nothing = { kind: 'null' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly string[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const nullable = <const R extends Rule>(rule: R) =>
  ({ kind: 'one-of', rules: [rule, nothing] }) as const

const target = { tenant: { rule: tenant }, session: { rule: session } } as const

const producer = object({ kind: { rule: literal('model', 'tool') }, call: { rule: text } })
const toolCall = object({ kind: { rule: literal('tool') }, call: { rule: text } })
const backgroundAnswer = object({
  kind: { rule: literal('requested', 'background') },
  controlId: { rule: text },
  producer: { rule: toolCall },
})
const callLabel = object({
  intent: { rule: nullable(anyText) },
  tool: { rule: text },
  command: { rule: nullable(text) },
  preview: { rule: anyText },
})
// One call in the background as every reader sees it: its short number, label and state now.
const backgroundCall = object({
  id: { rule: text },
  producer: { rule: toolCall },
  label: { rule: callLabel },
  source: { rule: literal('launched', 'control', 'threshold', 'foreground-limit') },
  status: { rule: literal('queued', 'running', 'ended-pending', 'stopping', 'unknown') },
  stop: {
    rule: nullable(
      object({
        initiator: { rule: literal('user', 'agent', 'system') },
        reason: { rule: nullable(anyText) },
        progress: { rule: literal('requested', 'accepted', 'proven') },
      }),
    ),
  },
  lastLine: { rule: nullable(anyText) },
})
const backgroundCalls = object({
  calls: { rule: { kind: 'array', item: backgroundCall } },
})
const terminalSource = object({
  owner: { rule: text },
  record: { rule: text },
  revision: { rule: text },
  digest: { rule: text },
})

function controlAnswer<const T extends Fields, const R extends Rule>(controlled: T, terminal: R) {
  return {
    kind: 'one-of',
    rules: [
      object({ kind: { rule: literal('requested') }, controlId: { rule: text }, ...controlled }),
      object({
        kind: { rule: literal('ended') },
        controlId: { rule: text },
        ...controlled,
        terminal: { rule: terminal },
      }),
    ],
  } as const
}

const empty = ruleCodec(object({}))
const limited = ruleCodec(
  object({
    resource: { rule: literal('pending-inputs', 'input-bytes') },
    limit: { rule: { kind: 'positive-integer' } },
  }),
)

const listSessions = object({
  tenant: { rule: tenant },
  cursor: { rule: nullable(text) },
  limit: { rule: { kind: 'positive-integer' }, optional: true },
  includeArchived: { rule: boolean, optional: true },
})

const sessionList = object({
  sessions: {
    rule: {
      kind: 'array',
      item: object({
        session: { rule: session },
        createdAt: { rule: nullable({ kind: 'instant' }) },
        lastActivityAt: { rule: nullable({ kind: 'instant' }) },
        lifecycle: { rule: literal('initializing', 'dormant', 'active', 'frozen', 'archived') },
        title: { rule: nullable(anyText) },
      }),
    },
  },
  next: { rule: nullable(text) },
  completeness: { rule: literal('complete', 'partial') },
})

const readHistory = {
  kind: 'one-of',
  rules: [
    object({
      ...target,
      cursor: { rule: nothing },
      direction: { rule: literal('forward', 'backward') },
      pageBytes: { rule: { kind: 'page-bytes' } },
    }),
    object({ ...target, cursor: { rule: text } }),
  ],
} as const

const historyPage = object({
  upper: { rule: anyText },
  entries: {
    rule: {
      kind: 'array',
      item: object({
        entryId: { rule: text },
        revision: { rule: anyText },
        kind: { rule: anyText },
        payload: { rule: json },
      }),
    },
  },
  next: { rule: nullable(text) },
  exhausted: { rule: boolean },
  scannedThrough: { rule: anyText },
})

const waiting = object({
  waiting: {
    rule: nullable(
      object({
        run: { rule: text },
        pending: { rule: { kind: 'count' } },
        cause: {
          rule: nullable(object({ kind: { rule: text }, detail: { rule: nullable(text) } })),
        },
      }),
    ),
  },
})

const modelOutput = { rule: literal('model-output-v1') } as const
const projected = <const K extends string>(kind: K) =>
  object({ kind: { rule: literal(kind) }, projection: modelOutput, value: { rule: json } })

const observeSessionOpen = object(target)
const observeSessionFrame = {
  kind: 'one-of',
  rules: [
    object({
      kind: { rule: literal('state') },
      run: { rule: nullable(text) },
      revision: { rule: anyText },
      phase: { rule: nullable(text) },
      target: { rule: nullable(object({ projection: modelOutput })) },
    }),
    projected('snapshot'),
    projected('delta'),
    object({
      kind: { rule: literal('gap') },
      reason: { rule: literal('buffer', 'source-history') },
    }),
    object({ kind: { rule: literal('refreshing') } }),
  ],
} as const

export type ObserveSessionOpen = RuleValue<typeof observeSessionOpen>
export type ObserveSessionFrame = RuleValue<typeof observeSessionFrame>

export const sessionProtocol = defineProtocol({
  name: 'session',
  major: 1,
  operations: {
    'create-session': {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(
        object({
          createCallId: { rule: text },
          definition: { rule: text, optional: true },
          purpose: { rule: anyText },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(object({ session: { rule: session }, recovered: { rule: boolean } })),
        limited,
        invalid: empty,
        conflict: empty,
      },
      countsAsAccess: true,
    },
    'query-create-session': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(object({ tenant: { rule: tenant }, createCallId: { rule: text } })),
      outcomes: { succeeded: ruleCodec(object({ session: { rule: session } })), unknown: true },
      countsAsAccess: true,
    },
    'send-input': {
      identity: 'login',
      effect: 'commit',
      limit: 'input',
      body: ruleCodec(
        object({
          ...target,
          acceptId: { rule: text },
          inputId: { rule: text },
          message: { rule: { kind: 'user-message' } },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(object({ recovered: { rule: boolean } })),
        limited,
        invalid: empty,
        archived: empty,
        frozen: empty,
        conflict: empty,
      },
      countsAsAccess: true,
    },
    // An urgent input: it releases the foreground wait of the Run there, or is taken as ordinary.
    'interrupt-input': {
      identity: 'login',
      effect: 'commit',
      limit: 'input',
      body: ruleCodec(
        object({
          ...target,
          acceptId: { rule: text },
          inputId: { rule: text },
          message: { rule: { kind: 'user-message' } },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(
          object({ recovered: { rule: boolean }, as: { rule: literal('interrupt', 'ordinary') } }),
        ),
        limited,
        invalid: empty,
        archived: empty,
        frozen: empty,
        conflict: empty,
      },
      countsAsAccess: true,
    },
    'query-send-input': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(object({ ...target, acceptId: { rule: text } })),
      outcomes: { succeeded: empty, 'not-committed': empty, unknown: true },
      countsAsAccess: true,
    },
    'read-history': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(readHistory),
      outcomes: { succeeded: ruleCodec(historyPage), invalid: empty },
      countsAsAccess: true,
    },
    'read-waiting': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(object(target)),
      outcomes: { succeeded: ruleCodec(waiting), invalid: empty },
      countsAsAccess: true,
    },
    'list-sessions': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(listSessions),
      outcomes: { succeeded: ruleCodec(sessionList), invalid: empty },
      countsAsAccess: true,
    },
    'cancel-run': {
      identity: 'login',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(
        object({
          ...target,
          controlId: { rule: text },
          run: { rule: text },
          urgency: { rule: literal('graceful', 'force') },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(
          controlAnswer(
            { run: { rule: text } },
            object({
              outcome: { rule: literal('completed', 'failed', 'cancelled') },
              source: { rule: terminalSource },
            }),
          ),
        ),
        invalid: empty,
        conflict: empty,
        'not-found': empty,
      },
      countsAsAccess: true,
    },
    'stop-call': {
      identity: 'login',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(
        object({
          ...target,
          controlId: { rule: text },
          producer: { rule: producer },
          reason: { rule: nullable(anyText), optional: true },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(
          controlAnswer(
            { producer: { rule: producer } },
            object({
              version: { rule: text },
              outcome: {
                rule: literal('completed', 'failed', 'interrupted', 'unavailable', 'no-response'),
              },
              source: { rule: terminalSource },
            }),
          ),
        ),
        invalid: empty,
        conflict: empty,
        'not-found': empty,
        unsupported: empty,
      },
      countsAsAccess: true,
    },
    'background-call': {
      identity: 'login',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(
        object({ ...target, controlId: { rule: text }, producer: { rule: toolCall } }),
      ),
      outcomes: { succeeded: ruleCodec(backgroundAnswer), invalid: empty, conflict: empty },
      countsAsAccess: true,
    },
    'list-background-calls': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(object(target)),
      outcomes: { succeeded: ruleCodec(backgroundCalls), invalid: empty },
      countsAsAccess: true,
    },
    'retry-run': {
      identity: 'login',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(object({ ...target, controlId: { rule: text }, run: { rule: text } })),
      outcomes: {
        succeeded: ruleCodec(object({ recovered: { rule: boolean } })),
        invalid: empty,
        archived: empty,
        frozen: empty,
        'not-found': empty,
        'no-change': empty,
        conflict: empty,
      },
      countsAsAccess: true,
    },
  },
  observations: {
    'observe-session': {
      identity: 'login',
      open: ruleCodec(observeSessionOpen),
      frame: ruleCodec(observeSessionFrame),
      ends: ['refresh-exhausted'],
      countsAsAccess: true,
    },
  },
})

export type SessionProtocol = typeof sessionProtocol
