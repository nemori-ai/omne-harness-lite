// AG-03 (R6.5): the execution operation of a running instance takes one input through invoke to one
// Model request whose result arrives only after the run has saved its wait at M1, and from there to
// the reply and ended. The scripted Model settles each admitted call once the test opens its gate;
// the memory Journal is the only store. Nothing here proves a real provider, a durable Journal or
// public resume.
//
// The count of R6.5 is per entry into the wait (perf baseline 2.3, W0 row of the node table: the
// wait registers its observation, then reads once, and sleeps when nothing moved): between the
// waiting commit and the parked driver the coordinator calls `Journal.load` at most once. The reads
// of E1, E2 and M1 after a wake leave the wait and are not counted here.
import { describe, expect, it } from 'vitest'
import type { AgentDependencies } from '@omne-harness/agent'
import type { ExecutionSnapshot, Failure, JournalCommit } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, type Outcome } from '@omne-harness/operation-result'
import {
  acceptedInput,
  execution,
  failure,
  ok,
  operation,
  otherTenant,
  type Principal,
} from './journal-support.ts'
import {
  alice,
  commitNodeOf,
  eventsOf,
  eventually,
  invoke,
  loopAssembly,
  shown,
  stoppedAt,
  type LoopAssembly,
} from './loop-support.ts'

type Dependencies = AgentDependencies<Principal, ContentBlock>
type Loaded = Outcome<ExecutionSnapshot, Failure>

/** One call the coordinator made on the Journal, or the start of a sleep on the clock, in order. */
type Call =
  | Readonly<{ kind: 'load' }>
  | Readonly<{ kind: 'commit'; input: JournalCommit<Principal> }>
  | Readonly<{ kind: 'sleep' }>

/**
 * What a test does with the first load after a waiting commit, which is the read of the wait:
 * `load` is the real read.
 */
type Reread = (load: () => Promise<Loaded>) => Promise<Loaded>

/**
 * The dependencies with each Journal load and commit and each clock sleep recorded, and the read of
 * the wait hooked.
 */
function recording(calls: Call[], reread: Reread = load => load()) {
  return (dependencies: Dependencies): Dependencies => {
    const { journal, clock } = dependencies
    let waitSaved = false
    return {
      ...dependencies,
      clock: {
        ...clock,
        waitUntil(instant, signal) {
          calls.push({ kind: 'sleep' })
          return clock.waitUntil(instant, signal)
        },
      },
      journal: {
        ...journal,
        load(input) {
          calls.push({ kind: 'load' })
          if (!waitSaved) return journal.load(input)
          waitSaved = false
          return reread(() => journal.load(input))
        },
        async commit(input) {
          calls.push({ kind: 'commit', input })
          const committed = await journal.commit(input)
          if ('ok' in committed && input.state.kind === 'waiting') waitSaved = true
          return committed
        },
      },
    }
  }
}

function commits(calls: readonly Call[]): JournalCommit<Principal>[] {
  return calls.flatMap(call => (call.kind === 'commit' ? [call.input] : []))
}

/** The kinds of the calls after the last waiting commit. */
function afterWaitSaved(calls: readonly Call[]): Call['kind'][] {
  const saved = calls.findLastIndex(
    call => call.kind === 'commit' && call.input.state.kind === 'waiting',
  )
  if (saved < 0) throw new Error('no waiting commit was recorded')
  return calls.slice(saved + 1).map(call => call.kind)
}

/** Invokes exec-1 with the Model gate closed and returns when the driver sleeps in W0. */
async function parkedAtModelWait(assembly: LoopAssembly) {
  const handle = ok(await invoke(assembly))
  await eventually(async () => assembly.controls.clock.pending().length === 1)
  return handle
}

/** Lets 20 turns of the event loop pass. */
async function turns(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await new Promise(resolve => setTimeout(resolve, 0))
}

async function journalState(assembly: LoopAssembly) {
  return ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() })).state
}

/** Opens the Model gate and returns when the received entry of the main call is in the Journal. */
async function settleModel(assembly: LoopAssembly): Promise<void> {
  assembly.release.open()
  await eventually(async () => {
    const read = ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() }))
    return read.entries?.some(entry => entry.kind === 'received') === true
  })
}

