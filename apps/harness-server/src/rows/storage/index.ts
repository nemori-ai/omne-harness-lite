// `storage` 行（装配页插件树第一行）：存储契约的 SQLite 提供者，入口对象承载（DP1-C15 第 2 种）。成员插件只 inject
// `storageHost`，把控制口交给它；`storage` 阶段的关闭句柄由入口对象 `storageHost` 在 `attachControl` 里登记。
// 行配置就是提供者配置（sqlite-provider 规格 §12.1），只含数据；`storageRoot` 是存储根目录。
import { SqliteStoragePlugin } from '@omne-harness/sqlite-provider/cordis'
import { storageHostKey, storageKey } from '@omne-harness/sql-contract/cordis'
import { defineRow } from '../../row.ts'

export const storageRow = defineRow({
  row: 'storage',
  implementation: 'real',
  manifest: { provides: [storageKey], injects: [storageHostKey], sameProviderGroup: null },
  lifecycle: { kind: 'entry-object', phase: 'storage', via: storageHostKey },
  plugin: SqliteStoragePlugin,
})
