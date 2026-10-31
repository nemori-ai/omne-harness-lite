import { describe, expect, it } from 'vitest'
import {
  POSITION_OUTPUTS,
  judgeExtensionOutput,
  type ExtensionOutputJudgeInput,
  type Position,
  type PositionOutputKey,
  type Subject,
} from '@omne-harness/agent-contract'

type Kind = 'observed' | 'inject' | 'rewrite' | 'select_model' | 'veto' | 'stop' | 'retry' | 'ask'
type Power = 'observe' | 'rewrite' | 'veto'

const KINDS: readonly Kind[] = [
  'observed',
  'inject',
  'rewrite',
  'select_model',
  'veto',
  'stop',
  'retry',
  'ask',
]

/*
 * The position output table of docs/public-api/extensions.md, copied as data: the allowed column,
 * then the `observe`, `rewrite` and `veto` columns of each row.
 */
const TABLE: Readonly<
  Record<
    PositionOutputKey,
    Readonly<{ allowed: readonly Kind[]; effective: Readonly<Record<Power, readonly Kind[]>> }>
  >
> = {
  execution_started: {
    allowed: ['observed', 'inject', 'stop', 'ask'],
    effective: {
      observe: ['observed'],
      rewrite: ['observed', 'inject'],
      veto: ['observed', 'inject', 'stop', 'ask'],
    },
  },
  before_compaction: {
    allowed: ['observed', 'inject', 'veto', 'stop', 'ask'],
    effective: {
      observe: ['observed'],
      rewrite: ['observed', 'inject'],
      veto: ['observed', 'inject', 'veto', 'stop', 'ask'],
    },
  },
  after_compaction: {
    allowed: ['observed', 'inject', 'stop', 'ask'],
    effective: {
      observe: ['observed'],
      rewrite: ['observed', 'inject'],
      veto: ['observed', 'inject', 'stop', 'ask'],
    },
  },
  'before_model_call/main': {
    allowed: ['observed', 'inject', 'rewrite', 'select_model', 'veto', 'stop', 'ask'],
    effective: {
      observe: ['observed'],
      rewrite: ['observed', 'inject', 'rewrite', 'select_model'],
      veto: ['observed', 'inject', 'rewrite', 'select_model', 'veto', 'stop', 'ask'],
    },
  },
  'before_model_call/compaction': {
    allowed: ['observed', 'veto', 'stop', 'ask'],
    effective: {
      observe: ['observed'],
      rewrite: ['observed'],
      veto: ['observed', 'veto', 'stop', 'ask'],
    },
  },
  'after_model_call/complete_reply': {
    allowed: ['observed', 'inject', 'stop', 'ask'],
    effective: {
      observe: ['observed'],
      rewrite: ['observed', 'inject'],
      veto: ['observed', 'inject', 'stop', 'ask'],
    },
  },
  'after_model_call/failure': {
    allowed: ['observed', 'inject', 'stop', 'retry', 'ask'],
    effective: {
      observe: ['observed'],
      rewrite: ['observed', 'inject', 'retry'],
      veto: ['observed', 'inject', 'stop', 'retry', 'ask'],
    },
  },
  before_action: {
    allowed: ['observed', 'inject', 'rewrite', 'veto', 'stop', 'ask'],
    effective: {
      observe: ['observed'],
      rewrite: ['observed', 'inject', 'rewrite'],
      veto: ['observed', 'inject', 'rewrite', 'veto', 'stop', 'ask'],
    },
  },
  'after_action/each': {
    allowed: ['observed', 'inject', 'rewrite', 'stop', 'ask'],
    effective: {
      observe: ['observed'],
      rewrite: ['observed', 'inject', 'rewrite'],
      veto: ['observed', 'inject', 'rewrite', 'stop', 'ask'],
    },
  },
  'after_action/batch': {
    allowed: ['observed', 'inject', 'stop', 'ask'],
    effective: {
      observe: ['observed'],
      rewrite: ['observed', 'inject'],
      veto: ['observed', 'inject', 'stop', 'ask'],
    },
  },
  before_terminal: {
    allowed: ['observed', 'inject', 'veto', 'stop', 'ask'],
    effective: {
      observe: ['observed'],
      rewrite: ['observed', 'inject'],
      veto: ['observed', 'inject', 'veto', 'stop', 'ask'],
    },
  },
  after_terminal: {
    allowed: ['observed'],
    effective: { observe: ['observed'], rewrite: ['observed'], veto: ['observed'] },
  },
}

