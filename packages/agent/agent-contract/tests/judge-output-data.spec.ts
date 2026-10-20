// What `judgeExtensionOutput` returns when it accepts, and how it compares a rewritten subject
// with the subject that the author received. The table of positions and powers is in
// judge-output.spec.ts. The accepted value is plain data, so these tests compare it with
// `toStrictEqual` on the canonical form of the value: a member that holds `undefined`, or a member
// that is missing, is a defect, and `toEqual` would not see it. The accepted value is a copy without
// prototype, and its prototype is not part of the contract, so the canonical form drops it.
import { describe, expect, it } from 'vitest'
import {
  judgeExtensionOutput,
  type ExtensionOutputJudgeInput,
  type Subject,
} from '@omne-harness/agent-contract'

const adoption = { owner: 'owner', name: 'name', revision: '1', digest: 'sha256:abc' }
const reminder = {
  id: 'msg_bbbbbbbbbbbbbbbbbbbbbb',
  role: 'system_reminder',
  blocks: [{ kind: 'text', text: 'remember' }],
}

const WHERE = {
  position: 'before_action',
  dimension: null,
  purpose: null,
  trigger: null,
} as const satisfies Partial<ExtensionOutputJudgeInput>

/** Judges `output` at `before_action` for a veto extension, where every output kind but `retry` is open. */
function judgeAt(
  output: unknown,
  subject: Record<string, unknown> = {},
  where: Pick<ExtensionOutputJudgeInput, 'position' | 'dimension' | 'purpose' | 'trigger'> = WHERE,
) {
  return judge({
    ...where,
    power: 'veto',
    subject: subject as unknown as Subject,
    output,
  })
}

/** The value with plain prototypes, sorted members and every member kept, also one that holds `undefined`. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (typeof value !== 'object' || value === null) return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map(key => [key, canonical(record[key])]),
  )
}

/** The judgment in canonical form. */
const judge = (input: ExtensionOutputJudgeInput) => canonical(judgeExtensionOutput(input))

const accepted = (value: unknown) => canonical({ kind: 'accepted', value })

describe('the accepted value of each output kind', () => {
  it('is observed, inject and veto, member for member', () => {
    expect(judgeAt({ kind: 'observed' })).toStrictEqual(accepted({ kind: 'observed' }))
    expect(judgeAt({ kind: 'inject', message: reminder })).toStrictEqual(
      accepted({ kind: 'inject', message: reminder }),
    )
    expect(judgeAt({ kind: 'veto', reason: 'not now' })).toStrictEqual(
      accepted({ kind: 'veto', reason: 'not now' }),
    )
  })

  it('keeps a select_model reason when it is given and has no reason member when it is not', () => {
    const where = {
      position: 'before_model_call',
      dimension: null,
      purpose: 'main',
      trigger: null,
    } as const
    expect(
      judgeAt({ kind: 'select_model', route: 'fast', reason: 'cheaper' }, {}, where),
    ).toStrictEqual(accepted({ kind: 'select_model', route: 'fast', reason: 'cheaper' }))
    expect(judgeAt({ kind: 'select_model', route: 'fast' }, {}, where)).toStrictEqual(
      accepted({ kind: 'select_model', route: 'fast' }),
    )
  })

  it('keeps a stop terminal when it is given, whichever it is, and has no terminal member when it is not', () => {
    for (const terminal of ['cancelled', 'failed'] as const) {
      expect(judgeAt({ kind: 'stop', terminal, reason: 'enough' }), terminal).toStrictEqual(
        accepted({ kind: 'stop', terminal, reason: 'enough' }),
      )
    }
    expect(judgeAt({ kind: 'stop', reason: 'enough' })).toStrictEqual(
      accepted({ kind: 'stop', reason: 'enough' }),
    )
    expect(judgeAt({ kind: 'stop', terminal: 'completed', reason: 'enough' })).toStrictEqual({
      kind: 'refused',
      reason: 'malformed',
    })
  })

  it('keeps a retry plan member for member', () => {
    const plan = {
      supplier: { adoption, recipient: 'recipient', model: 'model' },
      notBefore: '2026-10-17T08:00:00Z',
      basis: adoption,
    }
    const judged = judge({
      position: 'after_model_call',
      dimension: { ending: 'failure' },
      purpose: 'main',
      power: 'veto',
      trigger: 'first-content',
      subject: {} as Subject,
      output: { kind: 'retry', plan },
    })
    expect(judged).toStrictEqual(accepted({ kind: 'retry', plan }))
  })

  it('keeps every member of a card that states them all, and leaves out those that it does not state', () => {
    const full = {
      explanation: 'why',
      options: [
        { id: 'yes', label: 'Yes', effect: { kind: 'string', value: 'approved' } },
        { id: 'no', label: 'No' },
      ],
      about: { position: 'before_action', action: 'action-1' },
      proposedRewrite: { option: 'yes', effectiveArguments: '{}' },
    }
    const bare = {
      explanation: '',
      options: [{ id: 'ok', label: 'OK' }],
      about: { position: 'before_action' },
    }
    expect(judgeAt({ kind: 'ask', card: full })).toStrictEqual(
      accepted({ kind: 'ask', card: full }),
    )
    expect(judgeAt({ kind: 'ask', card: bare })).toStrictEqual(
      accepted({ kind: 'ask', card: bare }),
    )
  })

  it('refuses a card without an option, and a rewrite that names an option the card does not have', () => {
    const refused = { kind: 'refused', reason: 'malformed' }
    const about = { position: 'before_action' }
    expect(
      judgeAt({ kind: 'ask', card: { explanation: 'why', options: [], about } }),
    ).toStrictEqual(refused)
    const options = [{ id: 'yes', label: 'Yes' }]
    expect(
      judgeAt({
        kind: 'ask',
        card: {
          explanation: 'why',
          options,
          about,
          proposedRewrite: { option: 'other', effectiveArguments: '{}' },
        },
      }),
    ).toStrictEqual(refused)
    expect(
      judgeAt({
        kind: 'ask',
        card: { explanation: 'why', options: [...options, ...options], about },
      }),
    ).toStrictEqual(refused)
  })
})

