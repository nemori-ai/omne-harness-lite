import { vi } from 'vitest'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  createToolLedger,
  type CallRecord,
  type ResultRecord,
  type ToolLedgerGuards,
} from '@omne-harness/tool'
import {
  createMemoryToolLedgerStore,
  createMemoryToolMaterials,
  createTestResultChannels,
} from '@omne-harness/tool/testing'
import type { ToolDelivery, ToolResultReceiver } from '@omne-harness/tool-contract'
import {
  decodeToolDeliveryId,
  decodeToolResultVersion,
  decodeToolRevision,
  defaultResultPolicy,
  type ToolTask,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import {
  createMemoryToolClock,
  createMemoryToolEnvironment,
} from '@omne-harness/tool-contract/testing'
import { callId, operationId, evidence, request, tenantA } from '../coordinator-values.ts'
import { createLocalTextResults } from '../../src/text-results.ts'
import { localArgumentLimits } from '../../src/ledger-guards.ts'
import {
  createLocalToolResultDelivery,
  type LocalDeliveryInput,
} from '../../src/result-delivery.ts'

export function ok<T>(answer: Outcome<T, unknown>): T {
  if ('failure' in answer) throw new Error('fixture expected success')
  return answer.ok
}

export async function fixture() {
  const store = createMemoryToolLedgerStore()
  const access = { principal: 'host', tenant: tenantA, call: callId('original-call') }
  const consumer = request().consumer
  const version = ok(decodeToolResultVersion('result-1'))
  const delivery = {
    kind: 'pending',
    delivery: ok(decodeToolDeliveryId('delivery-1')),
    consumer,
  } as const
  const task: ToolTask = {
    kind: 'deliver',
    operation: operationId('deliver-task'),
    state: 'pending',
    diagnostic: null,
    result: version,
    delivery: delivery.delivery,
    consumer,
  }
  const materials = createMemoryToolMaterials<string>()
  const value = ok(createLocalTextResults().text('原始结果🙂\u0000\nunchanged payload'))
  const result: ResultRecord = {
    ...access,
    result: version,
    relation: 'original',
    terminal: { kind: 'completed' },
    actual: null,
    effect: { kind: 'not-started' },
    value: await createTestResultChannels({
      materials,
      access,
      operation: task.operation,
      source: evidence('original'),
      value,
    }),
    delivery,
    source: evidence('original'),
    settledBy: task.operation,
    custody: { kind: 'synthetic' },
  }
  const call: CallRecord = {
    tenant: access.tenant,
    call: access.call,
    admission: operationId('admission'),
    request: request(),
    initiator: { owner: 'test', subject: 'host', revision: '1' },
    state: {
      call: access.call,
      revision: ok(decodeToolRevision('1')),
      source: evidence('state'),
      foreground: { kind: 'final', result: version },
      effect: result.effect,
      execution: { kind: 'not-started' },
      timing: { kind: 'closed', accumulatedMs: '0' },
      queue: { kind: 'none' },
      controls: [],
      delivery,
      supplements: [],
      phase: 'settled',
      wait: { kind: 'none' },
      result: version,
      relation: 'foreground',
      terminal: result.terminal,
    },
    preparations: [],
    environment: null,
    start: null,
    startRejection: null,
    execution: null,
  }
  const domain = { kind: 'call', tenant: access.tenant, call: access.call } as const
  await store.commit({
    domain,
    expected: ok(decodeToolRevision('0')),
    revision: ok(decodeToolRevision('1')),
    writes: [
      { kind: 'put', record: { kind: 'call', call } },
      { kind: 'put', record: { kind: 'result', result } },
      { kind: 'put', record: { kind: 'task', task } },
    ],
  })
  let revoked = false
  const guards: ToolLedgerGuards<string, ToolMessageContentBlock> = {
    access: {
      qualify: async () => (revoked ? { kind: 'denied', reason: 'revoked' } : { kind: 'allowed' }),
    },
    sources: { verify: async () => ({ kind: 'trusted' }) },
    factAcknowledgements: { verify: async () => ({ kind: 'trusted' }) },
    grants: new Map(),
    starts: { qualifyStart: async () => ({ kind: 'allowed' }) },
    results: createLocalTextResults(),
    policy: defaultResultPolicy,
    budgets: { arguments: localArgumentLimits },
  }
  const ledger = createToolLedger(
    store,
    guards,
    createMemoryToolClock(),
    {
      resultPageBytes: 4096,
      ledgerCommitAttempts: 4,
      authorBufferBytes: 65_536,
      authorBufferItems: 128,
      queueCapacity: 16,
      readResultArguments: {
        maxBytes: 65_536,
        maxDepth: 32,
        maxItems: 4096,
        maxMembers: 256,
        maxStringLength: 32_768,
        maxNumberLength: 64,
      },
      offloading: {
        maxInlineUtf8Bytes: 65_536,
        maxRetentionMs: 86_400_000,
        maxBodyBytes: 16_777_216,
        previewUtf8Bytes: 1_024,
        maxPageBytes: 65_536,
        maxPageLeaseMs: 30_000,
        maxWriterMetadataBytes: 1_048_576,
        jsonDocument: {
          maxBytes: 1_048_576,
          maxDepth: 64,
          maxItems: 65_536,
          maxMembers: 65_536,
          maxStringLength: 1_048_576,
          maxNumberLength: 64,
        },
        jsonRecord: {
          maxBytes: 65_536,
          maxDepth: 32,
          maxItems: 4096,
          maxMembers: 4096,
          maxStringLength: 65_536,
          maxNumberLength: 64,
        },
      },
    },
    {
      materials,
      releaseInspection: createMemoryToolEnvironment<string>(),
      content: null,
    },
  )
  const pushes: ToolDelivery<ToolMessageContentBlock>[] = []
  const receive: ToolResultReceiver<string, ToolMessageContentBlock>['push'] = async ({
    delivery: payload,
  }) => {
    pushes.push(structuredClone(payload))
    return succeed({ key: payload.key, evidence: { ...evidence('saved'), owner: consumer.owner } })
  }
  const receiver: ToolResultReceiver<string, ToolMessageContentBlock> = { push: vi.fn(receive) }
  let identity = 0
  const input: LocalDeliveryInput<string, ToolMessageContentBlock> = {
    store,
    resultDelivery: { read: vi.fn(ledger.delivery.read) },
    commands: {
      ...ledger.commands,
      releaseDelivery: vi.fn(ledger.commands.releaseDelivery),
      recordTask: vi.fn(ledger.commands.recordTask),
    },
    reads: { ...ledger.reads, operation: vi.fn(ledger.reads.operation) },
    identities: { newOperation: vi.fn(async () => succeed(operationId(`worker-${++identity}`))) },
    access: guards.access,
    position: {
      access: vi.fn(async () => succeed(access)),
      receiver: vi.fn(async () => succeed(receiver)),
    },
    accountAtFreeze: vi.fn(async () => succeed(null)),
    capacity: 2,
  }
  const drive = (worker = createLocalToolResultDelivery(input)) =>
    worker.drive({ ...access, signal: new AbortController().signal })
  return {
    store,
    resultFor: async (target: typeof access): Promise<ResultRecord> => ({
      ...result,
      tenant: target.tenant,
      call: target.call,
      value: await createTestResultChannels({
        materials,
        access: target,
        operation: task.operation,
        source: result.source,
        value,
      }),
    }),
    input,
    access,
    result,
    value,
    call,
    task,
    domain,
    receiver,
    receive,
    pushes,
    drive,
    revoke: () => {
      revoked = true
    },
    fail,
    ledger,
  }
}
