import type { AccessContribution, LoginIdentity } from '@omne-harness/access-cordis-contract'
import type { InterfaceProtocol } from '@omne-harness/interface-protocol'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { Inspections } from './inspections.ts'
import type { InterfacePrincipals } from './ports.ts'

const DENIED = { outcome: 'denied' } as const
const UNAVAILABLE = { outcome: 'basis-unavailable' } as const

function tenantTextOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('interface-access: tenant is not a minted TenantId')
  return encoded.value
}

/** The login acts for the tenant the body names, or the answer that stops the call. */
async function admitted(principals: InterfacePrincipals, login: LoginIdentity, tenant: string) {
  try {
    const issued = await principals.actingFor(login, tenant)
    if ('ok' in issued) return undefined
    return issued.refused === 'denied' ? DENIED : UNAVAILABLE
  } catch {
    return UNAVAILABLE
  }
}

export function createInterfaceContribution(
  input: Readonly<{ principals: InterfacePrincipals; inspections: Inspections }>,
): Omit<AccessContribution<InterfaceProtocol>, 'protocol'> {
  const { principals, inspections } = input
  return {
    operations: {
      async deliver(call, body) {
        const tenant = tenantTextOf(body.tenant)
        const refused = await admitted(principals, call.principal, tenant)
        if (refused !== undefined) return refused
        const outcome = inspections.deliver(tenant, body.client, body.request, body.result)
        return { outcome, body: {} }
      },
      async 'deliver-seen'(call, body) {
        const tenant = tenantTextOf(body.tenant)
        const refused = await admitted(principals, call.principal, tenant)
        if (refused !== undefined) return refused
        const { client, request, result, met } = body
        const outcome = inspections.deliverSeen(tenant, client, request, result, met)
        return { outcome, body: {} }
      },
    },
    observations: {
      async 'observe-requests'(context, open) {
        const tenant = tenantTextOf(open.tenant)
        const refused = await admitted(principals, context.principal, tenant)
        if (refused !== undefined) return refused
        return {
          outcome: 'succeeded',
          frames: inspections.watch(tenant, open.client, 'look', context.revision, context.signal),
        }
      },
      async 'observe-now'(context, open) {
        const tenant = tenantTextOf(open.tenant)
        const refused = await admitted(principals, context.principal, tenant)
        if (refused !== undefined) return refused
        return {
          outcome: 'succeeded',
          frames: inspections.watch(tenant, open.client, 'now', context.revision, context.signal),
        }
      },
    },
  }
}