type Where = Pick<ExtensionOutputJudgeInput, 'position' | 'dimension' | 'purpose' | 'trigger'>

const WHERE: Readonly<Record<PositionOutputKey, Where>> = {
  execution_started: {
    position: 'execution_started',
    dimension: null,
    purpose: null,
    trigger: null,
  },
  before_compaction: {
    position: 'before_compaction',
    dimension: null,
    purpose: null,
    trigger: null,
  },
  after_compaction: { position: 'after_compaction', dimension: null, purpose: null, trigger: null },
  'before_model_call/main': {
    position: 'before_model_call',
    dimension: null,
    purpose: 'main',
    trigger: null,
  },
  'before_model_call/compaction': {
    position: 'before_model_call',
    dimension: null,
    purpose: 'compaction',
    trigger: null,
  },
  'after_model_call/complete_reply': {
    position: 'after_model_call',
    dimension: { ending: 'complete_reply' },
    purpose: 'main',
    trigger: null,
  },
  'after_model_call/failure': {
    position: 'after_model_call',
    dimension: { ending: 'failure' },
    purpose: 'main',
    trigger: 'first-content',
  },
  before_action: { position: 'before_action', dimension: null, purpose: null, trigger: null },
  'after_action/each': {
    position: 'after_action',
    dimension: { scope: 'each' },
    purpose: null,
    trigger: null,
  },
  'after_action/batch': {
    position: 'after_action',
    dimension: { scope: 'batch' },
    purpose: null,
    trigger: null,
  },
  before_terminal: { position: 'before_terminal', dimension: null, purpose: null, trigger: null },
  after_terminal: { position: 'after_terminal', dimension: null, purpose: null, trigger: null },
}

const ROWS = Object.keys(TABLE) as PositionOutputKey[]

const message = {
  id: 'msg_aaaaaaaaaaaaaaaaaaaaaa',
  role: 'tool',
  blocks: [{ kind: 'text', text: 'result' }],
}

const SUBJECTS: Readonly<Record<PositionOutputKey, Record<string, unknown>>> = {
  execution_started: { execution: 'exec-1', conditions: { owner: 'o' } },
  before_compaction: { preparation: { kind: 'needs-compaction', plan: 'p' } },
  after_compaction: { transition: { kind: 'committed' } },
  'before_model_call/main': {
    purpose: 'main',
    preparation: {
      kind: 'assembled',
      id: 'prep-1',
      input: {
        system: [{ kind: 'text', text: 'system' }],
        messages: [message],
        tools: [],
        toolChoice: 'auto',
        parameters: [],
        fixed: 'keep',
      },
    },
  },
  'before_model_call/compaction': { purpose: 'compaction', step: { kind: 'ready' }, progress: {} },
  'after_model_call/complete_reply': { purpose: 'main', call: 'call-1', reply: message },
  'after_model_call/failure': { purpose: 'main', call: 'call-1', fault: { kind: 'fault' } },
  before_action: {
    action: 'action-1',
    original: { kind: 'tool_call', name: 'read' },
    effectiveArguments: '{"path":"a"}',
    definition: { name: 'read' },
    batch: ['action-1'],
  },
  'after_action/each': {
    action: 'action-1',
    outcome: { kind: 'executed', terminal: 'done' },
    candidate: message,
  },
  'after_action/batch': { batch: 'batch-1', outcomes: [] },
  before_terminal: { proposed: { kind: 'completed' }, basis: { owner: 'o' } },
  after_terminal: { terminal: { kind: 'completed' }, disposition: { owner: 'o' } },
}

const reminder = {
  id: 'msg_bbbbbbbbbbbbbbbbbbbbbb',
  role: 'system_reminder',
  blocks: [{ kind: 'text', text: 'remember' }],
}

const adoption = { owner: 'owner', name: 'name', revision: '1', digest: 'sha256:abc' }

const supplier = {
  adoption,
  recipient: 'recipient',
  model: 'model',
  credential: { kind: 'factory' },
}

const card = {
  explanation: 'why',
  options: [
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No', effect: { kind: 'string', value: 'declined' } },
  ],
  about: { position: 'before_action', action: 'action-1' },
  proposedRewrite: { option: 'yes', effectiveArguments: '{}' },
}

