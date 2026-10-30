import { describe, expect, it } from 'vitest'
import { agentEvaluator } from '@omne-harness/agent'
import type {
  AgentCheckpoint,
  Authority,
  ExecutionSnapshot,
  Failure,
} from '@omne-harness/agent-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  createExecutionCoordinator,
  recoveryRoute,
  type ExecutionEntry,
} from '../src/loop/coordinator.ts'
import {
  acceptedInput,
  afterTerminalPassage,
  checkpoint,
  commitAt,
  evidence,
  execution,
  failure,
  ok,
  operation,
  type Principal,
} from './journal-support.ts'
import { options } from './factory-support.ts'
import {
  alice,
  inputBatch,
  eventsOf,
  eventually,
  invoke,
  loopAssembly,
  pendingCall,
  shown,
  stoppedAt,
  type LoopAssembly,
} from './loop-support.ts'

const STOP: Failure = { kind: 'invalid', field: 'test', reason: 'stop at the evaluator' }

function coordinator(assembly: LoopAssembly, change: Partial<ExecutionEntry<Principal>> = {}) {
  return createExecutionCoordinator({
    ports: assembly.dependencies,
    binding: options().binding,
    evaluator: agentEvaluator,
    access: alice,
    execution: execution(),
    operation: operation('invoke-exec-1'),
    initial: acceptedInput('input-exec-1', 'hello exec-1'),
    grant: null,
    idle() {},
    ...change,
  })
}

async function load(assembly: LoopAssembly) {
  return ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() }))
}

function route(at: AgentCheckpoint, change: Partial<ExecutionSnapshot> = {}) {
  return recoveryRoute({ checkpoint: at, unresolved: [], state: { kind: 'advancing' }, ...change })
}

describe('E4 recovery routing', () => {
  it.each(['E4', 'I0'])('NA-E4-1: input boundary %s delegates I0 to the evaluator', position => {
    expect(ok(route(checkpoint(position)))).toBe('evaluate')
  })

  it.each([
    ['E3', 'E3'],
    ['I1', 'I1'],
    ['P0', 'P0'],
    ['P1', 'P1'],
    ['I2', 'I2'],
    ['M0', 'M0'],
    ['M6', 'M6'],
    ['M1', 'M1'],
    ['M3', 'M3'],
    ['M4', 'M4'],
    ['M5', 'M5'],
    ['I3', 'I3'],
    ['I4', 'I4'],
    ['I8', 'I8'],
    ['F1', 'F1'],
    ['F2', 'F2'],
    ['F3', 'F3'],
    ['F4', 'F4'],
    ['O0', 'O0'],
    ['E9', 'E9'],
  ])(
    'NA-E4-2: saved position %s resumes at %s without changing its facts',
    (position, expected) => {
      const at = checkpoint(position)
      const before = structuredClone(at)
      expect(ok(route(at))).toBe(expected)
      expect(route(at)).toEqual(route(before))
      expect(at).toEqual(before)
    },
  )

  it('NA-E4-2: the input batch and preparation determine the recovery point', async () => {
    const preparationsSaved: AgentCheckpoint[] = []
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        commit: input => {
          if (input.checkpoint.requestPreparation !== null) preparationsSaved.push(input.checkpoint)
          return d.journal.commit(input)
        },
      },
    }))
    assembly.release.open()
    const c = coordinator(assembly)
    ok(await c.accept())
    ok(await c.runExecution())
    const preparations = assembly.controls.requests.prepare.calls
    expect(preparations).toHaveLength(2)
    expect(preparationsSaved[0]?.requestPreparation?.kind).toBe('assembled')
    expect(ok(route(preparationsSaved[0]!))).toBe('P0')
    // Read real preparations from the Journal writes, not a second request builder.
    const at = (await load(assembly)).checkpoint
    expect(at.requestPreparation?.kind).toBe('ready')
    expect(ok(route({ ...at, position: 'I2', calls: [] }))).toBe('P1')
    expect(ok(route({ ...checkpoint('I0'), inputBatch: inputBatch(1).id }))).toBe('I1')
    expect(ok(route({ ...at, position: 'I8', calls: [] }))).toBe('I8')
  })

  it('NA-E4-3: a pending operation goes to R0 and a settled operation resumes the main call at M1', () => {
    const at = { ...checkpoint('M1'), calls: [pendingCall] }
    expect(ok(route(at, { unresolved: [operation('M1/commit@1')] }))).toBe('R0')
    expect(ok(route(at))).toBe('M1')
  })

  it.each(['F2', 'F3'])('NA-E4-2: settling resumes %s from the saved finish intent', position => {
    const intent = {
      conclusion: { kind: 'complete' as const },
      inputWatermark: evidence('inputs'),
      obligations: evidence('obligations'),
      beforeTerminal: null,
      failure: null,
    }
    expect(ok(route(checkpoint(position), { state: { kind: 'settling', intent } }))).toBe(position)
  })

  it.each([
    'C0',
    'C1',
    'C2',
    'C3',
    'C4',
    'A0',
    'A1',
    'A2',
    'A3',
    'T0',
    'T1',
    'T2',
    'T3',
    'T4',
    'T5',
    'X0',
    'X1',
    'X2',
    'X3',
    'X4',
    'X5',
  ])('NA-E4-2: unfinished node %s has a named stage owner', position => {
    expect(failure(route(checkpoint(position)))).toMatchObject({
      kind: 'unsupported',
      node: position,
      card: expect.stringContaining('#502'),
    })
  })

  it('NA-E4-2: a saved extension passage takes precedence over the E3 position', () => {
    expect(failure(route(checkpoint('E3', [afterTerminalPassage('extension')])))).toMatchObject({
      kind: 'unsupported',
      node: 'X2',
    })
  })
})

