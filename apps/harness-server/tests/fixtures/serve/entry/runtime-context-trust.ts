import type { Context } from '@deepseek-ai/cordis'
import type { EntryEnv, EntryObjectModule, ServiceName } from '../../../../src/types.ts'
import { FixtureRuntimeContextTrustService, runtimeContextTrustKey } from '../definitions.ts'

class RuntimeContextTrustImpl extends FixtureRuntimeContextTrustService {}

export const fixtureRuntimeContextTrust: EntryObjectModule = {
  name: runtimeContextTrustKey,
  implementation: 'real',
  install(scope: Context) {
    new RuntimeContextTrustImpl(scope)
  },
}

export function failingEntryObject(name: ServiceName, detail: string): EntryObjectModule {
  return {
    name,
    implementation: 'real',
    install() {
      throw new Error(detail)
    },
  }
}

export function onceProbe(
  name: ServiceName,
  again: 'same' | 'different',
  seen: unknown[],
): EntryObjectModule {
  const key = Symbol('once-probe')
  const create = () => ({ made: true })
  return {
    name,
    implementation: 'real',
    install(scope: Context, env: EntryEnv) {
      seen.push(env.once(key, create))
      seen.push(env.once(key, again === 'same' ? create : () => ({ made: false })))
      scope.provide(name, {})
    },
  }
}
