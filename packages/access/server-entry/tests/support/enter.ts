import type { ProtocolKey } from '@omne-harness/access-cordis-contract'
import type { Entered, RegistryForPipeline } from '../../src/registry/registry.ts'

/** An enter that must be taken. */
export function mustEnter(registry: RegistryForPipeline, key: ProtocolKey, name: string): Entered {
  const entered = registry.enter(key, name)
  if ('refused' in entered) throw new Error(`${key.name}/v${key.major} ${name}: ${entered.refused}`)
  return entered
}
