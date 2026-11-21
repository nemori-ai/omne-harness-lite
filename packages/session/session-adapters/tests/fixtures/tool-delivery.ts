import type { Material, ReceivedEntry } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ToolDelivery } from '@omne-harness/tool-contract'
import { decodeToolResultVersion } from '@omne-harness/tool-contract/provider'
import type { ToolDeliveryReader } from '../../src/cordis/tool-log-consumption.ts'
import { evidence, ok } from './common-journal.ts'

// The material a Tool delivery is kept as, in a test schema the reader below adopts.

export const SCHEMA = {
  owner: 'test',
  name: 'tool-delivery',
  revision: '1',
  digest: 'test:tool-delivery',
}
type Json = Extract<Material<ContentBlock>, { kind: 'facts' }>['value']
type Draft = Omit<ReceivedEntry, 'material'>

export function json(value: unknown): Json {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(json) }
  if (typeof value === 'object')
    return {
      kind: 'object',
      entries: Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, member]) => ({ key, value: json(member) })),
    }
  throw new Error(`fixture: no JSON for ${typeof value}`)
}

function plain(value: Json): unknown {
  switch (value.kind) {
    case 'null':
      return null
    case 'string':
    case 'boolean':
      return value.value
    case 'number':
      return value.lexeme
    case 'array':
      return value.items.map(plain)
    case 'object':
      return Object.fromEntries(value.entries.map(entry => [entry.key, plain(entry.value)]))
  }
}

export function textOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('fixture: tenant')
  return encoded.value
}

export function deliveryOf(draft: Draft): Record<string, unknown> {
  const { delivery } = draft
  if (delivery.producer !== 'tool' || !('account' in delivery))
    throw new Error('fixture: a Tool entry with an account')
  return delivery.key.kind === 'result'
    ? {
        kind: 'result',
        key: delivery.key,
        consumer: draft.consumer,
        delivery: 'tdel_1',
        relation: 'original',
        terminal: { kind: 'completed' },
        actualTerminal: { kind: 'completed' },
        effect: { kind: 'occurred', evidence: evidence('tool-effect') },
        source: evidence('tool-result'),
        value: { kind: 'test-result' },
        account: delivery.account,
      }
    : { kind: 'account', key: delivery.key, consumer: draft.consumer, account: delivery.account }
}

export function materialOf(
  tenant: TenantId,
  draft: Draft,
  change: (value: Record<string, unknown>) => Record<string, unknown> = value => value,
): Material<ContentBlock> {
  return {
    kind: 'facts',
    schema: SCHEMA,
    value: json(change({ tenant: textOf(tenant), delivery: deliveryOf(draft) })),
  }
}

export const reader: ToolDeliveryReader = material => {
  if (material.kind !== 'facts' || material.schema.digest !== SCHEMA.digest) return null
  const value = plain(material.value) as { tenant?: unknown; delivery?: unknown }
  if (typeof value.tenant !== 'string' || typeof value.delivery !== 'object') return null
  return { tenant: value.tenant, delivery: value.delivery as ToolDelivery<ContentBlock> }
}

export function resultEntry(account: ReceivedEntry, reported = true): ReceivedEntry {
  if (
    account.delivery.producer !== 'tool' ||
    account.delivery.key.kind !== 'account' ||
    !('account' in account.delivery)
  )
    throw new Error('fixture: a Tool account entry')
  return {
    ...account,
    delivery: {
      producer: 'tool',
      key: {
        kind: 'result',
        producer: 'tool',
        reference: account.delivery.key.reference,
        result: ok(decodeToolResultVersion('tres_1')),
      },
      account: reported ? account.delivery.account : null,
    },
  }
}

const VISIBLE = { toHuman: true, toModel: true }
export const OUTCOME_CONTENT = { kind: 'text', id: 'blk_bg_out', visibility: VISIBLE, text: 'done' }

// The material of a result whose value holds content: what a background outcome reminds of.
export const outcomeMaterial = (tenant: TenantId, draft: Draft): Material<ContentBlock> =>
  materialOf(tenant, draft, value => ({
    ...value,
    delivery: {
      ...(value.delivery as Record<string, unknown>),
      value: {
        content: [OUTCOME_CONTENT],
        data: { kind: 'none' },
        original: { kind: 'none' },
        attachments: [],
      },
    },
  }))

export function placeholderEntry(account: ReceivedEntry): ReceivedEntry {
  if (account.delivery.producer !== 'tool') throw new Error('fixture: a Tool entry')
  const { reference } = account.delivery.key
  return {
    ...account,
    delivery: { producer: 'tool', key: { kind: 'placeholder', producer: 'tool', reference } },
  }
}

export function placeholderMaterial(
  tenant: TenantId,
  entry: ReceivedEntry,
): Material<ContentBlock> {
  return {
    kind: 'facts',
    schema: SCHEMA,
    value: json({
      tenant: textOf(tenant),
      delivery: {
        kind: 'placeholder',
        key: entry.delivery.key,
        consumer: entry.consumer,
        delivery: 'tdel_0',
        source: { kind: 'control', operation: 'top_background' },
        label: { intent: 'build', tool: 'Shell', command: 'execute', preview: 'pnpm build' },
        evidence: evidence('tool-placeholder'),
      },
    }),
  }
}