/** The subject after the one rewrite that the row allows, or an unchanged copy where none is allowed. */
function rewrittenSubject(row: PositionOutputKey): Record<string, unknown> {
  const subject = structuredClone(SUBJECTS[row])
  if (row === 'before_model_call/main') {
    const preparation = subject.preparation as { input: Record<string, unknown> }
    preparation.input.messages = [message, reminder]
    preparation.input.parameters = [{ kind: 'temperature', value: 0.2 }]
  }
  if (row === 'before_action') subject.effectiveArguments = '{"path":"b"}'
  if (row === 'after_action/each') {
    subject.candidate = { ...message, blocks: [{ kind: 'text', text: 'trimmed' }] }
  }
  return subject
}

function sampleOutput(kind: Kind, row: PositionOutputKey): unknown {
  switch (kind) {
    case 'observed':
      return { kind }
    case 'inject':
      return { kind, message: reminder }
    case 'rewrite':
      return { kind, subject: rewrittenSubject(row) }
    case 'select_model':
      return { kind, route: 'fast', reason: 'cheaper' }
    case 'veto':
      return { kind, reason: 'not allowed' }
    case 'stop':
      return { kind, terminal: 'failed', reason: 'enough' }
    case 'retry':
      return { kind, plan: { supplier, notBefore: null, basis: adoption } }
    case 'ask':
      return { kind, card }
  }
}

/*
 * The fixtures are plain data whose shape the judgment only compares and forwards, so they are
 * not built as real `Subject` values. The one assertion below is where they enter the typed input.
 */
type FixtureOverrides = Partial<Omit<ExtensionOutputJudgeInput, 'subject'>> &
  Readonly<{ subject?: Record<string, unknown> }>

function inputFor(
  row: PositionOutputKey,
  power: Power,
  output: unknown,
  overrides: FixtureOverrides = {},
): ExtensionOutputJudgeInput {
  const { subject = SUBJECTS[row], ...rest } = overrides
  return { ...WHERE[row], power, subject: subject as Subject, output, ...rest }
}

function reasonOf(judged: ReturnType<typeof judgeExtensionOutput>): string {
  return judged.kind === 'refused' ? judged.reason : 'accepted'
}

describe('the position output table', () => {
  it('is exported as data that matches the design table and cannot be edited', () => {
    expect(Object.keys(POSITION_OUTPUTS).sort()).toEqual([...ROWS].sort())
    for (const row of ROWS) {
      expect(POSITION_OUTPUTS[row].allowed, row).toEqual(TABLE[row].allowed)
    }
    expect(POSITION_OUTPUTS['before_model_call/main'].rewritable).toEqual([
      ['preparation', 'input', 'system'],
      ['preparation', 'input', 'messages'],
      ['preparation', 'input', 'tools'],
      ['preparation', 'input', 'toolChoice'],
      ['preparation', 'input', 'parameters'],
    ])
    expect(POSITION_OUTPUTS.before_action.rewritable).toEqual([['effectiveArguments']])
    expect(POSITION_OUTPUTS['after_action/each'].rewritable).toEqual([['candidate', 'blocks']])
    for (const row of ROWS) {
      if (!['before_model_call/main', 'before_action', 'after_action/each'].includes(row)) {
        expect(POSITION_OUTPUTS[row].rewritable, row).toEqual([])
      }
    }
    expect(Object.isFrozen(POSITION_OUTPUTS)).toBe(true)
    expect(Object.isFrozen(POSITION_OUTPUTS.before_action)).toBe(true)
    expect(Object.isFrozen(POSITION_OUTPUTS.before_action.allowed)).toBe(true)
  })

  for (const row of ROWS) {
    for (const power of ['observe', 'rewrite', 'veto'] as const) {
      it(`${row} with power ${power} allows exactly its cell and names the refusal`, () => {
        for (const kind of KINDS) {
          const judged = judgeExtensionOutput(inputFor(row, power, sampleOutput(kind, row)))
          const cell = TABLE[row]
          if (cell.effective[power].includes(kind)) {
            expect(judged, kind).toMatchObject({ kind: 'accepted', value: { kind } })
            continue
          }
          const word = !cell.allowed.includes(kind)
            ? kind === 'ask'
              ? 'ask_at_forbidden_position'
              : 'output_not_allowed_at_position'
            : 'output_not_allowed_for_power'
          expect(reasonOf(judged), kind).toBe(word)
        }
      })
    }
  }
})

