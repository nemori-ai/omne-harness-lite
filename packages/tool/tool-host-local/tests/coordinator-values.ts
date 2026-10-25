// Builders for the start coordinator tests: tenants with the shape of legal-identity's TenantId,
// a principal that belongs to some tenants, a fixed request, a start record and an access guard
// that answers by tenant membership. Each builder returns a fresh value.
import { testingTenant } from '@omne-harness/tool-contract/testing'
import type { ContentBlock } from '@omne-harness/content-block'
import type { Outcome } from '@omne-harness/operation-result'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type Adoption,
  type DurableEvidence,
  type FixedToolRequest,
  type ToolCallId,
  type ToolInstanceId,
  type ToolOperationId,
  type ToolStartRecord,
} from '@omne-harness/tool-contract'
import { decodeToolInstanceId } from '@omne-harness/tool-contract/provider'
import type { LedgerCommitInput, ToolLedgerStore } from '@omne-harness/tool'
import {
  createLocalStartCoordinator,
  type GuardResource,
  type StartCoordinatorAccess,
} from '@omne-harness/tool-host-local'

export type Principal = Readonly<{ subject: string; tenants: readonly string[] }>
export type TenantShape = Readonly<{
  name: 'TenantId'
  organization: Readonly<{ name: 'OrganizationId'; text: string }>
  account: Readonly<{ name: 'AccountId'; text: string }>
}>

export function tenant(organization: string, account: string): TenantShape {
  return {
    name: 'TenantId',
    organization: { name: 'OrganizationId', text: organization },
    account: { name: 'AccountId', text: account },
  }
}

const keyOf = (value: TenantShape): string => `${value.organization.text}/${value.account.text}`

export const tenantA = testingTenant(`org_${'0'.repeat(26)}`, `acc_${'1'.repeat(26)}`)
export const tenantB = testingTenant(`org_${'2'.repeat(26)}`, `acc_${'3'.repeat(26)}`)
export const principalA: Principal = { subject: 'alice', tenants: [keyOf(tenantA)] }
export const principalB: Principal = { subject: 'bob', tenants: [keyOf(tenantB)] }

function decoded<T>(outcome: Outcome<T, unknown>, text: string): T {
  if (!('ok' in outcome)) throw new Error(`fixture identity: ${text}`)
  return outcome.ok
}

export const callId = (text: string): ToolCallId => decoded(decodeToolCallId(text), text)
export const operationId = (text: string): ToolOperationId =>
  decoded(decodeToolOperationId(text), text)
export const instanceId: ToolInstanceId = decoded(decodeToolInstanceId('instance-1'), 'instance')

export function adoption(name: string): Adoption {
  return { owner: 'test-owner', name, revision: '1', digest: `sha256:${name}` }
}

export function evidence(record: string): DurableEvidence {
  return { owner: 'test-owner', record, revision: '1', digest: `sha256:${record}` }
}

export function request(overrides: Partial<FixedToolRequest> = {}): FixedToolRequest {
  return {
    availability: {
      kind: 'available',
      layer: { kind: 'official' },
      definition: {
        adoption: adoption('read_file'),
        name: 'read_file',
        description: 'The read_file tool.',
        requiredCapabilities: [],
        backgroundAllowed: false,
        declarations: {
          adoption: adoption('declarations'),
          environment: null,
          attachments: [],
          inputModalities: [],
          outputModalities: [],
          settings: null,
        },
        kind: 'function',
        parameters: {
          schema: {
            kind: 'object',
            entries: [{ key: 'type', value: { kind: 'string', value: 'object' } }],
          },
          vocabulary: adoption('json-schema'),
          descriptions: [{ path: 'path', text: 'The path value.' }],
        },
        returns: { kind: 'ordinary', program: { kind: 'none' } },
      },
      executor: adoption('exec'),
    },
    invocation: { kind: 'direct', source: evidence('entry') },
    command: null,
    arguments: { original: '{"path":"a.txt"}', effective: '{"path":"a.txt"}', complete: true },
    settings: adoption('settings'),
    context: adoption('context'),
    workspace: null,
    environment: adoption('environment'),
    resources: [],
    scope: { owner: 'scope-owner', key: 'scope-1', grant: evidence('grant') },
    consumer: { owner: 'consumer', work: 'work-1', position: 'position-1', purpose: 'tool-result' },
    batchDecision: null,
    mode: 'foreground',
    limits: { concurrency: 1, foregroundMs: null, backgroundAfterMs: null },
    ...overrides,
  }
}

/** The first start record of `call` in `within`, with the start operation `<call>/start`. */
export function startOf(
  call: string,
  within: TenantShape = tenantA,
): Extract<ToolStartRecord, { kind: 'start' }> {
  return {
    kind: 'start',
    operation: operationId(`${call}/start`),
    executor: adoption('exec'),
    // The tests pass TenantShape values where the contract types legal-identity's TenantId.
    execution: {
      tenant: within as never,
      call: callId(call),
      instance: instanceId,
      generation: '1',
    },
  }
}

/** Answers by tenant membership; a tenant that is not in the set of `minted` is denied. */
export function access(
  options: Readonly<{ unavailable?: string; minted?: ReadonlySet<object> }> = {},
): StartCoordinatorAccess<Principal> {
  return {
    qualify: input =>
      new Promise(resolve => {
        if (options.unavailable !== undefined)
          resolve({ kind: 'unavailable', diagnostic: options.unavailable })
        else if (options.minted !== undefined && !options.minted.has(input.tenant))
          resolve({ kind: 'denied', reason: 'not-a-minted-tenant' })
        else
          resolve(
            input.principal.tenants.includes(keyOf(input.tenant as TenantShape))
              ? { kind: 'allowed' }
              : { kind: 'denied', reason: 'not-a-member' },
          )
      }),
  }
}

/** The guard of every request: the programmable permission of the script runner. */
export const permission: GuardResource = { owner: 'permissions', resource: 'scope-1/read_file' }

export function coordinator<B extends ContentBlock>(
  store: ToolLedgerStore<B>,
  options: Readonly<{ guards?: readonly GuardResource[]; unavailable?: string }> = {},
) {
  return createLocalStartCoordinator<Principal, B>({
    store,
    access: access(options),
    guardsOf: () => options.guards ?? [permission],
    commitAttempts: 4,
  })
}

/** The call access of `call` for principal A in tenant A. */
export function callAccess(call: string) {
  return { principal: principalA, tenant: tenantA as never, call: callId(call) }
}

/** A store over `memory` whose next commit answers `answer` without writing, once. */
export function failingNextCommit(
  memory: ToolLedgerStore<ContentBlock>,
  answer: 'unknown' | 'unavailable',
): ToolLedgerStore<ContentBlock> & Readonly<{ arm(): void }> {
  let armed = false
  return {
    durability: 'none',
    arm: () => {
      armed = true
    },
    read: domain => memory.read(domain),
    commit: (input: LedgerCommitInput<ContentBlock>) => {
      if (!armed) return memory.commit(input)
      armed = false
      return Promise.resolve(
        answer === 'unknown'
          ? { kind: 'unknown', diagnostic: 'the answer was lost' }
          : { kind: 'unavailable', diagnostic: 'the store is down' },
      )
    },
  }
}