describe('the rows at after_action', () => {
  it('lets the each row rewrite the candidate and the batch row not, and names the rows apart', () => {
    const candidate = { id: 'm', role: 'tool', blocks: [{ kind: 'text', text: 'result' }] }
    const subject = { action: 'action-1', outcome: { kind: 'executed' }, candidate }
    const rewritten = {
      ...subject,
      candidate: { ...candidate, blocks: [{ kind: 'text', text: 'trimmed' }] },
    }
    const at = (scope: 'each' | 'batch', output: unknown) =>
      judge({
        position: 'after_action',
        dimension: { scope },
        purpose: null,
        power: 'veto',
        trigger: null,
        subject: subject as unknown as Subject,
        output,
      })
    expect(at('each', { kind: 'rewrite', subject: rewritten })).toStrictEqual(
      accepted({ kind: 'rewrite', subject: rewritten }),
    )
    expect(at('batch', { kind: 'rewrite', subject: rewritten })).toStrictEqual({
      kind: 'refused',
      reason: 'output_not_allowed_at_position',
    })
    expect(at('batch', { kind: 'stop', reason: 'enough' })).toStrictEqual(
      accepted({ kind: 'stop', reason: 'enough' }),
    )
    expect(
      judge({
        position: 'after_action',
        dimension: { ending: 'failure' },
        purpose: null,
        power: 'veto',
        trigger: null,
        subject: subject as unknown as Subject,
        output: { kind: 'observed' },
      }),
    ).toStrictEqual({ kind: 'refused', reason: 'dimension_missing' })
  })
})

describe('the comparison of a rewrite with the subject outside its rewritable fields', () => {
  const touched = { kind: 'refused', reason: 'rewrite_touches_immutable' }
  const rewrite = (subject: Record<string, unknown>, output: Record<string, unknown>) =>
    judgeAt({ kind: 'rewrite', subject: output }, subject)

  it('treats a member that the subject holds as undefined as absent', () => {
    const same = { effectiveArguments: '{}', original: 'call' }
    expect(rewrite({ ...same, ghost: undefined }, same)).toMatchObject({ kind: 'accepted' })
  })

  it('sees an array that grew or shrank, and a changed item that follows an equal one', () => {
    const batch = (items: unknown[]) => ({ effectiveArguments: '{}', batch: items })
    expect(rewrite(batch(['a']), batch(['a', 'b']))).toStrictEqual(touched)
    expect(rewrite(batch(['a', 'b']), batch(['a']))).toStrictEqual(touched)
    expect(rewrite(batch([]), batch(['a']))).toStrictEqual(touched)
    expect(rewrite(batch(['a', 'b']), batch(['a', 'c']))).toStrictEqual(touched)
    expect(rewrite(batch(['a', 'b']), batch(['a', 'b']))).toMatchObject({ kind: 'accepted' })
  })

  it('sees an array that became an object or a text, and the other way round', () => {
    const field = (value: unknown) => ({ effectiveArguments: '{}', field: value })
    expect(rewrite(field([]), field({}))).toStrictEqual(touched)
    expect(rewrite(field({}), field([]))).toStrictEqual(touched)
    expect(rewrite(field(['x']), field('x'))).toStrictEqual(touched)
    expect(rewrite(field('x'), field(['x']))).toStrictEqual(touched)
  })

  it('sees an object that became a number, a null or the other way round, and does not throw on a null', () => {
    const field = (value: unknown) => ({ effectiveArguments: '{}', field: value })
    expect(rewrite(field({}), field(0))).toStrictEqual(touched)
    expect(rewrite(field(0), field({}))).toStrictEqual(touched)
    expect(rewrite(field({}), field(null))).toStrictEqual(touched)
    expect(rewrite(field(null), field({}))).toStrictEqual(touched)
    expect(rewrite(field(null), field(null))).toMatchObject({ kind: 'accepted' })
  })

  it('compares a field that lies below a path that the subject does not have as an object', () => {
    // At `before_model_call` the rewritable fields lie below `preparation.input`.
    const at = (subject: Record<string, unknown>, output: Record<string, unknown>) =>
      judge({
        position: 'before_model_call',
        dimension: null,
        purpose: 'main',
        power: 'veto',
        trigger: null,
        subject: subject as unknown as Subject,
        output: { kind: 'rewrite', subject: output },
      })
    const preparation = (value: unknown) => ({ purpose: 'main', preparation: value })
    expect(at(preparation(null), preparation(null))).toMatchObject({ kind: 'accepted' })
    expect(at(preparation(1), preparation(1))).toMatchObject({ kind: 'accepted' })
    expect(at(preparation(1), preparation(2))).toStrictEqual(touched)
    expect(at(preparation('a'), preparation('b'))).toStrictEqual(touched)
    expect(at(preparation({ input: 1 }), preparation({ input: 2 }))).toStrictEqual(touched)
  })
})
