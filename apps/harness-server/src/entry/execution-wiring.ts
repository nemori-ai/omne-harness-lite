import type {
  SessionPrincipalBindingSource,
  SessionScopeOwnerSource,
} from '@omne-harness/session-contract'
import type { SessionScopeLookup } from '@omne-harness/session-cordis-contract'
import {
  sessionPrincipalBindingsKey,
  sessionScopeLookupKey,
  sessionScopeOwnersKey,
} from '@omne-harness/session-cordis-contract/cordis'
import type { EntryEnv, EntryObjectModule } from '../types.ts'
import { createExecutionAuthorityModules } from './execution-authorities.ts'
import { createRuntimeContextTrustModule, runtimeContextTrust } from './runtime-context-trust.ts'
import {
  createSessionScopeSource,
  type SessionScopeOwnershipSource,
  type SessionScopeSource,
} from './session-scope-source.ts'

const scopesByEnv = new WeakMap<EntryEnv, SessionScopeSource>()

function readPrincipalBindings(env: EntryEnv): SessionPrincipalBindingSource | undefined {
  const source: SessionPrincipalBindingSource | undefined = env
    .readTrusted(sessionPrincipalBindingsKey)
    .get(sessionPrincipalBindingsKey)
  return source
}

export function ownershipFrom(
  lookup: SessionScopeLookup | undefined,
  owners: SessionScopeOwnerSource | undefined,
): SessionScopeOwnershipSource | undefined {
  if (lookup === undefined && owners === undefined) return undefined
  return {
    async lookup(scope) {
      const indexed = lookup === undefined ? undefined : await lookup.lookup(scope)
      if (indexed?.kind === 'known')
        return {
          kind: 'bound',
          tenant: indexed.tenant,
          session: indexed.session,
          generation: indexed.generation,
        }
      if (owners === undefined)
        return indexed?.kind === 'unknown' ? { kind: 'unknown' } : { kind: 'unavailable' }
      const kept = await owners.lookup({ scope: scope.ref })
      if ('failure' in kept) return { kind: 'unavailable' }
      if (kept.ok.kind === 'unknown') return { kind: 'unknown' }
      return {
        kind: 'bound',
        tenant: kept.ok.tenant,
        session: kept.ok.session,
        generation: kept.ok.generation,
      }
    },
  }
}

export function sessionScopesOf(env: EntryEnv): SessionScopeSource {
  const made = scopesByEnv.get(env)
  if (made !== undefined) return made
  const created = createSessionScopeSource({
    readOwnership: () =>
      ownershipFrom(
        env.readTrusted(sessionScopeLookupKey).get(sessionScopeLookupKey),
        env.readTrusted(sessionScopeOwnersKey).get(sessionScopeOwnersKey),
      ),
    readPrincipalBindings: () => readPrincipalBindings(env),
  })
  scopesByEnv.set(env, created)
  return created
}

export const scopedRuntimeContextTrust: EntryObjectModule = {
  name: runtimeContextTrust.name,
  implementation: 'real',
  install: (scope, env) =>
    createRuntimeContextTrustModule(sessionScopesOf(env)).install(scope, env),
}

export const executionAuthorities: readonly EntryObjectModule[] =
  createExecutionAuthorityModules().map((module, index): EntryObjectModule => ({
    name: module.name,
    implementation: module.implementation,
    install(scope, env) {
      const bound = createExecutionAuthorityModules({
        readBindings: () => sessionScopesOf(env).bindings,
      })[index]
      if (bound === undefined) throw new Error('execution authority module index out of range')
      return bound.install(scope, env)
    },
  }))
