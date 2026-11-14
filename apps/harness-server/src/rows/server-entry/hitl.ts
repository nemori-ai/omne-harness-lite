import type { Context } from '@deepseek-ai/cordis'
import { hitlCommandBinding } from '@omne-harness/human-intervention-local'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { HitlIngressFaces } from '@omne-harness/server-entry'
import { toolHitlHolder } from '../tool-hitl/holder.ts'
import type { HitlApplication, Qualification } from '../tool-hitl/host.ts'

type Faces = HitlIngressFaces<ActingForTenantPrincipal>
type Selected =
  | Readonly<{ kind: 'ready'; application: HitlApplication }>
  | Readonly<{ kind: 'unregistered'; qualify: () => Promise<Qualification> }>
  | Readonly<{ kind: 'unavailable'; reason: string }>

const NO_CARD = Object.freeze({ kind: 'denied', reason: 'card' } as const)
const EMPTY_PAGE = Object.freeze({
  kind: 'page',
  items: [],
  next: null,
  snapshotRef: 'unregistered',
  completeness: 'complete',
} as const)

export function hitlFacesOfCall(ctx: Context): Faces {
  const holder = toolHitlHolder(ctx)
  const select = async (principal: ActingForTenantPrincipal): Promise<Selected> => {
    const host = holder.host
    if (host === null) return { kind: 'unavailable', reason: 'the HITL host is not installed' }
    const tenant = tenantCodec.encode(principal.tenant)
    if (!tenant.ok) return { kind: 'unavailable', reason: 'the principal names no tenant' }
    const at = await host.tenant(tenant.value)
    if (at.kind === 'ready') return { kind: 'ready', application: at.tenant.application }
    return at.kind === 'unregistered'
      ? { kind: 'unregistered', qualify: () => host.qualify(tenant.value, principal) }
      : { kind: 'unavailable', reason: at.diagnostic }
  }
  return Object.freeze({
    queries: Object.freeze({
      async listPool(principal, query) {
        const at = await select(principal)
        if (at.kind === 'unregistered') {
          const qualified = await at.qualify()
          if (qualified.kind !== 'qualified') return qualified
          return query.cursor === undefined
            ? EMPTY_PAGE
            : { kind: 'invalid-input', reason: 'pool-cursor' }
        }
        return at.kind === 'ready' ? at.application.listPool(principal, query) : at
      },
      async getCard(principal, query) {
        const at = await select(principal)
        if (at.kind === 'unregistered') return NO_CARD
        return at.kind === 'ready' ? at.application.getCard(principal, query) : at
      },
      async getOperation(principal, query) {
        const at = await select(principal)
        if (at.kind === 'unregistered') {
          const qualified = await at.qualify()
          return qualified.kind === 'qualified'
            ? { kind: 'unavailable', reason: 'the tenant has no domain' }
            : qualified
        }
        return at.kind === 'ready' ? at.application.getOperation(principal, query) : at
      },
    }),
    commands: Object.freeze({
      async submitReply(principal, command) {
        const at = await select(principal)
        if (at.kind === 'unregistered') return { ...NO_CARD, operationRef: command.operation }
        return at.kind === 'ready'
          ? at.application.submitReply(principal, command)
          : { ...at, operationRef: command.operation }
      },
    }),
    bindSubmitReply: command => hitlCommandBinding('submitReply', command),
  } satisfies Faces)
}
