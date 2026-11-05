// The `session-handoff` row (B1, R2-D136): the J06 message admission plugin of session-adapters
// (`createSessionMessageHandoffPlugin`), which provides `agentMessageHandoff`. Its admission records
// go to the `er_preadmission` table of the execution-record participant of the session log, so it
// injects the trusted `storage` and `tenantDomainLookup`, plus `agentAccessCheck` and `session` as
// `coordinator`. Construction inputs (runtime objects, not configuration): the coordinator
// principal source over the trusted `sessionWorkPrincipals`; the stable identity text of a caller
// that the record keeps (the two principal shapes of identity, never a credential); and the adoption
// that names this provider in every outcome.
//
// Configuration (release data): the session log combination that the records commit under, the
// same `combinationVersion` and `manifestDigest` as the `agent-journal` row.
import type { Context, Plugin } from '@deepseek-ai/cordis'
import {
  agentAccessCheckKey,
  agentMessageHandoffKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import type { Principal } from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import { createSessionMessageHandoffPlugin } from '@omne-harness/session-adapters/cordis'
import { sessionKey, sessionWorkPrincipalsKey } from '@omne-harness/session-cordis-contract/cordis'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { z } from 'zod'
import { defineRow } from '../../row.ts'
import { coordinatorPrincipalsOf } from '../session-adapters/coordinator.ts'

/** The adopted implementation of the provider, named in every outcome. */
export const MESSAGE_HANDOFF_PROVIDER = Object.freeze({
  owner: '@omne-harness/session-adapters',
  name: 'message-handoff',
  revision: '1',
  digest: 'session-adapters:message-handoff/1',
})

const text = z.string().min(1)
export const sessionHandoffConfig = z.strictObject({
  combinationVersion: text,
  manifestDigest: text,
})
export type SessionHandoffConfig = z.output<typeof sessionHandoffConfig>

/**
 * The stable identity text of a principal for the admission record: the component of a system
 * principal, or the component, tenant and work of an acting principal. A value that is not one of
 * the two shapes has no identity; the record keeps a marker, never the value.
 */
export function principalIdentityOf(principal: unknown): string {
  const value = principal as Principal | null | undefined
  if (value?.kind === 'system') return `system:${value.component}`
  if (value?.kind === 'acting-for-tenant') {
    const tenant = tenantCodec.encode(value.tenant)
    return `acting:${value.actor.component}@${tenant.ok ? tenant.value : 'unminted-tenant'}/${value.work.owner}:${value.work.work}`
  }
  return 'unknown-principal'
}

const INJECTS = [
  sessionWorkPrincipalsKey,
  sessionKey,
  agentAccessCheckKey,
  storageKey,
  tenantDomainLookupKey,
]

const plugin: Plugin.Object = {
  name: 'session-handoff',
  inject: INJECTS,
  Config: sessionHandoffConfig,
  async apply(ctx: Context, config: SessionHandoffConfig) {
    await ctx.plugin(
      createSessionMessageHandoffPlugin<unknown>({
        coordinator: coordinatorPrincipalsOf(ctx),
        principalIdentity: principalIdentityOf,
        provider: MESSAGE_HANDOFF_PROVIDER,
      }),
      config,
    )
  },
}

export const sessionHandoffRow = defineRow({
  row: 'session-handoff',
  implementation: 'real',
  manifest: { provides: [agentMessageHandoffKey], injects: INJECTS, sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin,
})
