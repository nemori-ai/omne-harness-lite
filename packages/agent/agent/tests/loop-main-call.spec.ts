import { describe, expect, it } from 'vitest'
import { agentEvaluator } from '@omne-harness/agent'
import type { AgentDependencies } from '@omne-harness/agent'
import type {
  Authority,
  JournalCommit,
  FinishIntent,
  Material,
  Evidence,
} from '@omne-harness/agent-contract'
import { judgeContentBlock, type ContentBlock } from '@omne-harness/content-block'
import {
  decodeDispatchId,
  decodeModelOperationId,
  decodeResultVersion,
  resolveModelInvocationRef,
  type ResultPart,
  type Termination,
  type AckInput,
} from '@omne-harness/model-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import {
  acceptedInput,
  evidence,
  execution,
  failure,
  ok,
  operation,
  tenantB,
  type Principal,
} from './journal-support.ts'
import { options } from './factory-support.ts'
import { alice, eventually, loopAssembly, type LoopAssembly } from './loop-support.ts'
import { agentProcessedResultSchema } from '../src/loop/processed-result.ts'
import { memoryMaterials } from './materials-support.ts'

type Dependencies = AgentDependencies<Principal, ContentBlock>

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

const FINAL_FAILURE: Termination = {
  kind: 'failed',
  fault: { cause: 'upstream-unavailable', diagnostic: 'final', upstreamStatus: null },
}

/** The original scripted Model settles without the success gate opening. */
async function settledAssembly(
  parts: readonly ResultPart[],
  termination = FINAL_FAILURE,
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
            if ('ok' in admitted)
              assembly.controls.models.settle({
                tenant: input.tenant,
                call: input.call,
                version: ok(decodeResultVersion('mrver_final')),
                termination,
                parts,
                source: evidence('final-settlement'),
                pageSize: 10,
                pageTargetBytes: 65536,
              })
            return admitted
          },
        },
      },
    }),
  )
  return assembly
}

/** The real post-producer cut: M3 has committed M4, then I3's first material read fails. */
async function committedProducerAssembly(wrap: (d: Dependencies) => Dependencies = d => d) {
  let cut = true
  return settledAssembly(
    [{ kind: 'partial', content: 'text', value: 'partial after producer', trims: [] }],
    FINAL_FAILURE,
    d =>
      wrap({
        ...d,
        materials: {
          ...d.materials,
          async read(input) {
            const at = ok(await d.journal.load({ ...alice, execution: execution() }))
            if (cut && at.checkpoint.position === 'M4') {
              cut = false
              return fail({
                kind: 'unavailable',
                owner: 'cut-at-I3',
                diagnostic: 'after producer commit',
              })
            }
            return d.materials.read(input)
          },
        },
      }),
  )
}

async function discardAtCommittedProducer(assembly: LoopAssembly) {
  let original: ReturnType<typeof coordinator> | null = coordinator(assembly)
  const authority = ok(await original.accept())
  expect(failure(await original.runExecution())).toMatchObject({
    node: 'I3',
    failure: { owner: 'cut-at-I3' },
  })
  expect((await load(assembly)).checkpoint.position).toBe('M4')
  original = null
  return authority
}

