import { describe, expect, it, vi } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { succeed } from '@omne-harness/operation-result'
import { decodeToolCallId, decodeToolOperationId } from '@omne-harness/tool-contract'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import type { HistoricalSourceFingerprint, ToolHistoryMigration } from '@omne-harness/tool'
import {
  checkToolHistory,
  type HistoryStartupInput,
} from '../../../src/rows/tool-runtime/history-startup.ts'

const parsed = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_0123456789abcdefghjkmnpqrs',
    account: 'acc_0123456789abcdefghjkmnpqrs',
  }),
)
if (!parsed.ok) throw new Error('invalid tenant fixture')
const tenant = parsed.value
const encoded = tenantCodec.encode(tenant)
if (!encoded.ok) throw new Error('invalid tenant fixture')
const callValue = decodeToolCallId('historical-call')
if ('failure' in callValue) throw new Error('invalid call fixture')
const call = callValue.ok

function setup() {
  const migration = {
    plans: vi.fn<ToolHistoryMigration<unknown>['plans']>(async () => succeed([])),
    preview: vi.fn<ToolHistoryMigration<unknown>['preview']>(async () =>
      succeed({ kind: 'current' }),
    ),
    apply: vi.fn(),
    inspect: vi.fn(),
    abandon: vi.fn(),
  } satisfies ToolHistoryMigration<unknown>
  const host = {
    inspect: vi.fn<HistoryStartupInput<unknown>['host']['inspect']>(async () =>
      succeed({ kind: 'current', records: 0 }),
    ),
    compact: vi.fn(),
  }
  const input: HistoryStartupInput<unknown> = {
    enumerate: vi.fn(async () => succeed([tenant])),
    principal: { kind: 'maintenance-fixture' },
    calls: { scan: vi.fn(async () => succeed({ calls: [call], next: null })) },
    migration,
    host,
    current: () => true,
  }
  return { input, migration, host }
}

describe('tool startup verifies historical responsibility before execution', () => {
  it('rejects historical or unknown calls without performing any conversion', async () => {
    const { input, migration, host } = setup()
    migration.preview.mockImplementation(async () =>
      succeed({ kind: 'quarantined', reason: 'unsupported-format' }),
    )
    const answer = await checkToolHistory(input)
    expect(answer).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(migration.apply).not.toHaveBeenCalled()
    expect(migration.abandon).not.toHaveBeenCalled()
    expect(host.compact).not.toHaveBeenCalled()
  })
})

it('scans every page and checks host records even when no tool call remains', async () => {
  const { input, migration, host } = setup()
  const scan = vi
    .fn<HistoryStartupInput<unknown>['calls']['scan']>()
    .mockResolvedValueOnce(succeed({ calls: [call], next: 'next-page' }))
    .mockResolvedValueOnce(succeed({ calls: [], next: null }))
  expect(await checkToolHistory({ ...input, calls: { scan } })).toEqual({ ok: undefined })
  expect(scan.mock.calls.map(([request]) => request.after)).toEqual([null, 'next-page'])
  expect(migration.preview).toHaveBeenCalledTimes(1)
  expect(host.inspect).toHaveBeenCalledTimes(1)
  host.inspect.mockImplementation(async () => succeed({ kind: 'quarantined' }))
  expect(
    await checkToolHistory({
      ...input,
      calls: { scan: async () => succeed({ calls: [], next: null }) },
    }),
  ).toMatchObject({ failure: { kind: 'unavailable' } })
})

it('rejects a late read after withdrawal without issuing the next operation', async () => {
  const { input, migration, host } = setup()
  let current = true
  const scan: HistoryStartupInput<unknown>['calls']['scan'] = async () => {
    current = false
    return succeed({ calls: [call], next: null })
  }
  expect(
    await checkToolHistory({ ...input, calls: { scan }, current: () => current }),
  ).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(migration.plans).not.toHaveBeenCalled()
  expect(host.inspect).not.toHaveBeenCalled()
})

it('treats a failed inventory as unavailable instead of an empty database', async () => {
  const { input, migration, host } = setup()
  expect(
    await checkToolHistory({
      ...input,
      enumerate: async () => {
        throw new Error('private storage detail')
      },
    }),
  ).toEqual({
    failure: {
      kind: 'unavailable',
      dependency: 'tool-history-startup',
      diagnostic: 'historical inventory could not be checked',
    },
  })
  expect(migration.plans).not.toHaveBeenCalled()
  expect(host.inspect).not.toHaveBeenCalled()
})

it('does not turn a failed lifetime check into an unhandled rejection or a pass', async () => {
  const { input, migration } = setup()
  await expect(
    checkToolHistory({
      ...input,
      current: () => {
        throw new Error('withdrawn context')
      },
    }),
  ).resolves.toMatchObject({ failure: { kind: 'unavailable' } })
  expect(migration.plans).not.toHaveBeenCalled()
})

function originalPlan(kind: 'preparing' | 'abandoning') {
  const operation = decodeToolOperationId('original-upgrade')
  const revision = decodeToolRevision('4')
  if ('failure' in operation || 'failure' in revision)
    throw new Error('invalid original plan fixture')
  const source: HistoricalSourceFingerprint = {
    format: 'tool-ledger-pre-w3',
    tenant,
    call,
    revision: revision.ok,
    keys: ['call', 'result:v1'],
    value: {
      codec: 'tool-canonical-json-v1',
      algorithm: 'sha256',
      digest: 'a'.repeat(64),
      bytes: '100',
    },
  }
  return { progress: { kind, operation: operation.ok, source }, interpretations: [] }
}

it('continues an abandoning plan once and refuses startup without starting a replacement', async () => {
  const { input, migration, host } = setup()
  const plan = originalPlan('abandoning')
  migration.plans.mockResolvedValue(succeed([plan]))
  migration.abandon.mockResolvedValue(succeed(plan.progress))
  const operation = vi.fn(() => plan.progress.operation)
  expect(
    await checkToolHistory({
      ...input,
      upgrade: { interpretations: () => [], operation, attempts: 2 },
    }),
  ).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(migration.abandon).toHaveBeenCalledExactlyOnceWith({
    principal: input.principal,
    tenant,
    call,
    operation: plan.progress.operation,
  })
  expect(migration.apply).not.toHaveBeenCalled()
  expect(migration.preview).not.toHaveBeenCalled()
  expect(host.compact).not.toHaveBeenCalled()
  expect(operation).not.toHaveBeenCalled()
})

it('bounds pending retries and keeps the original source and operation', async () => {
  const { input, migration, host } = setup()
  const plan = originalPlan('preparing')
  migration.plans.mockResolvedValue(succeed([plan]))
  migration.apply.mockResolvedValue(succeed(plan.progress))
  const operation = vi.fn(() => plan.progress.operation)
  expect(
    await checkToolHistory({
      ...input,
      upgrade: { interpretations: () => [], operation, attempts: 2 },
    }),
  ).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(migration.apply.mock.calls).toEqual(
    Array.from({ length: 2 }, () => [
      {
        principal: input.principal,
        tenant,
        call,
        operation: plan.progress.operation,
        source: plan.progress.source,
        interpretations: plan.interpretations,
      },
    ]),
  )
  expect(migration.preview).not.toHaveBeenCalled()
  expect(host.compact).not.toHaveBeenCalled()
  expect(operation).not.toHaveBeenCalled()
})
