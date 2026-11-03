import { createHash } from 'node:crypto'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { CalendarCallContext, CalendarQueries } from '@omne-harness/calendar-contract'
import {
  createCalendarToolModule,
  calendarToolAdoption,
  type CalendarToolEnvironment,
} from '@omne-harness/calendar-tools'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type FixedToolRequest,
} from '@omne-harness/tool-contract'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import {
  createLocalToolLoader,
  type LocalToolContributionVerifier,
} from '@omne-harness/tool-host-local'
import type {
  ToolAuthority,
  ToolMessageContentBlock,
  CallAccess,
} from '@omne-harness/tool-contract/provider'

export function value<T>(outcome: Outcome<T, unknown>): T {
  if ('failure' in outcome) throw new Error(JSON.stringify(outcome.failure))
  return outcome.ok
}
export const construction = { kind: 'object', entries: [] } as const
export const adoption = calendarToolAdoption
export const evidence = (record: string) => ({
  owner: 'calendar-test',
  record,
  revision: '1',
  digest: `sha256:${createHash('sha256').update(record).digest('hex')}`,
})
export const authority: ToolAuthority = {
  layer: { kind: 'official' },
  asset: { name: 'Calendar', adoption },
  holding: evidence('holding'),
  publication: evidence('publication'),
}
export const verifier: LocalToolContributionVerifier<string> = {
  verify: input => succeed(input),
  admits: () => succeed(undefined),
}
export const access = (name = 'alice'): CallAccess<string> => ({
  principal: name,
  tenant: testingTenant(
    `org_${(name === 'alice' ? 'a' : 'b').repeat(26)}`,
    `acc_${(name === 'alice' ? '1' : '2').repeat(26)}`,
  ),
  call: value(decodeToolCallId(`call-${name}`)),
})
export function context(name = 'alice'): CalendarCallContext {
  return {
    principalRef: name,
    owner: { kind: 'tenant', tenantId: name, ownerId: name },
    actor: { kind: 'human', actorRef: name },
    authContextRef: `auth-${name}`,
    requestId: `request-${name}`,
    originatingSessionRef: null,
  }
}
export const domainError = (
  code: 'forbidden' | 'missing_environment' | 'provider_failure' = 'forbidden',
) => ({
  kind: 'error' as const,
  error: { code, message: code, retryable: false, requestId: 'request', details: {} },
})
export const queries: CalendarQueries = {
  list: async () => domainError(),
  get: async () => domainError(),
  effective: async () => domainError(),
  resolve: async () => domainError(),
}
export function loader(origin: ToolAuthority = authority) {
  return createLocalToolLoader<string, CalendarToolEnvironment, ToolMessageContentBlock>({
    authority: origin,
    verifier,
    settings: async () => succeed(construction),
    schemas: async () => succeed(undefined),
  })
}
export async function author(service: CalendarQueries = queries) {
  const module = createCalendarToolModule(service)
  const loaded = value(
    await loader().load({
      ...access(),
      asset: { asset: authority.asset, requiredCapabilities: ['calendar.read'] },
      settings: adoption,
      services: {},
      module,
    }),
  )
  const registered = readToolRegistration(loaded.implementation)
  if (registered?.kind !== 'function') throw new Error('Not a real function registration')
  return { loaded, operation: registered.operation }
}
export const argumentsOf = (input: unknown) => ({
  complete: true,
  original: JSON.stringify(input),
  effective: JSON.stringify(input),
})
export async function request(): Promise<FixedToolRequest> {
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
    arguments: argumentsOf({ action: 'list', input: {} }),
    settings: adoption,
    context: adoption,
    workspace: null,
    environment: loaded.definition.declarations.environment,
    requesterScope: value(decodeScopeRef({ ref: 'calendar-test' })),
    resources: [],
    scope: { owner: 'test', key: 'test', grant: evidence('grant') },
    consumer: { owner: 'test', work: 'test', position: 'test', purpose: 'test' },
    batchDecision: null,
    mode: 'foreground',
    limits: { concurrency: 1, foregroundMs: null, backgroundAfterMs: null },
  }
}
export const operationId = (name: string) => value(decodeToolOperationId(name))