describe('#514 main call boundary', () => {
  it.each([
    'unavailable',
    'unknown',
    'unconfirmed',
    'version',
    'consumer',
    'receipt',
    'operation',
  ] as const)(
    'R1: %s ACK confirmation cannot silently complete a narrow continuation',
    async fault => {
      let recovering = false
      let reads = 0,
        admissions = 0,
        acks = 0
      const assembly = await committedProducerAssembly(d => ({
        ...d,
        models: {
          ...d.models,
          calls: {
            ...d.models.calls,
            admit(input) {
              admissions++
              return d.models.calls.admit(input)
            },
            async inspect(input) {
              if (recovering) {
                recovering = false
                if (fault === 'unavailable')
                  return fail({
                    kind: 'unavailable',
                    dependency: 'original-ACK',
                    diagnostic: 'not readable',
                  })
                if (fault === 'unknown')
                  return fail({
                    kind: 'commit-unknown',
                    operation: ok(decodeModelOperationId('mop_ack_unknown')),
                  })
                const found = ok(await d.models.calls.inspect(input))
                if (
                  found.kind !== 'found' ||
                  found.state.phase !== 'settled' ||
                  found.state.custody.kind !== 'acknowledged'
                )
                  throw new Error('missing actual ACK')
                const state = found.state,
                  custody = found.state.custody
                if (fault === 'unconfirmed')
                  return succeed({
                    kind: 'found',
                    state: { ...state, custody: { kind: 'producer' } },
                  })
                if (fault === 'version')
                  return succeed({
                    kind: 'found',
                    state: {
                      ...state,
                      settlement: {
                        ...state.settlement,
                        version: ok(decodeResultVersion('mrver_wrong')),
                      },
                    },
                  })
                if (fault === 'consumer')
                  return succeed({
                    kind: 'found',
                    state: { ...state, consumer: { ...state.consumer, position: 'other' } },
                  })
                if (fault === 'receipt')
                  return succeed({
                    kind: 'found',
                    state: {
                      ...state,
                      custody: { ...custody, receipt: { ...custody.receipt, record: 'wrong' } },
                    },
                  })
                return succeed({
                  kind: 'found',
                  state: {
                    ...state,
                    custody: { ...custody, operation: ok(decodeModelOperationId('mop_wrong_ack')) },
                  },
                })
              }
              return d.models.calls.inspect(input)
            },
          },
          consumption: {
            ...d.models.consumption,
            beginRead(input) {
              reads++
              return d.models.consumption.beginRead(input)
            },
            acknowledge(input) {
              acks++
              return d.models.consumption.acknowledge(input)
            },
          },
        },
      }))
      const authority = await discardAtCommittedProducer(assembly)
      recovering = true
      const fresh = coordinator(assembly)
      expect(failure(await fresh.continueExecution(authority))).toMatchObject({ node: 'I3' })
      const stopped = await load(assembly)
      expect(stopped.state.kind).toBe('advancing')
      expect(stopped.results[0]?.release.kind).toBe('pending')
      ok(await fresh.runExecution())
      expect((await load(assembly)).results[0]?.release.kind).toBe('confirmed')
      expect([reads, admissions, acks]).toEqual([1, 1, 1])
    },
  )

  it.each(['unavailable', 'applied', 'dropped', 'pending'] as const)(
    'R1: release %s keeps one identity and reconciles an unknown original write',
    async fault => {
      let first = true
      const writes: ReturnType<typeof operation>[] = []
      const queries: ReturnType<typeof operation>[] = []
      let acks = 0,
        reads = 0,
        admissions = 0
      const assembly = await committedProducerAssembly(d => ({
        ...d,
        journal: {
          ...d.journal,
          recordResult(input) {
            if (input.release.kind === 'confirmed') {
              writes.push(input.operation)
              if (first) {
                first = false
                assembly.controls.journal.failNext(
                  'recordResult',
                  fault === 'unavailable'
                    ? { kind: 'unavailable' }
                    : { kind: 'commit-unknown', outcome: fault === 'pending' ? 'pending' : fault },
                )
              }
            }
            return d.journal.recordResult(input)
          },
          query(input) {
            queries.push(input.operation)
            return d.journal.query(input)
          },
        },
        models: {
          ...d.models,
          calls: {
            ...d.models.calls,
            admit(input) {
              admissions++
              return d.models.calls.admit(input)
            },
          },
          consumption: {
            ...d.models.consumption,
            beginRead(input) {
              reads++
              return d.models.consumption.beginRead(input)
            },
            acknowledge(input) {
              acks++
              return d.models.consumption.acknowledge(input)
            },
          },
        },
      }))
      const authority = await discardAtCommittedProducer(assembly)
      const fresh = coordinator(assembly)
      expect(failure(await fresh.continueExecution(authority))).toMatchObject({ node: 'O0' })
      const original = writes[0]
      if (!original) throw new Error('missing original release')
      expect((await load(assembly)).results[0]?.release.kind).toBe(
        fault === 'applied' ? 'confirmed' : 'pending',
      )
      if (fault === 'pending') {
        assembly.controls.journal.failNextRead('query')
        expect(failure(await fresh.runExecution())).toMatchObject({
          node: 'O0',
          failure: { kind: 'unavailable' },
        })
        expect(failure(await fresh.runExecution())).toMatchObject({
          node: 'O0',
          failure: { kind: 'commit-unknown', operation: original },
        })
        expect(writes).toHaveLength(1)
        expect((await load(assembly)).results[0]?.release.kind).toBe('pending')
        expect(assembly.controls.journal.settle(execution(), original, 'applied')).toBe(true)
      }
      ok(await fresh.runExecution())
      const after = await load(assembly)
      expect(after.results[0]?.release.kind).toBe('confirmed')
      expect(new Set(writes)).toEqual(new Set([original]))
      if (fault !== 'unavailable') expect(queries).toContain(original)
      expect([reads, admissions, acks]).toEqual([1, 1, 1])
    },
  )

  it.each(['reply', 'partial', 'no-reply'] as const)(
    'R1: restores original ACK release after M3 committed M4 for %s',
    async kind => {
      let cut = true
      let reads = 0,
        admissions = 0,
        acks = 0
      const releases: string[] = []
      const judged = judgeContentBlock({
        kind: 'text',
        id: 'blk_01234567890123456789012345',
        visibility: { toHuman: true, toModel: true },
        text: 'reply after committed M3',
      })
      if ('rejected' in judged) throw new Error(judged.rejected)
      const parts: readonly ResultPart[] =
        kind === 'reply'
          ? [{ kind: 'sealed', block: judged.ok, trims: [] }]
          : kind === 'partial'
            ? [{ kind: 'partial', content: 'text', value: 'partial after committed M3', trims: [] }]
            : []
      const assembly = await settledAssembly(
        parts,
        kind === 'reply' ? { kind: 'completed', reason: 'stop' } : FINAL_FAILURE,
        d => ({
          ...d,
          materials: {
            ...d.materials,
            async read(input) {
              const at = ok(await d.journal.load({ ...alice, execution: execution() }))
              if (cut && at.checkpoint.position === 'M4') {
                cut = false
                return fail({
                  kind: 'unavailable',
                  owner: 'cut-at-I3',
                  diagnostic: 'after producer commit',
                })
              }
              return d.materials.read(input)
            },
          },
          journal: {
            ...d.journal,
            recordResult(input) {
              if (input.release.kind === 'confirmed') releases.push(input.operation)
              return d.journal.recordResult(input)
            },
          },
          models: {
            ...d.models,
            calls: {
              ...d.models.calls,
              admit(input) {
                admissions++
                return d.models.calls.admit(input)
              },
            },
            consumption: {
              ...d.models.consumption,
              beginRead(input) {
                reads++
                return d.models.consumption.beginRead(input)
              },
              acknowledge(input) {
                acks++
                return d.models.consumption.acknowledge(input)
              },
            },
          },
        }),
      )
      let original: ReturnType<typeof coordinator> | null = coordinator(assembly)
      const authority = ok(await original.accept())
      expect(failure(await original.runExecution())).toMatchObject({
        node: 'I3',
        failure: { owner: 'cut-at-I3' },
      })
      const before = await load(assembly)
      expect(before.checkpoint.position).toBe('M4')
      expect(before.results[0]?.release.kind).toBe('pending')
      const pending = before.checkpoint.calls[0]
      if (pending?.kind !== 'model') throw new Error('missing original call')
      const found = ok(
        await assembly.dependencies.models.calls.inspect({
          ...alice,
          reference: pending.reference,
        }),
      )
      if (found.kind !== 'found' || found.state.custody.kind !== 'acknowledged')
        throw new Error('missing real ACK')
      const receipt = found.state.custody.receipt
      original = null
      const fresh = coordinator(assembly)
      ok(await fresh.continueExecution(authority))
      const after = await load(assembly)
      expect(after.state).toMatchObject({
        kind: 'ended',
        conclusion: { kind: kind === 'no-reply' ? 'fail' : 'complete' },
      })
      expect(after.results[0]?.release).toEqual({ kind: 'confirmed', receipt })
      expect([reads, admissions, acks]).toEqual([1, 1, 1])
      expect(assembly.controls.requests.prepare.calls).toHaveLength(2)
      ok(await fresh.runExecution())
      expect((await load(assembly)).results[0]?.release).toEqual({ kind: 'confirmed', receipt })
      expect(new Set(releases).size).toBe(1)
      const output = ok(
        await assembly.dependencies.journal.output.read({
          ...alice,
          execution: execution(),
          after: null,
          limit: 100,
        }),
      )
      if (output.kind !== 'page') throw new Error('missing output')
      expect(output.events.filter(e => e.body.kind === 'producer')).toHaveLength(1)
    },
  )

  it.each([
    'preserve-before-write',
    'preserve-after-write',
    'preserve-unknown',
    'binding-failure',
  ] as const)(
    'L3-B1: %s keeps Model responsibility until material and binding both exist',
    async fault => {
      let first = true
      let acknowledgements = 0
      let orphan: Evidence | null = null
      let reads = 0
      const assembly = await settledAssembly(
        [{ kind: 'partial', content: 'text', value: 'saved partial', trims: [] }],
        FINAL_FAILURE,
        d => ({
          ...d,
          materials: {
            ...d.materials,
            async preserve(input) {
              if (first && fault.startsWith('preserve')) {
                first = false
                if (fault === 'preserve-after-write' || fault === 'preserve-unknown')
                  orphan = ok(await d.materials.preserve(input))
                if (fault === 'preserve-unknown')
                  return fail({ kind: 'commit-unknown', operation: operation('material-preserve') })
                return fail({ kind: 'unavailable', owner: 'materials', diagnostic: 'retry' })
              }
              const saved = await d.materials.preserve(input)
              if ('ok' in saved) orphan = saved.ok
              return saved
            },
          },
          journal: {
            ...d.journal,
            recordResult(input) {
              if (first && fault === 'binding-failure' && input.transfer.kind === 'processed') {
                first = false
                return Promise.resolve(
                  fail({ kind: 'unavailable', owner: 'binding', diagnostic: 'retry' }),
                )
              }
              return d.journal.recordResult(input)
            },
          },
          models: {
            ...d.models,
            consumption: {
              ...d.models.consumption,
              beginRead(input) {
                reads++
                return d.models.consumption.beginRead(input)
              },
              acknowledge(input) {
                acknowledgements++
                return d.models.consumption.acknowledge(input)
              },
            },
          },
        }),
      )
      const c = coordinator(assembly)
      ok(await c.accept())
      expect(failure(await c.runExecution())).toMatchObject({ node: 'M3' })
      expect(acknowledgements).toBe(0)
      expect((await load(assembly)).results).toEqual([])
      if (fault !== 'preserve-before-write') {
        if (orphan === null) throw new Error('lost orphan material')
        expect(
          JSON.stringify(
            ok(await assembly.dependencies.materials.read({ ...alice, source: orphan })),
          ),
        ).toContain('saved partial')
      }
      ok(await c.runExecution())
      expect(reads).toBe(1)
      expect(acknowledgements).toBe(1)
      expect((await load(assembly)).results[0]?.completion).toEqual(orphan)
    },
  )

  it('L3-B1: a foreign material owner remains unchanged and prevents ACK', async () => {
    let acknowledgements = 0
    const materials = memoryMaterials<Principal>('foreign-material-owner')
    const assembly = await settledAssembly([], FINAL_FAILURE, d => ({
      ...d,
      materials,
      models: {
        ...d.models,
        consumption: {
          ...d.models.consumption,
          acknowledge(input) {
            acknowledgements++
            return d.models.consumption.acknowledge(input)
          },
        },
      },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    expect(failure(await c.runExecution())).toMatchObject({
      node: 'M3',
      failure: { kind: 'invalid', field: 'materials.owner' },
    })
    expect(acknowledgements).toBe(0)
    expect((await load(assembly)).results).toEqual([])
  })

  it.each(['unknown-schema', 'corrupt-parts'] as const)(
    'L3-B1: %s cannot turn a bound result into an empty reply',
    async fault => {
      let acknowledgements = 0
      let corrupted = false
      const assembly = await settledAssembly([], FINAL_FAILURE, d => ({
        ...d,
        materials: {
          ...d.materials,
          async read(input) {
            const material = await d.materials.read(input)
            if (!corrupted && 'ok' in material && material.ok.kind === 'facts') {
              corrupted = true
              if (fault === 'unknown-schema')
                return succeed({
                  ...material.ok,
                  schema: { ...agentProcessedResultSchema, revision: 'unknown' },
                })
              if (material.ok.value.kind !== 'object') throw new Error('expected object')
              return succeed({
                ...material.ok,
                value: {
                  kind: 'object',
                  entries: material.ok.value.entries.map(e =>
                    e.key === 'parts' ? { key: e.key, value: { kind: 'null' } } : e,
                  ),
                },
              })
            }
            return material
          },
        },
        models: {
          ...d.models,
          consumption: {
            ...d.models.consumption,
            acknowledge(input) {
              acknowledgements++
              return d.models.consumption.acknowledge(input)
            },
          },
        },
      }))
      const c = coordinator(assembly)
      ok(await c.accept())
      expect(failure(await c.runExecution())).toMatchObject({
        node: 'M3',
        failure: { kind: 'invalid', field: 'processed-result' },
      })
      expect(acknowledgements).toBe(0)
      expect(assembly.controls.handoff.accept.calls).toHaveLength(1)
      ok(await c.runExecution())
      expect(acknowledgements).toBe(1)
      expect((await load(assembly)).state).toMatchObject({
        kind: 'ended',
        conclusion: { kind: 'fail' },
      })
    },
  )

  it('L3-B1: immutable materials recognize the same identity, conflict on different facts and enforce access', async () => {
    const assembly = await settledAssembly([], FINAL_FAILURE)
    const c = coordinator(assembly)
    ok(await c.accept())
    ok(await c.runExecution())
    const original = assembly.controls.materials.preserve.calls[0]
    if (!original || original.value.kind !== 'facts') throw new Error('missing original material')
    const source = ok(await assembly.dependencies.materials.preserve(original))
    expect(source).toEqual((await load(assembly)).results[0]?.completion)
    expect(
      failure(
        await assembly.dependencies.materials.preserve({
          ...original,
          value: { ...original.value, schema: { ...original.value.schema, revision: 'different' } },
        }),
      ),
    ).toMatchObject({ kind: 'conflict' })
    expect(ok(await assembly.dependencies.materials.read({ ...alice, source }))).toEqual(
      original.value,
    )
    expect(
      failure(await assembly.dependencies.materials.read({ ...alice, principal: 'bob', source })),
    ).toMatchObject({ kind: 'denied' })
  })

  it.each([
    'readNext',
    'readNext-throw',
    'readNext-closeRead',
    'closeRead',
    'closeRead-after-write',
  ] as const)(
    'L3-B2: %s failure can reenter with the original call, version and consumption',
    async fault => {
      let stop = true
      let closeStop = true
      let admissions = 0
      const reads: string[] = []
      const closes: string[] = []
      const assembly = await loopAssembly(
        [execution()],
        d => ({
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
            consumption: {
              ...d.models.consumption,
              beginRead(input) {
                reads.push(input.operation)
                return d.models.consumption.beginRead(input)
              },
              readNext(input) {
                if (stop && fault.startsWith('readNext')) {
                  stop = false
                  if (fault === 'readNext-throw') throw new Error('page throw')
                  return Promise.resolve(
                    fail({ kind: 'unavailable', dependency: 'page', diagnostic: 'retry' }),
                  )
                }
                return d.models.consumption.readNext(input)
              },
              async closeRead(input) {
                closes.push(input.read)
                if (closeStop && fault === 'readNext-closeRead') {
                  closeStop = false
                  return fail({ kind: 'unavailable', dependency: 'close', diagnostic: 'retry' })
                }
                if (stop && fault !== 'readNext') {
                  stop = false
                  if (fault === 'closeRead-after-write')
                    ok(await d.models.consumption.closeRead(input))
                  return fail({ kind: 'unavailable', dependency: 'close', diagnostic: 'retry' })
                }
                return d.models.consumption.closeRead(input)
              },
            },
          },
        }),
        { texts: ['one', 'two'], pageSize: 1 },
      )
      assembly.release.open()
      const c = coordinator(assembly)
      ok(await c.accept())
      expect(failure(await c.runExecution())).toMatchObject({ node: 'M3' })
      expect((await load(assembly)).results).toEqual([])
      ok(await c.runExecution())
      const after = await load(assembly)
      expect(after.state.kind).toBe('ended')
      expect(admissions).toBe(1)
      expect(after.results).toHaveLength(1)
      expect(after.results[0]?.consumption).toBe(after.effects[0]?.pending.consumption)
      if (fault.startsWith('readNext')) expect(new Set(reads).size).toBe(2)
      else {
        expect(reads).toHaveLength(1)
        expect(new Set(closes).size).toBe(1)
      }
      const messages = assembly.controls.handoff.accept.calls.filter(
        i => i.source.kind === 'model-reply',
      )
      expect(messages).toHaveLength(1)
      expect(messages[0]?.candidate.blocks).toHaveLength(2)
      const pending = after.effects[0]?.pending
      const originalResult = after.results[0]?.result
      if (pending?.kind !== 'model' || !originalResult) throw new Error('missing original result')
      for (const operation of new Set(reads)) {
        // Reconcile each actual read identity after ACK. Each relationship is ended, including
        // the incomplete one that failed; no inspection starts a new reading relationship.
        const ended = ok(
          await assembly.dependencies.models.consumption.beginRead({
            ...alice,
            reference: pending.reference,
            operation: ok(decodeModelOperationId(operation)),
            result: ok(decodeResultVersion(originalResult.version)),
          }),
        )
        expect(ended).toMatchObject({ kind: 'started', value: { kind: 'ended' } })
      }
    },
  )

  it.each(['reply', 'partial', 'no-reply'] as const)(
    'L3-B1: discards result caches after ACK and reaches the same %s outcome from Journal completion',
    async kind => {
      let cut = true
      let reads = 0
      let admissions = 0
      const judged = judgeContentBlock({
        kind: 'text',
        id: 'blk_01234567890123456789012345',
        visibility: { toHuman: true, toModel: true },
        text: 'saved reply',
      })
      if ('rejected' in judged) throw new Error(judged.rejected)
      const text = { kind: 'sealed', trims: [], block: judged.ok } as const
      const parts: readonly ResultPart[] =
        kind === 'reply'
          ? [text]
          : kind === 'partial'
            ? [{ kind: 'partial', content: 'text', value: 'saved partial', trims: [] }]
            : []
      const assembly = await settledAssembly(
        parts,
        kind === 'reply' ? { kind: 'completed', reason: 'stop' } : FINAL_FAILURE,
        d => ({
          ...d,
          journal: {
            ...d.journal,
            commit(input) {
              if (cut && input.operation.startsWith('M3/'))
                return Promise.resolve(
                  fail({ kind: 'unavailable', owner: 'cut', diagnostic: 'after ACK' }),
                )
              return d.journal.commit(input)
            },
          },
          models: {
            ...d.models,
            calls: {
              ...d.models.calls,
              admit(input) {
                admissions++
                return d.models.calls.admit(input)
              },
            },
            consumption: {
              ...d.models.consumption,
              beginRead(input) {
                reads++
                return d.models.consumption.beginRead(input)
              },
            },
          },
        }),
      )
      let c: ReturnType<typeof coordinator> | null = coordinator(assembly)
      const authority = ok(await c.accept())
      expect(failure(await c.runExecution())).toMatchObject({ node: 'M3' })
      c = null
      const before = await load(assembly)
      const pending = before.checkpoint.calls[0]
      if (pending?.kind !== 'model') throw new Error('missing call')
      expect(
        ok(
          await assembly.dependencies.models.calls.inspect({
            ...alice,
            reference: pending.reference,
          }),
        ),
      ).toMatchObject({ kind: 'found', state: { custody: { kind: 'acknowledged' } } })
      cut = false
      ok(await coordinator(assembly).continueExecution(authority))
      expect(reads).toBe(1)
      expect(admissions).toBe(1)
      const after = await load(assembly)
      expect(after.results[0]?.completion).toEqual(before.results[0]?.completion)
      expect(after.state).toMatchObject({
        kind: 'ended',
        conclusion: { kind: kind === 'no-reply' ? 'fail' : 'complete' },
      })
      const replies = assembly.controls.handoff.accept.calls.filter(
        i => i.source.kind === 'model-reply',
      )
      expect(replies).toHaveLength(kind === 'reply' ? 1 : 0)
      if (kind === 'reply') expect(replies[0]?.candidate.blocks).toEqual([text.block])
    },
  )

  it.each([
    'tenant',
    'version',
    'consumer',
    'fake-reference',
    'no-binding',
    'raw-only',
    'principal',
    'revoked',
  ] as const)('L3-B1: strict ACK proof rejects %s', async fault => {
    let hideBinding = false
    let delegated = 0
    const assembly = await settledAssembly([], FINAL_FAILURE, d => ({
      ...d,
      journal: {
        ...d.journal,
        async load(input) {
          const saved = await d.journal.load(input)
          return hideBinding && 'ok' in saved ? succeed({ ...saved.ok, results: [] }) : saved
        },
      },
      models: {
        ...d.models,
        consumption: {
          ...d.models.consumption,
          acknowledge: async () => {
            delegated++
            return fail({ kind: 'unavailable', dependency: 'cut', diagnostic: 'before ACK' })
          },
        },
      },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    expect(failure(await c.runExecution())).toMatchObject({ node: 'M3' })
    const saved = await load(assembly),
      binding = saved.results[0]
    const pending = saved.effects[0]?.pending
    if (
      !binding?.completion ||
      pending?.kind !== 'model' ||
      binding.result.producer.kind !== 'model'
    )
      throw new Error('missing completion')
    const material = ok(
      await assembly.dependencies.materials.read({ ...alice, source: binding.completion }),
    )
    if (fault === 'consumer') {
      if (material.kind !== 'facts' || material.value.kind !== 'object')
        throw new Error('expected facts')
      const consumer = material.value.entries.find(e => e.key === 'consumer')
      if (!consumer) throw new Error('missing consumer')
      const changed: Material<ContentBlock> = {
        ...material,
        value: {
          kind: 'object',
          entries: material.value.entries.map(e =>
            e.key === 'consumer'
              ? { key: e.key, value: { kind: 'string', value: 'wrong consumer' } }
              : e,
          ),
        },
      }
      assembly.controls.materials.read.once(() => succeed(changed))
    }
    if (fault === 'raw-only')
      assembly.controls.materials.read.once(() =>
        succeed({ kind: 'model', result: binding.result, pages: [] }),
      )
    hideBinding = fault === 'no-binding'
    if (fault === 'revoked')
      assembly.controls.models.revokeAccess({
        ...alice,
        call: binding.result.producer.call,
        actions: 'all',
      })
    const input: AckInput<Principal> = {
      ...alice,
      call: binding.result.producer.call,
      operation: ok(decodeModelOperationId('mop_bad_proof')),
      result:
        fault === 'version'
          ? ok(decodeResultVersion('mrver_other'))
          : ok(decodeResultVersion(binding.result.version)),
      evidence: {
        kind: 'processed',
        completion:
          fault === 'fake-reference'
            ? { ...binding.completion, record: 'missing' }
            : binding.completion,
      },
    }
    const invalid = await assembly.dependencies.models.consumption.acknowledge({
      ...input,
      tenant: fault === 'tenant' ? tenantB : input.tenant,
      principal: fault === 'principal' ? 'bob' : input.principal,
    })
    expect(failure(invalid)).toMatchObject({ kind: 'handoff-invalid' })
    expect(delegated).toBe(1)
    const inspected = await assembly.dependencies.models.calls.inspect({
      ...alice,
      reference: pending.reference,
    })
    if (fault === 'revoked') expect(failure(inspected)).toMatchObject({ kind: 'denied' })
    else
      expect(ok(inspected)).toMatchObject({
        kind: 'found',
        state: { custody: { kind: 'producer' } },
      })
  })

  it('L3-B1: partial content remains readable from processed materials after Model ACK', async () => {
    const marker = 'partial content retained by the consumer'
    const assembly = await settledAssembly([
      { kind: 'partial', content: 'text', value: marker, trims: [] },
    ])
    let c: ReturnType<typeof coordinator> | null = coordinator(assembly)
    ok(await c.accept())
    ok(await c.runExecution())
    c = null
    const saved = await load(assembly)
    const completion = saved.results[0]?.completion
    if (!completion) throw new Error('missing processed completion')
    const material = ok(
      await assembly.dependencies.materials.read({ ...alice, source: completion }),
    )
    expect(JSON.stringify(material)).toContain(marker)
    const pending = saved.effects[0]?.pending
    if (pending?.kind !== 'model') throw new Error('missing original call')
    expect(
      ok(
        await assembly.dependencies.models.consumption.beginRead({
          ...alice,
          reference: pending.reference,
          operation: ok(decodeModelOperationId('mop_after_ack')),
          result: ok(decodeResultVersion('mrver_final')),
        }),
      ).kind,
    ).toBe('acknowledged')
  })

  it('L3-B2: retries accounting after a closed Read without reading or admitting again', async () => {
    let failures = 1
    let reads = 0
    let admissions = 0
    const assembly = await settledAssembly([], FINAL_FAILURE, d => ({
      ...d,
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          admit(input) {
            admissions++
            return d.models.calls.admit(input)
          },
          dispatches(input) {
            if (failures-- > 0)
              return Promise.resolve(
                fail({ kind: 'unavailable', dependency: 'ledger', diagnostic: 'retry later' }),
              )
            return d.models.calls.dispatches(input)
          },
        },
        consumption: {
          ...d.models.consumption,
          beginRead(input) {
            reads++
            return d.models.consumption.beginRead(input)
          },
        },
      },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    expect(failure(await c.runExecution())).toMatchObject({ node: 'M3' })
    ok(await c.runExecution())
    expect((await load(assembly)).state.kind).toBe('ended')
    expect(reads).toBe(1)
    expect(admissions).toBe(1)
    expect((await load(assembly)).results).toHaveLength(1)
  })

  it('NA-M0-1: saves the fixed request, PendingCall, context and effect together before admission', async () => {
    const writes: JournalCommit<Principal>[] = []
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        commit(input) {
          writes.push(input)
          return d.journal.commit(input)
        },
      },
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          async admit(input) {
            const saved = await load(assembly)
            expect(saved.checkpoint.requestPreparation?.kind).toBe('ready')
            expect(saved.checkpoint.calls).toHaveLength(1)
            expect(saved.effects[0]?.pending).toEqual(saved.checkpoint.calls[0])
            expect(writes.filter(w => w.checkpoint.calls.length > 0)).toHaveLength(1)
            return d.models.calls.admit(input)
          },
        },
      },
    }))
    assembly.release.open()
    const c = coordinator(assembly)
    ok(await c.accept())
    ok(await c.runExecution())
    expect(writes.map(w => w.operation.split('/')[0])).not.toEqual(
      expect.arrayContaining(['I2', 'M6', 'M1', 'M4', 'M5']),
    )
  })

  it('C1: drops the coordinator after intent and rebuilds M6 from Journal under the original authority', async () => {
    let unavailable = true
    let admissions = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          inspect: input =>
            unavailable
              ? Promise.resolve(
                  fail({ kind: 'unavailable', dependency: 'cut', diagnostic: 'stopped' }),
                )
              : d.models.calls.inspect(input),
          admit: input => {
            admissions += 1
            return d.models.calls.admit(input)
          },
        },
      },
    }))
    let original: ReturnType<typeof coordinator> | null = coordinator(assembly)
    const authority = ok(await original.accept())
    ok(await original.runExecution())
    original = null
    const before = await load(assembly)
    expect(before.checkpoint.position).toBe('M6')
    expect(admissions).toBe(0)
    unavailable = false
    assembly.release.open()
    const prepares = assembly.controls.requests.prepare.calls.length
    ok(await coordinator(assembly).continueExecution(authority))
    const after = await load(assembly)
    expect(after.state.kind).toBe('ended')
    expect(after.effects).toEqual(before.effects)
    expect(admissions).toBe(1)
    expect(assembly.controls.requests.prepare.calls).toHaveLength(prepares)
  })

  it('NA-M0-1: drops the coordinator before intent and rebuilds the same call from saved ready at I2', async () => {
    let stop = true
    let originalIntent: JournalCommit<Principal> | null = null
    let admissions = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      journal: {
        ...d.journal,
        commit(input) {
          if (stop && input.operation.startsWith('M0/')) {
            originalIntent = structuredClone(input)
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
            admissions += 1
            return d.models.calls.admit(input)
          },
        },
      },
    }))
    let original: ReturnType<typeof coordinator> | null = coordinator(assembly)
    const authority = ok(await original.accept())
    expect(failure(await original.runExecution())).toMatchObject({ node: 'M0' })
    original = null
    const before = await load(assembly)
    expect(before.checkpoint).toMatchObject({
      position: 'I2',
      calls: [],
      requestPreparation: { kind: 'ready' },
    })
    expect(before.effects).toEqual([])
    expect(admissions).toBe(0)
    stop = false
    assembly.release.open()
    ok(await coordinator(assembly).continueExecution(authority))
    const after = await load(assembly)
    if (originalIntent === null) throw new Error('M0 did not reach its commit boundary')
    const captured: JournalCommit<Principal> = originalIntent
    expect(after.effects).toEqual(captured.effects)
    expect(after.effects[0]?.pending).toEqual(captured.checkpoint.calls[0])
    expect(after.effects[0]?.pending.fixed).toEqual(before.checkpoint.requestPreparation?.source)
    expect(assembly.controls.requests.prepare.calls).toHaveLength(2)
    expect(admissions).toBe(1)
    expect(after.state.kind).toBe('ended')
  })

  it('NA-M6-1: a lost admission receipt is inspected by the original reference without another admit', async () => {
    let admissions = 0
    const references: string[] = []
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          async admit(input) {
            admissions += 1
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
    expect(admissions).toBe(1)
    expect(new Set(references).size).toBe(1)
    expect((await load(assembly)).state.kind).toBe('ended')
  })

  it('NA-M6-1: revocation after not-accepted prevents admission', async () => {
    let authority: Authority | null = null
    let admissions = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          async inspect(input) {
            const seen = await d.models.calls.inspect(input)
            if (authority === null) throw new Error('no authority')
            ok(
              await d.journal.detach({
                ...alice,
                execution: execution(),
                operation: operation('detach-before-admit'),
                authority,
                reason: evidence('stop'),
              }),
            )
            return seen
          },
          admit(input) {
            admissions += 1
            return d.models.calls.admit(input)
          },
        },
      },
    }))
    const c = coordinator(assembly)
    authority = ok(await c.accept())
    expect(failure(await c.runExecution()).failure.kind).toBe('stale-advance')
    expect(admissions).toBe(0)
  })

  it('NA-M3-2: final failure is processed and returns through M4/M5 to a no-reply candidate', async () => {
    const assembly = await settledAssembly([])
    const c = coordinator(assembly)
    ok(await c.accept())
    ok(await c.runExecution())
    const saved = await load(assembly)
    expect(saved.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'fail' } })
    expect(saved.results[0]).toMatchObject({
      completion: expect.any(Object),
      release: { kind: 'confirmed' },
    })
    expect(assembly.controls.handoff.accept.calls).toHaveLength(1)
    const page = ok(
      await assembly.dependencies.journal.output.read({
        ...alice,
        execution: execution(),
        after: null,
        limit: 100,
      }),
    )
    expect(page.kind === 'page' && page.events.map(e => e.body.kind)).toEqual([
      'input-taken',
      'producer',
      'ended',
    ])
  })

  it('SC-AG-166: a failed partial tool argument is consumed without a no-reply failure or tool execution', async () => {
    const assembly = await settledAssembly([
      { kind: 'partial', content: 'tool-arguments', value: '{', trims: [] },
    ])
    const c = coordinator(assembly)
    ok(await c.accept())
    ok(await c.runExecution())
    expect((await load(assembly)).state).toMatchObject({
      kind: 'ended',
      conclusion: { kind: 'complete' },
    })
    expect(assembly.controls.handoff.accept.calls).toHaveLength(1)
  })

  it('NA-I2-2: input submitted while Model is in flight leaves its fixed request and reference unchanged', async () => {
    let accepted = false
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          async admit(input) {
            const result = await d.models.calls.admit(input)
            accepted = true
            return result
          },
        },
      },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    const running = c.runExecution()
    await eventually(async () => accepted)
    const before = await load(assembly)
    ok(
      await assembly.dependencies.journal.submit({
        ...alice,
        execution: execution(),
        operation: operation('in-flight'),
        value: acceptedInput('later'),
      }),
    )
    assembly.release.open()
    // A later step is outside this seam check: stop after the original reply is admitted.
    assembly.controls.conditions.read.once(() =>
      fail({ kind: 'unavailable', owner: 'boundary', diagnostic: 'next boundary' }),
    )
    await running
    const after = await load(assembly)
    expect(after.effects[0]).toEqual(before.effects[0])
    expect(after.checkpoint.requestPreparation).toEqual(before.checkpoint.requestPreparation)
    const pending = before.checkpoint.calls[0]
    if (pending?.kind !== 'model') throw new Error('no saved model')
    const call = ok(resolveModelInvocationRef(pending.reference, alice.tenant)).call
    expect(assembly.controls.handoff.accept.calls.at(-1)?.source).toMatchObject({
      kind: 'model-reply',
      call,
    })
  })

  it('C1: a fresh coordinator recalls the original admission after its receipt and observation were lost', async () => {
    let admitted = false
    let offline = true
    let admissions = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          async admit(input) {
            admissions += 1
            ok(await d.models.calls.admit(input))
            admitted = true
            return fail({ kind: 'commit-unknown', operation: input.operation })
          },
          inspect(input) {
            return admitted && offline
              ? Promise.resolve(
                  fail({ kind: 'unavailable', dependency: 'model-link', diagnostic: 'lost' }),
                )
              : d.models.calls.inspect(input)
          },
        },
      },
    }))
    let original: ReturnType<typeof coordinator> | null = coordinator(assembly)
    const authority = ok(await original.accept())
    ok(await original.runExecution())
    original = null
    const before = await load(assembly)
    offline = false
    assembly.release.open()
    ok(await coordinator(assembly).continueExecution(authority))
    expect(admissions).toBe(1)
    expect((await load(assembly)).effects).toEqual(before.effects)
    expect(assembly.controls.requests.prepare.calls).toHaveLength(2)
  })

  it('NA-M1-1: retry-decision and no live route save producer waiting without consuming a result', async () => {
    let reads = 0
    const assembly = await loopAssembly([execution()], d => ({
      ...d,
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          async inspect(input) {
            const found = await d.models.calls.inspect(input)
            return 'ok' in found && found.ok.kind === 'found'
              ? succeed({
                  kind: 'found',
                  state: {
                    ...found.ok.state,
                    phase: 'retry-decision',
                    dispatch: ok(decodeDispatchId('mdisp_retry')),
                  },
                })
              : found
          },
        },
        instances: { connect: async () => succeed({ kind: 'no-live-route' }) },
        consumption: {
          ...d.models.consumption,
          beginRead(input) {
            reads += 1
            return d.models.consumption.beginRead(input)
          },
        },
      },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    ok(await c.runExecution())
    expect((await load(assembly)).state).toMatchObject({
      kind: 'waiting',
      waits: [{ kind: 'producer' }],
    })
    expect(reads).toBe(0)
    expect((await load(assembly)).results).toEqual([])
  })

  const blockId = acceptedInput('block-source').content.blocks[0].id
  it.each<readonly [string, ResultPart]>([
    [
      'reasoning state',
      {
        kind: 'sealed',
        trims: [],
        block: {
          kind: 'reasoning_state',
          id: blockId,
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
          id: blockId,
          visibility: { toHuman: false, toModel: true },
          text: 'reason',
        },
      },
    ],
    ['partial thinking', { kind: 'partial', content: 'thinking', value: 'reason', trims: [] }],
  ])(
    'replay boundary: %s without producer tags closes its read and keeps Model responsibility',
    async (_, part) => {
      let processed = 0
      let acknowledgements = 0
      let closes = 0
      const assembly = await settledAssembly([], FINAL_FAILURE, d => ({
        ...d,
        journal: {
          ...d.journal,
          recordResult(input) {
            processed += 1
            return d.journal.recordResult(input)
          },
        },
        models: {
          ...d.models,
          consumption: {
            ...d.models.consumption,
            async beginRead(input) {
              const begun = await d.models.consumption.beginRead(input)
              return 'ok' in begun &&
                begun.ok.kind === 'started' &&
                begun.ok.value.kind === 'reading'
                ? succeed({
                    ...begun.ok,
                    value: { ...begun.ok.value, page: { ...begun.ok.value.page, parts: [part] } },
                  })
                : begun
            },
            acknowledge(input) {
              acknowledgements += 1
              return d.models.consumption.acknowledge(input)
            },
            closeRead(input) {
              closes += 1
              return d.models.consumption.closeRead(input)
            },
          },
        },
      }))
      const c = coordinator(assembly)
      ok(await c.accept())
      expect(failure(await c.runExecution())).toMatchObject({
        node: 'M3',
        failure: { kind: 'unsupported' },
      })
      expect([processed, acknowledgements, closes]).toEqual([0, 0, 1])
      expect(assembly.controls.handoff.accept.calls).toHaveLength(1)
      const saved = await load(assembly)
      expect(saved.checkpoint.calls).toHaveLength(1)
      const pending = saved.checkpoint.calls[0]
      if (pending?.kind !== 'model') throw new Error('no original Model reference')
      const found = ok(
        await assembly.dependencies.models.calls.inspect({
          ...alice,
          reference: pending.reference,
        }),
      )
      expect(found).toMatchObject({ kind: 'found', state: { custody: { kind: 'producer' } } })
    },
  )

  it('a close failure is explicit and does not release Model responsibility', async () => {
    let closes = 0
    const assembly = await settledAssembly([], FINAL_FAILURE, d => ({
      ...d,
      models: {
        ...d.models,
        consumption: {
          ...d.models.consumption,
          closeRead: async () => {
            closes += 1
            return fail({
              kind: 'unavailable',
              dependency: 'close-read',
              diagnostic: 'retained read',
            })
          },
        },
      },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    expect(failure(await c.runExecution())).toMatchObject({
      node: 'M3',
      failure: { owner: 'modelRuntime', diagnostic: expect.stringContaining('close-read') },
    })
    expect(closes).toBe(1)
    expect((await load(assembly)).results).toEqual([])
  })

  it('NA-M3-1: processed evidence precedes ACK; a lost ACK receipt reuses processing, call, version and cost', async () => {
    let reads = 0
    let acknowledgements = 0
    let finish: FinishIntent | null = null
    const order: string[] = []
    const assembly = await settledAssembly([], FINAL_FAILURE, d => ({
      ...d,
      journal: {
        ...d.journal,
        async recordResult(input) {
          const saved = await d.journal.recordResult(input)
          order.push(input.transfer.kind)
          return saved
        },
        tryFinish(input) {
          finish = input.intent
          return d.journal.tryFinish(input)
        },
      },
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          async admit(input) {
            const admitted = await d.models.calls.admit(input)
            const supplier = input.request.suppliers[0]
            if (supplier === undefined) throw new Error('no scripted supplier')
            assembly.controls.models.recordDispatch({
              tenant: input.tenant,
              call: input.call,
              record: {
                dispatch: ok(decodeDispatchId('mdisp_cost')),
                supplier,
                intent: input.operation,
                send: 'started',
                firstContent: 'none-proven',
                terminal: FINAL_FAILURE,
                materialization: null,
                account: {
                  subject: { kind: 'model_call', id: input.call },
                  usage: [],
                  cost: [{ state: 'known', lexeme: '0.25', unit: 'USD', source: 'supplier' }],
                  trimmed: { state: 'unknown', unit: 'tokens' },
                  place: 'script',
                  duration: { state: 'unknown' },
                  receipt: 'received',
                  revision: '1',
                },
              },
            })
            return admitted
          },
        },
        consumption: {
          ...d.models.consumption,
          beginRead(input) {
            reads += 1
            return d.models.consumption.beginRead(input)
          },
          async acknowledge(input) {
            const saved = await load(assembly)
            expect(saved.results[0]?.completion).toEqual(
              input.evidence.kind === 'processed' ? input.evidence.completion : null,
            )
            order.push('ack')
            const result = await d.models.consumption.acknowledge(input)
            acknowledgements += 1
            return acknowledgements === 1
              ? fail({ kind: 'commit-unknown', operation: input.operation })
              : result
          },
        },
      },
    }))
    const c = coordinator(assembly)
    ok(await c.accept())
    expect(failure(await c.runExecution()).node).toBe('M3')
    ok(await c.runExecution())
    expect(reads).toBe(1)
    expect(order).toEqual(['processed', 'ack', 'ack', 'none'])
    expect(finish).toMatchObject({
      failure: { kind: 'no-reply', at: assembly.controls.clock.now() },
    })
    const saved = await load(assembly)
    const result = saved.results[0]
    if (result?.result.producer.kind !== 'model') throw new Error('no original result')
    const dispatches = ok(
      await assembly.dependencies.models.calls.dispatches({
        ...alice,
        call: result.result.producer.call,
      }),
    )
    expect(dispatches).toHaveLength(1)
    expect(dispatches[0]?.account?.cost).toEqual([
      { state: 'known', lexeme: '0.25', unit: 'USD', source: 'supplier' },
    ])
    expect(result.result.version).toBe('mrver_final')
    expect(result.consumption).toBe(saved.effects[0]?.pending.consumption)
    if (!result.completion) throw new Error('no processed material binding')
    expect(
      JSON.stringify(
        ok(await assembly.dependencies.materials.read({ ...alice, source: result.completion })),
      ),
    ).toContain('0.25')
  })

  it('readNext throwing closes the original read and never acknowledges partial processing', async () => {
    let closes = 0
    let acknowledgements = 0
    const assembly = await loopAssembly(
      [execution()],
      d => ({
        ...d,
        models: {
          ...d.models,
          consumption: {
            ...d.models.consumption,
            readNext: async () => {
              throw new Error('read defect')
            },
            closeRead(input) {
              closes += 1
              return d.models.consumption.closeRead(input)
            },
            acknowledge(input) {
              acknowledgements += 1
              return d.models.consumption.acknowledge(input)
            },
          },
        },
      }),
      { texts: ['one', 'two'], pageSize: 1 },
    )
    assembly.release.open()
    const c = coordinator(assembly)
    ok(await c.accept())
    expect(failure(await c.runExecution())).toMatchObject({
      node: 'M3',
      failure: { owner: '@omne-harness/agent#defect', diagnostic: 'read defect' },
    })
    expect([closes, acknowledgements]).toEqual([1, 0])
    expect((await load(assembly)).results).toEqual([])
  })

  it.each(['applied', 'dropped'] as const)(
    'a processed record with unknown %s receipt is queried without reading again',
    async outcome => {
      let original: ReturnType<typeof operation> | null = null
      let reads = 0
      let completion: Evidence | null = null
      let acknowledgements = 0
      const assembly = await settledAssembly([], FINAL_FAILURE, d => ({
        ...d,
        journal: {
          ...d.journal,
          recordResult(input) {
            if (original === null && input.transfer.kind === 'processed') {
              original = input.operation
              completion = input.transfer.completion
              assembly.controls.journal.failNext('recordResult', {
                kind: 'commit-unknown',
                outcome,
              })
            }
            return d.journal.recordResult(input)
          },
        },
        models: {
          ...d.models,
          consumption: {
            ...d.models.consumption,
            beginRead(input) {
              reads += 1
              return d.models.consumption.beginRead(input)
            },
            acknowledge(input) {
              acknowledgements++
              return d.models.consumption.acknowledge(input)
            },
          },
        },
      }))
      const c = coordinator(assembly)
      ok(await c.accept())
      expect(failure(await c.runExecution())).toMatchObject({
        node: 'M3',
        failure: { kind: 'commit-unknown' },
      })
      expect(acknowledgements).toBe(0)
      if (completion === null) throw new Error('missing preserved material')
      expect(
        ok(await assembly.dependencies.materials.read({ ...alice, source: completion })),
      ).toMatchObject({ kind: 'facts', schema: agentProcessedResultSchema })
      ok(await c.runExecution())
      expect(reads).toBe(1)
      expect((await load(assembly)).results).toHaveLength(1)
      expect((await load(assembly)).state.kind).toBe('ended')
      expect((await load(assembly)).results[0]?.completion).toEqual(completion)
      expect(acknowledgements).toBe(1)
    },
  )

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
})
