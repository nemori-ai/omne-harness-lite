import { describe, expect, it } from 'vitest'
import type {
  Conclusion,
  ExtensionChain,
  ExtensionInvocationResult,
  LoopExtensionDeclaration,
  Passage,
  Position,
  Subject,
} from '@omne-harness/agent-contract'
import {
  callsOf,
  chainState,
  closedPass,
  concludeCall,
  effectiveSubject,
  membersAt,
  nextOrdinal,
  reduceChain,
  requestedCall,
  vetoes,
} from '../src/loop/extension-pass.ts'
import { adoption, evidence } from './journal-support.ts'
import { declare, reminder } from './extension-support.ts'

const subject = { execution: 'exec-1', conditions: evidence('conditions') } as never as Subject
const at = '2026-11-17T00:00:00Z'

function chainOf(position: Position, ...declarations: LoopExtensionDeclaration[]): ExtensionChain {
  return {
    pass: `step-1/${position}`,
    position,
    dimension: null,
    purpose: position === 'before_model_call' ? 'main' : null,
    members: declarations.map(declaration => ({
      source: 'tenant',
      declaration,
      implementation: adoption(`${declaration.name}@1`),
    })),
    basis: evidence('view'),
  }
}

function conclude(
  declaration: LoopExtensionDeclaration,
  result: ExtensionInvocationResult,
  mode: 'fresh' | 'replay' = 'fresh',
) {
  const call = requestedCall(chainOf(declaration.position, declaration), 0, null, evidence('in'))
  return concludeCall(call, { mode, subject, trigger: null, at }, result)
}

const finalOf = (concluded: ReturnType<typeof conclude>): Conclusion => {
  if (concluded.kind !== 'final') throw new Error(`not final: ${concluded.kind}`)
  return concluded.conclusion
}

describe('the members of a chain', () => {
  const member = (name: string, position: Position = 'execution_started') => ({
    declaration: declare(name, position),
    implementation: adoption(`${name}@1`),
  })
  const place = { position: 'execution_started', dimension: null, purpose: null } as const

  it('keeps the three sources in order and each source in the order it was given', () => {
    const members = membersAt(place, {
      system: [member('s')],
      tenant: [member('a'), member('b')],
      definition: [member('z'), member('y')],
    })
    expect(members.map(item => [item.source, item.declaration.name])).toEqual([
      ['definition', 'z'],
      ['definition', 'y'],
      ['tenant', 'a'],
      ['tenant', 'b'],
      ['system', 's'],
    ])
  })

  it('leaves out a member of another position or of another dimension', () => {
    const each = { scope: 'each' } as const
    const members = membersAt(
      { position: 'after_action', dimension: each, purpose: null },
      {
        definition: [],
        system: [],
        tenant: [
          member('other-position', 'before_action'),
          {
            declaration: declare('batch', 'after_action', { dimension: { scope: 'batch' } }),
            implementation: adoption('batch@1'),
          },
          {
            declaration: declare('each', 'after_action', { dimension: each }),
            implementation: adoption('each@1'),
          },
        ],
      },
    )
    expect(members.map(item => item.declaration.name)).toEqual(['each'])
  })
})

