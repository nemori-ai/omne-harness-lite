// 生产入口对 Runtime Context 收窄与 Execution 授权三件的接线：四个模块都在清单里各一次，
// 共用一份 Scope 来源；AD-03 与 AD-15 的生产来源缺席时，绑定与恢复授权答 unavailable，不因会话归属读口可读而放行。
import { expect, it } from 'vitest'
import {
  executionEnvironmentAuthorityKey,
  executionRecoveryAuthorityKey,
  executionScopeBindingKey,
} from '@omne-harness/execution-environment-cordis-contract/cordis'
import { createRecoveryAccess } from '@omne-harness/execution-environment-contract'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { runtimeContextTrustKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import { sessionPrincipalBindingsKey } from '@omne-harness/session-cordis-contract/cordis'
import { entryObjects } from '../../src/entry/index.ts'
import {
  executionAuthorities,
  scopedRuntimeContextTrust,
} from '../../src/entry/execution-wiring.ts'
import { principalIssuer } from '../../src/entry/principals.ts'
import { fixtureEnv, fixtureTenant, got, okOf } from './support.ts'

const tenant = fixtureTenant('a')
const scope = okOf(decodeScopeRef({ ref: 'wiring-scope' }), 'scope')

it('registers the runtime-context narrowing and the three execution modules once each', () => {
  const names = entryObjects.map(module => module.name)
  expect(new Set(names).size).toBe(names.length)
  for (const key of [
    runtimeContextTrustKey,
    executionEnvironmentAuthorityKey,
    executionScopeBindingKey,
    executionRecoveryAuthorityKey,
  ])
    expect(names.filter(name => name === key)).toHaveLength(1)
  expect(executionAuthorities.map(module => module.name)).toEqual([
    executionEnvironmentAuthorityKey,
    executionScopeBindingKey,
    executionRecoveryAuthorityKey,
  ])
})

it('answers unavailable for scope bindings and recovery while AD-03 and AD-15 have no production source', async () => {
  const keys = [
    principalIssuerKey,
    runtimeContextTrustKey,
    executionEnvironmentAuthorityKey,
    executionScopeBindingKey,
    executionRecoveryAuthorityKey,
    sessionPrincipalBindingsKey,
  ]
  const fixture = fixtureEnv(keys)
  // The session side is readable and says bound: the missing scope owner alone must keep the answer closed.
  fixture.scopeOf(sessionPrincipalBindingsKey).provide(sessionPrincipalBindingsKey, {
    read: async (input: { tenant: typeof tenant; session: string }) => ({
      ok: {
        kind: 'bound',
        ...input,
        source: { owner: 'test', record: 'r1', revision: '1', digest: 'd' },
      },
    }),
  })
  await fixture.install(principalIssuer)
  await fixture.install(scopedRuntimeContextTrust)
  for (const module of executionAuthorities) await fixture.install(module)

  const bindings = got(
    fixture.scopeOf(executionScopeBindingKey).get(executionScopeBindingKey),
    'execution bindings',
  )
  expect(await bindings.lookup(scope)).toEqual({ kind: 'unavailable' })
  const trust = got(
    fixture.scopeOf(runtimeContextTrustKey).get(runtimeContextTrustKey),
    'runtime context trust',
  )
  expect(await trust.bindings.lookup(scope)).toEqual({ kind: 'unavailable' })
  const recovery = got(
    fixture.scopeOf(executionRecoveryAuthorityKey).get(executionRecoveryAuthorityKey),
    'execution recovery',
  )
  expect(await recovery.authorizeRecovery(createRecoveryAccess(), scope, [])).toBe('unavailable')
})
