import { createHash } from 'node:crypto'
import { fail, type Outcome } from '@omne-harness/operation-result'
import { canonicalDigest, createToolLedger } from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import {
  createMemoryToolClock,
  createMemoryToolEnvironment,
  createMemoryToolOutputCustody,
  testingTenant,
} from '@omne-harness/tool-contract/testing'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type FixedToolRequest,
} from '@omne-harness/tool-contract'
import {
  defaultResultPolicy,
  describedAdoption,
  type ToolAuthority,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { createLocalTextResults } from '@omne-harness/tool-host-local'
import { calendarToolAdoption } from '@omne-harness/calendar-tools'
import { scheduleToolAdoption } from '@omne-harness/schedule-tools'

export function value<T>(outcome: Outcome<T, unknown>): T {
  if ('failure' in outcome) throw new Error(JSON.stringify(outcome.failure))
  return outcome.ok
}
export const evidence = (record: string) => ({
  owner: 'r1-controlled-test-source',
  record,
  revision: '1',
  digest: createHash('sha256').update(record).digest('hex'),
})
export const adoption = describedAdoption({
  owner: 'r1-controlled-test-source',
  name: 'host-inputs',
  revision: '1',
})
export const construction = { kind: 'object', entries: [] } as const
export const operationId = (text: string) => value(decodeToolOperationId(text))
export const access = (id: string) => ({
  principal: 'principal:alice',
  tenant: testingTenant(`org_${'a'.repeat(26)}`, `acc_${'1'.repeat(26)}`),
  call: value(decodeToolCallId(id)),
})
export const authorities: Record<'Calendar' | 'Schedule', ToolAuthority> = {
  Calendar: {
    layer: { kind: 'official' },
    asset: { name: 'Calendar', adoption: calendarToolAdoption },
    holding: evidence('Calendar/holding'),
    publication: evidence('Calendar/publication'),
  },
  Schedule: {
    layer: { kind: 'official' },
    asset: { name: 'Schedule', adoption: scheduleToolAdoption },
    holding: evidence('Schedule/holding'),
    publication: evidence('Schedule/publication'),
  },
}
export function fixedRequest(
  availability: FixedToolRequest['availability'],
  args: unknown,
): FixedToolRequest {
  return {
    availability,
    invocation: { kind: 'direct', source: evidence('invocation') },
    command: null,
    arguments: { complete: true, original: JSON.stringify(args), effective: JSON.stringify(args) },
    settings: adoption,
    context: adoption,
    workspace: null,
    environment: availability.definition.declarations.environment,
    requesterScope: value(decodeScopeRef({ ref: 'r1-controlled-test' })),
    resources: [],
    scope: { owner: 'r1-test', key: 'fixed', grant: evidence('scope') },
    consumer: { owner: 'r1-test', work: 'composition', position: 'test', purpose: 'verification' },
    batchDecision: null,
    mode: 'foreground',
    limits: { concurrency: 1, foregroundMs: null, backgroundAfterMs: null },
  }
}
export function memoryLedger(store = createMemoryToolLedgerStore<ToolMessageContentBlock>()) {
  return createToolLedger(
    store,
    {
      access: {
        qualify: async input =>
          canonicalDigest(input.tenant) === canonicalDigest(access('unused').tenant) &&
          input.principal === 'principal:alice'
            ? { kind: 'allowed' }
            : { kind: 'denied', reason: 'Controlled tenant/principal mismatch' },
      },
      sources: { verify: async () => ({ kind: 'trusted' }) },
      factAcknowledgements: { verify: async () => ({ kind: 'trusted' }) },
      grants: new Map([['r1-test', { verifyGrant: async () => ({ kind: 'granted' as const }) }]]),
      starts: {
        qualifyStart: async () => ({
          kind: 'unavailable',
          diagnostic: 'bindings start is tested separately',
        }),
      },
      results: createLocalTextResults(),
      policy: defaultResultPolicy,
      budgets: {
        arguments: {
          maxBytes: 65536,
          maxDepth: 32,
          maxItems: 200000,
          maxMembers: 512,
          maxStringLength: 65536,
          maxNumberLength: 64,
        },
      },
    },
    createMemoryToolClock(),
    { resultPageBytes: 512, ledgerCommitAttempts: 3, queueCapacity: 100 },
    {
      custody: createMemoryToolOutputCustody<string>(),
      content: null,
      releaseInspection: createMemoryToolEnvironment<string>(),
    },
  )
}
export const absent = (dependency: string) =>
  fail({ kind: 'unavailable' as const, dependency, diagnostic: 'Controlled missing test source' })
export const denied = () => fail({ kind: 'denied' as const, action: 'restore-test-context' })

export const failureCodec = describedAdoption({
  owner: 'r1-controlled-test-source',
  name: 'utf8-failure',
  revision: '1',
})
