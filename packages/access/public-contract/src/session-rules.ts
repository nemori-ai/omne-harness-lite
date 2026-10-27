import { empty, type Family, type Rule } from './operation-rules.ts'
import type { SessionOperation, SessionOutcomes } from './session-messages.ts'

const text: Rule = { kind: 'text' }
const tenant: Rule = { kind: 'tenant' }
const session: Rule = { kind: 'session' }

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
