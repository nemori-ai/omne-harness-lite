import { stubPlugin } from '../../../src/cordis.ts'
import { fixtureIdentity } from './rows/identity/index.ts'
import { fixtureRuntimeContext } from './rows/runtime-context/index.ts'
import { fixtureStorage } from './rows/storage/index.ts'

export { fixtureIdentity, fixtureRuntimeContext, fixtureStorage }
export { storageEvents } from './rows/storage/index.ts'
export { fixtureStorageHost } from './entry/storage-host.ts'
export {
  failingEntryObject,
  fixtureRuntimeContextTrust,
  onceProbe,
} from './entry/runtime-context-trust.ts'
export { syntheticRow } from './rows/synthetic.ts'

export const AA_FIXTURE_ROWS = { fixtureStorage, fixtureIdentity, fixtureRuntimeContext } as const

export const fixturePlugins = { stubPlugin, ...AA_FIXTURE_ROWS } as const