describe('what an invocation result means for its call', () => {
  const veto = declare('guard', 'before_action')

  it('a legal output is the final conclusion and names the call, the extension and its exact version', () => {
    expect(
      finalOf(conclude(veto, { kind: 'output', value: { kind: 'veto', reason: 'no' } })),
    ).toEqual({
      position: 'before_action',
      passage: 'step-1/before_action/call/0',
      extension: 'guard',
      implementation: adoption('guard@1'),
      power: 'veto',
      at,
      output: { kind: 'veto', reason: 'no' },
    })
  })

  it('an ask is not final', () => {
    const card = {
      explanation: 'ok?',
      options: [{ id: 'y', label: 'Yes' }],
      about: { position: 'before_action' },
    }
    expect(conclude(veto, { kind: 'output', value: { kind: 'ask', card } }).kind).toBe('ask')
  })

  it.each([
    [
      'an output the position does not allow',
      { kind: 'output', value: { kind: 'retry' } },
      'bad_output',
    ],
    ['a malformed output', { kind: 'output', value: 'yes' }, 'bad_output: malformed'],
    ['an error', { kind: 'errored', error: 'boom' }, 'boom'],
    [
      'a nonzero exit',
      { kind: 'errored', error: 'exit 3', classification: 'nonzero_exit' },
      'nonzero_exit: exit 3',
    ],
    ['an inconsistent replay', { kind: 'replayInconsistent' }, 'replayInconsistent'],
  ] as const)(
    '%s is an error, and a veto extension before the change vetoes by default',
    (_name, result, error) => {
      const conclusion = finalOf(conclude(veto, result as ExtensionInvocationResult))
      expect(conclusion.skipped).toBe('errored')
      expect(conclusion.error).toContain(error)
      expect(conclusion.output).toEqual({ kind: 'veto', reason: conclusion.error })
      expect(vetoes(conclusion)).toBe(true)
    },
  )

  it.each([
    ['onError ignore', declare('g', 'before_action', { onError: 'ignore' })],
    ['onError record', declare('g', 'before_action', { onError: 'record' })],
    ['a rewrite extension', declare('g', 'before_action', { power: 'rewrite' })],
    ['an observe extension', declare('g', 'before_action', { power: 'observe' })],
    [
      'a position after the change',
      declare('g', 'after_model_call', { dimension: { ending: 'complete_reply' } }),
    ],
    ['execution_started', declare('g', 'execution_started')],
  ] as const)('an error with %s does not change the advance', (_name, declaration) => {
    const conclusion = finalOf(conclude(declaration, { kind: 'errored', error: 'boom' }))
    expect(conclusion).toMatchObject({
      skipped: 'errored',
      error: 'boom',
      output: { kind: 'observed' },
    })
    expect(vetoes(conclusion)).toBe(false)
  })

  it('not started is unavailable for a fresh call, by the declared policy; only a veto extension before the change may veto by it', () => {
    const skipped = finalOf(conclude(veto, { kind: 'notStartedUnavailable' }))
    expect(skipped).toMatchObject({ skipped: 'unavailable', unavailability: 'skip' })
    expect(skipped.output).toBeUndefined()
    expect(vetoes(skipped)).toBe(false)
    const strict = declare('guard', 'before_action', { unavailability: 'veto' })
    expect(vetoes(finalOf(conclude(strict, { kind: 'notStartedUnavailable' })))).toBe(true)
    const narrowed = declare('guard', 'before_action', { unavailability: 'veto', power: 'rewrite' })
    expect(vetoes(finalOf(conclude(narrowed, { kind: 'notStartedUnavailable' })))).toBe(false)
    const after = declare('guard', 'execution_started', { unavailability: 'veto' })
    expect(vetoes(finalOf(conclude(after, { kind: 'notStartedUnavailable' })))).toBe(false)
  })

  it.each([
    ['not started in replay', { kind: 'notStartedUnavailable' }, 'replay'],
    ['an unreadable replay control', { kind: 'controlUnavailable' }, 'replay'],
    [
      'an unresolved invocation whose start is unknown',
      { kind: 'invocationUnresolved', start: { kind: 'unknown' }, recovery: evidence('r') },
      'fresh',
    ],
    [
      'an unresolved invocation that started',
      {
        kind: 'invocationUnresolved',
        start: { kind: 'started', evidence: evidence('s') },
        recovery: evidence('r'),
      },
      'fresh',
    ],
  ] as const)('%s forms no conclusion: unknown is not unavailable', (_name, result, mode) => {
    expect(conclude(veto, result as ExtensionInvocationResult, mode).kind).toBe('unresolved')
  })
})

