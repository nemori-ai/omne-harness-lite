// 夹具清单：`fixturePlugins` 是测试里替代 `./cordis` 导出的插件表，`AA_FIXTURE_ROWS` 是其中行 id 取自 AA 行表的那些。
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

/** 行 id 在 AA 行表里的夹具行，键是导出名（发行配置里 `plugin` 的取值）。 */
export const AA_FIXTURE_ROWS = { fixtureStorage, fixtureIdentity, fixtureRuntimeContext } as const

export const fixturePlugins = { stubPlugin, ...AA_FIXTURE_ROWS } as const
