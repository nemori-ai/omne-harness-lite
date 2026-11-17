import type { PrincipalVerifier } from '@omne-harness/identity'
import { createRuntimeContext } from '@omne-harness/runtime-context'
import { decodeScopeRef, type ScopeRef } from '@omne-harness/runtime-context-contract'
import {
  prepareContextRegistration,
  sessionModesDescriptor,
  sessionModesProducer,
} from '@omne-harness/session-adapters/cordis'
import { createRuntimeContextAuthority } from '../../entry/runtime-context-trust.ts'
import {
  INITIAL_BLOCKS,
  modesPreparationRecords,
  type ModesCreation,
} from '../../assembly/session-modes-initialization.ts'
import { Service, type Context } from '@deepseek-ai/cordis'
import {
  ENABLED_EXTENSIONS_BLOCK,
  enabledExtensionsDescriptor,
  enabledExtensionsProducer,
} from '@omne-harness/loop-extension-contract'
import { loopExtensionViewsKey } from '@omne-harness/loop-extension-cordis-contract/cordis'
import { createEnabledExtensionsPublisher } from '@omne-harness/loop-extension-host-local'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import { runtimeContextKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  createSessionModesPlugin,
  type SessionModesPluginInput,
} from '@omne-harness/session-adapters/cordis'
import type { SessionId } from '@omne-harness/session-contract'
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
  readonly prepareInitial: (input: ModesCreation) => Promise<InitialPreparations>
  readonly ensure: (tenant: TenantId) => Promise<{ kind: 'ready' | 'unavailable' }>
  readonly refresh: (tenant: TenantId, session: SessionId) => ReturnType<Producer['refresh']>

  constructor(ctx: Context, sources: Sources) {
    super(ctx, sessionModesInstallationKey)
    const producers = new Map<string, Promise<Producer | undefined>>()
    let active = true
    const closing: (() => Promise<void>)[] = []
    ctx.effect(() => async () => {
      active = false
      producers.clear()
      await Promise.all(closing.splice(0).map(close => close()))
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
      const extensions = enabledExtensionsPublisherOf(ctx, tenant, principal)
      try {
        await fiber
        const registered = await extensions.start()
        if (registered.kind !== 'registered')
          throw new Error(`extension producer registration answered ${registered.kind}`)
        if (active) {
          closing.push(() => extensions.close())
          return plugin
        }
      } catch {
        ctx.logger('session-ad03-modes').warn('tenant context producers could not start')
      }
      await extensions.close()
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
    this.prepareInitial = async input => {
      if (!active)
        return {
          failure: {
            kind: 'unavailable',
            owner: 'session.modes',
            diagnostic: 'mode installation is closed',
          },
        }
      const result = await prepareInitial(input, sources)
      return active
        ? result
        : {
            failure: {
              kind: 'unavailable',
              owner: 'session.modes',
              diagnostic: 'mode installation is closed',
            },
          }
    }
    this.ensure = async tenant => ({
      kind: (await producer(tenant)) === undefined ? 'unavailable' : 'ready',
    })
    this.refresh = async (tenant, session) => {
      const mounted = await producer(tenant)
      return mounted?.refresh(session) ?? { kind: 'unavailable' }
    }
  }
}

// The view is asked for on each read: while the loop-extension services are away the block reads as missing.
function enabledExtensionsPublisherOf(ctx: Context, tenant: TenantId, principal: unknown) {
  return createEnabledExtensionsPublisher<unknown>({
    tenant,
    principal,
    runtime: {
      registerProducer: (caller, registration) => {
        const runtime = ctx.get(runtimeContextKey)
        return runtime === undefined
          ? Promise.resolve({ kind: 'rejected' as const, reason: 'closed' as const })
          : runtime.registerProducer(caller, registration)
      },
    },
    views: {
      read: async access =>
        (await ctx.get(loopExtensionViewsKey)?.read(access)) ?? {
          kind: 'unavailable',
          diagnostic: 'the loop extension views are away',
        },
    },
  })
}

type Prepared = Awaited<ReturnType<typeof prepareContextRegistration>>
type InitialPreparations = Outcome<
  readonly Extract<Prepared, { ok: unknown }>['ok'][],
  PreparationFailure
>
type PreparationFailure = Extract<Prepared, { failure: unknown }>['failure']

async function prepareInitial(
  input: ModesCreation,
  sources: Sources,
): Promise<InitialPreparations> {
  const unavailable = () => ({
    failure: {
      kind: 'unavailable' as const,
      owner: 'session.modes',
      diagnostic: 'initial modes preparation is unavailable',
    },
  })
  const principal = sources.principals.forTenant(input.tenant)
  if (principal === undefined) return unavailable()
  const records = modesPreparationRecords(input)
  const [first] = records
  if (first === undefined) return succeed([])
  const scope = decodeScopeRef({ ref: first.decision.scope })
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
    const registered = await temporary.registerProducer(principal, {
      tenant: input.tenant,
      key: 'session.modes',
      producer: sessionModesProducer,
      declaration: sessionModesDescriptor,
      scoped: true,
      supply: async () => ({ kind: 'none' }),
    })
    const extensions = await temporary.registerProducer(principal, {
      tenant: input.tenant,
      key: ENABLED_EXTENSIONS_BLOCK,
      producer: enabledExtensionsProducer,
      declaration: enabledExtensionsDescriptor,
      scoped: false,
      supply: async () => ({ kind: 'unavailable' }),
    })
    if (registered.kind !== 'registered' || extensions.kind !== 'registered') return unavailable()
    const prepared = []
    for (const [index, record] of records.entries()) {
      const block = INITIAL_BLOCKS[index]
      if (block === undefined) return unavailable()
      const one = await prepareContextRegistration(
        temporary,
        input.principal,
        {
          kind: 'add',
          tenant: input.tenant,
          scope: scope.ok,
          key: block.key,
          creating: true,
          required: true,
          basedOn: record.decision.basedOn,
          bindings: block.bindings,
          parameters: undefined,
        },
        { commit: record.decision.commit },
      )
      if ('failure' in one) return one
      prepared.push(one.ok)
    }
    return succeed(prepared)
  } finally {
    await temporary.close()
  }
}
