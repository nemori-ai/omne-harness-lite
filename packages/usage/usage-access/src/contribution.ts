import type {
  AccessContribution,
  LoginIdentity,
  Principal,
} from '@omne-harness/access-cordis-contract'
import { tenantCodec, type Access, type TenantId } from '@omne-harness/legal-identity'
import type { UsageFailure, UsageReply } from '@omne-harness/usage-contract'
import type { UsageProtocol } from '@omne-harness/usage-protocol'
import type { Instant } from '@omne-harness/utc-instant'
import type { UsageFace, UsagePrincipals } from './ports.ts'
import { occupancyOf, pageOf, resultOf, textOf } from './views.ts'

export type UsageContributionInput = Readonly<{
  usage: () => UsageFace | undefined
  principals: UsagePrincipals
}>

type Handlers = AccessContribution<UsageProtocol>['operations']
type Failed =
  | Readonly<{ outcome: 'denied' | 'basis-unavailable' }>
  | Readonly<{ outcome: 'invalid'; body: Readonly<{ field: InvalidField; reason: string }> }>
  | Readonly<{ outcome: 'unsupported'; body: Readonly<{ field: 'scope' }> }>
  | Readonly<{ outcome: 'not-found'; body: Readonly<Record<string, never>> }>
  | Readonly<{ outcome: 'limited'; body: Readonly<{ limit: 'buckets' | 'pages' }> }>
type InvalidField = Extract<UsageFailure, { kind: 'invalid' }>['field']

const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })

function answerOfFailure(failure: UsageFailure): Failed {
  switch (failure.kind) {
    case 'invalid':
      return { outcome: 'invalid', body: { field: failure.field, reason: failure.reason } }
    case 'unsupported':
      return { outcome: 'unsupported', body: { field: failure.field } }
    case 'not-found':
      return { outcome: 'not-found', body: {} }
    case 'denied':
      return { outcome: 'denied' }
    case 'unavailable':
      return UNAVAILABLE
    case 'too-large':
      return { outcome: 'limited', body: { limit: failure.limit } }
  }
}

function tenantTextOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('usage-access: tenant is not a minted TenantId')
  return encoded.value
}

const rangeOf = (range: Readonly<{ from: Instant; to: Instant }>) => ({
  from: textOf(range.from),
  to: textOf(range.to),
})

export function createUsageContribution(
  input: UsageContributionInput,
): Omit<AccessContribution<UsageProtocol>, 'protocol'> {
  /** The four steps: act for the tenant, take its principal, take the face now, call and map. */
  async function answered<T, B>(
    login: LoginIdentity,
    tenant: TenantId,
    call: (usage: UsageFace, access: Access<Principal>) => UsageReply<T>,
    bodyOf: (value: T) => B,
  ): Promise<Failed | Readonly<{ outcome: 'succeeded'; body: B }>> {
    let issued: Awaited<ReturnType<UsagePrincipals['actingFor']>>
    try {
      issued = await input.principals.actingFor(login, tenantTextOf(tenant))
    } catch {
      return UNAVAILABLE
    }
    if ('refused' in issued) return { outcome: issued.refused }
    const usage = input.usage()
    if (usage === undefined) return UNAVAILABLE
    try {
      const reply = await call(usage, { principal: issued.ok, tenant })
      if ('failure' in reply) return answerOfFailure(reply.failure)
      return { outcome: 'succeeded', body: bodyOf(reply.ok) }
    } catch {
      return UNAVAILABLE
    }
  }

  const queryUsage: Handlers['query-usage'] = (call, body) =>
    answered(
      call.principal,
      body.tenant,
      (usage, access) =>
        usage.query({
          ...access,
          scope: body.scope,
          range: rangeOf(body.range),
          zone: body.zone,
          bucket: body.bucket,
          groupBy: body.groupBy,
        }),
      resultOf,
    )

  const listUsageRecords: Handlers['list-usage-records'] = (call, body) =>
    answered(
      call.principal,
      body.tenant,
      (usage, access) =>
        usage.records({
          ...access,
          scope: body.scope,
          range: rangeOf(body.range),
          after: body.after,
          limit: body.limit,
        }),
      pageOf,
    )

  const readContextOccupancy: Handlers['read-context-occupancy'] = (call, body) =>
    answered(
      call.principal,
      body.tenant,
      (usage, access) => usage.occupancy({ ...access, session: body.session }),
      occupancyOf,
    )

  return {
    operations: {
      'query-usage': queryUsage,
      'list-usage-records': listUsageRecords,
      'read-context-occupancy': readContextOccupancy,
    },
    observations: {},
  }
}
