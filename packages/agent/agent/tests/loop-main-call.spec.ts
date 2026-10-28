import { describe, expect, it } from 'vitest'
import { agentEvaluator, agentModelDeliverySchema } from '@omne-harness/agent'
import type { AgentDependencies } from '@omne-harness/agent'
import type { Authority, JournalCommit, FinishIntent } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  decodeResultVersion,
  decodeOutputCursor,
  resolveModelInvocationRef,
  type ResultPart,
  type Termination,
} from '@omne-harness/model-contract'
import { fail } from '@omne-harness/operation-result'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import {
  acceptedInput,
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
  loopAssembly,
  eventually,
  invoke,
  eventsOf,
  type LoopAssembly,
} from './loop-support.ts'

type Dependencies = AgentDependencies<Principal, ContentBlock>
const FINAL_FAILURE: Termination = {
  kind: 'failed',
  fault: { cause: 'upstream-unavailable', diagnostic: 'final', upstreamStatus: null },
}
function coordinator(assembly: LoopAssembly) {
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
  })
}
async function load(assembly: LoopAssembly) {
  return ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() }))
}
async function pushed(assembly: LoopAssembly) {
  const pending = (await load(assembly)).effects[0]?.pending
  if (pending?.kind !== 'model' || !assembly.controls.pusher)
    throw new Error('original Model call required')
  const ref = ok(resolveModelInvocationRef(pending.reference, alice.tenant))
  return assembly.controls.pusher.settled({ tenant: alice.tenant, call: ref.call })
}
async function settledAssembly(
  parts: readonly ResultPart[],
  termination: Termination = FINAL_FAILURE,
  wrap: (d: Dependencies) => Dependencies = d => d,
) {
  const assembly = await loopAssembly([execution()], d =>
    wrap({
      ...d,
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          async admit(input) {
            const admitted = await d.models.calls.admit(input)
            if ('ok' in admitted) {
              assembly.controls.models.settle({
                tenant: input.tenant,
                call: input.call,
                version: ok(decodeResultVersion('mrver_final')),
                termination,
                parts,
                source: evidence('final-settlement'),
                pageSize: 1,
                pageTargetBytes: 65536,
              })
              await assembly.controls.pusher?.settled({ tenant: input.tenant, call: input.call })
            }
            return admitted
          },
        },
      },
    }),
  )
  return assembly
}
async function eventKinds(assembly: LoopAssembly) {
  const page = ok(
    await assembly.dependencies.journal.output.read({
      ...alice,
      execution: execution(),
      after: null,
      limit: 100,
    }),
  )
  if (page.kind !== 'page') throw new Error('new execution must have contiguous events')
  return page.events.map(event => event.body.kind)
}

