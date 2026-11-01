// The Cordis binding of the SQLite provider (SQL contract SPEC 2.2, 2.3, 14). A function plugin:
// it only injects `storageHost`, builds one StorageService subclass instance and does not provide
// the key a second time. A construction failure throws, so the fiber ends FAILED. A managed effect
// closes the provider when the fiber is disposed. Worker, queues and result owner live in the
// provider object, never on the Context of a caller (IC-13).
import { definePlugin, type StandardSchema } from '@omne-harness/kernel-basis/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { StorageService, storageHostKey } from '@omne-harness/sql-contract/cordis'
import { validateConfig, type SqliteStorageConfig } from './config.ts'
import { createSqliteStorage } from './provider.ts'

/** The `StorageService` instance. Every method forwards to the function object of the provider. */
class SqliteStorageService extends StorageService {
  readonly registerCombination: SqlStorage['registerCombination']
  readonly commit: SqlStorage['commit']
  readonly query: SqlStorage['query']
  readonly read: SqlStorage['read']

  constructor(ctx: Context, storage: SqlStorage) {
    super(ctx)
    this.registerCombination = input => storage.registerCombination(input)
    this.commit = (input, options) => storage.commit(input, options)
    this.query = identity => storage.query(identity)
    this.read = (input, options) => storage.read(input, options)
  }
}

const configSchema: StandardSchema<SqliteStorageConfig> = {
  '~standard': {
    version: 1,
    vendor: 'omne-harness-sqlite-provider',
    validate(value: unknown) {
      const judged = validateConfig(value)
      if (judged.kind === 'valid') return { value: judged.config }
      return {
        issues: judged.problems.map(problem => ({ message: `${problem.field}: ${problem.rule}` })),
      }
    },
  },
}

export const SqliteStoragePlugin = definePlugin({
  name: 'sqlite-storage',
  Config: configSchema,
  inject: [storageHostKey],
  async apply(ctx, config) {
    const host = ctx.storageHost
    const created = await createSqliteStorage({
      config,
      materials: host.materials,
      closeLeases: host.closeLeases,
    })
    if (created.kind === 'rejected')
      throw new Error(`sqlite storage rejected (${created.reason}): ${created.problems.join('; ')}`)
    new SqliteStorageService(ctx, created.storage)
    host.attachControl(created.control)
    // Disposal does not undo what was committed. It stops admission and ends the Workers.
    ctx.effect(() => () => created.control.close({ initiator: 'disposal' }))
  },
})
