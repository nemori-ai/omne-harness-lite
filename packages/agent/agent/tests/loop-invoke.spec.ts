// C2 of #510: one input through invoke, one main call that really settles, its reply admitted, no
// action, completion proposed and the execution ended, all against the scripted Model and the memory
// Journal. invoke returns at the reliable acceptance; the Loop goes on by itself; the caller reads
// input-taken, producer and ended, numbered from 1; the runtime is idle again. The skeleton's
// temporary choices are pinned by the tests that name them (tests/README.md).
import { describe, expect, it } from 'vitest'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { fail } from '@omne-harness/operation-result'
import type { AgentDependencies } from '@omne-harness/agent'
import type {
  AgentEvent,
  AgentExecutionHandle,
  AgentObservation,
  AgentState,
  JournalCommit,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  acceptedInput,
  execution,
  failure,
  ok,
  operation,
  otherTenant,
  type Principal,
} from './journal-support.ts'
import { REPLY_TEXT, alice, loopAssembly, type LoopAssembly } from './loop-support.ts'

type Dependencies = AgentDependencies<Principal, ContentBlock>

function invoke(assembly: LoopAssembly, id = 'exec-1') {
  return assembly.provider.runtime.invoke({
    ...alice,
    execution: execution(id),
    operation: operation(`invoke-${id}`),
    initial: acceptedInput(`input-${id}`, `hello ${id}`),
    grant: null,
  })
}

/** Every event of the execution through the handle, until the ended event. */
async function eventsOf(handle: AgentExecutionHandle<Principal>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  const controller = new AbortController()
  for await (const page of handle.output.events({
    ...alice,
    execution: handle.execution,
    after: null,
    signal: controller.signal,
  })) {
    const read = ok(page)
    if (read.kind !== 'page') throw new Error('a gap in a new execution')
    events.push(...read.events)
    if (read.events.some(event => event.body.kind === 'ended')) break
  }
  controller.abort()
  return events
}

/** The states the instance shows, until `until` holds for one of them. */
async function statesUntil(
  assembly: LoopAssembly,
  until: (state: AgentState) => boolean,
): Promise<AgentState[]> {
  const states: AgentState[] = []
  const controller = new AbortController()
  for await (const seen of assembly.provider.observation.observe({
    ...alice,
    signal: controller.signal,
  }) as AsyncIterable<AgentObservation>) {
    if (seen.kind === 'ended') break
    states.push(seen.value)
    if (until(seen.value)) break
  }
  controller.abort()
  return states
}

/** The dependencies with every Journal commit recorded as node and position. */
function recordingCommits(log: [node: string, position: string][]) {
  return (dependencies: Dependencies): Dependencies => ({
    ...dependencies,
    journal: {
      ...dependencies.journal,
      commit(input: JournalCommit<Principal>) {
        // The coordinator names each commit `<node>/commit@<revision>`.
        log.push([input.operation.split('/')[0] ?? '', input.checkpoint.position])
        return dependencies.journal.commit(input)
      },
    },
  })
}