describe('received Model result adoption', () => {
  it('saves the fixed request and effect before admit; normal Agent path never polls, reads or acknowledges Model', async () => {
    const writes: JournalCommit<Principal>[] = []
    const forbidden = () => {
      throw new Error('Agent used the producer consumption surface')
    }
    const assembly = await loopAssembly(
      [execution()],
      d => ({
        ...d,
        journal: {
          ...d.journal,
          commit(input) {
            writes.push(input)
            return d.journal.commit(input)
          },
          recordResult: forbidden,
        },
        models: {
          ...d.models,
          instances: { connect: forbidden },
          consumption: {
            beginRead: forbidden,
            readNext: forbidden,
            closeRead: forbidden,
            acknowledge: forbidden,
          },
          calls: {
            ...d.models.calls,
            inspect: forbidden,
            dispatches: forbidden,
            async admit(input) {
              const saved = await load(assembly)
              expect(saved.checkpoint.requestPreparation?.kind).toBe('ready')
              expect(saved.effects[0]?.pending).toEqual(saved.checkpoint.calls[0])
              return d.models.calls.admit(input)
            },
          },
        },
      }),
      { texts: ['one', 'two', 'three'], pageSize: 1 },
    )
    assembly.release.open()
    const c = coordinator(assembly)
    ok(await c.accept())
    ok(await c.runExecution())
    const saved = await load(assembly)
    expect(saved.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    expect(saved.entries).toHaveLength(1)
    expect(saved.results).toEqual([])
    expect(await eventKinds(assembly)).toEqual(['input-taken', 'producer', 'message', 'ended'])
    const delivered = await pushed(assembly)
    expect(delivered.status).toBe('saved')
    expect(assembly.controls.pusher?.acknowledgements()).toHaveLength(1)
    expect(writes.filter(write => write.effects.length > 0)).toHaveLength(1)
    const entry = saved.entries?.[0]
    if (!entry || entry.kind !== 'received') throw new Error('received entry required')
    expect(
      ok(await assembly.dependencies.materials.read({ ...alice, source: entry.material })),
    ).toMatchObject({ kind: 'facts', schema: agentModelDeliverySchema })
  })

  it('waits on Journal before delivery and adopts the same call after the push', async () => {
    const assembly = await loopAssembly([execution()])
    const c = coordinator(assembly)
    ok(await c.accept())
    ok(await c.runExecution())
    const before = await load(assembly)
    expect(before.state).toMatchObject({ kind: 'waiting', waits: [{ kind: 'producer' }] })
    expect(before.entries).toEqual([])
    assembly.release.open()
    expect((await pushed(assembly)).status).toBe('saved')
    ok(await c.runExecution())
    const after = await load(assembly)
    expect(after.state.kind).toBe('ended')
    expect(after.effects).toEqual(before.effects)
    expect(await eventKinds(assembly)).toEqual([
      'input-taken',
      'waiting',
      'producer',
      'message',
      'ended',
    ])
  })

  it('restarts after intent without re-admitting an already accepted call', async () => {
    let admits = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          admit(input) {
            admits++
            return d.models.calls.admit(input)
          },
        },
      },
    }))
    const first = coordinator(assembly)
    const authority = ok(await first.accept())
    ok(await first.runExecution())
    const before = await load(assembly),
      preparations = assembly.controls.requests.prepare.calls.length
    assembly.release.open()
    await pushed(assembly)
    ok(await coordinator(assembly).continueExecution(authority))
    expect((await load(assembly)).state.kind).toBe('ended')
    expect((await load(assembly)).effects).toEqual(before.effects)
    expect(admits).toBe(1)
    expect(assembly.controls.requests.prepare.calls).toHaveLength(preparations)
  })

  it('rebuilds the same ready intent after stopping before its publication', async () => {
    let stop = true,
      admits = 0
    const intents: JournalCommit<Principal>[] = []
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        commit(input) {
          if (input.operation.startsWith('M0/')) {
            intents.push(input)
            if (stop)
              return Promise.resolve(
                fail({ kind: 'unavailable', owner: 'cut', diagnostic: 'before intent' }),
              )
          }
          return d.journal.commit(input)
        },
      },
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          admit(input) {
            admits++
            return d.models.calls.admit(input)
          },
        },
      },
    }))
    const first = coordinator(assembly),
      authority = ok(await first.accept())
    expect(failure(await first.runExecution())).toMatchObject({ node: 'M0' })
    expect((await load(assembly)).effects).toEqual([])
    expect(admits).toBe(0)
    stop = false
    assembly.release.open()
    ok(await coordinator(assembly).continueExecution(authority))
    expect(intents).toHaveLength(2)
    expect(intents[1]?.effects).toEqual(intents[0]?.effects)
    expect((await load(assembly)).state.kind).toBe('ended')
    expect(admits).toBe(1)
  })

  it('reconciles a lost admission answer using the original reference without another admit', async () => {
    let admits = 0
    const references: string[] = []
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          async admit(input) {
            admits++
            ok(await d.models.calls.admit(input))
            return fail({ kind: 'commit-unknown', operation: input.operation })
          },
          inspect(input) {
            references.push(input.reference)
            return d.models.calls.inspect(input)
          },
        },
      },
    }))
    assembly.release.open()
    const c = coordinator(assembly)
    ok(await c.accept())
    ok(await c.runExecution())
    expect(admits).toBe(1)
    expect(new Set(references).size).toBe(1)
    expect((await load(assembly)).state.kind).toBe('ended')
  })

  it('cannot resume a detached authority even though the host receives its result', async () => {
    const assembly = await loopAssembly([execution()]),
      c = coordinator(assembly)
    const authority = ok(await c.accept())
    ok(await c.runExecution())
    ok(
      await assembly.dependencies.journal.detach({
        ...alice,
        execution: execution(),
        operation: operation('detach'),
        authority,
        reason: evidence('stopped'),
      }),
    )
    assembly.release.open()
    expect((await pushed(assembly)).status).toBe('saved')
    expect(failure(await coordinator(assembly).continueExecution(authority)).failure.kind).toBe(
      'stale-advance',
    )
    expect(await eventKinds(assembly)).toEqual(['input-taken', 'waiting'])
  })

  it('rechecks authority after reading a saved material and never publishes under a revoked owner', async () => {
    let authority: Authority | undefined,
      revoke = true
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      materials: {
        ...d.materials,
        async read(input) {
          const result = await d.materials.read(input)
          if (revoke && authority) {
            revoke = false
            ok(
              await d.journal.detach({
                ...alice,
                execution: execution(),
                operation: operation('detach-at-material'),
                authority,
                reason: evidence('revoked'),
              }),
            )
          }
          return result
        },
      },
    }))
    assembly.release.open()
    const c = coordinator(assembly)
    authority = ok(await c.accept())
    expect(failure(await c.runExecution()).failure.kind).toBe('stale-advance')
    expect((await load(assembly)).entries).toHaveLength(1)
    expect(await eventKinds(assembly)).toEqual(['input-taken'])
  })

  it.each(['schema', 'payload'] as const)(
    'rejects a saved material with corrupt %s without publishing a reply',
    async corrupt => {
      const assembly = await loopAssembly([execution()], d => ({
        ...d,
        materials: {
          ...d.materials,
          async read(input) {
            const read = await d.materials.read(input)
            if ('failure' in read || read.ok.kind !== 'facts') return read
            return {
              ok:
                corrupt === 'schema'
                  ? { ...read.ok, schema: { ...read.ok.schema, revision: 'unknown' } }
                  : {
                      ...read.ok,
                      value: { kind: 'string' as const, value: 'not a Model envelope' },
                    },
            }
          },
        },
      }))
      assembly.release.open()
      const c = coordinator(assembly)
      ok(await c.accept())
      expect(failure(await c.runExecution())).toMatchObject({
        node: 'M3',
        failure: { kind: 'invalid', field: 'received.material' },
      })
      expect(await eventKinds(assembly)).toEqual(['input-taken'])
      expect(
        assembly.controls.handoff.accept.calls.filter(call => call.source.kind === 'model-reply'),
      ).toEqual([])
    },
  )

  it.each([
    ['failed', [], 'fail'],
    ['partial-text', [{ kind: 'partial', content: 'text', value: 'half', trims: [] }], 'complete'],
    [
      'partial-tool',
      [{ kind: 'partial', content: 'tool-arguments', value: '{', trims: [] }],
      'complete',
    ],
  ] as const)(
    'adopts %s from received material and retains the original bytes',
    async (_name, parts, conclusion) => {
      const assembly = await settledAssembly(parts),
        c = coordinator(assembly)
      ok(await c.accept())
      ok(await c.runExecution())
      expect((await load(assembly)).state).toMatchObject({
        kind: 'ended',
        conclusion: { kind: conclusion },
      })
      expect((await load(assembly)).entries).toHaveLength(1)
      expect((await load(assembly)).results).toEqual([])
      expect((await pushed(assembly)).delivery).toMatchObject({ parts })
      expect(await eventKinds(assembly)).toEqual(['input-taken', 'producer', 'ended'])
    },
  )

  it.each(['reply', 'partial', 'no-reply'] as const)(
    'resumes %s after producer publication from the same material without duplicate delivery',
    async kind => {
      let cut = true,
        admits = 0
      const parts: readonly ResultPart[] =
        kind === 'reply'
          ? [
              {
                kind: 'sealed',
                trims: [],
                block: {
                  kind: 'text',
                  id: acceptedInput('reply').content.blocks[0].id,
                  visibility: { toHuman: true, toModel: true },
                  text: 'saved reply',
                },
              },
            ]
          : kind === 'partial'
            ? [{ kind: 'partial', content: 'text', value: 'partial', trims: [] }]
            : []
      const assembly = await settledAssembly(
        parts,
        kind === 'reply' ? { kind: 'completed', reason: 'stop' } : FINAL_FAILURE,
        d => ({
          ...d,
          models: {
            ...d.models,
            calls: {
              ...d.models.calls,
              admit(input) {
                admits++
                return d.models.calls.admit(input)
              },
            },
          },
          materials: {
            ...d.materials,
            async read(input) {
              const at = await load(assembly)
              if (cut && at.checkpoint.position === 'M4') {
                cut = false
                return fail({ kind: 'unavailable', owner: 'cut', diagnostic: 'after producer' })
              }
              return d.materials.read(input)
            },
          },
        }),
      )
      const c = coordinator(assembly),
        authority = ok(await c.accept())
      expect(failure(await c.runExecution())).toMatchObject({ node: 'I3' })
      const before = await load(assembly)
      expect(before.checkpoint.position).toBe('M4')
      ok(await coordinator(assembly).continueExecution(authority))
      expect((await load(assembly)).entries).toEqual(before.entries)
      expect(admits).toBe(1)
      expect((await eventKinds(assembly)).filter(kind => kind === 'producer')).toHaveLength(1)
      expect((await load(assembly)).state).toMatchObject({
        kind: 'ended',
        conclusion: { kind: kind === 'no-reply' ? 'fail' : 'complete' },
      })
      const replies = assembly.controls.handoff.accept.calls.filter(
        item => item.source.kind === 'model-reply',
      )
      expect(replies).toHaveLength(kind === 'reply' ? 1 : 0)
    },
  )
})

