import { randomUUID } from 'node:crypto'
import { succeed } from '@omne-harness/operation-result'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type ToolAvailabilityReference,
  type ToolCallId,
  type ToolDefinition,
  type ToolInvocation,
  type ToolInvokeRequest,
  type ToolOperationId,
  type FixedToolRequest,
} from '@omne-harness/tool-contract'
import {
  decodeToolInstanceId,
  fixToolRequest,
  fixedRequestReference,
  judgeToolInvokeRequest,
  namesDefinition,
  toolAvailabilityOf,
  type ToolInvocationSourceIssuer,
  type ToolInvocationSourceOutcome,
  type ToolOperationIdentities,
  type ToolInstanceIdentities,
  type Mutation,
} from '@omne-harness/tool-contract/provider'
import { canonicalJson, digestOf } from './evidence.ts'
import { isTenantShape } from './boundary.ts'
import type { AccessVerdict, ToolInvokeAuthority, ToolSourceGuard } from './ledger-guards.ts'
import type { TenantId } from './ledger-store.ts'

export const TEST_SOURCE_OWNER = '@omne-harness/tool/testing'

export type TestSourceBinding<P> = Readonly<{
  principal: P
  tenant: TenantId
  call: ToolCallId
  admission: ToolOperationId
  request: ToolInvokeRequest
  invocation: ToolInvocation
}>

export type TestInvocationSource<P> = Readonly<{
  durability: 'none'
  issuer: ToolInvocationSourceIssuer<P>
  guard: ToolSourceGuard<P>
  bindings(): readonly TestSourceBinding<P>[]
}>

type Reservation<P> = Omit<TestSourceBinding<P>, 'invocation'> &
  Readonly<{ digest: string; definition: ToolDefinition }>
type SourceRecord<P> =
  | Readonly<{ kind: 'reserved'; reservation: Reservation<P> }>
  | Readonly<{ kind: 'issued'; reservation: Reservation<P>; binding: TestSourceBinding<P> }>

function fingerprint<P>(
  input: Mutation<P> &
    Readonly<{ request: ToolInvokeRequest & Pick<FixedToolRequest, 'invocation'> }>,
): string {
  return canonicalJson({
    tenant: [input.tenant.organization.text, input.tenant.account.text],
    call: input.call,
    operation: input.operation,
    request: input.request,
  })
}

const unknownTool = {
  kind: 'rejected',
  failure: { kind: 'invalid', field: 'name', reason: 'unknown-tool' },
} as const

async function authorityVerdict(check: () => Promise<AccessVerdict>): Promise<AccessVerdict> {
  try {
    return await check()
  } catch {
    return {
      kind: 'unavailable',
      diagnostic: 'invoke authority threw; its message is not reported',
    }
  }
}

type TestInvocationSourceOptions<P> = Readonly<{
  authority: ToolInvokeAuthority<P>
  snapshotPrincipal: (principal: P) => P
  definition?: (reference: ToolAvailabilityReference) => ToolDefinition | undefined
  beforeIssue?: () => void
  throws?: string
}>

function admissibleDefinition<P>(
  options: TestInvocationSourceOptions<P>,
  input: Parameters<ToolInvocationSourceIssuer<P>['resolve']>[0],
  request: ToolInvokeRequest,
): ToolDefinition | Extract<ToolInvocationSourceOutcome, { kind: 'rejected' }> {
  const definition = options.definition?.(request.availability)
  if (definition === undefined || !namesDefinition(request.availability, definition))
    return unknownTool
  const availability = toolAvailabilityOf(request.availability, definition)
  const refused = input.refusal?.({ ...request, availability }) ?? null
  return refused === null ? definition : { kind: 'rejected', failure: refused }
}

const boundRequest = <P>(reservation: Reservation<P>, invocation: ToolInvocation) =>
  structuredClone(fixToolRequest(reservation.request, reservation.definition, invocation))

