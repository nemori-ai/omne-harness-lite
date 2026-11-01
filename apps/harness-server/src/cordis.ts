// `./cordis` 导出：S0 替身插件与真实行（单写点，L1-06）。导出名就是发行配置里 `plugin` 的取值，也是装载的 allowlist。
export { createStubPlugin as stubPlugin } from './s0/stub-plugin.ts'
export { agentAdoptionsRow } from './rows/agent-adoptions/index.ts'
export { adoptionSourcesRow } from './rows/adoption-sources/index.ts'
export { authorization } from './rows/authorization/row.ts'
export { identityRow } from './rows/identity/index.ts'
export { serverEntryRow } from './rows/server-entry/index.ts'
export { storageRow } from './rows/storage/index.ts'
export { sessionStorageRow } from './rows/session-storage/index.ts'
