// The one execution slot of #510 and what a caller can read of it: which invoke is refused while
// the slot is held and with what reason, when a failed invoke gives the slot back, that `observe`
// shows the state the slot implies, how a stopped run is named, and that the registration handle
// only receives a projection. A held slot and a halt have no contract state or channel of their
// own; the readings chosen here are named in tests/README.md.
import { describe, expect, it } from 'vitest'
import { agentEvaluator } from '@omne-harness/agent'
import type {
  AgentEvaluator,
  AgentObservation,
  AgentState,
  Failure,
  LoopExtensionDeclaration,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  acceptedInput,
  adoption,
  execution,
  failure,
  instance,
  ok,
  operation,
} from './journal-support.ts'
import { alice, loopAssembly, type LoopAssembly } from './loop-support.ts'

function invoke(assembly: LoopAssembly, id = 'exec-1') {
  return assembly.provider.runtime.invoke({
    ...alice,
    execution: execution(id),
    operation: operation(`invoke-${id}`),
    initial: acceptedInput(`input-${id}`, `hello ${id}`),
    grant: null,
  })
}

/** The diagnostic of an `unavailable` failure; another failure fails the test. */
function diagnosticOf(outcome: Outcome<unknown, Failure>): string {
  const refused = failure(outcome)
  if (refused.kind !== 'unavailable') throw new Error(`expected unavailable: ${refused.kind}`)
  return refused.diagnostic
}

/** The state that `observe` shows now. */
async function shown(assembly: LoopAssembly): Promise<AgentState> {
  const controller = new AbortController()
  for await (const seen of assembly.provider.observation.observe({
    ...alice,
    signal: controller.signal,
  }) as AsyncIterable<AgentObservation>) {
    controller.abort()
    if (seen.kind === 'state') return seen.value
  }
  throw new Error('observe showed no state')
}

