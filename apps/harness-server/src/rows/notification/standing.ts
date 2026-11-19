import { tenantCodec, type TenantId as LegalTenantId } from '@omne-harness/legal-identity'
import {
  STANDING_ITEMS_NEED,
  standingReadOf,
  type StandingBlockRead,
  type StandingItems,
} from '@omne-harness/notification'
import {
  standingItemsSchema,
  tenantIdSchema,
  type StandingRead,
  type TenantId,
} from '@omne-harness/notification-contract'
import type {
  NeedBinding,
  StaticBlock,
  StaticContribution,
  StaticReaderRequest,
  StaticScopeHolder,
  SuppliedBlockDescriptor,
} from '@omne-harness/runtime-context-contract'

export const DELIVERY_BLOCKED_KEY = 'notification.delivery-blocked'

const descriptor = Object.freeze({
  key: DELIVERY_BLOCKED_KEY,
  kind: 'supplied',
  schema: standingItemsSchema,
  consumers: ['coordinator'],
  required: true,
  disclosure: 'plain',
  carriesPrevious: false,
  volatility: 'per-request',
  recovery: 'reread',
} satisfies SuppliedBlockDescriptor<typeof DELIVERY_BLOCKED_KEY, unknown>)

function textOf(tenant: LegalTenantId): TenantId | null {
  const text = tenantCodec.encode(tenant)
  const parsed = text.ok ? tenantIdSchema.safeParse(text.value) : undefined
  return parsed?.success ? parsed.data : null
}

/** Notification publishes its blocked destinations as a block; it does not know who reads it. */
function deliveryBlockedBlock(blocked: (tenant: TenantId) => Promise<StandingRead>): StaticBlock {
  return Object.freeze({
    declaration: descriptor,
    supply: async ({ tenant }) => {
      const text = textOf(tenant)
      const read: StandingRead = text === null ? { kind: 'unknown' } : await blocked(text)
      if (read.kind === 'ok') return { kind: 'value', value: read.items }
      return { kind: read.kind === 'unknown' ? 'unknown' : 'unavailable' }
    },
  })
}

export function standingItemsBinding(key: `${string}.${string}`): NeedBinding {
  return Object.freeze({
    need: Object.freeze({
      name: STANDING_ITEMS_NEED,
      shape: standingItemsSchema,
      consumer: 'coordinator',
      purpose: 'The standing items that are open now, for the reminders of Notification',
      // The registrations of a tenant-level scope are not required, so a need bound there is optional;
      // Notification itself reads anything but a value as not known.
      necessity: 'optional',
    }),
    key,
  })
}

/** What Notification contributes to the tenant-level scope: its own block, bound to its own need. */
export function standingContribution(
  blocked: (tenant: TenantId) => Promise<StandingRead>,
): StaticContribution {
  return Object.freeze({
    blocks: [deliveryBlockedBlock(blocked)],
    needs: [standingItemsBinding(DELIVERY_BLOCKED_KEY)],
  })
}

export type StandingReaderDeps<P> = Readonly<{
  scope(): Pick<StaticScopeHolder<P>, 'read'> | undefined
  principal(tenant: LegalTenantId): Promise<P | null>
}>

const REQUEST: StaticReaderRequest = {
  consumer: 'coordinator',
  blocks: [],
  needs: [STANDING_ITEMS_NEED],
}

export function createStandingItemsReader<P>(deps: StandingReaderDeps<P>): StandingItems {
  return Object.freeze({
    async read(text: TenantId): Promise<StandingRead> {
      const tenant = tenantCodec.parse(text)
      const scope = deps.scope()
      if (!tenant.ok || scope === undefined) return { kind: 'unknown' }
      const principal = await deps.principal(tenant.value)
      if (principal === null) return { kind: 'unknown' }
      const read = await scope.read(principal, tenant.value, REQUEST)
      if ('failure' in read) return { kind: read.failure.kind === 'denied' ? 'refused' : 'unknown' }
      const blocks: StandingBlockRead[] = read.ok.entries.map(entry =>
        entry.kind === 'value' ? { kind: 'value', value: entry.value } : { kind: entry.kind },
      )
      const bound = !read.ok.missing.needs.includes(STANDING_ITEMS_NEED)
      return standingReadOf({ kind: 'read', bound, blocks })
    },
  })
}