describe('the first-content trigger of retry', () => {
  const retry = sampleOutput('retry', 'after_model_call/failure')

  it('accepts retry for the trigger before first content', () => {
    expect(judgeExtensionOutput(inputFor('after_model_call/failure', 'veto', retry))).toMatchObject(
      {
        kind: 'accepted',
        value: { kind: 'retry' },
      },
    )
  })

  it('refuses retry for the final trigger and for an absent trigger', () => {
    for (const trigger of ['final', null] as const) {
      expect(
        reasonOf(
          judgeExtensionOutput(inputFor('after_model_call/failure', 'veto', retry, { trigger })),
        ),
        String(trigger),
      ).toBe('output_not_allowed_at_position')
    }
  })

  it('refuses retry at a row that has no failure ending whatever the trigger', () => {
    expect(
      reasonOf(
        judgeExtensionOutput(
          inputFor('after_model_call/complete_reply', 'veto', retry, { trigger: 'first-content' }),
        ),
      ),
    ).toBe('output_not_allowed_at_position')
  })

  it('does not let the final trigger limit the outputs other than retry', () => {
    expect(
      judgeExtensionOutput(
        inputFor(
          'after_model_call/failure',
          'veto',
          { kind: 'stop', reason: 'give up' },
          {
            trigger: 'final',
          },
        ),
      ),
    ).toMatchObject({ kind: 'accepted', value: { kind: 'stop', reason: 'give up' } })
  })
})

describe('ask', () => {
  it('is refused at after_terminal with its own word for every power', () => {
    for (const power of ['observe', 'rewrite', 'veto'] as const) {
      expect(
        reasonOf(
          judgeExtensionOutput(
            inputFor('after_terminal', power, sampleOutput('ask', 'after_terminal')),
          ),
        ),
      ).toBe('ask_at_forbidden_position')
    }
  })

  it('keeps the card draft as submitted, with optional members left out', () => {
    const minimal = {
      kind: 'ask',
      card: {
        explanation: '',
        options: [{ id: 'ok', label: 'OK' }],
        about: { position: 'after_compaction' },
      },
    }
    const judged = judgeExtensionOutput(inputFor('after_compaction', 'veto', minimal))
    expect(judged).toEqual({ kind: 'accepted', value: minimal })
    expect(judged.kind === 'accepted' && Object.keys(judged.value)).toEqual(['kind', 'card'])
  })
})

describe('rewrite', () => {
  it('accepts a change of each rewritable field of the three positions', () => {
    for (const row of ['before_model_call/main', 'before_action', 'after_action/each'] as const) {
      const judged = judgeExtensionOutput(inputFor(row, 'rewrite', sampleOutput('rewrite', row)))
      expect(judged, row).toEqual({
        kind: 'accepted',
        value: { kind: 'rewrite', subject: rewrittenSubject(row) },
      })
    }
  })

  it('accepts a rewrite that changes nothing and ignores key order', () => {
    const reordered = Object.fromEntries(Object.entries(SUBJECTS.before_action).reverse())
    expect(
      judgeExtensionOutput(
        inputFor('before_action', 'rewrite', { kind: 'rewrite', subject: reordered }),
      ),
    ).toMatchObject({ kind: 'accepted' })
  })

  const touches: readonly (readonly [string, PositionOutputKey, Record<string, unknown>])[] = [
    [
      'a field outside the rewritable ones at before_action',
      'before_action',
      { ...SUBJECTS.before_action, action: 'action-2' },
    ],
    [
      'the original call at before_action',
      'before_action',
      { ...SUBJECTS.before_action, original: { kind: 'tool_call', name: 'write' } },
    ],
    [
      'the batch list at before_action',
      'before_action',
      { ...SUBJECTS.before_action, batch: ['action-1', 'action-2'] },
    ],
    ['a member added to the subject', 'before_action', { ...SUBJECTS.before_action, extra: true }],
    [
      'a member removed from the subject',
      'before_action',
      { action: 'action-1', effectiveArguments: '{}' },
    ],
    [
      'the outcome at after_action each',
      'after_action/each',
      { ...SUBJECTS['after_action/each'], outcome: { kind: 'denied' } },
    ],
    [
      'the candidate role at after_action each',
      'after_action/each',
      { ...SUBJECTS['after_action/each'], candidate: { ...message, role: 'user' } },
    ],
    [
      'the candidate id at after_action each',
      'after_action/each',
      {
        ...SUBJECTS['after_action/each'],
        candidate: { ...message, id: 'msg_cccccccccccccccccccccc' },
      },
    ],
    [
      'the purpose at before_model_call',
      'before_model_call/main',
      { ...SUBJECTS['before_model_call/main'], purpose: 'compaction' },
    ],
    [
      'the preparation kind at before_model_call',
      'before_model_call/main',
      {
        purpose: 'main',
        preparation: {
          ...(SUBJECTS['before_model_call/main'].preparation as object),
          kind: 'ready',
        },
      },
    ],
    [
      'a fixed member of the model input',
      'before_model_call/main',
      {
        purpose: 'main',
        preparation: {
          kind: 'assembled',
          id: 'prep-1',
          input: {
            ...(SUBJECTS['before_model_call/main'].preparation as { input: object }).input,
            fixed: 'changed',
          },
        },
      },
    ],
    ['a different shape of the subject', 'before_action', { effectiveArguments: '{}' }],
  ]

  for (const [label, row, subject] of touches) {
    it(`refuses a rewrite that changes ${label}`, () => {
      expect(
        reasonOf(judgeExtensionOutput(inputFor(row, 'rewrite', { kind: 'rewrite', subject }))),
      ).toBe('rewrite_touches_immutable')
    })
  }
})

