import type { Context } from '@deepseek-ai/cordis'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { runtimeContextKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import { sessionKey, sessionScopeLookupKey } from '@omne-harness/session-cordis-contract/cordis'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import type { SessionContextHolderInput } from './context-holder.ts'
import type { SessionConditionsInput } from './conditions.ts'
import type { SessionId } from '@omne-harness/session-contract'
import { createSessionModesPublisher } from './mode-publisher.ts'
import { createSessionModesSource } from './mode-source.ts'

export type SessionModesPluginInput = Readonly<{
  tenant: TenantId
  principal: unknown
  coordinator: SessionContextHolderInput<unknown>['coordinator']
  defaultModes: SessionConditionsInput['defaultModes']
}>

const affected = new Set([
  'session.created',
  'session.mode-changed',
  'session.permission-assigned',
  'session.context-registration-changed',
  'session.archived',
  'session.unarchived',
])

/** The trusted assembly mounts one producer fiber per tenant, with that tenant's registration principal. */
export function createSessionModesPlugin(input: SessionModesPluginInput) {
  let active: ReturnType<typeof createSessionModesPublisher<unknown>> | undefined
  return {
    name: 'session-ad03-modes',
    refresh(session: SessionId) {
      return active?.refresh(session) ?? Promise.resolve({ kind: 'unavailable' as const })
    },
    inject: {
      [sessionKey]: { caller: 'coordinator' as const },
      [runtimeContextKey]: null,
      [sessionScopeLookupKey]: null,
      [storageKey]: null,
      [tenantDomainLookupKey]: null,
    },
    async apply(ctx: Context) {
      const session = ctx[sessionKey]
      const publisher = createSessionModesPublisher({
        tenant: input.tenant,
        principal: input.principal,
        runtime: ctx[runtimeContextKey],
        scopes: ctx[sessionScopeLookupKey],
        coordinator: input.coordinator,
        source: createSessionModesSource({
          readWork: access => session.work.readWork(access),
          storage: ctx[storageKey],
          domains: ctx[tenantDomainLookupKey],
          defaultModes: input.defaultModes,
        }),
      })
      ctx.effect(() => {
        active = publisher
        return async () => {
          if (active === publisher) active = undefined
          await publisher.close()
        }
      })
      ctx.on(
        'session-cordis-contract/committed',
        async (tenant, session, _revision, _source, kinds) => {
          if (!tenantEquals(tenant, input.tenant) || !kinds.some(kind => affected.has(kind))) return
          const result = await publisher.refresh(session)
          if (result.kind !== 'refreshed' && result.kind !== 'closed')
            ctx.logger('session-ad03-modes').warn(`mode refresh answered ${result.kind}`)
        },
      )
      const registered = await publisher.start()
      if (registered.kind !== 'registered')
        throw new Error(`mode producer registration answered ${registered.kind}`)
    },
  }
}