describe('AG-03 (R6.5): invoke to one Model request that answers after the run waits', () => {
  it('commits each node of the path once and W0 once with the producer wait, then ends complete', async () => {
    const calls: Call[] = []
    const assembly = await loopAssembly([execution()], recording(calls))
    const handle = await parkedAtModelWait(assembly)
    assembly.release.open()
    const events = await eventsOf(handle)
    const written = commits(calls)
    // One checkpoint write per commit; F3 is tryFinish and writes no checkpoint.
    expect(
      written.map(input => [commitNodeOf(input.operation), input.checkpoint.position]),
    ).toEqual([
      ['E3', 'E4'],
      ['I0', 'I1'],
      ['I1', 'P0'],
      ['P0', 'P1'],
      ['P1', 'I2'],
      ['M0', 'M6'],
      ['W0', 'M6'],
      ['M3', 'M4'],
      ['Q1', 'Q2'],
      ['Q2', 'Q4'],
      ['Q4', 'I3'],
      ['I3', 'I4'],
      ['I4', 'I8'],
      ['I8', 'F1'],
      ['F1', 'F2'],
      ['F2', 'F3'],
    ])
    const saved = written.find(input => input.state.kind === 'waiting')
    const pending = written.find(input => commitNodeOf(input.operation) === 'M0')?.checkpoint
      .calls[0]
    expect(saved?.state).toEqual({ kind: 'waiting', waits: [{ kind: 'producer', pending }] })
    expect(saved?.events).toEqual([{ kind: 'waiting', waits: [{ kind: 'producer', pending }] }])
    expect(events.map(event => event.body.kind)).toEqual([
      'input-taken',
      'waiting',
      'entry',
      'producer',
      'message',
      'ended',
    ])
    expect(events.at(-1)?.body).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
  })

  it('#1011: every commit carries the verified read position, moved past the admitted reply after I8 read it', async () => {
    const calls: Call[] = []
    const assembly = await loopAssembly([execution()], recording(calls))
    const handle = await parkedAtModelWait(assembly)
    assembly.release.open()
    await eventsOf(handle)
    const positions = commits(calls).map(input => {
      const read = input.checkpoint.replyAdmissionRead
      return [commitNodeOf(input.operation), read.kind === 'verified' ? read.prefix.sequence : null]
    })
    const admitted = positions.findIndex(([node]) => node === 'I8')
    expect(positions.slice(0, admitted).every(([, sequence]) => sequence === '0')).toBe(true)
    expect(positions.slice(admitted)).toEqual([
      ['I8', '1'],
      ['F1', '1'],
      ['F2', '1'],
    ])
  })
})

describe('R6.5: entering the Model wait reads the Journal at most once', () => {
  it('between the waiting commit and the sleeping driver, load runs at most once', async () => {
    const calls: Call[] = []
    const assembly = await loopAssembly([execution()], recording(calls))
    const handle = await parkedAtModelWait(assembly)
    const entered = afterWaitSaved(calls)
    expect(
      entered.slice(0, entered.indexOf('sleep')).filter(kind => kind === 'load').length,
    ).toBeLessThanOrEqual(1)
    assembly.release.open()
    await eventsOf(handle)
  })

  it('the waiting event of the wait itself does not wake the driver', async () => {
    const calls: Call[] = []
    const assembly = await loopAssembly([execution()], recording(calls))
    const handle = await parkedAtModelWait(assembly)
    await turns()
    // One read and one sleep since the waiting commit: the driver never woke on its own event.
    expect(afterWaitSaved(calls)).toEqual(['load', 'sleep'])
    expect(assembly.controls.clock.pending()).toHaveLength(1)
    expect((await journalState(assembly)).kind).toBe('waiting')
    assembly.release.open()
    await eventsOf(handle)
  })

  it('a result that arrives after the read of the wait wakes the driver before the check time', async () => {
    const assembly = await loopAssembly([execution()], recording([]))
    const handle = await parkedAtModelWait(assembly)
    assembly.release.open()
    const events = await eventsOf(handle)
    expect(events.at(-1)?.body).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    // The clock never reached the check time: the wake came from the Journal events.
    expect(ok(await assembly.dependencies.clock.now())).toBe('1970-01-01T00:00:00Z')
  })

  it('a result that arrives between the waiting commit and the read of the wait wakes it at once', async () => {
    let assembly: LoopAssembly | null = null
    const calls: Call[] = []
    assembly = await loopAssembly(
      [execution()],
      recording(calls, async load => {
        if (assembly === null) throw new Error('the assembly is not ready')
        await settleModel(assembly)
        return load()
      }),
    )
    const handle = ok(await invoke(assembly))
    const events = await eventsOf(handle)
    expect(events.at(-1)?.body).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    expect(ok(await assembly.dependencies.clock.now())).toBe('1970-01-01T00:00:00Z')
  })
})