describe('the output limits', () => {
  function nested(levels: number): unknown {
    let value: unknown = 'leaf'
    for (let level = 0; level < levels; level += 1) value = { inner: value }
    return value
  }

  it('accepts a rewrite of a model input with 100 messages of about 200 characters', () => {
    const messages = Array.from({ length: 100 }, (_, index) => ({
      ...message,
      id: `msg_${String(index).padStart(22, 'a')}`,
      blocks: [{ kind: 'text', text: 'x'.repeat(200) }],
    }))
    const withMessages = (list: readonly unknown[]): Record<string, unknown> => {
      const subject = structuredClone(SUBJECTS['before_model_call/main'])
      ;(subject.preparation as { input: Record<string, unknown> }).input.messages = list
      return subject
    }
    const rewritten = [
      { ...messages[0], blocks: [{ kind: 'text', text: 'y'.repeat(200) }] },
      ...messages.slice(1),
    ]
    const judged = judgeExtensionOutput(
      inputFor(
        'before_model_call/main',
        'rewrite',
        { kind: 'rewrite', subject: withMessages(rewritten) },
        { subject: withMessages(messages) },
      ),
    )
    expect(judged).toEqual({
      kind: 'accepted',
      value: { kind: 'rewrite', subject: withMessages(rewritten) },
    })
  })

  it('accepts a rewrite of effectiveArguments of 20 000 characters', () => {
    const subject = { ...SUBJECTS.before_action, effectiveArguments: 'z'.repeat(20_000) }
    expect(
      judgeExtensionOutput(inputFor('before_action', 'rewrite', { kind: 'rewrite', subject })),
    ).toMatchObject({ kind: 'accepted', value: { kind: 'rewrite', subject } })
  })

  it('accepts nesting up to 64 levels and refuses a subject nested deeper', () => {
    const shallow = { ...SUBJECTS.before_action, definition: nested(60) }
    expect(
      judgeExtensionOutput(
        inputFor(
          'before_action',
          'rewrite',
          { kind: 'rewrite', subject: shallow },
          { subject: shallow },
        ),
      ).kind,
    ).toBe('accepted')
    const deep = { ...SUBJECTS.before_action, definition: nested(70) }
    expect(
      reasonOf(
        judgeExtensionOutput(
          inputFor(
            'before_action',
            'rewrite',
            { kind: 'rewrite', subject: deep },
            { subject: deep },
          ),
        ),
      ),
    ).toBe('malformed')
  })

  it('refuses a subject that contains a function', () => {
    const subject = { ...SUBJECTS.before_action, run: () => undefined }
    expect(
      reasonOf(
        judgeExtensionOutput(inputFor('before_action', 'rewrite', { kind: 'rewrite', subject })),
      ),
    ).toBe('malformed')
  })
})