describe('E1 and E2 read-only recognition', () => {
  it('NA-E1-1: allowed enters E2 with no extra access check or business write', async () => {
    let evaluations = 0
    const assembly = await loopAssembly([execution()])
    const c = coordinator(assembly, {
      evaluator: {
        ...agentEvaluator,
        initial: () => succeed(checkpoint('I0')),
        next: facts => {
          evaluations += 1
          expect(facts.inputs).toHaveLength(1)
          return fail(STOP)
        },
      },
    })
    ok(await c.accept())
    const before = await load(assembly)
    expect(failure(await c.runExecution())).toEqual({ node: 'E4', failure: STOP })
    expect(evaluations).toBe(1)
    expect((await load(assembly)).revision).toBe(before.revision)
    expect(assembly.controls.access.check.calls).toHaveLength(0)
  })

  it('NA-E1-3: ended goes to F4 without entering E2', async () => {
    let reads = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        inputs: async input => {
          reads += 1
          return d.journal.inputs(input)
        },
      },
    }))
    assembly.release.open()
    const first = coordinator(assembly)
    ok(await first.accept())
    ok(await first.runExecution())
    reads = 0
    const again = coordinator(assembly)
    ok(await again.accept())
    ok(await again.runExecution())
    expect(reads).toBe(0)
    expect((await load(assembly)).state.kind).toBe('ended')
  })

  it.each(['load', 'inputs', 'readReplyAdmissions', 'query'] as const)(
    'NA-E2-2: unavailable %s saves dependency waiting instead of empty facts',
    async method => {
      const assembly = await loopAssembly([execution()], d => ({
        ...d,
        journal: {
          ...d.journal,
          load: async input => {
            const read = await d.journal.load(input)
            return 'ok' in read && method === 'query'
              ? succeed({ ...read.ok, unresolved: [operation('pending')] })
              : read
          },
        },
      }))
      const c = coordinator(assembly)
      ok(await c.accept())
      if (method === 'load') {
        // E1 succeeds. Its wrapper schedules the fault for the separate E2 load.
        const original = assembly.dependencies.journal.load
        let first = true
        assembly.dependencies.journal.load = async input => {
          const read = await original(input)
          if (first) {
            first = false
            assembly.controls.journal.failNextRead('load')
          }
          return read
        }
      } else assembly.controls.journal.failNextRead(method)
      const ran = await c.runExecution()
      if (method === 'query') {
        expect(failure(ran).failure.kind).toBe('unavailable')
        expect((await load(assembly)).state.kind).toBe('advancing')
        return
      }
      ok(ran)
      expect((await load(assembly)).state).toMatchObject({
        kind: 'waiting',
        waits: [{ kind: 'dependency', position: 'E2' }],
      })
    },
  )

  it('NA-E2-2: a reply projection gap saves waiting', async () => {
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        readReplyAdmissions: async () => succeed({ kind: 'gap', recovery: evidence('gap') }),
      },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    ok(await c.runExecution())
    expect((await load(assembly)).state.kind).toBe('waiting')
  })
})

