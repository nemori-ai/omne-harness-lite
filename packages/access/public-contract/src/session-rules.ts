import { empty, type Family, type Rule } from './operation-rules.ts'
import type { SessionOperation, SessionOutcomes } from './session-messages.ts'

const text: Rule = { kind: 'text' }
const tenant: Rule = { kind: 'tenant' }
const session: Rule = { kind: 'session' }

const producer: Rule = {
  kind: 'object',
  fields: {
    kind: { rule: { kind: 'literal', values: ['model', 'tool'] } },
    call: { rule: text },
  },
}

const requests = {
  'create-session': {
    kind: 'object',
    fields: {
      createCallId: { rule: text },
      definition: { rule: text },
      purpose: { rule: { kind: 'string' } },
    },
  },
  'query-create-session': {
    kind: 'object',
    fields: { tenant: { rule: tenant }, createCallId: { rule: text } },
  },
  'send-input': {
    kind: 'object',
    fields: {
      tenant: { rule: tenant },
      session: { rule: session },
      acceptId: { rule: text },
      inputId: { rule: text },
      message: { rule: { kind: 'user-message' } },
    },
  },
  'query-send-input': {
    kind: 'object',
    fields: { tenant: { rule: tenant }, session: { rule: session }, acceptId: { rule: text } },
  },
  // `cursor` must be present. `direction` and `pageBytes` occur exactly when it is null.
  'read-history': {
    kind: 'one-of',
    rules: [
      {
        kind: 'object',
        fields: {
          tenant: { rule: tenant },
          session: { rule: session },
          cursor: { rule: { kind: 'null' } },
          direction: { rule: { kind: 'literal', values: ['forward', 'backward'] } },
          pageBytes: { rule: { kind: 'page-bytes' } },
        },
      },
      {
        kind: 'object',
        fields: { tenant: { rule: tenant }, session: { rule: session }, cursor: { rule: text } },
      },
    ],
  },
  'cancel-run': {
    kind: 'object',
    fields: {
      tenant: { rule: tenant },
      session: { rule: session },
      controlId: { rule: text },
      run: { rule: text },
      urgency: { rule: { kind: 'literal', values: ['graceful', 'force'] } },
    },
  },
  'stop-call': {
    kind: 'object',
    fields: {
      tenant: { rule: tenant },
      session: { rule: session },
      controlId: { rule: text },
      producer: { rule: producer },
    },
  },
  // `cursor` must be present. `run` and `pageBytes` occur exactly when it is null.
  'read-session-diagnostics': {
    kind: 'one-of',
    rules: [
      {
        kind: 'object',
        fields: {
          tenant: { rule: tenant },
          session: { rule: session },
          cursor: { rule: { kind: 'null' } },
          run: { rule: { kind: 'one-of', rules: [text, { kind: 'null' }] } },
          pageBytes: { rule: { kind: 'page-bytes' } },
        },
      },
      {
        kind: 'object',
        fields: { tenant: { rule: tenant }, session: { rule: session }, cursor: { rule: text } },
      },
    ],
  },
} satisfies Readonly<Record<SessionOperation, Rule>>

const anyText: Rule = { kind: 'string' }
// entryId follows message's RecordEntryRef, which is non-empty. revision and kind are plain text.
const historyEntry: Rule = {
  kind: 'object',
  fields: {
    entryId: { rule: text },
    revision: { rule: anyText },
    kind: { rule: anyText },
    payload: { rule: { kind: 'json' } },
  },
}

// The wire form of a recorded origin. Declared here so this package imports no other member.
const terminalSource: Rule = {
  kind: 'object',
  fields: {
    owner: { rule: text },
    record: { rule: text },
    revision: { rule: text },
    digest: { rule: text },
  },
}
const literal = (...values: string[]): Rule => ({ kind: 'literal', values })
/** `requested` and `ended` are told apart by the literal `kind`, so the options are disjoint. */
const controlAnswer = (target: Record<string, { rule: Rule }>, terminal: Rule): Rule => ({
  kind: 'one-of',
  rules: [
    {
      kind: 'object',
      fields: { kind: { rule: literal('requested') }, controlId: { rule: text }, ...target },
    },
    {
      kind: 'object',
      fields: {
        kind: { rule: literal('ended') },
        controlId: { rule: text },
        ...target,
        terminal: { rule: terminal },
      },
    },
  ],
})

