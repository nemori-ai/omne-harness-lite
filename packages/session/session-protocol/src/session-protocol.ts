import { defineProtocol, ruleCodec, type Rule, type RuleValue } from '@omne-harness/public-contract'

// The rule texts are copied from the `session-public/1` family of the public contract
// (`session-rules.ts`), so that Session owns them. That copy goes with the run that removes the
// old family. The rules stay literals: the value types come from them through `RuleValue`.

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

/** Every operation but `create-session` names its target tenant in the body, not in the envelope. */
const target = { tenant: { rule: tenant }, session: { rule: session } } as const

const producer = object({ kind: { rule: literal('model', 'tool') }, call: { rule: text } })
const terminalSource = object({
  owner: { rule: text },
  record: { rule: text },
  revision: { rule: text },
  digest: { rule: text },
})

/** `requested` and `ended` differ in the literal `kind`, so the two options are disjoint. */
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

// RFC-0015「列出会话」. `cursor` is the `next` of the page before, or null for the first page. Without
// `limit` the deployment's default applies; without `includeArchived` archived sessions are left out.
const listSessions = object({
  tenant: { rule: tenant },
  cursor: { rule: nullable(text) },
  limit: { rule: { kind: 'positive-integer' }, optional: true },
  includeArchived: { rule: boolean, optional: true },
})

// A session list is a projection, most recent activity first. The two instants are null for a
// session that was created before commit times were recorded; `title` is null until the session has
// a user message with text. `partial` means the page reached the row bound of one read.
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

// The first page has a null `cursor` with `direction` and `pageBytes`; a later page has only the cursor.
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

// entryId is a non-empty RecordEntryRef. Two axes appear here as opaque decimal text and never
// compare with each other (SPEC.md「会话修订号与读历史」): a session revision (an entry's
// `revision`, the page's `upper`, a state frame's `revision`) and a scan position (`scannedThrough`).
const historyPage = object({
  // The session revision this traversal is pinned to: the same on every page of one cursor chain.
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

/** The opening body of `observe-session` (RFC-0015 §8 `ObserveSessionOpen`). */
export type ObserveSessionOpen = RuleValue<typeof observeSessionOpen>
/** One frame of `observe-session` (RFC-0015 §8 `ObserveSessionFrame`). */
export type ObserveSessionFrame = RuleValue<typeof observeSessionFrame>

/** `session/v1`. SPEC.md gives the operation table and the four differences from `session-public/1`. */
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
      // A read, but it can find that the create it asks about has no known result.
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
    'query-send-input': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(object({ ...target, acceptId: { rule: text } })),
      // A read, but it can find that the input it asks about has no known result.
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
        object({ ...target, controlId: { rule: text }, producer: { rule: producer } }),
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
