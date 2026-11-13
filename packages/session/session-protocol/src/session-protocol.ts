import { defineProtocol, ruleCodec, type RuleValue } from '@omne-harness/public-contract'

// The rule texts are copied from the shared contract's `session-public/1` family
// (`packages/access/public-contract/src/session-rules.ts`). Session owns them from here on.

const text = { kind: 'text' } as const
const anyText = { kind: 'string' } as const
const tenant = { kind: 'tenant' } as const
const session = { kind: 'session' } as const
const boolean = { kind: 'boolean' } as const
const nothing = { kind: 'null' } as const

const producer = {
  kind: 'object',
  fields: {
    kind: { rule: { kind: 'literal', values: ['model', 'tool'] } },
    call: { rule: text },
  },
} as const

const empty = ruleCodec({ kind: 'object', fields: {} })

/** The body of `limited`: which resource ran out and its limit. */
const limited = ruleCodec({
  kind: 'object',
  fields: {
    resource: { rule: { kind: 'literal', values: ['pending-inputs', 'input-bytes'] } },
    limit: { rule: { kind: 'positive-integer' } },
  },
})

// entryId follows message's RecordEntryRef, which is non-empty. revision and kind are plain text.
const historyEntry = {
  kind: 'object',
  fields: {
    entryId: { rule: text },
    revision: { rule: anyText },
    kind: { rule: anyText },
    payload: { rule: { kind: 'json' } },
  },
} as const

/** The wire form of a recorded origin. */
const terminalSource = {
  kind: 'object',
  fields: {
    owner: { rule: text },
    record: { rule: text },
    revision: { rule: text },
    digest: { rule: text },
  },
} as const

// `cursor` must be present. `direction` and `pageBytes` occur exactly when it is null.
const readHistory = {
  kind: 'one-of',
  rules: [
    {
      kind: 'object',
      fields: {
        tenant: { rule: tenant },
        session: { rule: session },
        cursor: { rule: nothing },
        direction: { rule: { kind: 'literal', values: ['forward', 'backward'] } },
        pageBytes: { rule: { kind: 'page-bytes' } },
      },
    },
    {
      kind: 'object',
      fields: { tenant: { rule: tenant }, session: { rule: session }, cursor: { rule: text } },
    },
  ],
} as const

/** `requested` and `ended` are told apart by the literal `kind`, so the options are disjoint. */
const cancelRunAnswer = {
  kind: 'one-of',
  rules: [
    {
      kind: 'object',
      fields: {
        kind: { rule: { kind: 'literal', values: ['requested'] } },
        controlId: { rule: text },
        run: { rule: text },
      },
    },
    {
      kind: 'object',
      fields: {
        kind: { rule: { kind: 'literal', values: ['ended'] } },
        controlId: { rule: text },
        run: { rule: text },
        terminal: {
          rule: {
            kind: 'object',
            fields: {
              outcome: { rule: { kind: 'literal', values: ['completed', 'failed', 'cancelled'] } },
              source: { rule: terminalSource },
            },
          },
        },
      },
    },
  ],
} as const

const stopCallAnswer = {
  kind: 'one-of',
  rules: [
    {
      kind: 'object',
      fields: {
        kind: { rule: { kind: 'literal', values: ['requested'] } },
        controlId: { rule: text },
        producer: { rule: producer },
      },
    },
    {
      kind: 'object',
      fields: {
        kind: { rule: { kind: 'literal', values: ['ended'] } },
        controlId: { rule: text },
        producer: { rule: producer },
        terminal: {
          rule: {
            kind: 'object',
            fields: {
              version: { rule: text },
              outcome: {
                rule: {
                  kind: 'literal',
                  values: ['completed', 'failed', 'interrupted', 'unavailable', 'no-response'],
                },
              },
              source: { rule: terminalSource },
            },
          },
        },
      },
    },
  ],
} as const

const modelOutput = { rule: { kind: 'literal', values: ['model-output-v1'] } } as const