/** Calls `probe` on later turns of the event loop until it holds, at most 200 times. */
async function eventually(probe: () => Promise<boolean>): Promise<void> {
  for (let turn = 0; turn < 200; turn += 1) {
    if (await probe()) return
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  throw new Error('the condition never held')
}

/** Redefines the bound definition with another evaluator or extensions. */
function adopt(
  assembly: LoopAssembly,
  evaluator: AgentEvaluator,
  extensions: readonly LoopExtensionDeclaration[] = [],
): void {
  assembly.controls.adoptions.define(adoption('definition'), {
    definition: {
      category: 'AgentDefinition',
      name: 'test',
      version: { kind: 'then-legal-winner' },
      references: [],
      attributes: [],
    },
    evaluator,
    extensions,
  })
}

/** The generic evaluator, except that its first decision at E4 is `decision`. */
function evaluatorDeciding(decision: ReturnType<AgentEvaluator['next']>): AgentEvaluator {
  return {
    ...agentEvaluator,
    next: facts => (facts.checkpoint.position === 'E4' ? decision : agentEvaluator.next(facts)),
  }
}

describe('a held slot refuses a second invoke and says what holds it', () => {
  it('while the first invoke is reserved, in the same turn', async () => {
    const assembly = await loopAssembly([execution(), execution('exec-2')])
    const [first, second] = await Promise.all([invoke(assembly), invoke(assembly, 'exec-2')])
    ok(first)
    expect(diagnosticOf(second)).toBe(
      'a second concurrent invoke is not implemented until #502 1.3',
    )
    assembly.release.open()
  })

  it('while the first run is running', async () => {
    const assembly = await loopAssembly([execution(), execution('exec-2')])
    ok(await invoke(assembly))
    expect(diagnosticOf(await invoke(assembly, 'exec-2'))).toBe(
      'a second concurrent invoke is not implemented until #502 1.3',
    )
    assembly.release.open()
  })
})

describe('a halted run keeps the slot occupied and is named by the next invoke', () => {
  it('a port failure: the Journal refuses the E3 commit, and the halt keeps its owner', async () => {
    const assembly = await loopAssembly([execution(), execution('exec-2')])
    assembly.controls.journal.failNext('commit', { kind: 'unavailable' })
    ok(await invoke(assembly))
    let diagnostic = ''
    await eventually(async () => {
      diagnostic = diagnosticOf(await invoke(assembly, 'exec-2'))
      return diagnostic.includes('halted')
    })
    expect(diagnostic).toContain('the slot is held by exec-1, halted at E3')
    expect(diagnostic).toContain('"owner":"memory-agent-journal"')
    expect(await shown(assembly)).toMatchObject({ kind: 'occupied', execution: execution() })
  })

  it('a contract outcome a later card handles: a stop at E4 is named, not a defect', async () => {
    const assembly = await loopAssembly([execution(), execution('exec-2')])
    adopt(assembly, evaluatorDeciding(succeed({ kind: 'stop', reason: 'suspended' })))
    ok(await invoke(assembly))
    let diagnostic = ''
    await eventually(async () => {
      diagnostic = diagnosticOf(await invoke(assembly, 'exec-2'))
      return diagnostic.includes('halted')
    })
    expect(diagnostic).toContain('halted at E4')
    expect(diagnostic).toContain('"owner":"@omne-harness/agent"')
    expect(diagnostic).toContain('a stop (suspended) is not handled until #502 1.4 and stage 5')
  })

  it('a coordinator defect: an outcome without a table row is owned by @omne-harness/agent#defect, never a dependency', async () => {
    const assembly = await loopAssembly([execution(), execution('exec-2')])
    adopt(assembly, evaluatorDeciding(succeed({ kind: 'wait', waiting: [] })))
    ok(await invoke(assembly))
    let diagnostic = ''
    await eventually(async () => {
      diagnostic = diagnosticOf(await invoke(assembly, 'exec-2'))
      return diagnostic.includes('halted')
    })
    expect(diagnostic).toContain('halted at E4')
    expect(diagnostic).toContain('"owner":"@omne-harness/agent#defect"')
    expect(diagnostic).toContain('E4 has no transition on wait')
  })
})

describe('slot release before E1 (SPEC 受理与单执行槽)', () => {
  it('待 #558: open commit-unknown keeps the reservation; observe shows draining with the execution unresolved', async () => {
    const assembly = await loopAssembly([execution(), execution('exec-2')])
    assembly.controls.journal.failNext('open', { kind: 'commit-unknown', outcome: 'pending' })
    expect(failure(await invoke(assembly)).kind).toBe('commit-unknown')
    expect(await shown(assembly)).toEqual({
      kind: 'draining',
      instance: instance(),
      unresolved: [execution()],
    })
    expect(diagnosticOf(await invoke(assembly, 'exec-2'))).toContain(
      'the slot is held by exec-1: open answered commit-unknown',
    )
  })

  it('a handoff commit-unknown at Q2 comes before open, so the slot is given back and observe shows idle', async () => {
    const assembly = await loopAssembly([execution(), execution('exec-2')])
    assembly.controls.handoff.accept.once(input =>
      fail({ kind: 'commit-unknown', operation: input.operation }),
    )
    expect(failure(await invoke(assembly)).kind).toBe('commit-unknown')
    expect(
      failure(await assembly.dependencies.journal.load({ ...alice, execution: execution() })).kind,
    ).toBe('denied')
    expect(await shown(assembly)).toEqual({ kind: 'idle', instance: instance() })
    ok(await invoke(assembly, 'exec-2'))
    assembly.release.open()
  })

  it('an adopted loop extension refuses invoke before open and gives the slot back', async () => {
    const assembly = await loopAssembly([execution(), execution('exec-2')])
    const extension: LoopExtensionDeclaration = {
      name: 'observer',
      position: 'execution_started',
      power: 'observe',
      implementation: { kind: 'builtin', builtinName: 'observer' },
    }
    adopt(assembly, agentEvaluator, [extension])
    expect(diagnosticOf(await invoke(assembly))).toBe(
      'an adopted loop extension is not implemented until #502 stage 3',
    )
    expect(await shown(assembly)).toEqual({ kind: 'idle', instance: instance() })
    adopt(assembly, agentEvaluator)
    ok(await invoke(assembly, 'exec-2'))
    assembly.release.open()
  })
})

describe('the registration handle only receives a projection', () => {
  it('a report that throws neither fails invoke nor holds the slot after E9', async () => {
    const reported: string[] = []
    const assembly = await loopAssembly([execution(), execution('exec-2')], dependencies => ({
      ...dependencies,
      registration: {
        instance: instance(),
        report({ state }) {
          reported.push(state.kind)
          throw new Error('host report failed')
        },
        withdraw: () => Promise.resolve(succeed(null)),
      },
    }))
    ok(await invoke(assembly))
    assembly.release.open()
    await eventually(async () => (await shown(assembly)).kind === 'idle')
    expect(reported).toEqual(['occupied', 'idle'])
    ok(await invoke(assembly, 'exec-2'))
  })
})
