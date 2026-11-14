import type { Context, Plugin } from '@deepseek-ai/cordis'
import { defineRow } from '../../../../../src/row.ts'
import {
  FixtureStorageHostService,
  FixtureStorageService,
  storageHostKey,
  storageKey,
  type FixtureStorageControl,
} from '../../definitions.ts'

export const storageEvents: string[] = []

class StorageImpl extends FixtureStorageService {}

const memberPlugin: Plugin.Object = {
  name: 'fixture-storage',
  inject: [storageHostKey],
  apply(ctx: Context) {
    new StorageImpl(ctx)
    const host: FixtureStorageHostService = ctx.reflect.get(storageHostKey)
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
