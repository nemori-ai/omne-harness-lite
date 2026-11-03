import {
  createToolLedger,
  type CallRecord,
  type ResultRecord,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import {
  createMemoryToolClock,
  createMemoryToolEnvironment,
} from '@omne-harness/tool-contract/testing'
import {
  decodeToolDeliveryId,
  decodeToolRevision,
  defaultResultPolicy,
  type CallAccess,
  type ToolContentReader,
  type ToolMessageContentBlock,
  type ToolOutputCustody,
} from '@omne-harness/tool-contract/provider'
import type {
  DurableEvidence,
  RawOutput,
  ToolResult,
  ToolResultVersion,
} from '@omne-harness/tool-contract'
import { createLocalTextResults } from '@omne-harness/tool-host-local'
import { evidence, operationId, request, value } from './world.ts'

export async function retainedReader(input: {
  access: CallAccess<string>
  result: ToolResultVersion
  raw: RawOutput
  retained: DurableEvidence
  resultValue: ToolResult<ToolMessageContentBlock>
  custody: ToolOutputCustody<string>
  content: Pick<ToolContentReader<string>, 'read'>
}) {
  const fixed = await request()
  const revision = value(decodeToolRevision('1'))
  const delivery = {
    kind: 'pending' as const,
    delivery: value(decodeToolDeliveryId('delivery')),
    consumer: fixed.consumer,
  }
  const call: CallRecord = {
    tenant: input.access.tenant,
    call: input.access.call,
    admission: operationId('admission'),
    request: fixed,
    initiator: { owner: 'calendar-fixture', subject: input.access.principal, revision: '1' },
    state: {
      call: input.access.call,
      revision,
      source: evidence('recorded-state'),
      foreground: null,
      effect: { kind: 'not-occurred', evidence: evidence('read-only') },
      execution: { kind: 'ended', evidence: evidence('author-returned') },
      timing: { kind: 'closed', accumulatedMs: '0' },
      queue: { kind: 'none' },
      controls: [],
      delivery,
      supplements: [],
      phase: 'settled',
      wait: { kind: 'none' },
      result: input.result,
      relation: 'foreground',
      terminal: { kind: 'completed' },
    },
    preparations: [],
    environment: null,
    start: null,
    startRejection: null,
    execution: null,
  }
  const result: ResultRecord<ToolMessageContentBlock> = {
    tenant: input.access.tenant,
    call: input.access.call,
    result: input.result,
    relation: 'original',
    terminal: { kind: 'completed' },
    actual: null,
    effect: call.state.effect,
    value: input.resultValue,
    delivery,
    source: evidence('result'),
    settledBy: operationId('settlement'),
    custody: {
      kind: 'execution',
      final: evidence('final'),
      raw: input.raw,
      retainOperation: operationId('retain'),
      retained: input.retained,
      cleanup: { kind: 'planned', operation: operationId('cleanup') },
    },
  }
  const store: ToolLedgerStore<ToolMessageContentBlock> = {
    durability: 'none',
    read: async domain => ({
      kind: 'complete',
      revision,
      records:
        domain.kind === 'call' &&
        domain.tenant === input.access.tenant &&
        domain.call === input.access.call
          ? [
              { kind: 'call', call },
              { kind: 'result', result },
            ]
          : [],
    }),
    commit: async () => {
      throw new Error('Read fixture cannot commit')
    },
  }
  let revoked = false
  const actions: string[] = []
  const unused = async (): Promise<never> => {
    throw new Error('Read fixture cannot execute')
  }
  const ledger = createToolLedger(
    store,
    {
      access: {
        qualify: async access => {
          actions.push(access.action)
          return !revoked &&
            access.principal === input.access.principal &&
            access.tenant === input.access.tenant &&
            access.call === input.access.call &&
            ['read-content', 'read-raw', 'read-raw-content'].includes(access.action)
            ? { kind: 'allowed' }
            : { kind: 'denied', reason: 'No current read grant' }
        },
      },
      sources: { verify: unused },
      factAcknowledgements: { verify: unused },
      grants: new Map(),
      starts: { qualifyStart: unused },
      results: createLocalTextResults(),
      policy: defaultResultPolicy,
      budgets: {
        arguments: {
          maxBytes: 65536,
          maxDepth: 32,
          maxItems: 1024,
          maxMembers: 128,
          maxStringLength: 32768,
          maxNumberLength: 64,
        },
      },
    },
    createMemoryToolClock(),
    { resultPageBytes: 65536, ledgerCommitAttempts: 3, queueCapacity: 10 },
    {
      custody: input.custody,
      content: input.content,
      releaseInspection: createMemoryToolEnvironment<string>(),
    },
  )
  return {
    reader: ledger.reads.content,
    actions,
    revoke: () => {
      revoked = true
    },
  }
}