it('a live waiting driver rereads receiver-only revisions at its injected check time', async () => {
  const assembly = await loopAssembly([execution()])
  const handle = ok(await invoke(assembly))
  await eventually(async () => assembly.controls.clock.pending().length > 0)
  const before = await load(assembly)
  assembly.release.open()
  expect((await pushed(assembly)).status).toBe('saved')
  const received = await load(assembly)
  expect(received.executionAttachment).toEqual(before.executionAttachment)
  expect(received.revision).not.toEqual(before.revision)
  const due = assembly.controls.clock.pending()[0]
  if (!due) throw new Error('injected timer required')
  ok(assembly.controls.clock.advanceTo(due))
  const events = await eventsOf(handle)
  expect(events.filter(event => event.body.kind === 'message')).toHaveLength(1)
  expect((await load(assembly)).state.kind).toBe('ended')
})

it('no-reply waits for injected time and retains one candidate after an excluded F1 commit', async () => {
  let times = 0
  let unknown = true
  const candidates: FinishIntent[] = []
  const assembly = await settledAssembly([], FINAL_FAILURE, d => ({
    ...d,
    clock: {
      ...d.clock,
      async now() {
        times += 1
        return times === 1
          ? fail({ kind: 'unavailable', owner: 'clock', diagnostic: 'time unavailable' })
          : d.clock.now()
      },
    },
    journal: {
      ...d.journal,
      commit(input) {
        if (input.state.kind === 'settling' && input.operation.startsWith('F1/')) {
          candidates.push(input.state.intent)
          if (unknown) {
            unknown = false
            assembly.controls.journal.failNext('commit', {
              kind: 'commit-unknown',
              outcome: 'dropped',
            })
          }
        }
        return d.journal.commit(input)
      },
    },
  }))
  const c = coordinator(assembly)
  ok(await c.accept())
  expect(failure(await c.runExecution())).toMatchObject({
    node: 'I3',
    failure: { owner: 'clock' },
  })
  expect((await load(assembly)).checkpoint.position).toBe('M4')
  expect(failure(await c.runExecution())).toMatchObject({
    node: 'F1',
    failure: { kind: 'commit-unknown' },
  })
  ok(await c.runExecution())
  expect(times).toBe(2)
  expect(candidates).toHaveLength(2)
  expect(candidates[1]).toEqual(candidates[0])
  expect(candidates[0]?.failure).toMatchObject({
    kind: 'no-reply',
    at: assembly.controls.clock.now(),
  })
})