// The diagnostics page (SPEC「会话诊断页」). The union members are told apart by a literal `kind`.
const nullable = (rule: Rule): Rule => ({ kind: 'one-of', rules: [rule, { kind: 'null' }] })
const fieldsOf = (fields: Record<string, Rule>): Rule => ({
  kind: 'object',
  fields: Object.fromEntries(Object.entries(fields).map(([key, rule]) => [key, { rule }])),
})
const gapReason = literal(
  'unsupported',
  'unavailable',
  'denied',
  'not-disclosed',
  'not-accepted',
  'not-found',
  'not-recorded',
  'retention-expired',
  'truncated',
)
const unknownValue = fieldsOf({
  kind: literal('unknown'),
  reason: literal(
    'unsupported',
    'unavailable',
    'denied',
    'not-accepted',
    'not-found',
    'not-recorded',
    'retention-expired',
  ),
})
const known = (field: string): Rule => ({
  kind: 'one-of',
  rules: [
    fieldsOf({ kind: literal('known'), [field]: text }),
    fieldsOf({ kind: literal('unknown') }),
  ],
})
const adoptionRef = fieldsOf({ owner: text, name: text, revision: text, digest: text })
/** A closed set, or an `unknown` with its reason. A literal and an object are disjoint. */
const closedOrUnknown = (...values: string[]): Rule => ({
  kind: 'one-of',
  rules: [literal(...values), unknownValue],
})
const runCause: Rule = {
  kind: 'one-of',
  rules: [
    unknownValue,
    fieldsOf({ kind: literal('none') }),
    fieldsOf({ kind: literal('no-failure'), conclusion: literal('complete', 'fail', 'cancelled') }),
    fieldsOf({
      kind: literal('model-refused'),
      failure: closedOrUnknown('denied', 'invalid', 'unsupported', 'capacity'),
    }),
    fieldsOf({ kind: literal('no-reply'), cause: nullable(text), upstreamStatus: nullable(text) }),
    fieldsOf({ kind: literal('request-rejected') }),
    fieldsOf({ kind: literal('cannot-fit'), reason: closedOrUnknown('fixed', 'after-compaction') }),
    fieldsOf({ kind: literal('compaction-invalid') }),
    fieldsOf({ kind: literal('message-rejected') }),
    fieldsOf({ kind: literal('extension-stop') }),
    fieldsOf({ kind: literal('guard') }),
  ],
}
const runControl = fieldsOf({
  position: text,
  kind: literal('requested', 'progress'),
  target: nullable(literal('run', 'producer', 'session')),
  intent: nullable(literal('control', 'interrupt', 'auto-archive')),
  state: nullable(literal('committed', 'propagating', 'reconciled')),
})
const amountState = literal('unknown', 'known', 'provisional')
const accountView = fieldsOf({
  kind: literal('account'),
  usage: {
    kind: 'array',
    item: fieldsOf({ name: text, unit: anyText, state: amountState, lexeme: nullable(text) }),
  },
  cost: {
    kind: 'array',
    item: fieldsOf({ source: text, unit: anyText, state: amountState, lexeme: nullable(text) }),
  },
  duration: known('value'),
  receipt: literal('received', 'late'),
})
const accountOrUnknown: Rule = { kind: 'one-of', rules: [accountView, unknownValue] }
const attempt = fieldsOf({
  dispatch: text,
  revision: text,
  adapter: adoptionRef,
  send: literal('not-sent', 'sent', 'unknown'),
  firstContent: literal('none-proven', 'observed', 'uncertain'),
  outcome: {
    kind: 'one-of',
    rules: [
      fieldsOf({ kind: literal('pending') }),
      fieldsOf({
        kind: literal('completed'),
        reason: literal('stop', 'limit', 'tool-suggestions'),
      }),
      fieldsOf({ kind: literal('interrupted') }),
      fieldsOf({ kind: literal('failed'), cause: text, upstreamStatus: nullable(text) }),
    ],
  },
  timing: fieldsOf({
    materialize: known('milliseconds'),
    sendToFirstContent: known('milliseconds'),
    execution: known('milliseconds'),
  }),
  account: accountOrUnknown,
})
// Counts are decimal texts, checked as non-empty text like every other count of the page.
const counted: Rule = { kind: 'array', item: fieldsOf({ kind: text, count: text }) }
const modelCall = fieldsOf({
  reference: text,
  purpose: text,
  call: {
    kind: 'one-of',
    rules: [
      fieldsOf({
        kind: literal('found'),
        call: text,
        phase: literal('accepted', 'running', 'retry-decision', 'settled'),
      }),
      unknownValue,
    ],
  },
  dispatches: { kind: 'array', item: attempt },
  coverage: literal('complete-through-snapshot', 'expired-prefix', 'unknown'),
  facts: counted,
})
// Tool's `DiagnosticPage` gives `phase` and `code` as plain strings, which can be empty.
const toolDiagnosticEntry = fieldsOf({ operation: text, phase: anyText, code: anyText })
const toolCall = fieldsOf({
  reference: text,
  state: {
    kind: 'one-of',
    rules: [
      fieldsOf({
        kind: literal('found'),
        call: text,
        phase: literal(
          'accepted',
          'preparing',
          'queued',
          'starting',
          'running',
          'suspended',
          'settled',
        ),
        relation: literal('foreground', 'background'),
        terminal: nullable(
          fieldsOf({
            kind: literal('completed', 'failed', 'unavailable', 'interrupted', 'no-response'),
            cause: nullable(text),
          }),
        ),
      }),
      unknownValue,
    ],
  },
  account: accountOrUnknown,
  facts: counted,
  // An array and an object are disjoint.
  diagnostics: {
    kind: 'one-of',
    rules: [{ kind: 'array', item: toolDiagnosticEntry }, unknownValue],
  },
})
const runAttempts = fieldsOf({
  started: text,
  released: fieldsOf({
    ended: text,
    bounded: text,
    cancelled: text,
    released: text,
    superseded: text,
  }),
  exited: text,
})
const runDiagnostic = fieldsOf({
  run: text,
  entry: literal('interactive', 'dispatch'),
  execution: text,
  started: fieldsOf({ position: text, at: known('instant') }),
  attempts: runAttempts,
  controls: { kind: 'array', item: runControl },
  terminal: nullable(
    fieldsOf({
      outcome: literal('completed', 'failed', 'cancelled'),
      cause: fieldsOf({ record: nullable(text), structured: runCause }),
    }),
  ),
  calls: fieldsOf({ registered: text, projected: text }),
  modelCalls: { kind: 'array', item: modelCall },
  toolCalls: { kind: 'array', item: toolCall },
  messages: counted,
  facts: counted,
})
const diagnosticsPage = fieldsOf({
  runs: { kind: 'array', item: runDiagnostic },
  next: nullable(text),
  exhausted: { kind: 'boolean' },
  scannedThrough: anyText,
  basis: fieldsOf({ upper: anyText }),
  gaps: {
    kind: 'array',
    item: fieldsOf({
      source: literal('session', 'agent', 'model', 'tool'),
      subject: text,
      reason: gapReason,
    }),
  },
})

