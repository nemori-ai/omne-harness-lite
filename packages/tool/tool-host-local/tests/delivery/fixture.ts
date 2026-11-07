import { vi } from 'vitest'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  createToolLedger,
  type CallRecord,
  type ResultRecord,
  type ToolLedgerGuards,
} from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
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
  createMemoryToolOutputCustody,
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
  const store = createMemoryToolLedgerStore<ToolMessageContentBlock>()
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
  const result: ResultRecord<ToolMessageContentBlock> = {
    ...access,
    result: version,
    relation: 'original',
    terminal: { kind: 'completed' },
    actual: null,
    effect: { kind: 'not-started' },
    value: ok(createLocalTextResults().text('原始结果🙂\u0000\nunchanged payload')),
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
    { resultPageBytes: 4096, ledgerCommitAttempts: 4, queueCapacity: 16 },
    {
      custody: createMemoryToolOutputCustody<string>(),
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
    input,
    access,
    result,
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
