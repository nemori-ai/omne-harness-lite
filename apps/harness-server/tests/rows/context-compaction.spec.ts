import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import {
  decodeActionId,
  decodeCompactionOperationId,
  decodeCompactionOutcome,
  decodeCompactionTaskId,
  type AgentAccessCheck,
  type AgentAccessOperation,
  type CompactionRequest,
} from '@omne-harness/agent-contract'
import { sampleCompactionInput } from '@omne-harness/agent-contract/testing'
import {
  agentAccessCheckKey,
  agentCompactionKey,
  agentReceivedRecordsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { compactionRequestDigest } from '@omne-harness/context-compaction'
import { succeed } from '@omne-harness/operation-result'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import { createContextCompactionRow } from '../../src/rows/context-compaction/index.ts'
import { storageCatalog } from '../../src/rows/storage/catalog.ts'
import { providerConfig, TENANT_A } from './storage/fixtures/tree.ts'

function ok<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}

it('mounts a rule provider over the release SQL catalog and checks each operation before exposing a task', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'release-compaction-')))
  const made = await createSqliteStorage({
    config: providerConfig(root),
    materials: storageCatalog(),
    closeLeases: { admit: () => ({}), release: () => {} },
  })
  if (made.kind !== 'created') throw new Error(`storage: ${made.reason}`)
  const ctx = new Context()
  const access = { principal: 'worker', tenant: TENANT_A }
  const binding = {
    authority: 'release/rules',
    adoption: { owner: 'test', name: 'rules', revision: '1', digest: 'rules' },
  }
  const task = ok(decodeCompactionTaskId('release-task'))
  const unsigned: CompactionRequest = {
    ref: { authority: binding.authority, tenant: TENANT_A, task, requestDigest: 'pending' },
    provider: binding.adoption,
    consumer: {
      owner: '@omne-harness/agent',
      work: 'execution/step-0',
      position: 'C1',
      purpose: 'compaction',
    },
    preparation: ok(decodeActionId('prepare')),
    input: sampleCompactionInput(),
  }
  const request = {
    ...unsigned,
    ref: { ...unsigned.ref, requestDigest: compactionRequestDigest(unsigned) },
  }
  const checks: AgentAccessOperation[] = []
  let allowed = true
  let executionCalls = 0
  const dependencies = await ctx.plugin({
    name: 'compaction-test-dependencies',
    apply(inner: Context) {
      inner.provide(storageKey, made.storage)
      inner.provide(agentAccessCheckKey, {
        async check(given: Parameters<AgentAccessCheck<unknown>['check']>[0]) {
          checks.push(given.operation)
          expect(given.target).toEqual({
            kind: 'compaction',
            task: { authority: binding.authority, task, requestDigest: request.ref.requestDigest },
          })
          return allowed
            ? {
                kind: 'allowed',
                evidence: { owner: 'access', record: 'work', revision: '1', digest: 'd' },
              }
            : { kind: 'denied' }
        },
      })
      inner.provide(agentReceivedRecordsKey, {
        query: async () => succeed({ kind: 'unknown' as const }),
      })
    },
  })
  const row = createContextCompactionRow({
    binding,
    inject: [],
    executor: () => ({
      async advance(input, generation) {
        executionCalls++
        const outcome = ok(
          decodeCompactionOutcome(
            JSON.stringify({
              kind: 'completed',
              message: {
                role: 'compaction',
                id: input.input.outputMessageId,
                blocks: input.input.history.entries[0]!.message.blocks,
                covers: { from: input.input.history.origin, to: input.input.history.upper },
                retained: [],
                derivation: generation,
              },
            }),
          ),
        )
        if (outcome.kind !== 'completed') throw new Error('rule result')
        return succeed({ phase: 'terminal', physical: 'settled', outcome })
      },
      cancel: async () => succeed('settled'),
    }),
  })
  const fiber = await ctx.plugin(row)
  try {
    await expect.poll(() => ctx.get(agentCompactionKey)).toBeDefined()
    const service = ctx.get(agentCompactionKey)
    if (service === undefined) throw new Error('provider missing')
    ok(await service.admit({ ...access, request }))
    await expect
      .poll(async () => ok(await service.inspect({ ...access, ref: request.ref })))
      .toMatchObject({
        kind: 'found',
        state: { phase: 'terminal', outcome: { kind: 'completed' } },
      })
    const state = ok(await service.inspect({ ...access, ref: request.ref }))
    if (state.kind !== 'found' || state.state.phase !== 'terminal')
      throw new Error('result missing')
    expect(
      await service.acknowledge({
        ...access,
        ref: request.ref,
        operation: ok(decodeCompactionOperationId('ack')),
        result: state.state.result,
        handoff: {
          kind: 'retained',
          consumer: request.consumer,
          custody: state.state.result.evidence,
        },
      }),
    ).toHaveProperty('failure.kind', 'unavailable')
    allowed = false
    expect(await service.inspect({ ...access, ref: request.ref })).toHaveProperty(
      'failure.kind',
      'denied',
    )
    expect(
      await service.cancel({
        ...access,
        ref: request.ref,
        operation: ok(decodeCompactionOperationId('cancel')),
      }),
    ).toHaveProperty('failure.kind', 'denied')
    expect(new Set(checks)).toEqual(
      new Set([
        'compaction.admit',
        'compaction.inspect',
        'compaction.acknowledge',
        'compaction.cancel',
      ]),
    )
    expect(executionCalls).toBe(1)
  } finally {
    await fiber.dispose()
    await dependencies.dispose()
    await made.control.close({ initiator: 'disposal' })
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