describe('C2 one input, one reply, ended', () => {
  it('invoke returns the handle at the acceptance, before the main call settles', async () => {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    expect(handle.execution).toBe(execution())
    const loaded = ok(
      await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
    )
    expect(loaded.state.kind).not.toBe('ended')
    assembly.release.open()
    await eventsOf(handle)
  })

  it('the caller reads input-taken, producer and ended, numbered 1, 2, 3', async () => {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    assembly.release.open()
    const events = await eventsOf(handle)
    expect(events.map(event => [event.sequence, event.body.kind])).toEqual([
      ['1', 'input-taken'],
      ['2', 'producer'],
      ['3', 'ended'],
    ])
    const [taken, producer, ended] = events.map(event => event.body)
    expect(taken).toMatchObject({ kind: 'input-taken', batch: { ordered: ['input-exec-1'] } })
    expect(producer).toMatchObject({ kind: 'producer', result: { version: 'mrver_1' } })
    expect(ended).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
  })

  it('the runtime goes from occupied back to idle, and the Journal holds the execution ended', async () => {
    const assembly = await loopAssembly([execution()])
    ok(await invoke(assembly))
    const occupied = await statesUntil(assembly, state => state.kind === 'occupied')
    expect(occupied.at(-1)).toMatchObject({ kind: 'occupied', execution: execution() })
    assembly.release.open()
    const states = await statesUntil(assembly, state => state.kind === 'idle')
    expect(states.at(-1)).toEqual({ kind: 'idle', instance: assembly.provider.runtime.instance })
    const loaded = ok(
      await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
    )
    expect(loaded.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    // The reply's responsibility is completed on the processed path and released after the ACK.
    expect(loaded.results).toHaveLength(1)
    expect(loaded.results[0]?.completion).not.toBeNull()
    expect(loaded.results[0]?.release.kind).toBe('confirmed')
    expect(loaded.replyAdmissions.lastAdmission).not.toBeNull()
  })

  it('admits the input and then the assistant reply through MessageHandoff', async () => {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    assembly.release.open()
    await eventsOf(handle)
    const accepted = assembly.controls.handoff.accept.calls
    expect(accepted.map(call => call.source.kind)).toEqual(['external-input', 'model-reply'])
    expect(accepted[0]?.advance).toBeNull()
    expect(accepted[1]?.candidate).toMatchObject({
      role: 'assistant',
      blocks: [{ kind: 'text', text: REPLY_TEXT }],
    })
  })

  it('a second invoke after idle runs a second execution on the same runtime', async () => {
    const assembly = await loopAssembly([execution(), execution('exec-2')])
    assembly.release.open()
    await eventsOf(ok(await invoke(assembly)))
    await statesUntil(assembly, state => state.kind === 'idle')
    const second = await eventsOf(ok(await invoke(assembly, 'exec-2')))
    expect(second.map(event => event.body.kind)).toEqual(['input-taken', 'producer', 'ended'])
  })
})

describe('临时简化，1.3–1.9 按节点表收紧: one commit per node, position moves on each time', () => {
  it('commits from E3 to F2 in path order, each moving position to the next node of the table', async () => {
    const log: [string, string][] = []
    const assembly = await loopAssembly([execution()], recordingCommits(log))
    const handle = ok(await invoke(assembly))
    assembly.release.open()
    await eventsOf(handle)
    // U0 to Q4 run before the execution exists, E1, E2 and E4 only read, F3 is tryFinish, and F4,
    // O0 and E9 come after ended: none of them writes a commit.
    expect(log).toEqual([
      ['E3', 'E4'],
      ['I0', 'I1'],
      ['I1', 'P0'],
      ['P0', 'P1'],
      ['P1', 'I2'],
      ['I2', 'M0'],
      ['M0', 'M6'],
      ['M6', 'M1'],
      ['M1', 'M3'],
      ['M3', 'M4'],
      ['M4', 'M5'],
      ['M5', 'I3'],
      ['Q1', 'Q2'],
      ['Q2', 'Q4'],
      ['Q4', 'I3'],
      ['I3', 'I4'],
      ['I4', 'I8'],
      ['I8', 'F1'],
      ['F1', 'F2'],
      ['F2', 'F3'],
    ])
  })

  it('待 #558 M04-1: the producer event goes with the commit after recordResult; M04-8: input-taken with the I0 commit', async () => {
    const commits: JournalCommit<Principal>[] = []
    const assembly = await loopAssembly([execution()], dependencies => ({
      ...dependencies,
      journal: {
        ...dependencies.journal,
        commit(input: JournalCommit<Principal>) {
          commits.push(input)
          return dependencies.journal.commit(input)
        },
      },
    }))
    const handle = ok(await invoke(assembly))
    assembly.release.open()
    await eventsOf(handle)
    const withEvents = commits
      .filter(input => input.events.length > 0)
      .map(input => [input.operation.split('/')[0], input.events.map(body => body.kind)])
    expect(withEvents).toEqual([
      ['I0', ['input-taken']],
      ['M3', ['producer']],
    ])
  })
})

describe('the handle', () => {
  it('reads the events under the access guard: another tenant is denied', async () => {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    const read = await handle.output.read({
      ...otherTenant,
      execution: execution(),
      after: null,
      limit: 10,
    })
    expect(failure(read).kind).toBe('denied')
    assembly.release.open()
    await eventsOf(handle)
  })

  it('stage-temporary (#502): submit, control and acknowledge answer a named unavailable', async () => {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    const mutation = { ...alice, execution: execution(), operation: operation('later') }
    const answers = [
      await handle.input.submit({ ...mutation, value: acceptedInput('input-2') }),
      await handle.control.control({
        ...mutation,
        command: {
          kind: 'suspend',
          reason: { owner: 't', record: 'r', revision: '1', digest: 'd' },
        },
      }),
      await handle.output.acknowledge({ ...mutation, through: '1', receipt: null }),
    ]
    for (const answer of answers)
      expect(failure(answer)).toMatchObject({ kind: 'unavailable', owner: '@omne-harness/agent' })
    // The stage table of #502 assigns submit no stage yet.
    expect(failure(answers[0] ?? fail({ kind: 'unsupported' }))).toMatchObject({
      diagnostic: 'submit is not implemented yet; #502 assigns it no stage',
    })
    assembly.release.open()
    await eventsOf(handle)
  })
})

describe('the handle reads events under the guard and only for its own execution', () => {
  /** The test assembly whose access check answers `answer` for `operation` and allows the rest. */
  async function checked(operation: 'read' | 'events', answer: 'denied' | 'unavailable') {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    assembly.controls.access.check.always(input =>
      input.operation === operation
        ? answer === 'denied'
          ? { kind: 'denied' }
          : { kind: 'unavailable', diagnostic: 'authorization offline' }
        : { kind: 'allowed', evidence: { owner: 't', record: 'r', revision: '1', digest: 'd' } },
    )
    return { assembly, handle }
  }

  /** The first item that `events` yields. */
  async function firstOf(handle: AgentExecutionHandle<Principal>, id = execution()) {
    const controller = new AbortController()
    for await (const page of handle.output.events({
      ...alice,
      execution: id,
      after: null,
      signal: controller.signal,
    })) {
      controller.abort()
      return page
    }
    throw new Error('events yielded nothing')
  }

  it.each(['denied', 'unavailable'] as const)(
    'read: a check that answers %s refuses',
    async answer => {
      const { assembly, handle } = await checked('read', answer)
      const read = await handle.output.read({
        ...alice,
        execution: execution(),
        after: null,
        limit: 10,
      })
      expect(failure(read).kind).toBe(answer)
      assembly.release.open()
    },
  )

  it.each(['denied', 'unavailable'] as const)(
    'events: a check that answers %s refuses',
    async answer => {
      const { assembly, handle } = await checked('events', answer)
      expect(failure(await firstOf(handle)).kind).toBe(answer)
      assembly.release.open()
    },
  )

  it('events: another tenant is denied', async () => {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    const controller = new AbortController()
    for await (const page of handle.output.events({
      ...otherTenant,
      execution: execution(),
      after: null,
      signal: controller.signal,
    })) {
      controller.abort()
      expect(failure(page).kind).toBe('denied')
      break
    }
    assembly.release.open()
  })

  it('read and events refuse the identity of another execution as invalid', async () => {
    const assembly = await loopAssembly([execution()])
    const handle = ok(await invoke(assembly))
    const foreign = {
      kind: 'invalid',
      field: 'execution',
      reason: 'not the execution of this handle',
    }
    const read = await handle.output.read({
      ...alice,
      execution: execution('exec-other'),
      after: null,
      limit: 10,
    })
    expect(failure(read)).toEqual(foreign)
    expect(failure(await firstOf(handle, execution('exec-other')))).toEqual(foreign)
    assembly.release.open()
  })
})

describe('the reply and the identities the coordinator mints', () => {
  it('reads a result of several pages in order into one reply', async () => {
    const texts = ['one', 'two', 'three']
    const assembly = await loopAssembly([execution()], undefined, { texts, pageSize: 1 })
    const handle = ok(await invoke(assembly))
    assembly.release.open()
    await eventsOf(handle)
    const reply = assembly.controls.handoff.accept.calls[1]?.candidate
    expect(reply?.blocks.map(block => (block.kind === 'text' ? block.text : block.kind))).toEqual(
      texts,
    )
  })

  it('derives the call, the operations and the reply message from the execution and the step', async () => {
    const admitted: string[] = []
    const assembly = await loopAssembly([execution()], dependencies => ({
      ...dependencies,
      models: {
        ...dependencies.models,
        calls: {
          ...dependencies.models.calls,
          admit(input) {
            admitted.push(input.call, input.operation)
            return dependencies.models.calls.admit(input)
          },
        },
      },
    }))
    const handle = ok(await invoke(assembly))
    assembly.release.open()
    await eventsOf(handle)
    // A 40-digit digest of the execution, then the ordinal of the step (step-1).
    expect(admitted).toEqual([
      expect.stringMatching(/^mcall_[0-9a-f]{40}_1$/u),
      expect.stringMatching(/^mop_[0-9a-f]{40}_1_admit$/u),
    ])
    expect(assembly.controls.handoff.accept.calls[1]?.candidate.id).toMatch(
      /^msg_[0-9a-f]{40}_1_reply$/u,
    )
    const loaded = ok(
      await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
    )
    expect(loaded.checkpoint.step).toBe('step-1')
  })
})

describe('the ModelInvocationRef of the main call (model-contract SPEC 可保存调用引用)', () => {
  it('is committed with the PendingCall before the first admit and names the admitted call', async () => {
    const log: string[] = []
    let saved: unknown = null
    const assembly = await loopAssembly([execution()], dependencies => ({
      ...dependencies,
      journal: {
        ...dependencies.journal,
        commit(input: JournalCommit<Principal>) {
          const [pending] = input.checkpoint.calls
          if (pending?.kind === 'model' && saved === null) {
            saved = pending.reference
            log.push(`commit ${input.operation.split('/')[0]}`)
          }
          return dependencies.journal.commit(input)
        },
      },
      models: {
        ...dependencies.models,
        calls: {
          ...dependencies.models.calls,
          async admit(input) {
            log.push('admit')
            const admitted = await dependencies.models.calls.admit(input)
            if ('ok' in admitted) {
              const parts = ok(resolveModelInvocationRef(admitted.ok.reference, input.tenant))
              expect(admitted.ok.reference).toBe(saved)
              expect(parts).toMatchObject({ call: input.call, admission: input.operation })
            }
            return admitted
          },
        },
      },
    }))
    const handle = ok(await invoke(assembly))
    assembly.release.open()
    await eventsOf(handle)
    expect(log).toEqual(['commit I2', 'admit'])
  })
})