describe('the state of a chain', () => {
  const chain = chainOf(
    'before_model_call',
    declare('a', 'before_model_call'),
    declare('b', 'before_model_call'),
  )
  const first = requestedCall(chain, 0, null, evidence('in'))
  const second = requestedCall(chain, 1, null, evidence('in'))
  const resolved = (call: Passage, output: unknown): Passage => ({
    ...call,
    progress: {
      kind: 'resolved',
      rounds: [],
      conclusion: finalOf(
        concludeCall(
          call,
          { mode: 'fresh', subject, trigger: null, at },
          { kind: 'output', value: output },
        ),
      ),
    },
  })

  it('the first call without a final conclusion is pending, with the conclusions before it', () => {
    const state = chainState(callsOf(chain, [resolved(first, { kind: 'observed' }), second], null))
    expect(state).toMatchObject({
      kind: 'pending',
      call: { id: second.id },
      earlier: [{ extension: 'a' }],
    })
  })

  it('a veto ends the chain: no member after it starts', () => {
    const vetoed = resolved(first, { kind: 'veto', reason: 'no' })
    const conclusion = (vetoed.progress as { conclusion: Conclusion }).conclusion
    expect(nextOrdinal(chain, vetoed, conclusion)).toBeNull()
    expect(chainState(callsOf(chain, [vetoed], null))).toMatchObject({ kind: 'ended' })
    const passed = resolved(first, { kind: 'observed' })
    expect(
      nextOrdinal(chain, passed, (passed.progress as { conclusion: Conclusion }).conclusion),
    ).toBe(1)
    const last = resolved(second, { kind: 'observed' })
    expect(
      nextOrdinal(chain, last, (last.progress as { conclusion: Conclusion }).conclusion),
    ).toBeNull()
  })

  it('only the calls of this chain are its calls, and an adopted pass leaves none of them', () => {
    const foreign = { ...first, id: 'step-1/tool/0/admission' } as Passage
    expect(callsOf(chain, [foreign, first], null).map(call => call.id)).toEqual([first.id])
    expect(closedPass({ chain, passages: [foreign, first, second] })).toEqual({
      chain: null,
      passages: [foreign],
    })
    expect(closedPass({ chain: null, passages: [foreign] })).toEqual({})
  })
})

describe('one effect from the conclusions that were formed', () => {
  const base = {
    position: 'before_model_call',
    passage: 'p',
    implementation: adoption('x@1'),
    power: 'veto',
    at,
  } as const
  const of = (extension: string, output: unknown) =>
    ({ ...base, extension, output }) as never as Conclusion
  const rewritten = { rewritten: true } as never as Subject

  it('proceeds with the subject after the rewrites in order, the reminders in order and the last selection', () => {
    const effect = reduceChain(subject, [
      of('a', reminder('first')),
      of('b', { kind: 'rewrite', subject: { earlier: true } }),
      of('c', { kind: 'rewrite', subject: rewritten }),
      of('d', { kind: 'select_model', route: 'cheap' }),
      of('e', { kind: 'select_model', route: 'strong' }),
      of('f', reminder('second')),
    ])
    expect(effect.route).toBe('proceed')
    expect(effect.subject).toBe(rewritten)
    expect(effect.injects.map(item => item.extension)).toEqual(['a', 'f'])
    expect(effect.model?.output.route).toBe('strong')
    expect(effect.veto).toBeNull()
  })

  it('a veto wins over a retry; a stop does not end the chain and does not erase what came before it', () => {
    const stop = { kind: 'stop', terminal: 'failed', reason: 'enough' }
    const retry = { kind: 'retry', plan: { supplier: {}, notBefore: null, basis: adoption('r') } }
    const effect = reduceChain(subject, [
      of('a', reminder('kept')),
      of('b', stop),
      of('c', retry),
      of('d', { kind: 'veto', reason: 'no' }),
    ])
    expect(effect.route).toBe('vetoed')
    expect(effect.veto?.extension).toBe('d')
    expect(effect.stops.map(item => item.extension)).toEqual(['b'])
    expect(effect.injects).toHaveLength(1)
    expect(reduceChain(subject, [of('b', stop), of('c', retry)]).route).toBe('retry')
    expect(reduceChain(subject, []).route).toBe('proceed')
  })

  it('a member reads the subject as the members before it left it', () => {
    expect(effectiveSubject(subject, [])).toBe(subject)
    expect(effectiveSubject(subject, [of('a', { kind: 'rewrite', subject: rewritten })])).toBe(
      rewritten,
    )
  })
})