it.each<readonly [string, ResultPart]>([
  [
    'reasoning state',
    {
      kind: 'sealed',
      trims: [],
      block: {
        kind: 'reasoning_state',
        id: acceptedInput('replay').content.blocks[0].id,
        visibility: { toHuman: false, toModel: true },
        payload: 'opaque',
        pairs: [],
      },
    },
  ],
  [
    'sealed thinking',
    {
      kind: 'sealed',
      trims: [],
      block: {
        kind: 'thinking',
        id: acceptedInput('replay').content.blocks[0].id,
        visibility: { toHuman: false, toModel: true },
        text: 'reason',
      },
    },
  ],
  ['partial thinking', { kind: 'partial', content: 'thinking', value: 'reason', trims: [] }],
])(
  'unsupported replay interpretation preserves the received %s without publishing a reply',
  async (_name, part) => {
    // The public scripted producer rejects reasoning_state in its sealed-result allowlist.
    // This one case therefore tests a direct typed delivery to the actual receiver, not producer ACK.
    const direct = part.kind === 'sealed' && part.block.kind === 'reasoning_state'
    const assembly = direct ? await loopAssembly([execution()]) : await settledAssembly([part])
    const c = coordinator(assembly)
    ok(await c.accept())
    if (direct) {
      ok(await c.runExecution())
      const pending = (await load(assembly)).checkpoint.calls[0]
      const receiver = assembly.controls.receiver
      if (pending?.kind !== 'model' || !receiver)
        throw new Error('original call and receiver required')
      const version = ok(decodeResultVersion('mrver_reasoning'))
      ok(
        await receiver.push({
          access: alice,
          signal: new AbortController().signal,
          delivery: {
            kind: 'result',
            key: { kind: 'result', reference: pending.reference, result: version },
            consumer: pending.position,
            parts: [part],
            accounts: [],
            settlement: {
              version,
              cursor: ok(decodeOutputCursor('1')),
              source: evidence('direct-delivery'),
              termination: FINAL_FAILURE,
            },
          },
        }),
      )
    }
    const observed = failure(await c.runExecution())
    expect(observed, JSON.stringify(observed)).toMatchObject({
      node: 'M3',
      failure: { kind: 'unsupported' },
    })
    const snapshot = await load(assembly),
      entry = snapshot.entries?.[0]
    if (!entry || entry.kind !== 'received') throw new Error('received entry required')
    expect(snapshot.checkpoint.calls).toHaveLength(1)
    expect((await eventKinds(assembly)).filter(kind => kind === 'message')).toEqual([])
    expect(
      JSON.stringify(
        ok(await assembly.dependencies.materials.read({ ...alice, source: entry.material })),
      ),
    ).toContain(part.kind === 'partial' ? part.value : part.block.kind)
    expect(assembly.controls.pusher?.acknowledgements()).toHaveLength(direct ? 0 : 1)
  },
)