describe('the seven steps in order', () => {
  const observed = { kind: 'observed' }

  it('refuses an unknown position and an unknown power before anything else', () => {
    const base = inputFor('before_action', 'veto', 'junk')
    expect(
      reasonOf(judgeExtensionOutput({ ...base, position: 'before_persist_message' as Position })),
    ).toBe('position_unknown')
    expect(
      reasonOf(judgeExtensionOutput({ ...base, position: 'attempt_started' as Position })),
    ).toBe('position_unknown')
    expect(reasonOf(judgeExtensionOutput({ ...base, power: 'grant' as Power }))).toBe(
      'power_unknown',
    )
    expect(
      reasonOf(
        judgeExtensionOutput({ ...base, position: 'nowhere' as Position, power: 'grant' as Power }),
      ),
    ).toBe('position_unknown')
  })

  it('judges the dimension before the shape of the output', () => {
    const missing: readonly [string, Partial<ExtensionOutputJudgeInput>][] = [
      ['no ending', { position: 'after_model_call', dimension: null }],
      [
        'a scope at after_model_call',
        { position: 'after_model_call', dimension: { scope: 'each' } },
      ],
      [
        'an unknown ending',
        { position: 'after_model_call', dimension: { ending: 'x' as 'failure' } },
      ],
      ['no scope', { position: 'after_action', dimension: null }],
      ['an ending at after_action', { position: 'after_action', dimension: { ending: 'failure' } }],
      ['an unknown scope', { position: 'after_action', dimension: { scope: 'x' as 'each' } }],
    ]
    for (const [label, change] of missing) {
      expect(
        reasonOf(judgeExtensionOutput({ ...inputFor('before_action', 'veto', 'junk'), ...change })),
        label,
      ).toBe('dimension_missing')
    }
    for (const row of ROWS) {
      if (WHERE[row].dimension !== null) continue
      for (const dimension of [{ ending: 'failure' }, { scope: 'each' }] as const) {
        const input = inputFor(row, 'veto', 'junk', { dimension })
        expect(reasonOf(judgeExtensionOutput(input)), row).toBe('dimension_not_allowed')
      }
    }
  })

  it('refuses output that is not one of the eight shapes as malformed', () => {
    const malformed: readonly [string, unknown][] = [
      ['null', null],
      ['a string', 'observed'],
      ['an array', [{ kind: 'observed' }]],
      ['no kind', {}],
      ['an unknown kind', { kind: 'persist' }],
      ['a kind of the wrong type', { kind: 1 }],
      ['an extra member on observed', { kind: 'observed', note: 'x' }],
      ['an inject without a message', { kind: 'inject' }],
      ['an inject message that is not an object', { kind: 'inject', message: 'text' }],
      ['an inject message without a role', { kind: 'inject', message: { id: 'x', blocks: [] } }],
      [
        'an inject message with extra members',
        { kind: 'inject', message: { ...reminder, extra: 1 } },
      ],
      ['a rewrite without a subject', { kind: 'rewrite' }],
      ['a rewrite subject that is not an object', { kind: 'rewrite', subject: 'x' }],
      ['a rewrite subject that is an array', { kind: 'rewrite', subject: [] }],
      ['an empty route', { kind: 'select_model', route: '' }],
      ['a route that is not text', { kind: 'select_model', route: 1 }],
      ['a reason that is not text', { kind: 'select_model', route: 'a', reason: 1 }],
      ['a veto without a reason', { kind: 'veto' }],
      ['a veto with an empty reason', { kind: 'veto', reason: '' }],
      ['a stop without a reason', { kind: 'stop' }],
      ['a stop with an empty reason', { kind: 'stop', reason: '' }],
      ['a stop with an unknown terminal', { kind: 'stop', terminal: 'completed', reason: 'x' }],
      ['a retry without a plan', { kind: 'retry' }],
      [
        'a retry plan without a supplier',
        { kind: 'retry', plan: { notBefore: null, basis: adoption } },
      ],
      ['a retry plan without notBefore', { kind: 'retry', plan: { supplier, basis: adoption } }],
      [
        'a retry plan with a numeric notBefore',
        { kind: 'retry', plan: { supplier, notBefore: 5, basis: adoption } },
      ],
      // SPEC "声明判断", `retry`: a text that `parseInstant` does not read is malformed. These go
      // red when the check is dropped and `notBefore` is accepted as any text (SC-AG-138).
      [
        'a retry plan whose notBefore is not an instant text',
        { kind: 'retry', plan: { supplier, notBefore: 'tomorrow', basis: adoption } },
      ],
      [
        'a retry plan whose notBefore is a local time without Z',
        { kind: 'retry', plan: { supplier, notBefore: '2026-10-17T08:00:00', basis: adoption } },
      ],
      [
        'a retry plan whose notBefore has a numeric offset',
        {
          kind: 'retry',
          plan: { supplier, notBefore: '2026-10-17T08:00:00+08:00', basis: adoption },
        },
      ],
      [
        'a retry plan whose notBefore is an impossible date',
        { kind: 'retry', plan: { supplier, notBefore: '2026-02-30T08:00:00Z', basis: adoption } },
      ],
      // Red when the text check is dropped and a non-string that reads as an instant passes.
      [
        'a retry plan whose notBefore is an array holding an instant text',
        {
          kind: 'retry',
          plan: { supplier, notBefore: ['2026-10-17T08:00:00Z'], basis: adoption },
        },
      ],
      ['a retry plan without a basis', { kind: 'retry', plan: { supplier, notBefore: null } }],
      [
        'a retry basis with three of the four fields',
        {
          kind: 'retry',
          plan: { supplier, notBefore: null, basis: { owner: 'o', name: 'n', revision: '1' } },
        },
      ],
      [
        'a retry basis with a fifth field',
        { kind: 'retry', plan: { supplier, notBefore: null, basis: { ...adoption, extra: 1 } } },
      ],
      [
        'a supplier that is not an object',
        { kind: 'retry', plan: { supplier: 'x', notBefore: null, basis: adoption } },
      ],
      ['an ask without a card', { kind: 'ask' }],
      ['an ask card without options', { kind: 'ask', card: { ...card, options: [] } }],
      [
        'an ask card with duplicate option ids',
        { kind: 'ask', card: { ...card, options: [card.options[0], card.options[0]] } },
      ],
      ['an ask option without a label', { kind: 'ask', card: { ...card, options: [{ id: 'a' }] } }],
      [
        'an ask option with an empty id',
        { kind: 'ask', card: { ...card, options: [{ id: '', label: 'x' }] } },
      ],
      [
        'an ask option effect that is no JSON tree',
        { kind: 'ask', card: { ...card, options: [{ id: 'a', label: 'x', effect: 5 }] } },
      ],
      ['an ask card without a position', { kind: 'ask', card: { ...card, about: {} } }],
      [
        'an ask card with an unknown position',
        { kind: 'ask', card: { ...card, about: { position: 'before_persist_message' } } },
      ],
      [
        'a proposed rewrite of an unknown option',
        {
          kind: 'ask',
          card: { ...card, proposedRewrite: { option: 'maybe', effectiveArguments: '{}' } },
        },
      ],
      ['a card without an explanation', { kind: 'ask', card: { ...card, explanation: undefined } }],
      ['a card with an extra member', { kind: 'ask', card: { ...card, extra: 1 } }],
      ['a number', 5],
      ['undefined', undefined],
    ]
    for (const [label, output] of malformed) {
      expect(reasonOf(judgeExtensionOutput(inputFor('before_action', 'veto', output))), label).toBe(
        'malformed',
      )
    }
  })

  it('refuses a function, an accessor, a host object and a cycle as malformed without running them', () => {
    let reads = 0
    const withGetter = {
      kind: 'veto',
      get reason() {
        reads += 1
        return 'x'
      },
    }
    const cyclic: Record<string, unknown> = { kind: 'rewrite' }
    cyclic.subject = cyclic
    const outputs: readonly unknown[] = [
      () => undefined,
      { kind: 'veto', reason: 'x', run: () => undefined },
      withGetter,
      new Date(0),
      new Map(),
      cyclic,
      { kind: 'select_model', route: 'a', reason: Number.NaN },
    ]
    for (const output of outputs) {
      expect(reasonOf(judgeExtensionOutput(inputFor('before_action', 'veto', output)))).toBe(
        'malformed',
      )
    }
    expect(reads).toBe(0)
  })

  it('refuses a reminder whose role is not system_reminder before looking at the position', () => {
    for (const role of [
      'user',
      'assistant',
      'tool',
      'tool_internal',
      'compaction',
      'System_Reminder',
      '',
    ]) {
      const output = { kind: 'inject', message: { ...reminder, role } }
      expect(reasonOf(judgeExtensionOutput(inputFor('before_action', 'veto', output))), role).toBe(
        'inject_source_mismatch',
      )
      expect(
        reasonOf(judgeExtensionOutput(inputFor('after_terminal', 'observe', output))),
        role,
      ).toBe('inject_source_mismatch')
    }
  })

  it('judges the position before the power and the power before the rewrite fields', () => {
    expect(
      reasonOf(
        judgeExtensionOutput(
          inputFor('after_compaction', 'rewrite', sampleOutput('veto', 'after_compaction')),
        ),
      ),
    ).toBe('output_not_allowed_at_position')
    expect(
      reasonOf(
        judgeExtensionOutput(
          inputFor('before_action', 'observe', sampleOutput('veto', 'before_action')),
        ),
      ),
    ).toBe('output_not_allowed_for_power')
    const touching = { kind: 'rewrite', subject: { ...SUBJECTS.before_action, action: 'action-2' } }
    expect(reasonOf(judgeExtensionOutput(inputFor('before_action', 'observe', touching)))).toBe(
      'output_not_allowed_for_power',
    )
    expect(reasonOf(judgeExtensionOutput(inputFor('before_action', 'rewrite', touching)))).toBe(
      'rewrite_touches_immutable',
    )
    expect(
      reasonOf(
        judgeExtensionOutput(
          inputFor('after_terminal', 'veto', sampleOutput('ask', 'after_terminal')),
        ),
      ),
    ).toBe('ask_at_forbidden_position')
    expect(
      reasonOf(
        judgeExtensionOutput(
          inputFor('before_action', 'observe', sampleOutput('ask', 'before_action')),
        ),
      ),
    ).toBe('output_not_allowed_for_power')
    expect(judgeExtensionOutput(inputFor('before_action', 'observe', observed))).toMatchObject({
      kind: 'accepted',
    })
  })
})

