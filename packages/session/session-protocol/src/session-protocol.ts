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
const workspaceTarget = object({ workspace: { rule: text }, instance: { rule: text } })
const limited = ruleCodec(
  object({
    resource: { rule: literal('pending-inputs', 'input-bytes') },
    limit: { rule: { kind: 'positive-integer' } },
  }),
)

const instant = { kind: 'instant' } as const
const relation = literal('main', 'child', 'handoff')
const attendance = literal('attended', 'unattended')
const page = {
  tenant: { rule: tenant },
  cursor: { rule: nullable(text) },
  limit: { rule: { kind: 'positive-integer' }, optional: true },
  relation: { rule: nullable(relation), optional: true },
  parent: { rule: nullable(session), optional: true },
  attendance: { rule: nullable(attendance), optional: true },
  definition: { rule: nullable(text), optional: true },
} as const
const listSessions = object(page)
// The archived list narrows by archive time (from inclusive, to exclusive), by how, by title text.
const listArchivedSessions = object({
  ...page,
  from: { rule: nullable(instant), optional: true },
  to: { rule: nullable(instant), optional: true },
  by: { rule: nullable(literal('person', 'auto', 'parent')), optional: true },
  titleContains: { rule: nullable(anyText), optional: true },
})

// What a session is to others. A server that does not know these yet leaves them out, so each is optional.
const standing = {
  relation: { rule: relation, optional: true },
  parent: { rule: nullable(session), optional: true },
  origin: { rule: nullable(session), optional: true },
  root: { rule: session, optional: true },
  depth: { rule: { kind: 'count' }, optional: true },
  attendance: { rule: attendance, optional: true },
  definition: { rule: text, optional: true },
} as const
const sessionItem = {
  session: { rule: session },
  createdAt: { rule: nullable(instant) },
  lastActivityAt: { rule: nullable(instant) },
  lifecycle: { rule: literal('initializing', 'dormant', 'active', 'frozen', 'archived') },
  title: { rule: nullable(anyText) },
  ...standing,
} as const
const listOf = <const F extends Fields>(item: F) =>
  object({
    sessions: { rule: { kind: 'array', item: object(item) } },
    next: { rule: nullable(text) },
    completeness: { rule: literal('complete', 'partial') },
  })
const sessionList = listOf(sessionItem)
const archivedList = listOf({
  ...sessionItem,
  archivedAt: { rule: nullable(instant) },
  archivedBy: { rule: nullable(literal('person', 'auto', 'parent')) },
})

// Archiving an archived session, or unarchiving one that is not, answers so; it is not refused.
const archiveAnswer = {
  kind: 'one-of',
  rules: [
    object({
      kind: { rule: literal('archived') },
      controlId: { rule: text },
      runs: { rule: { kind: 'count' } },
      backgroundCalls: { rule: { kind: 'count' } },
    }),
    object({ kind: { rule: literal('already-archived') }, controlId: { rule: text } }),
  ],
} as const
const unarchiveAnswer = object({
  kind: { rule: literal('unarchived', 'not-archived') },
  controlId: { rule: text },
})