it('an input submitted during the call leaves the fixed request intact and reaches the next boundary', async () => {
  const assembly = await loopAssembly([execution()]),
    c = coordinator(assembly)
  ok(await c.accept())
  ok(await c.runExecution())
  const before = await load(assembly)
  ok(
    await assembly.dependencies.journal.submit({
      ...alice,
      execution: execution(),
      operation: operation('later'),
      value: acceptedInput('later'),
    }),
  )
  assembly.release.open()
  await pushed(assembly)
  ok(await c.runExecution())
  const after = await load(assembly)
  expect(after.effects[0]).toEqual(before.effects[0])
  expect(
    assembly.controls.handoff.accept.calls.filter(item => item.source.kind === 'model-reply'),
  ).toHaveLength(2)
  expect(after.checkpoint.step).toBe('step-2')
  expect(after.state.kind).toBe('ended')
})

it('a transient material read failure resumes the same received delivery without another admission', async () => {
  let failRead = true,
    admissions = 0
  const assembly = await loopAssembly([execution()], d => ({
    ...d,
    models: {
      ...d.models,
      calls: {
        ...d.models.calls,
        admit(input) {
          admissions++
          return d.models.calls.admit(input)
        },
      },
    },
    materials: {
      ...d.materials,
      read(input) {
        if (failRead) {
          failRead = false
          return Promise.resolve(
            fail({ kind: 'unavailable', owner: 'material', diagnostic: 'retry' }),
          )
        }
        return d.materials.read(input)
      },
    },
  }))
  assembly.release.open()
  const c = coordinator(assembly)
  ok(await c.accept())
  expect(failure(await c.runExecution())).toMatchObject({ node: 'M3' })
  const before = await load(assembly)
  ok(await c.runExecution())
  expect(admissions).toBe(1)
  expect((await load(assembly)).entries).toEqual(before.entries)
  expect((await eventKinds(assembly)).filter(kind => kind === 'producer')).toHaveLength(1)
  expect((await load(assembly)).state.kind).toBe('ended')
})

