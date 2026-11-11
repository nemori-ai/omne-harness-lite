import {
  judgeEvidence,
  type Access,
  type Adoption,
  type Material,
  type ReceivedEntry,
} from '@omne-harness/agent-contract'
import {
  judgeContentBlock,
  type ContentBlock,
  type ContentReference,
} from '@omne-harness/content-block'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  decodeToolOperationId,
  judgeToolDelivery,
  type ToolDelivery,
  type ToolTerminal,
  type ToolResult,
  type Effect,
} from '@omne-harness/tool-contract'
import {
  decodeToolDeliveryId,
  decodeToolInvocationRef,
  decodeToolResultVersion,
  decodeToolWaitId,
  judgeConsumerRef,
} from '@omne-harness/tool-contract/provider'
import { canonical } from './canonical.ts'
import { account } from './receiving-material.ts'
import { json, jsonTree, object, plain } from './receiving-values.ts'

export const agentToolDeliverySchema: Adoption = Object.freeze({
  owner: 'agent',
  name: 'received-tool-delivery',
  revision: '1',
  digest: 'agent:received-tool-delivery/1',
})

/** Tool identity distinguishes a missing field from a field whose value is undefined. */
export function toolValueText(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(toolValueText).join(',')}]`
  return `{${Object.entries(value)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, child]) => `${JSON.stringify(key)}:${toolValueText(child)}`)
    .join(',')}}`
}

const failedCauses = ['arguments', 'environment', 'executor', 'runtime-lost', 'result']

function interruptedCause(cause: unknown): boolean {
  if (!object(cause)) return false
  switch (cause.kind) {
    case 'foreground-limit':
      return true
    case 'resume-rejected':
      return 'ok' in judgeEvidence(cause.exclusion)
    case 'control':
      return 'ok' in decodeToolOperationId(cause.operation) && typeof cause.withdrawn === 'boolean'
    default:
      return false
  }
}

function terminal(value: unknown): value is ToolTerminal {
  if (!object(value)) return false
  switch (value.kind) {
    case 'completed':
      return true
    case 'failed':
      return typeof value.diagnostic === 'string' && failedCauses.includes(String(value.cause))
    case 'unavailable':
      return typeof value.reason === 'string'
    case 'no-response':
      return 'ok' in decodeToolWaitId(value.wait) && typeof value.reason === 'string'
    case 'interrupted':
      return interruptedCause(value.cause)
    default:
      return false
  }
}

function effect(value: unknown): value is Effect {
  if (!object(value)) return false
  switch (value.kind) {
    case 'not-started':
      return true
    case 'not-occurred':
    case 'occurred':
      return 'ok' in judgeEvidence(value.evidence)
    case 'unknown':
      return typeof value.diagnostic === 'string'
    default:
      return false
  }
}

function reference(value: unknown): value is ContentReference {
  return (
    object(value) &&
    ['storage', 'key', 'mediaType', 'digest'].every(
      key => typeof value[key] === 'string' && value[key].length > 0,
    ) &&
    typeof value.bytes === 'string' &&
    /^(0|[1-9]\d*)$/u.test(value.bytes)
  )
}

function adoption(value: unknown): value is Adoption {
  return (
    object(value) &&
    ['owner', 'name', 'revision', 'digest'].every(
      key => typeof value[key] === 'string' && value[key].length > 0,
    )
  )
}

const nonEmptyStrings = (value: Record<string, unknown>, keys: readonly string[]) =>
  keys.every(key => typeof value[key] === 'string' && value[key].length > 0)

const contentBlocks = (value: unknown): boolean =>
  Array.isArray(value) && value.every(block => 'ok' in judgeContentBlock(block))

function resultData(data: Record<string, unknown>): boolean {
  if (data.kind === 'none') return true
  const schema = data.schema
  return (
    data.kind === 'json' &&
    adoption(data.contract) &&
    object(schema) &&
    nonEmptyStrings(schema, ['id', 'revision', 'digest']) &&
    jsonTree(data.value)
  )
}

function resultOriginal(original: Record<string, unknown>): boolean {
  return (
    original.kind === 'none' ||
    (original.kind === 'offloaded' && reference(original.source) && contentBlocks(original.summary))
  )
}

function result(value: unknown): value is ToolResult<ContentBlock> {
  if (
    !object(value) ||
    !contentBlocks(value.content) ||
    !Array.isArray(value.attachments) ||
    !value.attachments.every(reference)
  )
    return false
  const data = value.data,
    original = value.original
  if (!object(data) || !object(original)) return false
  return resultData(data) && resultOriginal(original)
}

function accountDelivery(value: Record<string, unknown>, key: Record<string, unknown>): boolean {
  return (
    key.kind === 'account' &&
    typeof key.event === 'string' &&
    key.event.length > 0 &&
    typeof key.revision === 'string' &&
    account(value.account)
  )
}

function resultOutcome(value: Record<string, unknown>): boolean {
  return (
    terminal(value.terminal) &&
    (value.actualTerminal === null || terminal(value.actualTerminal)) &&
    effect(value.effect)
  )
}

function resultDelivery(value: Record<string, unknown>, key: Record<string, unknown>): boolean {
  return (
    value.kind === 'result' &&
    key.kind === 'result' &&
    'ok' in decodeToolResultVersion(key.result) &&
    'ok' in decodeToolDeliveryId(value.delivery) &&
    (value.relation === 'original' || value.relation === 'late') &&
    resultOutcome(value) &&
    'ok' in judgeEvidence(value.source) &&
    result(value.value) &&
    (value.account === null || account(value.account))
  )
}

function delivery(value: unknown): value is ToolDelivery<ContentBlock> {
  if (
    !object(value) ||
    !object(value.key) ||
    value.key.producer !== 'tool' ||
    'failure' in decodeToolInvocationRef(value.key.reference) ||
    'failure' in judgeConsumerRef(value.consumer)
  )
    return false
  return value.kind === 'account'
    ? accountDelivery(value, value.key)
    : resultDelivery(value, value.key)
}

export function toolDeliveryMaterial<P>(
  access: Access<P>,
  value: ToolDelivery<ContentBlock>,
): Material<ContentBlock> {
  const tenant = tenantCodec.encode(access.tenant)
  if (!tenant.ok) throw new TypeError('invalid tenant')
  return {
    kind: 'facts',
    schema: agentToolDeliverySchema,
    value: json({ tenant: tenant.value, delivery: value }),
  }
}

export function toolReceivedDraft(
  value: ToolDelivery<ContentBlock>,
  consumption: ReceivedEntry['consumption'],
): Omit<ReceivedEntry, 'material'> {
  const common = { kind: 'received' as const, consumer: value.consumer, consumption }
  return value.kind === 'result'
    ? { ...common, delivery: { producer: 'tool', key: value.key, account: value.account } }
    : { ...common, delivery: { producer: 'tool', key: value.key, account: value.account } }
}

/** Validates saved bytes independently of the live runtime or producer's retained copy. */
export function decodeAgentToolDeliveryMaterial(
  material: Material<ContentBlock>,
): Readonly<{ tenant: string; delivery: ToolDelivery<ContentBlock> }> | null {
  try {
    if (
      material.kind !== 'facts' ||
      canonical(material.schema) !== canonical(agentToolDeliverySchema)
    )
      return null
    const value = plain(material.value)
    if (!object(value) || typeof value.tenant !== 'string' || !delivery(value.delivery)) return null
    const tenant = tenantCodec.parse(value.tenant)
    if (
      !tenant.ok ||
      'failure' in judgeToolDelivery({ tenant: tenant.value, delivery: value.delivery })
    )
      return null
    return { tenant: value.tenant, delivery: value.delivery }
  } catch {
    return null
  }
}

export function readToolDeliveryMaterial<P>(
  access: Access<P>,
  material: Material<ContentBlock>,
  expected: Omit<ReceivedEntry, 'material'>,
): ToolDelivery<ContentBlock> | null {
  try {
    const value = decodeAgentToolDeliveryMaterial(material)
    if (value === null) return null
    const tenant = tenantCodec.encode(access.tenant)
    if (!tenant.ok || value.tenant !== tenant.value) return null
    const { kind, consumer, consumption, delivery: received } = expected
    return canonical(toolReceivedDraft(value.delivery, consumption)) ===
      canonical({ kind, consumer, consumption, delivery: received })
      ? value.delivery
      : null
  } catch {
    return null
  }
}
