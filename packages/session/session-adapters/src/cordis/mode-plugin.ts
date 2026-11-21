import type { Context } from '@deepseek-ai/cordis'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { runtimeContextKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import { sessionKey, sessionScopeLookupKey } from '@omne-harness/session-cordis-contract/cordis'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import type { SessionContextHolderInput } from './context-holder.ts'
import type { SessionConditionsInput } from './conditions.ts'
import type { Modes, SessionAccess, SessionId } from '@omne-harness/session-contract'
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

export type SessionPermissionModeReading =
  | Readonly<{ kind: 'read'; mode: Modes['permission']; revision: string }>
  | Readonly<{ kind: 'unavailable' }>
export type SessionModesReading =
  | Readonly<{ kind: 'read'; modes: Modes; revision: string }>
  | Readonly<{ kind: 'unavailable' }>

export function createSessionModesPlugin(input: SessionModesPluginInput) {
  let active:
    | Readonly<{
        publisher: ReturnType<typeof createSessionModesPublisher<unknown>>
        source: ReturnType<typeof createSessionModesSource<unknown>>
      }>
    | undefined
  return {
    name: 'session-ad03-modes',
    refresh(session: SessionId) {
      return active?.publisher.refresh(session) ?? Promise.resolve({ kind: 'unavailable' as const })
    },
    /** The modes in force, computed as they are published, with the permission revision. */
    async readModes(access: SessionAccess<unknown>): Promise<SessionModesReading> {
      const observed = await active?.source.read(access)
      if (observed?.kind !== 'ready') return { kind: 'unavailable' }
      const { modes, basis } = observed.value
      return { kind: 'read', modes, revision: basis.permissionRevision }
    },
    async readPermissionMode(
      access: SessionAccess<unknown>,
    ): Promise<SessionPermissionModeReading> {
      const now = await this.readModes(access)
      if (now.kind !== 'read') return now
      return { kind: 'read', mode: now.modes.permission, revision: now.revision }
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
      const modes = createSessionModesSource({
        readWork: access => session.work.readWork(access),
        storage: ctx[storageKey],
        domains: ctx[tenantDomainLookupKey],
        defaultModes: input.defaultModes,
      })
      const publisher = createSessionModesPublisher({
        tenant: input.tenant,
        principal: input.principal,
        runtime: ctx[runtimeContextKey],
        scopes: ctx[sessionScopeLookupKey],
        coordinator: input.coordinator,
        source: modes,
      })
      const current = { publisher, source: modes }
      ctx.effect(() => {
        active = current
        return async () => {
          if (active === current) active = undefined
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
