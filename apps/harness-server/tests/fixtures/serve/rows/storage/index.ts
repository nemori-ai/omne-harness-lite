// 夹具 `storage` 行：入口对象承载（DP1-C15 第 2 种）。成员插件只 inject `storageHost`，把控制口交给它，
// 不认识 `s0.assemblyLifecycle`。登记由夹具入口对象 `storageHost` 在 `attachControl` 里完成。
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { defineRow } from '../../../../../src/row.ts'
import {
  FixtureStorageHostService,
  FixtureStorageService,
  storageHostKey,
  storageKey,
  type FixtureStorageControl,
} from '../../definitions.ts'

/** 控制口收到的调用，按次序。每个用例开始前清空。 */
export const storageEvents: string[] = []

class StorageImpl extends FixtureStorageService {}

/** 代表 `SqliteStoragePlugin` 这样的成员插件。 */
const memberPlugin: Plugin.Object = {
  name: 'fixture-storage',
  inject: [storageHostKey],
  apply(ctx: Context) {
    new StorageImpl(ctx)
    const host: FixtureStorageHostService = ctx.get(storageHostKey)
    const control: FixtureStorageControl = {
      async close(options) {
        storageEvents.push(`close:${options.initiator}`)
        return 'closed'
      },
      assemblyReportSettled() {
        storageEvents.push('report-settled')
      },
    }
    host.attachControl(control)
  },
}

export const fixtureStorage = defineRow({
  row: 'storage',
  implementation: 'real',
  manifest: { provides: [storageKey], injects: [storageHostKey], sameProviderGroup: null },
  lifecycle: { kind: 'entry-object', phase: 'storage', via: storageHostKey },
  plugin: memberPlugin,
})