/** The frames of `observe-session` (RFC-0015 §8 `ObserveSessionFrame`), told apart by `kind`. */
const observeSessionFrame = {
  kind: 'one-of',
  rules: [
    {
      kind: 'object',
      fields: {
        kind: { rule: { kind: 'literal', values: ['state'] } },
        run: { rule: { kind: 'one-of', rules: [text, nothing] } },
        revision: { rule: anyText },
        phase: { rule: { kind: 'one-of', rules: [text, nothing] } },
        target: {
          rule: {
            kind: 'one-of',
            rules: [{ kind: 'object', fields: { projection: modelOutput } }, nothing],
          },
        },
      },
    },
    {
      kind: 'object',
      fields: {
        kind: { rule: { kind: 'literal', values: ['snapshot'] } },
        projection: modelOutput,
        value: { rule: { kind: 'json' } },
      },
    },
    {
      kind: 'object',
      fields: {
        kind: { rule: { kind: 'literal', values: ['delta'] } },
        projection: modelOutput,
        value: { rule: { kind: 'json' } },
      },
    },
    {
      kind: 'object',
      fields: {
        kind: { rule: { kind: 'literal', values: ['gap'] } },
        reason: { rule: { kind: 'literal', values: ['buffer', 'source-history'] } },
      },
    },
    { kind: 'object', fields: { kind: { rule: { kind: 'literal', values: ['refreshing'] } } } },
  ],
} as const

const observeSessionOpen = {
  kind: 'object',
  fields: { tenant: { rule: tenant }, session: { rule: session } },
} as const

/** What a client sends to open `observe-session`. */
export type ObserveSessionOpen = RuleValue<typeof observeSessionOpen>
/** One frame of `observe-session`. */
export type ObserveSessionFrame = RuleValue<typeof observeSessionFrame>

/**
 * `session/v1`: the operations and the observation Session opens to clients. Each body and each
 * outcome body is the one of the `session-public/1` family, except that `create-session` may leave
 * `definition` out. Every operation needs a login; only `create-session` also needs an acting tenant.
 */
export const sessionProtocol = defineProtocol({
  name: 'session',
  major: 1,
  operations: {
    'create-session': {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec({
        kind: 'object',
        fields: {
          createCallId: { rule: text },
          definition: { rule: text, optional: true },
          purpose: { rule: anyText },
        },
      }),
      outcomes: {
        succeeded: ruleCodec({
          kind: 'object',
          fields: { session: { rule: session }, recovered: { rule: boolean } },
        }),
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
      body: ruleCodec({
        kind: 'object',
        fields: { tenant: { rule: tenant }, createCallId: { rule: text } },
      }),
      outcomes: {
        succeeded: ruleCodec({ kind: 'object', fields: { session: { rule: session } } }),
        unknown: true,
      },
      countsAsAccess: true,
    },
    'send-input': {
      identity: 'login',
      effect: 'commit',
      limit: 'input',
      body: ruleCodec({
        kind: 'object',
        fields: {
          tenant: { rule: tenant },
          session: { rule: session },
          acceptId: { rule: text },
          inputId: { rule: text },
          message: { rule: { kind: 'user-message' } },
        },
      }),
      outcomes: {
        succeeded: ruleCodec({ kind: 'object', fields: { recovered: { rule: boolean } } }),
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
      body: ruleCodec({
        kind: 'object',
        fields: { tenant: { rule: tenant }, session: { rule: session }, acceptId: { rule: text } },
      }),
      outcomes: { succeeded: empty, 'not-committed': empty, unknown: true },
      countsAsAccess: true,
    },
    'read-history': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(readHistory),
      outcomes: {
        succeeded: ruleCodec({
          kind: 'object',
          fields: {
            entries: { rule: { kind: 'array', item: historyEntry } },
            // next is sent back as cursor, which is null or non-empty.
            next: { rule: { kind: 'one-of', rules: [text, nothing] } },
            exhausted: { rule: boolean },
            scannedThrough: { rule: anyText },
          },
        }),
        invalid: empty,
      },
      countsAsAccess: true,
    },
    'cancel-run': {
      identity: 'login',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec({
        kind: 'object',
        fields: {
          tenant: { rule: tenant },
          session: { rule: session },
          controlId: { rule: text },
          run: { rule: text },
          urgency: { rule: { kind: 'literal', values: ['graceful', 'force'] } },
        },
      }),
      outcomes: {
        succeeded: ruleCodec(cancelRunAnswer),
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
      body: ruleCodec({
        kind: 'object',
        fields: {
          tenant: { rule: tenant },
          session: { rule: session },
          controlId: { rule: text },
          producer: { rule: producer },
        },
      }),
      outcomes: {
        succeeded: ruleCodec(stopCallAnswer),
        invalid: empty,
        conflict: empty,
        'not-found': empty,
        unsupported: empty,
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