export function createTestInvocationSource<P>(
  options: TestInvocationSourceOptions<P>,
): TestInvocationSource<P> {
  const saved = new Map<string, SourceRecord<P>>()
  const bySource = new Map<string, TestSourceBinding<P>>()
  const issuer: ToolInvocationSourceIssuer<P> = {
    resolve: async input => {
      const judged = judgeToolInvokeRequest(input.request)
      if ('failure' in judged)
        return { kind: 'rejected', failure: { kind: 'invalid', ...judged.failure } }
      if (!isTenantShape(input.tenant))
        return { kind: 'rejected', failure: { kind: 'denied', action: 'admit' } }
      const request = judged.ok
      let principal: P
      try {
        principal = options.snapshotPrincipal(input.principal)
      } catch {
        return {
          kind: 'rejected',
          failure: {
            kind: 'unavailable',
            dependency: 'principal-snapshot',
            diagnostic: 'principal snapshot failed; its exception message is not reported',
          },
        }
      }
      const qualified = await authorityVerdict(() =>
        options.authority.qualify({ principal, tenant: input.tenant, consumer: request.consumer }),
      )
      if (qualified.kind !== 'allowed')
        return {
          kind: 'rejected',
          failure:
            qualified.kind === 'denied'
              ? { kind: 'denied', action: 'admit' }
              : {
                  kind: 'unavailable',
                  dependency: 'invoke-authority',
                  diagnostic: qualified.diagnostic,
                },
        }
      const { owner, work, position, purpose } = request.consumer
      const key = canonicalJson([
        input.tenant.organization.text,
        input.tenant.account.text,
        owner,
        work,
        position,
        purpose,
      ])
      let known = saved.get(key)
      const recovered = known !== undefined
      if (known !== undefined) {
        const original = known.reservation.principal
        const same = await authorityVerdict(() =>
          options.authority.samePrincipal({ current: principal, original }),
        )
        if (same.kind !== 'allowed')
          return {
            kind: 'rejected',
            failure:
              same.kind === 'denied'
                ? { kind: 'denied', action: 'admit' }
                : {
                    kind: 'unavailable',
                    dependency: 'invoke-authority',
                    diagnostic: same.diagnostic,
                  },
          }
        if (canonicalJson(known.reservation.request) !== canonicalJson(request))
          return {
            kind: 'rejected',
            failure: { kind: 'conflict', operation: known.reservation.admission },
          }
      }
      known = saved.get(key)
      if (known === undefined) {
        const definition = admissibleDefinition(options, input, request)
        if ('failure' in definition) return definition
        const call = decodeToolCallId(`call-${randomUUID()}`)
        const admission = decodeToolOperationId(`admit-${randomUUID()}`)
        if ('failure' in call || 'failure' in admission) throw new Error('invalid source identity')
        known = {
          kind: 'reserved',
          reservation: Object.freeze({
            principal,
            tenant: input.tenant,
            call: call.ok,
            admission: admission.ok,
            request,
            digest: digestOf(request),
            definition,
          }),
        }
        saved.set(key, known)
      }
      if (known.kind === 'reserved') {
        const reservation = known.reservation
        try {
          options.beforeIssue?.()
        } catch {
          return {
            kind: 'issuance-unknown',
            call: reservation.call,
            admission: reservation.admission,
          }
        }
        const record = `source-${reservation.call}`
        const invocation: ToolInvocation = Object.freeze({
          kind: 'direct',
          source: Object.freeze({
            owner: TEST_SOURCE_OWNER,
            record,
            revision: '1',
            digest: digestOf({
              call: reservation.call,
              admission: reservation.admission,
              request: reservation.request,
              requestDigest: reservation.digest,
              record,
              tenant: [input.tenant.organization.text, input.tenant.account.text],
            }),
          }),
        })
        const binding = Object.freeze({ ...reservation, invocation })
        known = { kind: 'issued', reservation, binding }
        saved.set(key, known)
        bySource.set(invocation.source.record, binding)
      }
      return {
        kind: 'bound',
        call: known.binding.call,
        admission: known.binding.admission,
        request: boundRequest(known.reservation, known.binding.invocation),
        recovered,
      }
    },
  }
  const guard: ToolSourceGuard<P> = {
    verify: async input => {
      if (options.throws !== undefined) throw new Error(options.throws)
      const binding = bySource.get(input.request.invocation.source.record)
      if (binding === undefined) return { kind: 'forged', reason: 'unknown-source' }
      const same = await authorityVerdict(() =>
        options.authority.samePrincipal({ current: input.principal, original: binding.principal }),
      )
      if (same.kind === 'unavailable') return same
      if (same.kind === 'denied') return { kind: 'forged', reason: 'different-subject' }
      return fingerprint({ ...input, request: fixedRequestReference(input.request) }) ===
        fingerprint({
          ...input,
          tenant: binding.tenant,
          call: binding.call,
          operation: binding.admission,
          request: { ...binding.request, invocation: binding.invocation },
        })
        ? { kind: 'trusted' }
        : { kind: 'forged', reason: 'binding-mismatch' }
    },
  }
  return Object.freeze({
    durability: 'none',
    issuer,
    guard,
    bindings: () =>
      [...bySource.values()].map(binding => ({
        principal: options.snapshotPrincipal(binding.principal),
        tenant: structuredClone(binding.tenant),
        call: binding.call,
        admission: binding.admission,
        request: structuredClone(binding.request),
        invocation: structuredClone(binding.invocation),
      })),
  })
}

export type TestToolIdentities = Readonly<{
  operationIdentities: ToolOperationIdentities
  instanceIdentities: ToolInstanceIdentities
}>

export function createTestToolIdentities(): TestToolIdentities {
  let operations = 0
  let instances = 0
  return Object.freeze({
    operationIdentities: {
      newOperation: () => {
        const decoded = decodeToolOperationId(`op-cmd-${++operations}`)
        if ('failure' in decoded) throw new Error('invalid test identity')
        return Promise.resolve(succeed(decoded.ok))
      },
    },
    instanceIdentities: {
      newInstance: () => {
        const decoded = decodeToolInstanceId(`instance-${++instances}`)
        if ('failure' in decoded) throw new Error('invalid test identity')
        return Promise.resolve(succeed(decoded.ok))
      },
    },
  })
}