// The permission handling mode now, with the permission revision it stands at.
const permissionModeValue = literal('never', 'auto_permission', 'bypass-permissions')
const permissionMode = object({
  mode: { rule: permissionModeValue },
  revision: { rule: text },
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

const position = { kind: 'revision' } as const
const run = { rule: text } as const
const pendingInput = object({
  input: { rule: text },
  position: { rule: position },
  source: { rule: object({ name: { rule: text }, label: { rule: text } }) },
  role: { rule: literal('user', 'system_reminder') },
  wakes: { rule: boolean },
  preview: { rule: anyText },
})
const readPending = object({
  ...target,
  after: { rule: nullable(position) },
  limit: { rule: { kind: 'page-limit' } },
})
const pendingPage = object({
  inputs: { rule: { kind: 'array', item: pendingInput } },
  next: { rule: nullable(position) },
})
const waitingCalls = object({
  calls: {
    rule: {
      kind: 'array',
      item: object({
        card: { rule: terminalSource },
        action: { rule: nullable(text) },
        passage: { rule: text },
        position: { rule: text },
        run: { rule: nullable(text) },
      }),
    },
  },
})
const SEARCHABLE_KINDS = [
  'message.user',
  'message.assistant',
  'message.tool',
  'message.system_reminder',
  'message.tool_internal',
  'message.compaction',
] as const
const searchHistory = object({
  tenant: { rule: tenant },
  sessions: { rule: nullable({ kind: 'array', item: session, max: 64 }), optional: true },
  archived: { rule: literal('unarchived', 'archived', 'all'), optional: true },
  from: { rule: nullable(instant), optional: true },
  to: { rule: nullable(instant), optional: true },
  kinds: { rule: { kind: 'array', item: literal(...SEARCHABLE_KINDS), max: 6 }, optional: true },
  modelReadable: { rule: literal('only', 'any'), optional: true },
  content: {
    rule: {
      kind: 'one-of',
      rules: [
        object({
          kind: { rule: literal('literals') },
          all: { rule: { kind: 'array', item: anyText, nonempty: true, max: 8 } },
          caseSensitive: { rule: boolean },
        }),
        object({
          kind: { rule: literal('regex') },
          pattern: { rule: anyText },
          caseSensitive: { rule: boolean },
        }),
      ],
    },
  },
  cursor: { rule: nullable(text) },
  limit: { rule: { kind: 'positive-integer' }, optional: true },
})
const searchHit = object({
  session: { rule: session },
  position: { rule: text },
  kind: { rule: literal(...SEARCHABLE_KINDS) },
  at: { rule: nullable(instant) },
  snippet: {
    rule: object({ before: { rule: anyText }, match: { rule: anyText }, after: { rule: anyText } }),
  },
})
const searchPage = object({
  hits: { rule: { kind: 'array', item: searchHit } },
  next: { rule: nullable(text) },
  complete: { rule: boolean },
  incomplete: {
    rule: nullable(
      object({
        reason: { rule: literal('budget', 'tail-budget', 'rebuilding') },
        behind: { rule: { kind: 'count' } },
        progress: {
          rule: nullable(
            object({ indexed: { rule: { kind: 'count' } }, total: { rule: { kind: 'count' } } }),
          ),
        },
      }),
    ),
  },
})
const searchInvalid = object({
  field: { rule: literal('query', 'cursor', 'limit') },
  reason: { rule: text },
})
const inputFate = object({
  fate: {
    rule: {
      kind: 'one-of',
      rules: [
        object({ kind: { rule: literal('pending') }, returnedFrom: { rule: nullable(text) } }),
        object({ kind: { rule: literal('taken') }, run }),
        object({
          kind: { rule: literal('answered') },
          run,
          terminal: { rule: literal('active', 'completed', 'failed', 'cancelled') },
        }),
        object({
          kind: { rule: literal('settled') },
          by: { rule: literal('cancelled', 'archived', 'frozen') },
          run: { rule: nullable(text) },
        }),
        object({ kind: { rule: literal('refused') }, reason: { rule: anyText } }),
      ],
    },
  },
})

const modelOutput = { rule: literal('model-output-v1') } as const
const projected = <const K extends string>(kind: K) =>
  object({ kind: { rule: literal(kind) }, projection: modelOutput, value: { rule: json } })

const observeSessionOpen = object(target)
// How far the real dispatches of the main call got, as the Model states it.
const dispatchProgress = object({
  allowed: { rule: { kind: 'count' } },
  made: { rule: { kind: 'count' } },
  last: {
    rule: nullable(object({ cause: { rule: text }, upstreamStatus: { rule: nullable(text) } })),
  },
  notBefore: { rule: nullable(text) },
})
const observeSessionFrame = {
  kind: 'one-of',
  rules: [
    object({
      kind: { rule: literal('state') },
      run: { rule: nullable(text) },
      revision: { rule: anyText },
      phase: { rule: nullable(text) },
      attempts: { rule: dispatchProgress, optional: true },
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

const blockPosition = object({ message: { rule: text }, block: { rule: text } })

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
          model: { rule: text, optional: true },
          workspace: { rule: workspaceTarget, optional: true },
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
    'read-pending': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(readPending),
      outcomes: { succeeded: ruleCodec(pendingPage), invalid: empty },
      countsAsAccess: true,
    },
    'read-waiting-calls': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(object(target)),
      outcomes: { succeeded: ruleCodec(waitingCalls), invalid: empty },
      countsAsAccess: true,
    },
    'read-input-fate': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(object({ ...target, inputId: { rule: text } })),
      outcomes: { succeeded: ruleCodec(inputFate), invalid: empty },
      countsAsAccess: true,
    },
    'search-history': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(searchHistory),
      outcomes: {
        succeeded: ruleCodec(searchPage),
        invalid: ruleCodec(searchInvalid),
        limited: empty,
      },
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
    'list-archived-sessions': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(listArchivedSessions),
      outcomes: { succeeded: ruleCodec(archivedList), invalid: empty },
      countsAsAccess: true,
    },
    'archive-session': {
      identity: 'login',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(object({ ...target, controlId: { rule: text } })),
      outcomes: { succeeded: ruleCodec(archiveAnswer), invalid: empty, conflict: empty },
      countsAsAccess: true,
    },
    'unarchive-session': {
      identity: 'login',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(object({ ...target, controlId: { rule: text } })),
      outcomes: { succeeded: ruleCodec(unarchiveAnswer), invalid: empty, conflict: empty },
      countsAsAccess: true,
    },
    'read-permission-mode': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(object(target)),
      outcomes: { succeeded: ruleCodec(permissionMode), invalid: empty },
      countsAsAccess: true,
    },
    'change-permission-mode': {
      identity: 'login',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(
        object({
          ...target,
          mode: { rule: permissionModeValue },
          expectedRevision: { rule: text },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(permissionMode),
        'no-change': ruleCodec(permissionMode),
        conflict: empty,
        invalid: empty,
      },
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
    'select-model': {
      identity: 'login',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(object({ ...target, controlId: { rule: text }, model: { rule: text } })),
      outcomes: {
        succeeded: ruleCodec(
          object({
            controlId: { rule: text },
            model: { rule: text },
            credential: { rule: literal('available', 'missing', 'unknown') },
          }),
        ),
        invalid: ruleCodec(
          object({
            reason: {
              rule: literal('unknown-name', 'withdrawn', 'excluded', 'modality', 'locked', 'scope'),
            },
            blocks: { rule: { kind: 'array', item: blockPosition, max: 16 }, optional: true },
          }),
        ),
        archived: empty,
        frozen: empty,
        'not-found': empty,
        conflict: empty,
      },
      countsAsAccess: true,
    },
    'select-workspace': {
      identity: 'login',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(
        object({
          ...target,
          controlId: { rule: text },
          workspace: { rule: nullable(workspaceTarget) },
        }),
      ),
      outcomes: {
        succeeded: ruleCodec(
          object({ controlId: { rule: text }, directory: { rule: nullable(text) } }),
        ),
        invalid: ruleCodec(
          object({ reason: { rule: literal('not-permitted', 'instance-unavailable') } }),
        ),
        archived: empty,
        frozen: empty,
        'not-found': empty,
        conflict: empty,
      },
      countsAsAccess: true,
    },
    'read-model-selection': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(object(target)),
      outcomes: {
        succeeded: ruleCodec(object({ model: { rule: text }, revision: { rule: anyText } })),
        invalid: empty,
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