const successes = {
  'create-session': {
    kind: 'object',
    fields: { session: { rule: session }, recovered: { rule: { kind: 'boolean' } } },
  },
  'query-create-session': { kind: 'object', fields: { session: { rule: session } } },
  'send-input': { kind: 'object', fields: { recovered: { rule: { kind: 'boolean' } } } },
  'query-send-input': empty,
  'read-history': {
    kind: 'object',
    fields: {
      entries: { rule: { kind: 'array', item: historyEntry } },
      // next is sent back as cursor, which is null or non-empty.
      next: { rule: { kind: 'one-of', rules: [text, { kind: 'null' }] } },
      exhausted: { rule: { kind: 'boolean' } },
      scannedThrough: { rule: anyText },
    },
  },
  'cancel-run': controlAnswer(
    { run: { rule: text } },
    {
      kind: 'object',
      fields: {
        outcome: { rule: literal('completed', 'failed', 'cancelled') },
        source: { rule: terminalSource },
      },
    },
  ),
  'stop-call': controlAnswer(
    { producer: { rule: producer } },
    {
      kind: 'object',
      fields: {
        version: { rule: text },
        outcome: {
          rule: literal('completed', 'failed', 'interrupted', 'unavailable', 'no-response'),
        },
        source: { rule: terminalSource },
      },
    },
  ),
  'read-session-diagnostics': diagnosticsPage,
} satisfies Readonly<Record<SessionOperation, Rule>>

const outcomes = {
  'create-session': ['succeeded', 'denied', 'invalid', 'conflict', 'basis-unavailable', 'unknown'],
  'query-create-session': ['succeeded', 'denied', 'basis-unavailable', 'unknown'],
  'send-input': [
    'succeeded',
    'denied',
    'invalid',
    'archived',
    'frozen',
    'conflict',
    'basis-unavailable',
    'unknown',
  ],
  'query-send-input': ['succeeded', 'not-committed', 'denied', 'basis-unavailable', 'unknown'],
  'read-history': ['succeeded', 'denied', 'invalid', 'basis-unavailable'],
  'cancel-run': [
    'succeeded',
    'denied',
    'invalid',
    'conflict',
    'not-found',
    'basis-unavailable',
    'unknown',
  ],
  'stop-call': [
    'succeeded',
    'denied',
    'invalid',
    'conflict',
    'not-found',
    'basis-unavailable',
    'unknown',
    'unsupported',
  ],
  'read-session-diagnostics': ['succeeded', 'denied', 'invalid', 'basis-unavailable'],
} as const satisfies { readonly [O in SessionOperation]: readonly SessionOutcomes[O][] }

/** Fails to compile when an outcome of `SessionOutcomes` is missing from the table above. */
type MissingOutcomes = {
  readonly [O in SessionOperation]: Exclude<SessionOutcomes[O], (typeof outcomes)[O][number]>
}[SessionOperation]
type OutcomesComplete<Missing extends never> = Missing
export type SessionOutcomeTableComplete = OutcomesComplete<MissingOutcomes>

function isSessionOperation(value: unknown): value is SessionOperation {
  return typeof value === 'string' && Object.hasOwn(requests, value)
}

export const sessionFamily: Family<'session-public/1', SessionOperation, never> = {
  version: 'session-public/1',
  error: 'Invalid session codec arguments',
  stages: [],
  isProvided: isSessionOperation,
  requestRule: operation => ({
    body: requests[operation],
    proof: true,
    tenant: operation === 'create-session',
  }),
  responseRule: (operation, outcome) => {
    const allowed: readonly string[] = outcomes[operation]
    if (!allowed.includes(outcome)) return undefined
    return outcome === 'succeeded' ? successes[operation] : empty
  },
}
