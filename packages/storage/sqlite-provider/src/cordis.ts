import { definePlugin, type StandardSchema } from '@omne-harness/kernel-basis/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { StorageService, storageHostKey } from '@omne-harness/sql-contract/cordis'
import { validateConfig, type SqliteStorageConfig } from './config.ts'
import { createSqliteStorage } from './provider.ts'

class SqliteStorageService extends StorageService {
  readonly database: SqlStorage['database']
  readonly registerCombination: SqlStorage['registerCombination']
  readonly commit: SqlStorage['commit']
  readonly query: SqlStorage['query']
  readonly read: SqlStorage['read']

  constructor(ctx: Context, storage: SqlStorage) {
    super(ctx)
    this.database = storage.database
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
    ctx.effect(() => () => created.control.close({ initiator: 'disposal' }))
  },
})
