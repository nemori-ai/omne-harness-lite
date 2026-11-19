import type { PrincipalVerifier } from '@omne-harness/identity'
import { createRuntimeContext } from '@omne-harness/runtime-context'
import {
  decodeScopeRef,
  type ContextBlockKey,
  type ScopeRef,
} from '@omne-harness/runtime-context-contract'
import { prepareContextRegistration } from '@omne-harness/session-adapters/cordis'
import { createRuntimeContextAuthority } from '../../entry/runtime-context-trust.ts'
import {
  contextPreparationRecord,
  type ContextCreation,
  type InitialBlock,
} from '../../assembly/session-context-initialization.ts'
import { Service, type Context } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  createSessionModesPlugin,
  type SessionModesPluginInput,
} from '@omne-harness/session-adapters/cordis'
import type { SessionAccess, SessionId } from '@omne-harness/session-contract'
import type { SessionModesPrincipalsService } from '../../entry/session-modes-principals.ts'

export const sessionModesInstallationKey = 'sessionModesInstallation'
type Producer = ReturnType<typeof createSessionModesPlugin>
type Sources = Pick<SessionModesPluginInput, 'coordinator' | 'defaultModes'> &
  Readonly<{
    principals: Pick<SessionModesPrincipalsService, 'forTenant'>
    verifier: PrincipalVerifier
    recoverSession(
      input: Readonly<{ tenant: TenantId; session: SessionId; scope: ScopeRef }>,
    ): Promise<Readonly<{ kind: 'ready' | 'absent' | 'unavailable' }>>
  }>

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionModesInstallation: SessionModesInstallation
  }
}

export class SessionModesInstallation extends Service {
  readonly recoverSession: Sources['recoverSession']
  readonly prepareInitial: (
    input: ContextCreation,
    block: InitialBlock,
  ) => ReturnType<typeof prepareContextRegistration>
  readonly ensure: (tenant: TenantId) => Promise<{ kind: 'ready' | 'unavailable' }>
  readonly refresh: (tenant: TenantId, session: SessionId) => ReturnType<Producer['refresh']>
  readonly readPermissionMode: (
    access: SessionAccess<unknown>,
  ) => ReturnType<Producer['readPermissionMode']>

  constructor(ctx: Context, sources: Sources) {
    super(ctx, sessionModesInstallationKey)
    const producers = new Map<string, Promise<Producer | undefined>>()
    let active = true
    ctx.effect(() => () => {
      active = false
      producers.clear()
    })
    const mount = async (tenant: TenantId): Promise<Producer | undefined> => {
      const principal = sources.principals.forTenant(tenant)
      if (principal === undefined || !active) return undefined
      const plugin = createSessionModesPlugin({
        tenant,
        principal,
        coordinator: sources.coordinator,
        defaultModes: sources.defaultModes,
      })
      const fiber = ctx.plugin(plugin)
      try {
        await fiber
        if (active) return plugin
      } catch {
        ctx.logger('session-ad03-modes').warn('tenant mode producer could not start')
      }
      await fiber.dispose()
      return undefined
    }
    const producer = (tenant: TenantId): Promise<Producer | undefined> => {
      const encoded = tenantCodec.encode(tenant)
      if (!active || !encoded.ok) return Promise.resolve(undefined)
      const key = encoded.value
      const existing = producers.get(key)
      if (existing !== undefined) return existing
      const pending = mount(tenant)
      producers.set(key, pending)
      void pending.then(value => {
        if (value === undefined && producers.get(key) === pending) producers.delete(key)
      })
      return pending
    }
    this.recoverSession = async input => {
      if ((await producer(input.tenant)) === undefined) return { kind: 'unavailable' }
      const result = await sources.recoverSession(input)
      return active ? result : { kind: 'unavailable' }
    }
    this.prepareInitial = async (input, block) => {
      const closed = {
        failure: {
          kind: 'unavailable' as const,
          owner: block.item,
          diagnostic: 'the context installation is closed',
        },
      }
      if (!active) return closed
      const result = await prepareInitial(input, block, sources)
      return active ? result : closed
    }
    this.ensure = async tenant => ({
      kind: (await producer(tenant)) === undefined ? 'unavailable' : 'ready',
    })
    this.refresh = async (tenant, session) => {
      const mounted = await producer(tenant)
      return mounted?.refresh(session) ?? { kind: 'unavailable' }
    }
    this.readPermissionMode = async access => {
      const mounted = await producer(access.tenant)
      return mounted?.readPermissionMode(access) ?? { kind: 'unavailable' }
    }
  }
}

async function prepareInitial(
  input: ContextCreation,
  block: InitialBlock,
  sources: Sources,
): ReturnType<typeof prepareContextRegistration> {
  const unavailable = () => ({
    failure: {
      kind: 'unavailable' as const,
      owner: block.item,
      diagnostic: 'the initial context preparation is unavailable',
    },
  })
  const principal = sources.principals.forTenant(input.tenant)
  if (principal === undefined) return unavailable()
  const record = contextPreparationRecord(block, input)
  const scope = decodeScopeRef({ ref: record.decision.scope })
  if ('failure' in scope) return unavailable()
  const authority = createRuntimeContextAuthority({ verifier: sources.verifier })
  const temporary = createRuntimeContext({
    trust: {
      authority: {
        holder: (caller, action) =>
          action.kind === 'prepare' && action.change.scope.ref === scope.ok.ref
            ? authority.holder(caller, action)
            : Promise.resolve({ kind: 'refused' }),
        producer: (caller, action) => authority.producer(caller, action),
        reader: async () => ({ kind: 'refused' }),
      },
      bindings: {
        lookup: async requested =>
          requested.ref === scope.ok.ref
            ? { kind: 'bound', tenant: input.tenant }
            : { kind: 'unbound' },
      },
    },
  })
  try {
    const registered = await temporary.registerProducer<ContextBlockKey>(principal, {
      tenant: input.tenant,
      key: block.item,
      producer: block.producer,
      declaration: block.descriptor,
      scoped: true,
      supply: async () => ({ kind: 'none' }),
    })
    if (registered.kind !== 'registered') return unavailable()
    return await prepareContextRegistration(
      temporary,
      input.principal,
      {
        kind: 'add',
        tenant: input.tenant,
        scope: scope.ok,
        key: block.item,
        creating: true,
        required: true,
        basedOn: block.basedOn,
        bindings: block.bindings,
        parameters: undefined,
      },
      { commit: record.decision.commit },
    )
  } finally {
    await temporary.close()
  }
}