describe('R0 and W0 coordination', () => {
  it.each(['unknown', 'applied', 'dropped'] as const)(
    'NA-E4-3: R0 keeps the original operation when its result is %s',
    async outcome => {
      const pending = operation('original-commit')
      const queried: string[] = []
      let queryCount = 0
      let settle = () => false
      const assembly = await loopAssembly([execution()], d => ({
        ...d,
        journal: {
          ...d.journal,
          query: async input => {
            queried.push(input.operation)
            queryCount += 1
            if (queryCount === 1 && outcome !== 'unknown') expect(settle()).toBe(true)
            return d.journal.query(input)
          },
        },
      }))
      settle = () =>
        assembly.controls.journal.settle(
          execution(),
          pending,
          outcome === 'applied' ? 'applied' : 'dropped',
        )
      const c = coordinator(assembly, {
        evaluator: {
          ...agentEvaluator,
          initial: () => succeed(checkpoint('I0')),
          next: () => fail(STOP),
        },
      })
      const authority = ok(await c.accept())
      const before = await load(assembly)
      assembly.controls.journal.failNext('commit', { kind: 'commit-unknown', outcome: 'pending' })
      expect(
        failure(
          await assembly.dependencies.journal.commit(
            commitAt(before, authority, pending, { checkpoint: before.checkpoint }),
          ),
        ),
      ).toMatchObject({ kind: 'commit-unknown' })
      const ran = await c.runExecution()
      expect(queried).toEqual([pending])
      if (outcome === 'unknown') {
        expect(failure(ran).failure).toEqual({ kind: 'commit-unknown', operation: pending })
        expect((await load(assembly)).state.kind).toBe('advancing')
      } else {
        expect(failure(ran)).toEqual({ node: 'E4', failure: STOP })
        expect((await load(assembly)).state.kind).not.toBe('waiting')
      }
    },
  )

  // SPEC "查询的四种结论与持久拒绝": R0 branches on rejected explicitly. For an unresolved operation of
  // another writer it is a settled refusal, so R0 goes on; for the coordinator's own commit it is a
  // violation of the Journal provider, reported as unavailable, never waited on.
  it.each(['own-commit', 'other-operation'] as const)(
    'NA-E4-3: R0 treats a rejected %s as settled or as a provider violation, not as unknown',
    async which => {
      const other = operation('other-ack')
      // For `own-commit`, the first commit of the coordinator is held pending and named here.
      let target: ReturnType<typeof operation> | null = which === 'other-operation' ? other : null
      const assembly = await loopAssembly([execution()], d => ({
        ...d,
        journal: {
          ...d.journal,
          commit: input => {
            if (which === 'own-commit' && target === null) {
              target = input.operation
              assembly.controls.journal.failNext('commit', {
                kind: 'commit-unknown',
                outcome: 'pending',
              })
            }
            return d.journal.commit(input)
          },
          query: async input =>
            input.operation === target
              ? {
                  ok: {
                    kind: 'rejected',
                    failure: { kind: 'conflict', operation: input.operation },
                    audit: evidence('audit'),
                    revision: '1' as never,
                  },
                }
              : d.journal.query(input),
        },
      }))
      const c = coordinator(
        assembly,
        which === 'own-commit'
          ? {}
          : {
              evaluator: {
                ...agentEvaluator,
                initial: () => succeed(checkpoint('I0')),
                next: () => fail(STOP),
              },
            },
      )
      ok(await c.accept())
      if (which === 'own-commit') {
        assembly.release.open()
        expect(failure(await c.runExecution()).failure).toMatchObject({ kind: 'commit-unknown' })
        expect(target).not.toBeNull()
        const before = await load(assembly)
        expect(failure(await c.runExecution()).failure).toMatchObject({
          kind: 'unavailable',
          owner: 'agentJournal',
        })
        expect(await load(assembly)).toEqual(before)
      } else {
        assembly.controls.journal.failNext('acknowledge', {
          kind: 'commit-unknown',
          outcome: 'pending',
        })
        expect(
          failure(
            await assembly.dependencies.journal.acknowledge({
              ...alice,
              execution: execution(),
              operation: other,
              through: '1',
              receipt: null,
            }),
          ),
        ).toMatchObject({ kind: 'commit-unknown' })
        expect(failure(await c.runExecution())).toEqual({ node: 'E4', failure: STOP })
      }
    },
  )

  it('NA-E4-3: recovery of the original main call reaches I3 without another admission', async () => {
    let connects = 0
    let admits = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          admit: input => {
            admits += 1
            return d.models.calls.admit(input)
          },
        },
        instances: {
          ...d.models.instances,
          connect: input => {
            connects += 1
            return connects === 1
              ? Promise.resolve(
                  fail({ kind: 'unavailable' as const, dependency: 'test', diagnostic: 'offline' }),
                )
              : d.models.instances.connect(input)
          },
        },
      },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    ok(await c.runExecution())
    expect((await load(assembly)).state.kind).toBe('waiting')
    const call = (await load(assembly)).checkpoint.calls[0]
    assembly.release.open()
    await eventually(
      async () =>
        ok(
          await assembly.controls.journal.port.load({ ...alice, execution: execution() }),
        ).entries?.some(
          entry =>
            entry.kind === 'received' &&
            entry.delivery.producer === 'model' &&
            entry.delivery.key.kind === 'result',
        ) === true,
    )
    ok(await c.runExecution())
    expect(admits).toBe(1)
    expect(assembly.controls.handoff.accept.calls.at(-1)?.source).toMatchObject({
      kind: 'model-reply',
      call: expect.any(String),
    })
    expect(call?.purpose).toBe('main')
    expect((await load(assembly)).state.kind).toBe('ended')
  })

  it.each(
    ['I0', 'M0', 'M3', 'Q2', 'Q4', 'I3', 'I8', 'F1', 'F2'].flatMap(target =>
      (['applied', 'dropped'] as const).flatMap(outcome =>
        (['at-R0', 'before-reentry'] as const).map(when => [target, outcome, when] as const),
      ),
    ),
  )(
    'NA-E4-3: %s %s %s resumes its successor or original frame without consuming twice',
    async (target, outcome, when) => {
      let original: ReturnType<typeof operation> | null = null
      let queries = 0
      let admits = 0
      let connects = 0
      let reads = 0
      let acknowledgements = 0
      let processed = 0
      let admittedCall: string | null = null
      const writes: string[] = []
      const assembly = await loopAssembly([execution()], d => ({
        ...d,
        journal: {
          ...d.journal,
          commit: input => {
            writes.push(input.operation)
            if (original === null && input.operation.startsWith(`${target}/commit@`)) {
              original = input.operation
              assembly.controls.journal.failNext('commit', {
                kind: 'commit-unknown',
                outcome: 'pending',
              })
            }
            return d.journal.commit(input)
          },
          recordResult: input => {
            if (input.transfer.kind === 'processed') processed += 1
            return d.journal.recordResult(input)
          },
          query: input => {
            queries += 1
            if (queries === 1 && original !== null && when === 'at-R0')
              expect(assembly.controls.journal.settle(execution(), original, outcome)).toBe(true)
            return d.journal.query(input)
          },
        },
        models: {
          ...d.models,
          calls: {
            ...d.models.calls,
            admit: input => {
              admits += 1
              admittedCall = input.call
              return d.models.calls.admit(input)
            },
          },
          instances: {
            ...d.models.instances,
            connect: input => {
              connects += 1
              return d.models.instances.connect(input)
            },
          },
          consumption: {
            ...d.models.consumption,
            acknowledge: input => {
              acknowledgements += 1
              return d.models.consumption.acknowledge(input)
            },
            beginRead: input => {
              reads += 1
              return d.models.consumption.beginRead(input)
            },
          },
        },
      }))
      assembly.release.open()
      const c = coordinator(assembly)
      ok(await c.accept())
      expect(failure(await c.runExecution()), outcome).toMatchObject({
        node: target,
        failure: { kind: 'commit-unknown' },
      })
      if (when === 'before-reentry' && original !== null)
        expect(assembly.controls.journal.settle(execution(), original, outcome)).toBe(true)
      ok(await c.runExecution())
      expect(original).not.toBeNull()
      expect(queries).toBe(1)
      expect(admits).toBe(1)
      expect(connects).toBe(0)
      expect(reads).toBe(0)
      expect(acknowledgements).toBe(0)
      expect(processed).toBe(0)
      expect(assembly.controls.pusher?.acknowledgements()).toHaveLength(1)
      expect(assembly.controls.handoff.accept.calls).toHaveLength(
        target === 'Q2' && outcome === 'dropped' ? 3 : 2,
      )
      const replies = assembly.controls.handoff.accept.calls.filter(
        call => call.source.kind === 'model-reply',
      )
      expect(new Set(replies.map(call => call.operation)).size).toBe(1)
      expect(
        replies.every(
          call => JSON.stringify(call.candidate) === JSON.stringify(replies[0]?.candidate),
        ),
      ).toBe(true)
      const saved = await load(assembly)
      expect(saved.state.kind).toBe('ended')
      expect(saved.results).toEqual([])
      expect(saved.entries).toHaveLength(1)
      const received = saved.entries?.[0]
      if (!received || received.kind !== 'received' || received.delivery.key.kind !== 'result')
        throw new Error('received result required')
      const admissions = ok(
        await assembly.dependencies.journal.readReplyAdmissions({
          ...alice,
          execution: execution(),
          through: saved.replyAdmissions.through,
          after: null,
          limit: 100,
        }),
      )
      expect(
        admissions.kind === 'page' && admissions.items.map(item => item.fact.decision),
      ).toEqual(['admitted'])
      expect(writes.filter(value => value === original)).toHaveLength(outcome === 'applied' ? 1 : 2)
      const page = ok(
        await assembly.dependencies.journal.output.read({
          ...alice,
          execution: execution(),
          after: null,
          limit: 100,
        }),
      )
      expect(page.kind === 'page' && page.events.map(event => event.body.kind)).toEqual([
        'input-taken',
        'entry',
        'producer',
        'message',
        'ended',
      ])
      expect(
        page.kind === 'page' && page.events.find(event => event.body.kind === 'producer')?.body,
      ).toMatchObject({
        result: {
          producer: { kind: 'model', call: admittedCall },
          version: received.delivery.key.result,
        },
        consumption: received.consumption,
      })
    },
  )

  it('NA-E1-1: detach between E1 and E2 stops before another Model connection', async () => {
    let connects = 0
    let reentryLoads = 0
    let resuming = false
    let idle = 0
    let authority: Authority | null = null
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        load: async input => {
          if (resuming && ++reentryLoads === 2) {
            if (authority === null) throw new Error('accept has not returned')
            ok(
              await d.journal.detach({
                ...alice,
                execution: execution(),
                operation: operation('detach-between-E1-E2'),
                authority,
                reason: evidence('handoff'),
              }),
            )
          }
          return d.journal.load(input)
        },
      },
      models: {
        ...d.models,
        instances: {
          ...d.models.instances,
          connect: input => {
            connects += 1
            return connects === 1
              ? Promise.resolve(
                  fail({ kind: 'unavailable' as const, dependency: 'test', diagnostic: 'pause' }),
                )
              : d.models.instances.connect(input)
          },
        },
      },
    }))
    const c = coordinator(assembly, {
      idle: () => {
        idle += 1
      },
    })
    authority = ok(await c.accept())
    ok(await c.runExecution())
    expect((await load(assembly)).state.kind).toBe('waiting')
    const before = await load(assembly)
    assembly.release.open()
    resuming = true
    ok(await c.runExecution())
    resuming = false
    expect(connects).toBe(0)
    expect(idle).toBe(1)
    const saved = await load(assembly)
    expect(saved.executionAttachment).toBeNull()
    expect(saved.state.kind).toBe('suspended')
    expect(saved.checkpoint).toEqual(before.checkpoint)
  })

  it('NA-E1-3: a terminal E2 snapshot takes priority over unresolved business continuation', async () => {
    let reentry = false
    let loads = 0
    let idle = 0
    let inputReads = 0
    let finish: Parameters<ExecutionEntry<Principal>['ports']['journal']['tryFinish']>[0] | null =
      null
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        tryFinish: async input => {
          finish = input
          return fail({ kind: 'unavailable', owner: 'test', diagnostic: 'pause before terminal' })
        },
        load: async input => {
          if (reentry && ++loads === 2) {
            if (finish === null) throw new Error('no finish intent')
            ok(await d.journal.tryFinish(finish))
          }
          return d.journal.load(input)
        },
        inputs: input => {
          inputReads += 1
          return d.journal.inputs(input)
        },
      },
    }))
    assembly.release.open()
    const c = coordinator(assembly, {
      idle: () => {
        idle += 1
      },
    })
    ok(await c.accept())
    expect(failure(await c.runExecution()).node).toBe('F3')
    const before = inputReads
    reentry = true
    ok(await c.runExecution())
    reentry = false
    expect(inputReads).toBe(before)
    expect(idle).toBe(1)
    const saved = await load(assembly)
    expect(saved.state.kind).toBe('ended')
    expect(ok(recoveryRoute({ ...saved, unresolved: [operation('old-business-commit')] }))).toBe(
      'F4',
    )
  })

  it('NA-W0-1: a failed waiting commit stays a failure and saves no event', async () => {
    const assembly = await loopAssembly([execution()])
    const c = coordinator(assembly)
    ok(await c.accept())
    const before = await load(assembly)
    assembly.controls.journal.failNextRead('load')
    assembly.controls.journal.failNext('commit', { kind: 'unavailable' })
    expect(failure(await c.runExecution())).toMatchObject({
      node: 'W0',
      failure: { kind: 'unavailable' },
    })
    expect(await load(assembly)).toEqual(before)
  })

  it('NA-E2-1: load, query, inputs and reply admissions reclaim facts without a revision change', async () => {
    const queried: string[] = []
    let inputReads = 0
    let admissionReads = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        load: async input => {
          const read = await d.journal.load(input)
          return 'ok' in read
            ? succeed({ ...read.ok, unresolved: [operation('invoke-exec-1')] })
            : read
        },
        query: input => {
          queried.push(input.operation)
          return d.journal.query(input)
        },
        inputs: input => {
          inputReads += 1
          return d.journal.inputs(input)
        },
        readReplyAdmissions: input => {
          admissionReads += 1
          return d.journal.readReplyAdmissions(input)
        },
      },
    }))
    const c = coordinator(assembly, {
      evaluator: {
        ...agentEvaluator,
        initial: () => succeed(checkpoint('I0')),
        next: () => fail(STOP),
      },
    })
    ok(await c.accept())
    const before = await load(assembly)
    expect(failure(await c.runExecution())).toEqual({ node: 'E4', failure: STOP })
    expect((await load(assembly)).revision).toBe(before.revision)
    expect(queried).toEqual([operation('invoke-exec-1')])
    expect(inputReads).toBe(1)
    expect(admissionReads).toBe(1)
  })
})

