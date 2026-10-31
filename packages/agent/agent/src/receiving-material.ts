import type { Access, Adoption, Material, ReceivedEntry } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  decodeDispatchId,
  decodeModelInvocationRef,
  decodeResultVersion,
  judgeModelDelivery,
  type ModelDelivery,
  type ModelAccountSnapshot,
} from '@omne-harness/model-contract'
import { canonical } from './canonical.ts'
import { json, plain, object, settlement, parts } from './receiving-values.ts'

export const agentModelDeliverySchema: Adoption = Object.freeze({
  owner: 'agent',
  name: 'received-model-delivery',
  revision: '1',
  digest: 'agent:received-model-delivery/1',
})
type Account = Extract<ModelDelivery, { kind: 'account' }>['account']
type Amount = Account['trimmed']
const decimal = (value: unknown) =>
  typeof value === 'string' && /^-?(0|[1-9]\d*)(\.\d+)?$/u.test(value)
function amount(value: unknown): value is Amount {
  return (
    object(value) &&
    typeof value.unit === 'string' &&
    (value.state === 'unknown' ||
      ((value.state === 'known' || value.state === 'provisional') && decimal(value.lexeme)))
  )
}
function account(value: unknown): value is Account {
  return (
    object(value) &&
    object(value.subject) &&
    (value.subject.kind === 'model_call' || value.subject.kind === 'tool_execution') &&
    typeof value.subject.id === 'string' &&
    value.subject.id.length > 0 &&
    Array.isArray(value.usage) &&
    value.usage.every(item => amount(item) && 'name' in item && typeof item.name === 'string') &&
    Array.isArray(value.cost) &&
    value.cost.every(
      item =>
        amount(item) &&
        'source' in item &&
        ['supplier', 'observation', 'billable', 'ledger'].includes(String(item.source)),
    ) &&
    amount(value.trimmed) &&
    typeof value.place === 'string' &&
    ((typeof value.duration === 'string' && /^-?PT\d+(?:\.\d+)?S$/u.test(value.duration)) ||
      (object(value.duration) && value.duration.state === 'unknown')) &&
    (value.receipt === 'received' || value.receipt === 'late') &&
    typeof value.revision === 'string' &&
    /^(0|[1-9]\d*)$/u.test(value.revision)
  )
}
export function modelDeliveryMaterial<P>(
  access: Access<P>,
  delivery: ModelDelivery,
): Material<ContentBlock> {
  const tenant = tenantCodec.encode(access.tenant)
  if (!tenant.ok) throw new TypeError('invalid tenant')
  return {
    kind: 'facts',
    schema: agentModelDeliverySchema,
    value: json({ tenant: tenant.value, delivery }),
  }
}
export function modelReceivedDraft(
  delivery: ModelDelivery,
  consumption: ReceivedEntry['consumption'],
): Omit<ReceivedEntry, 'material'> {
  const common = { kind: 'received' as const, consumer: delivery.consumer, consumption }
  return delivery.kind === 'result'
    ? { ...common, delivery: { producer: 'model', key: delivery.key, accounts: delivery.accounts } }
    : { ...common, delivery: { producer: 'model', key: delivery.key, account: delivery.account } }
}
/** Decodes persisted bytes before admitting them as a producer envelope. */
export function readModelDeliveryMaterial<P>(
  access: Access<P>,
  material: Material<ContentBlock>,
  expected: Omit<ReceivedEntry, 'material'>,
): ModelDelivery | null {
  try {
    if (
      material.kind !== 'facts' ||
      canonical(material.schema) !== canonical(agentModelDeliverySchema)
    )
      return null
    const decoded = plain(material.value),
      tenant = tenantCodec.encode(access.tenant)
    if (
      !object(decoded) ||
      !tenant.ok ||
      decoded.tenant !== tenant.value ||
      !object(decoded.delivery)
    )
      return null
    const value = decoded.delivery
    if (!object(value.key) || !object(value.consumer)) return null
    const { owner, work, position, purpose } = value.consumer
    if (
      ![owner, work, position, purpose].every(
        field => typeof field === 'string' && field.length > 0,
      )
    )
      return null
    if (
      typeof owner !== 'string' ||
      typeof work !== 'string' ||
      typeof position !== 'string' ||
      typeof purpose !== 'string'
    )
      return null
    const consumer = { owner, work, position, purpose }
    const reference = decodeModelInvocationRef(value.key.reference)
    if ('failure' in reference) return null
    let delivery: ModelDelivery
    if (value.kind === 'result' && value.key.kind === 'result') {
      const result = decodeResultVersion(value.key.result),
        terminal = settlement(value.settlement),
        output = parts(value.parts)
      if ('failure' in result || !terminal || !output || !Array.isArray(value.accounts)) return null
      const accounts: ModelAccountSnapshot[] = []
      for (const item of value.accounts) {
        if (!object(item)) return null
        const dispatch = decodeDispatchId(item.dispatch)
        if ('failure' in dispatch || (item.account !== null && !account(item.account))) return null
        accounts.push({ dispatch: dispatch.ok, account: item.account })
      }
      delivery = {
        kind: 'result',
        key: { kind: 'result', reference: reference.ok, result: result.ok },
        consumer,
        settlement: terminal,
        parts: output,
        accounts,
      }
    } else if (value.kind === 'account' && value.key.kind === 'account') {
      const dispatch = decodeDispatchId(value.key.dispatch)
      if (
        'failure' in dispatch ||
        typeof value.key.revision !== 'string' ||
        !account(value.account)
      )
        return null
      delivery = {
        kind: 'account',
        key: {
          kind: 'account',
          reference: reference.ok,
          dispatch: dispatch.ok,
          revision: value.key.revision,
        },
        consumer,
        account: value.account,
      }
    } else return null
    if (
      'failure' in judgeModelDelivery({ tenant: access.tenant, delivery }) ||
      canonical(modelReceivedDraft(delivery, expected.consumption)) !== canonical(expected)
    )
      return null
    return delivery
  } catch {
    return null
  }
}
