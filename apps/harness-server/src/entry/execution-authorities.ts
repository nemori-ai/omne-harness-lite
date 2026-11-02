import type { Context } from '@deepseek-ai/cordis'
import type {
  EnvironmentAuthority,
  EnvironmentAction,
  RecoveryAuthority,
} from '@omne-harness/execution-environment-contract'
import {
  ExecutionEnvironmentAuthorityService,
  ExecutionRecoveryAuthorityService,
  ExecutionScopeBindingService,
  executionEnvironmentAuthorityKey,
  executionRecoveryAuthorityKey,
  executionScopeBindingKey,
} from '@omne-harness/execution-environment-cordis-contract/cordis'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type {
  AuthorityDecision,
  ScopeBindingSource,
  ScopeRef,
} from '@omne-harness/runtime-context-contract'
import type { EntryObjectModule } from '../types.ts'
import { verifierOf } from './principals.ts'
import { currentForReader } from './runtime-context-trust.ts'

export type ExecutionAuthorityOptions = Readonly<{
  readVerifier: () => PrincipalVerifier | undefined
  readBindings: () => ScopeBindingSource | undefined
}>

type Target = Readonly<{ tenant: TenantId; scope?: ScopeRef }>

async function scopeFailure(
  options: ExecutionAuthorityOptions,
  scope: ScopeRef | undefined,
  tenant: TenantId,
): Promise<Exclude<AuthorityDecision<unknown>, { kind: 'authorized' }> | undefined> {
  if (scope === undefined) return undefined
  const bindings = options.readBindings()
  if (bindings === undefined) return { kind: 'unavailable' }
  const binding = await bindings.lookup(scope)
  switch (binding.kind) {
    case 'bound':
      return tenantEquals(binding.tenant, tenant) ? undefined : { kind: 'refused' }
    case 'unbound':
      return { kind: 'refused' }
    case 'unknown':
      return { kind: 'unknown' }
    default:
      return { kind: 'unavailable' }
  }
}

function targetOf(action: EnvironmentAction, tenant: TenantId): Target {
  switch (action.kind) {
    case 'resolve':
    case 'describe':
      return { tenant, scope: Object.freeze({ ref: action.scope.ref }) }
    case 'acquire':
    case 'inspect-original':
      return {
        tenant: action.original.tenant,
        scope: Object.freeze({ ref: action.original.scope.ref }),
      }
    case 'inspect':
      return { tenant: action.tenant }
  }
}

export class EntryExecutionEnvironmentAuthority extends ExecutionEnvironmentAuthorityService<unknown> {
  readonly readers = new WeakMap<Context, () => boolean>()
  readonly options: ExecutionAuthorityOptions
  constructor(ctx: Context, options: ExecutionAuthorityOptions) {
    super(ctx)
    this.options = options
  }

  async authorize(
    ...[access, action]: Parameters<EnvironmentAuthority<unknown>['authorize']>
  ): Promise<AuthorityDecision<unknown>> {
    const current = currentForReader(this.readers, this.ctx)
    const { principal, tenant } = access
    const target = targetOf(action, tenant)
    try {
      const verifier = this.options.readVerifier()
      if (verifier === undefined) return { kind: 'unavailable' }
      const verification = await verifier.verify(principal)
      if (verification.kind === 'unavailable') return { kind: 'unavailable' }
      if (verification.kind !== 'verified') return { kind: 'refused' }
      const verified = verification.principal
      if (
        verified.kind !== 'acting-for-tenant' ||
        !tenantEquals(verified.tenant, tenant) ||
        !tenantEquals(target.tenant, tenant)
      )
        return { kind: 'refused' }
      const failure = await scopeFailure(this.options, target.scope, tenant)
      if (failure !== undefined) return failure
      return { kind: 'authorized', principal: verified, current }
    } catch {
      return { kind: 'unavailable' }
    }
  }
}

export class EntryExecutionScopeBinding extends ExecutionScopeBindingService {
  readonly readBindings: () => ScopeBindingSource | undefined
  constructor(ctx: Context, readBindings: () => ScopeBindingSource | undefined) {
    super(ctx)
    this.readBindings = readBindings
  }

  async lookup(
    ...[scope]: Parameters<ScopeBindingSource['lookup']>
  ): ReturnType<ScopeBindingSource['lookup']> {
    try {
      const source = this.readBindings()
      if (source === undefined) return { kind: 'unavailable' }
      return await source.lookup(Object.freeze({ ref: scope.ref }))
    } catch {
      return { kind: 'unavailable' }
    }
  }
}

export class EntryExecutionRecoveryAuthority extends ExecutionRecoveryAuthorityService {
  readonly readRecovery: () => RecoveryAuthority | undefined
  constructor(ctx: Context, readRecovery: () => RecoveryAuthority | undefined) {
    super(ctx)
    this.readRecovery = readRecovery
  }

  async authorizeRecovery(
    ...args: Parameters<RecoveryAuthority['authorizeRecovery']>
  ): ReturnType<RecoveryAuthority['authorizeRecovery']> {
    try {
      const source = this.readRecovery()
      if (source === undefined) return 'unavailable'
      const result = await source.authorizeRecovery(...args)
      return result === 'authorized' || result === 'notAuthorized' ? result : 'unavailable'
    } catch {
      return 'unavailable'
    }
  }
}

export type ExecutionAuthorityModuleOptions = Readonly<{
  readBindings?: () => ScopeBindingSource | undefined
  readRecovery?: () => RecoveryAuthority | undefined
}>

/** Callbacks close over the entry's trusted sources, never the caller's contexts. */
export function createExecutionAuthorityModules(
  options: ExecutionAuthorityModuleOptions = {},
): readonly EntryObjectModule[] {
  const readBindings = options.readBindings ?? (() => undefined)
  return [
    {
      name: executionEnvironmentAuthorityKey,
      implementation: 'real',
      install(scope, env) {
        new EntryExecutionEnvironmentAuthority(scope, {
          readVerifier: () => verifierOf(env),
          readBindings,
        })
      },
    },
    {
      name: executionScopeBindingKey,
      implementation: 'real',
      install(scope) {
        new EntryExecutionScopeBinding(scope, readBindings)
      },
    },
    {
      name: executionRecoveryAuthorityKey,
      implementation: 'real',
      install(scope) {
        new EntryExecutionRecoveryAuthority(scope, options.readRecovery ?? (() => undefined))
      },
    },
  ]
}
