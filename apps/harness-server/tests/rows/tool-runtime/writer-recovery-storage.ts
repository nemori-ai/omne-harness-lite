import type { Context } from '@deepseek-ai/cordis'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { StorageService, storageHostKey, storageKey } from '@omne-harness/sql-contract/cordis'
import { createSqliteStorage, type SqliteStorageConfig } from '@omne-harness/sqlite-provider'
import { defineRow } from '../../../src/row.ts'

export function writerRecoveryStorage() {
  const attempts: { operation: string; digest: string; material: string; data: string }[] = []
  const fault = { available: false }
  class Storage extends StorageService {
    readonly registerCombination: SqlStorage['registerCombination']
    readonly commit: SqlStorage['commit']
    readonly query: SqlStorage['query']
    readonly read: SqlStorage['read']
    constructor(ctx: Context, storage: SqlStorage) {
      super(ctx)
      this.registerCombination = input => storage.registerCombination(input)
      this.query = identity => storage.query(identity)
      this.read = (input, options) => storage.read(input, options)
      this.commit = async (input, options) => {
        const facts = input.commands[0]?.facts
        if (
          facts?.['intent'] === 'material-chunk' &&
          typeof facts['material'] === 'string' &&
          facts['material'].includes('body-fragment:')
        ) {
          const { operation, digest, material, data } = facts
          if (
            typeof operation !== 'string' ||
            typeof digest !== 'string' ||
            typeof material !== 'string' ||
            typeof data !== 'string'
          )
            throw new Error('invalid fragment fault input')
          attempts.push({ operation, digest, material, data })
          if (!fault.available)
            return {
              kind: 'unknown',
              identity: input.identity,
              diagnostic: 'fixture fragment storage offline',
            }
        }
        return storage.commit(input, options)
      }
    }
  }
  const row = defineRow({
    row: 'storage',
    implementation: 'real',
    manifest: { provides: [storageKey], injects: [storageHostKey], sameProviderGroup: null },
    lifecycle: { kind: 'entry-object', phase: 'storage', via: storageHostKey },
    plugin: {
      name: 'writer-recovery-storage',
      inject: [storageHostKey],
      async apply(ctx: Context, config: SqliteStorageConfig) {
        const host = ctx.storageHost
        const created = await createSqliteStorage({
          config,
          materials: host.materials,
          closeLeases: host.closeLeases,
        })
        if (created.kind === 'rejected') throw new Error('fixture storage rejected')
        new Storage(ctx, created.storage)
        host.attachControl(created.control)
        ctx.effect(() => () => created.control.close({ initiator: 'disposal' }))
      },
    },
  })
  return { row, fault, attempts }
}