describe('saved waiting through invoke', () => {
  it('NA-W0-1: state, basis and event commit once while observe remains occupied', async () => {
    const writes: Parameters<ExecutionEntry<Principal>['ports']['journal']['commit']>[0][] = []
    const assembly = await loopAssembly([execution(), execution('exec-2')], d => ({
      ...d,
      journal: {
        ...d.journal,
        // Hold the failure through W0's readiness reread; a one-shot read now recovers immediately.
        inputs: async () =>
          fail({ kind: 'unavailable', owner: 'test-inputs', diagnostic: 'offline' }),
        commit: input => {
          writes.push(input)
          return d.journal.commit(input)
        },
      },
    }))
    ok(await invoke(assembly))
    const state = await stoppedAt(assembly, 'E3')
    expect(state.kind).toBe('waiting')
    expect(writes).toHaveLength(1)
    const write = writes[0]!
    expect(write.state.kind).toBe('waiting')
    expect(write.events).toEqual([
      { kind: 'waiting', waits: state.kind === 'waiting' ? state.waits : [] },
    ])
    expect((await load(assembly)).revision).not.toBe(write.expected)
    expect((await shown(assembly)).kind).toBe('occupied')
    expect(failure(await invoke(assembly, 'exec-2'))).toEqual({ kind: 'busy' })
  })

  it('NA-E1-2: unavailable E1 load preserves the original continuation in a dependency wait', async () => {
    const assembly = await loopAssembly([execution()])
    const c = coordinator(assembly)
    ok(await c.accept())
    assembly.controls.journal.failNextRead('load')
    ok(await c.runExecution())
    expect(await load(assembly)).toMatchObject({
      checkpoint: { position: 'E3' },
      state: { kind: 'waiting', waits: [{ kind: 'dependency', position: 'E1' }] },
    })
  })

  it('NA-E1-1: a replaced attachment goes to E9 without a business write', async () => {
    let idle = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        load: async input => {
          const loaded = await d.journal.load(input)
          return 'ok' in loaded ? succeed({ ...loaded.ok, executionAttachment: null }) : loaded
        },
      },
    }))
    const c = coordinator(assembly, {
      idle: () => {
        idle += 1
      },
    })
    ok(await c.accept())
    const before = await load(assembly)
    ok(await c.runExecution())
    expect(idle).toBe(1)
    expect(await load(assembly)).toEqual(before)
  })
})

