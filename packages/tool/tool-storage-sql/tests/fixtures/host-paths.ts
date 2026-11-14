import {
  acquisitionRef,
  originRef,
  type ManagedResource,
  type OriginalAcquisition,
} from '@omne-harness/execution-environment-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { succeed } from '@omne-harness/operation-result'
import { canonicalDigest, type CallRecord } from '@omne-harness/tool'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type Adoption,
  type DurableEvidence,
  type FixedToolRequest,
  type ToolCallId,
  type ToolForwardIntent,
  type ToolInvokeRequest,
  type ToolOperationId,
  type ToolStartRecord,
} from '@omne-harness/tool-contract'
import {
  decodeToolInstanceId,
  decodeToolRevision,
  type PreparationRecord,
} from '@omne-harness/tool-contract/provider'
import type { PrincipalJson } from '@omne-harness/tool-host-local'
import { fixedRequest } from './ledger.ts'

export type Principal = Readonly<{ subject: string; session: string }>

export const alice: Principal = { subject: 'alice', session: 'session-a' }

export function ok<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer) throw new Error(`expected success: ${JSON.stringify(answer.failure)}`)
  return answer.ok
}

export const width = (index: number): string => String(index).padStart(6, '0')

export const evidence = (record: string): DurableEvidence => ({
  owner: 'test',
  record,
  revision: '1',
  digest: `sha256:${record}`,
})

const adoption = (name: string): Adoption => ({
  owner: 'test-owner',
  name,
  revision: '1',
  digest: `sha256:${name}`,
})

const isJsonObject = (value: PrincipalJson): value is Readonly<{ [key: string]: PrincipalJson }> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const principalCodec = {
  encode: (principal: Principal): PrincipalJson => ({ ...principal }),
  decode: (value: PrincipalJson) => {
    const fields: Readonly<Record<string, unknown>> = isJsonObject(value) ? value : {}
    const subject = fields['subject']
    const session = fields['session']
    return typeof subject === 'string' && typeof session === 'string'
      ? succeed({ subject, session })
      : { failure: { reason: 'shape' } }
  },
}

export const targetIntent: ToolForwardIntent = {
  name: 'fixture',
  command: null,
  arguments: { kind: 'object', entries: [] },
}

export function targetRequest(): Omit<ToolInvokeRequest, 'invocation'> {
  const { invocation: _entry, ...request } = fixedRequest()
  return request
}

export function parentRequest(index: number): ToolInvokeRequest {
  const base = targetRequest()
  const definition = base.availability.definition
  if (definition.kind !== 'function') throw new Error('the fixture target is a function tool')
  const text = JSON.stringify({
    command: 'execute',
    params: { name: targetIntent.name, command: null, arguments: {} },
  })
  return {
    ...base,
    consumer: { ...base.consumer, work: `work-${width(index)}` },
    command: 'execute',
    arguments: { original: text, effective: text, complete: true },
    availability: {
      ...base.availability,
      definition: {
        name: 'Tools',
        adoption: adoption('Tools'),
        description: definition.description,
        requiredCapabilities: [],
        backgroundAllowed: false,
        declarations: definition.declarations,
        kind: 'commands',
        encoding: 'wrapped',
        commands: [
          {
            name: 'execute',
            summary: 'Execute one target',
            parameters: { kind: 'executor-owned' },
            returns: definition.returns,
          },
        ],
      },
    },
  }
}

export const isParent = (request: FixedToolRequest): boolean =>
  request.availability.definition.name === 'Tools'

export function startOf(
  tenant: TenantId,
  call: ToolCallId,
): Extract<ToolStartRecord, { kind: 'start' }> {
  return {
    kind: 'start',
    operation: ok(decodeToolOperationId(`${call}/start`)),
    executor: { owner: 'test', name: 'exec', revision: '1', digest: 'sha256:exec' },
    execution: {
      tenant,
      call,
      instance: ok(decodeToolInstanceId('instance-1')),
      generation: '1',
    },
  }
}

export function preparationOf(
  tenant: TenantId,
  call: ToolCallId,
  request: FixedToolRequest,
): PreparationRecord {
  return {
    tenant,
    call,
    operation: ok(decodeToolOperationId(`${call}/prepare`)),
    adoption: adoption('environment'),
    inputDigest: canonicalDigest(request),
    purpose: 'initial',
  }
}

export function acquisitionOf(
  preparation: PreparationRecord,
  scope: FixedToolRequest['requesterScope'],
) {
  const original: OriginalAcquisition & Readonly<{ retentionScope: typeof scope }> = {
    tenant: preparation.tenant,
    acquisition: acquisitionRef(`acquisition-${preparation.call}`),
    origin: originRef('caller'),
    scope,
    placement: {
      kind: 'placement',
      binding: { kind: 'host_machine' },
      requirement: {
        allowedBindings: [{ kind: 'host_machine' }],
        facilities: ['terminal'],
        isolation: [],
      },
      provider: { name: 'fixture', version: '1', generation: '1' },
      quotaDomain: 'fixture',
      continuity: { kind: 'not_guaranteed' },
    },
    retentionScope: scope,
  }
  return {
    preparation,
    original,
    digest: canonicalDigest(preparation),
    allocation: { kind: 'allocated' as const },
    closed: false,
    evidence: evidence(`original-${preparation.call}`),
    release: null,
    resources: [],
    reservations: [],
  }
}

export function terminalOf(index: number): ManagedResource {
  return {
    key: `terminal-${width(index)}`,
    provider: 'fixture',
    reference: { kind: 'string', value: `terminal-generation-${width(index)}` },
  }
}

export function processOf(index: number): ManagedResource {
  return {
    key: `process-${width(index)}`,
    provider: 'fixture',
    reference: { kind: 'string', value: `process-generation-${width(index)}` },
  }
}

export function runningCall(input: {
  tenant: TenantId
  call: ToolCallId
  admission: ToolOperationId
  request: FixedToolRequest
  preparation: PreparationRecord
}): CallRecord {
  return {
    tenant: input.tenant,
    call: input.call,
    admission: input.admission,
    request: input.request,
    initiator: { owner: 'test', subject: alice.subject, revision: '1' },
    preparations: [input.preparation],
    environment: null,
    start: startOf(input.tenant, input.call),
    startRejection: null,
    execution: null,
    state: {
      call: input.call,
      revision: ok(decodeToolRevision('1')),
      source: evidence('state'),
      foreground: null,
      effect: { kind: 'not-started' },
      execution: { kind: 'not-started' },
      timing: { kind: 'closed', accumulatedMs: '0' },
      queue: { kind: 'none' },
      controls: [],
      delivery: null,
      supplements: [],
      phase: 'preparing',
      relation: 'foreground',
      wait: { kind: 'none' },
    },
  }
}

export const callIdOf = (text: string): ToolCallId => ok(decodeToolCallId(text))