describe('the purpose of a model call position', () => {
  it('takes an absent purpose as the stricter compaction row', () => {
    for (const purpose of [null, 'other' as 'main']) {
      const input = inputFor(
        'before_model_call/main',
        'veto',
        sampleOutput('select_model', 'before_model_call/main'),
        { purpose },
      )
      expect(reasonOf(judgeExtensionOutput(input)), String(purpose)).toBe(
        'output_not_allowed_at_position',
      )
    }
  })

  it('does not split after_model_call by purpose', () => {
    for (const purpose of ['main', 'compaction'] as const) {
      const input = inputFor(
        'after_model_call/complete_reply',
        'veto',
        { kind: 'stop', reason: 'x' },
        { purpose },
      )
      expect(judgeExtensionOutput(input).kind, purpose).toBe('accepted')
    }
  })
})

describe('the accepted value', () => {
  it('is frozen and shares nothing with what the author returned', () => {
    const output = { kind: 'inject', message: structuredClone(reminder) }
    const judged = judgeExtensionOutput(inputFor('before_action', 'rewrite', output))
    expect(judged.kind).toBe('accepted')
    if (judged.kind !== 'accepted' || judged.value.kind !== 'inject') return
    output.message.blocks.push({ kind: 'text', text: 'late' })
    output.message.role = 'user'
    expect(judged.value.message).toEqual(reminder)
    expect(Object.isFrozen(judged.value)).toBe(true)
    expect(Object.isFrozen(judged.value.message)).toBe(true)
    expect(Object.isFrozen(judged.value.message.blocks)).toBe(true)
  })

  it('keeps an omitted optional member omitted', () => {
    const select = judgeExtensionOutput(
      inputFor('before_model_call/main', 'veto', { kind: 'select_model', route: 'fast' }),
    )
    expect(select).toEqual({ kind: 'accepted', value: { kind: 'select_model', route: 'fast' } })
    const stop = judgeExtensionOutput(
      inputFor('before_action', 'veto', { kind: 'stop', reason: 'x' }),
    )
    expect(stop.kind === 'accepted' && Object.keys(stop.value)).toEqual(['kind', 'reason'])
  })

  it('is the same for the same input', () => {
    const input = inputFor('before_action', 'veto', sampleOutput('ask', 'before_action'))
    expect(judgeExtensionOutput(input)).toEqual(judgeExtensionOutput(input))
  })
})