describe('AG-03: a failure in the wait is not progress and not a result', () => {
  it('an unavailable read of the wait neither wakes nor ends the run; the result that arrives later does', async () => {
    const calls: Call[] = []
    const unavailable: Failure = {
      kind: 'unavailable',
      owner: 'agentJournal',
      diagnostic: 'injected',
    }
    const assembly = await loopAssembly(
      [execution()],
      recording(calls, async () => fail(unavailable)),
    )
    const handle = await parkedAtModelWait(assembly)
    await turns()
    // The failed read is no progress: the driver sleeps and reads nothing again before an event or
    // the check time.
    expect(afterWaitSaved(calls)).toEqual(['load', 'sleep'])
    expect((await journalState(assembly)).kind).toBe('waiting')
    expect(assembly.controls.clock.pending()).toHaveLength(1)
    assembly.release.open()
    const events = await eventsOf(handle)
    expect(events.at(-1)?.body).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    expect(ok(await assembly.dependencies.clock.now())).toBe('1970-01-01T00:00:00Z')
  })

  it('a denied read of the wait stops the run where it waits: no end, no check time, the slot held', async () => {
    const assembly = await loopAssembly(
      [execution()],
      recording([], async () => fail({ kind: 'denied', action: 'load' })),
    )
    ok(await invoke(assembly))
    const state = await stoppedAt(assembly, 'M6')
    expect(state.kind).toBe('waiting')
    expect(assembly.controls.clock.pending()).toEqual([])
    assembly.release.open()
    await turns()
    expect((await journalState(assembly)).kind).toBe('waiting')
  })

  it('an event cursor that is not decimal text is no position to hold: the run still ends complete', async () => {
    const assembly = await loopAssembly([execution()], dependencies => ({
      ...dependencies,
      journal: {
        ...dependencies.journal,
        async load(input) {
          const loaded = await dependencies.journal.load(input)
          if (!('ok' in loaded)) return loaded
          return {
            ok: { ...loaded.ok, output: { ...loaded.ok.output, emittedThrough: 'not-a-sequence' } },
          }
        },
      },
    }))
    assembly.release.open()
    ok(await invoke(assembly))
    await eventually(async () => (await journalState(assembly)).kind === 'ended')
    expect(await journalState(assembly)).toMatchObject({ conclusion: { kind: 'complete' } })
  })
})

describe('AG-03: invoke again while the run waits for the Model', () => {
  it('the same operation and input gets the original handle; another input conflicts; another tenant is denied', async () => {
    const calls: Call[] = []
    const assembly = await loopAssembly([execution()], recording(calls))
    const handle = await parkedAtModelWait(assembly)
    const before = await shown(assembly)
    const parked = calls.length
    const checks = assembly.controls.access.check.calls.length
    const prepares = assembly.controls.handoff.prepare.calls.length

    expect(ok(await invoke(assembly)).execution).toBe(handle.execution)
    expect(
      failure(await invoke(assembly, 'exec-1', { input: acceptedInput('input-other', 'other') })),
    ).toEqual({ kind: 'conflict', operation: operation('invoke-exec-1') })
    expect(
      failure(
        await assembly.provider.runtime.invoke({
          ...otherTenant,
          execution: execution(),
          operation: operation('invoke-exec-1'),
          initial: acceptedInput('input-exec-1', 'hello exec-1'),
          grant: null,
        }),
      ),
    ).toMatchObject({ kind: 'denied' })

    // The two own-tenant invokes passed the guard once each; the foreign one never reached it.
    expect(assembly.controls.access.check.calls.length).toBe(checks + 2)
    // Nothing was prepared, opened, loaded or committed, and the run still sleeps on its wait.
    expect(assembly.controls.handoff.prepare.calls.length).toBe(prepares)
    expect(calls.slice(parked)).toEqual([])
    expect(await shown(assembly)).toEqual(before)
    expect(assembly.controls.clock.pending()).toHaveLength(1)

    assembly.release.open()
    const events = await eventsOf(handle)
    expect(events.filter(event => event.body.kind === 'ended')).toHaveLength(1)
  })
})