describe('the recovered input boundary', () => {
  it('NA-E4-1: I0 takes the input content saved by acceptance', async () => {
    const initial = acceptedInput('persisted-input', 'the saved input')
    const messages: unknown[] = []
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        inputs: async input => {
          const read = await d.journal.inputs(input)
          if ('ok' in read) messages.push(read.ok.messages)
          return read
        },
      },
    }))
    assembly.release.open()
    const events = await eventsOf(ok(await invoke(assembly, 'exec-1', { input: initial })))
    expect(messages[0]).toEqual([initial.content])
    expect(events.find(event => event.body.kind === 'input-taken')?.body).toMatchObject({
      kind: 'input-taken',
      batch: { ordered: [initial.id] },
    })
  })
})

describe('checkpoint positions saved by the current assembly', () => {
  it('NA-E4-2: every checkpoint written on the normal path has the specified recovery destination', async () => {
    const saved: Pick<ExecutionSnapshot, 'checkpoint' | 'state' | 'unresolved'>[] = []
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        commit: input => {
          saved.push({ checkpoint: input.checkpoint, state: input.state, unresolved: [] })
          return d.journal.commit(input)
        },
      },
    }))
    const expected: Record<string, string> = {
      E4: 'evaluate',
      I1: 'I1',
      P0: 'P0',
      P1: 'P0',
      I2: 'P1',
      M6: 'M6',
      M4: 'M4',
      Q4: 'Q4',
      I3: 'I3',
      I4: 'I4',
      I8: 'I8',
      F1: 'F1',
      F2: 'F2',
      F3: 'F3',
    }
    assembly.release.open()
    const c = coordinator(assembly)
    ok(await c.accept())
    ok(await c.runExecution())
    for (const snapshot of saved)
      expect(ok(recoveryRoute(snapshot)), snapshot.checkpoint.position).toBe(
        expected[snapshot.checkpoint.position],
      )
    expect([...new Set(saved.map(snapshot => snapshot.checkpoint.position))].sort()).toEqual(
      Object.keys(expected).sort(),
    )
  })
})
