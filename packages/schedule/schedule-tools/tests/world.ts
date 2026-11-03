import { createHash } from 'node:crypto'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import {
  createIndependentToolScope,
  createToolLedger,
  type ToolAccessGuard,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import {
  createMemoryToolClock,
  createMemoryToolEnvironment,
  createMemoryToolOutputCustody,
  testingTenant,
} from '@omne-harness/tool-contract/testing'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type FixedToolRequest,
} from '@omne-harness/tool-contract'
import {
  defaultResultPolicy,
  renderToolResult,
  type ToolAuthority,
  type ToolMessageContentBlock,
  type CallAccess,
} from '@omne-harness/tool-contract/provider'
import {
  createLocalToolLoader,
  createLocalTextResults,
  type LocalToolContributionVerifier,
} from '@omne-harness/tool-host-local'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import {
  ScheduleCallContextSchema,
  ScheduleDefinitionSchema,
  ScheduleIdSchema,
  ScheduleViewSchema,
  type ScheduleCommands,
  type ScheduleQueries,
} from '@omne-harness/schedule-contract'
import {
  createScheduleToolModule,
  scheduleToolAdoption,
  type ScheduleToolEnvironment,
} from '@omne-harness/schedule-tools'

export function value<T>(outcome: Outcome<T, unknown>): T {
  if ('failure' in outcome) throw new Error(JSON.stringify(outcome.failure))
  return outcome.ok
}
export const construction = { kind: 'object', entries: [] } as const
export const adoption = scheduleToolAdoption
export const evidence = (record: string) => ({
  owner: 'schedule-fixture',
  record,
  revision: '1',
  digest: createHash('sha256').update(record).digest('hex'),
})
export const authority: ToolAuthority = {
  layer: { kind: 'official' },
  asset: { name: 'Schedule', adoption },
  holding: evidence('holding'),
  publication: evidence('publication'),
}
export const verifier: LocalToolContributionVerifier<string> = {
  verify: input => succeed(input),
  admits: () => succeed(undefined),
}
export const access = (): CallAccess<string> => ({
  principal: 'alice',
  tenant: testingTenant(`org_${'a'.repeat(26)}`, `acc_${'1'.repeat(26)}`),
  call: value(decodeToolCallId('schedule-call')),
})
export const context = ScheduleCallContextSchema.parse({
  principalRef: 'alice',
  owner: { kind: 'tenant', tenantId: 'tenant', ownerId: 'alice' },
  actor: { kind: 'human', actorRef: 'alice' },
  authContextRef: 'auth',
  requestId: 'request',
  originatingSessionRef: 'original-session',
})
export const definition = ScheduleDefinitionSchema.parse({
  label: 'Tea',
  recurrence: { kind: 'once', localAt: '2026-11-05T09:00:00' },
  limits: { eligibleLimit: null, jobLimit: null, excludeDates: [] },
  binding: { kind: 'explicit', timezone: 'UTC', calendar: null },
  calendarOverlay: null,
  purpose: {
    kind: 'reminder',
    content: { title: null, body: 'Make tea' },
    admissionPolicy: 'reminder-window-v1',
    overlap: 'parallel',
  },
})
export const scheduleId = ScheduleIdSchema.parse('00000000-0000-4000-8000-000000000001')
export const operationRef = '00000000-0000-4000-8000-000000000009'
export const view = ScheduleViewSchema.parse({
  scheduleId,
  owner: context.owner,
  author: { kind: 'human', actorRef: 'alice' },
  createdBy: 'alice',
  createdAt: '2026-11-04T00:00:00.000Z',
  definition,
  revision: 1,
  definitionRevision: 1,
  stateRevision: 1,
  timeRuleRevision: 1,
  control: 'draft',
  standing: {
    kind: 'ready',
    generation: 1,
    reasons: [],
    authorityEvidence: [],
    since: '2026-11-04T00:00:00.000Z',
    observedAt: '2026-11-04T00:00:00.000Z',
  },
  nextOccurrence: null,
  predecessorId: null,
  successorId: null,
  promotedBy: null,
  promotedAt: null,
  discardedBy: null,
  discardedAt: null,
  sourceScheduleKey: null,
  consentAdoption: null,
  eligibleConsumed: 0,
  acceptedJobCount: 0,
  observedAt: '2026-11-04T00:00:00.000Z',
})
export const domainError = () => ({
  kind: 'error' as const,
  error: {
    code: 'forbidden' as const,
    message: 'forbidden',
    retryable: false,
    requestId: 'request',
    details: {},
  },
})
export const queries: ScheduleQueries = {
  list: async () => domainError(),
  get: async () => domainError(),
  revisions: async () => domainError(),
  executions: async () => domainError(),
  agenda: async () => domainError(),
  preview: async () => domainError(),
}
export const commands: ScheduleCommands = {
  create: async () => ({ kind: 'rejected', error: domainError().error }),
  execute: async () => ({ kind: 'rejected', error: domainError().error }),
  queryOperation: async () => domainError(),
}
export const services = { commands, queries }
export function loader(origin: ToolAuthority = authority) {
  return createLocalToolLoader<string, ScheduleToolEnvironment, ToolMessageContentBlock>({
    authority: origin,
    verifier,
    settings: async () => succeed(construction),
    schemas: async () => succeed(undefined),
  })
}
export async function author(service = services) {
  const loaded = value(
    await loader().load({
      ...access(),
      asset: { asset: authority.asset, requiredCapabilities: ['schedule.read', 'schedule.write'] },
      settings: adoption,
      services: {},
      module: createScheduleToolModule(service),
    }),
  )
  const registration = readToolRegistration(loaded.implementation)
  if (registration?.kind !== 'function' || registration.operation.author.kind !== 'ordinary')
    throw new Error('Expected ordinary function author')
  return { loaded, operation: registration.operation, author: registration.operation.author }
}
export const argumentsOf = (input: unknown) => ({
  complete: true,
  original: JSON.stringify(input),
  effective: JSON.stringify(input),
})
export async function request(
  input: unknown = { action: 'get', input: { scheduleId } },
): Promise<FixedToolRequest> {
  const { loaded } = await author()
  return {
    availability: {
      kind: 'available',
      layer: authority.layer,
      definition: loaded.definition,
      executor: loaded.executor,
    },
    invocation: { kind: 'direct', source: evidence('invocation') },
    command: null,
    arguments: argumentsOf(input),
    settings: adoption,
    context: adoption,
    workspace: null,
    environment: loaded.definition.declarations.environment,
    requesterScope: value(decodeScopeRef({ ref: 'schedule-test' })),
    resources: [],
    scope: { owner: 'test', key: 'test', grant: evidence('grant') },
    consumer: { owner: 'test', work: 'test', position: 'test', purpose: 'test' },
    batchDecision: null,
    mode: 'foreground',
    limits: { concurrency: 1, foregroundMs: null, backgroundAfterMs: null },
  }
}
export const operationId = (text: string) => value(decodeToolOperationId(text))
export async function run(
  input: unknown,
  environment: ScheduleToolEnvironment,
  service = services,
  signal = new AbortController().signal,
) {
  const module = await author(service)
  const args = value(module.author.parameters.parse(argumentsOf(input)))
  const scope = value(
    createIndependentToolScope({
      signal,
      limits: {
        authorBufferBytes: 10000,
        authorBufferItems: 100,
        authorWaitHistoryBytes: 10000,
        authorWaitHistoryItems: 100,
      },
      process: null,
      waits: null,
    }),
  )
  const returned = await module.author.executor.execute(args, environment, scope.context)
  value(await scope.finish('returned'))
  const checked = value(module.author.output.check({ arguments: args, value: returned }))
  return {
    ...module,
    returned: checked,
    rendered: renderToolResult(
      checked,
      module.author,
      createLocalTextResults(),
      defaultResultPolicy,
    ),
  }
}
export function ledger(
  guard: ToolAccessGuard<string> = { qualify: async () => ({ kind: 'allowed' }) },
  store: ToolLedgerStore<ToolMessageContentBlock> = createMemoryToolLedgerStore(),
) {
  return createToolLedger(
    store,
    {
      access: guard,
      sources: { verify: async () => ({ kind: 'trusted' }) },
      factAcknowledgements: { verify: async () => ({ kind: 'trusted' }) },
      grants: new Map([['test', { verifyGrant: async () => ({ kind: 'granted' as const }) }]]),
      starts: { qualifyStart: async () => ({ kind: 'unavailable', diagnostic: 'unused' }) },
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
    { resultPageBytes: 512, ledgerCommitAttempts: 3, queueCapacity: 10 },
    {
      custody: createMemoryToolOutputCustody<string>(),
      content: null,
      releaseInspection: createMemoryToolEnvironment<string>(),
    },
  )
}