it('fresh recovery reconciles an unreadable lost admission without creating another call', async () => {
  let offline = true,
    admits = 0
  const assembly = await loopAssembly([execution()], d => ({
    ...d,
    models: {
      ...d.models,
      calls: {
        ...d.models.calls,
        async admit(input) {
          admits++
          ok(await d.models.calls.admit(input))
          return fail({ kind: 'commit-unknown', operation: input.operation })
        },
        inspect(input) {
          return offline
            ? Promise.resolve(
                fail({ kind: 'unavailable', dependency: 'admission', diagnostic: 'offline' }),
              )
            : d.models.calls.inspect(input)
        },
      },
    },
  }))
  const first = coordinator(assembly),
    authority = ok(await first.accept())
  ok(await first.runExecution())
  const before = await load(assembly)
  expect(before.entries).toEqual([])
  offline = false
  assembly.release.open()
  await pushed(assembly)
  ok(await coordinator(assembly).continueExecution(authority))
  expect(admits).toBe(1)
  expect((await load(assembly)).effects).toEqual(before.effects)
  expect((await load(assembly)).state.kind).toBe('ended')
})

it('revocation after recovery proves not-accepted prevents its first real admission', async () => {
  let recovering = false,
    attempts = 0,
    authority: Authority | null = null
  const assembly = await loopAssembly([execution()], d => ({
    ...d,
    models: {
      ...d.models,
      calls: {
        ...d.models.calls,
        async admit(input) {
          attempts++
          return recovering
            ? d.models.calls.admit(input)
            : fail({ kind: 'unavailable', dependency: 'admission', diagnostic: 'before admission' })
        },
        async inspect(input) {
          const result = await d.models.calls.inspect(input)
          if (recovering && authority !== null)
            ok(
              await d.journal.detach({
                ...alice,
                execution: execution(),
                operation: operation('revoke-before-admit'),
                authority,
                reason: evidence('revoked'),
              }),
            )
          return result
        },
      },
    },
  }))
  const first = coordinator(assembly)
  authority = ok(await first.accept())
  expect(failure(await first.runExecution())).toMatchObject({ node: 'M6' })
  recovering = true
  expect(failure(await coordinator(assembly).continueExecution(authority)).failure.kind).toBe(
    'stale-advance',
  )
  expect(attempts).toBe(1)
  expect((await load(assembly)).entries).toEqual([])
})
