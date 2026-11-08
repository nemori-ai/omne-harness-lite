import type { Context } from '@deepseek-ai/cordis'
import type { JsonValue, SqlStorage } from '@omne-harness/sql-contract'
import { StorageService, storageHostKey, storageKey } from '@omne-harness/sql-contract/cordis'
import { createSqliteStorage, type SqliteStorageConfig } from '@omne-harness/sqlite-provider'
import { defineRow } from '../../../src/row.ts'

export type EraseTarget = Readonly<{ tenant: string; call: string; material: string }>
export type EraseAttempt = Readonly<{ operation: string; digest: string; receipt: JsonValue }>

export function maintenanceStorage(config: SqliteStorageConfig, loseAnswer: boolean) {
  const target = Promise.withResolvers<EraseTarget>()
  const lost = Promise.withResolvers<EraseAttempt>()
  const attempts: EraseAttempt[] = []
  let dropped = false
  const wrap =
    (storage: SqlStorage): SqlStorage['commit'] =>
    async (input, options) => {
      const facts = input.commands[0]?.facts
      if (facts?.['intent'] !== 'material-erase') return storage.commit(input, options)
      const selected = await target.promise
      if (
        facts['tenant'] !== selected.tenant ||
        facts['call'] !== selected.call ||
        facts['material'] !== selected.material
      )
        return storage.commit(input, options)
      if (
        typeof facts['operation'] !== 'string' ||
        typeof facts['digest'] !== 'string' ||
        facts['receipt'] === undefined
      )
        throw new Error('invalid erase fixture input')
      const attempt = {
        operation: facts['operation'],
        digest: facts['digest'],
        receipt: facts['receipt'],
      }
      attempts.push(attempt)
      const unknown = {
        kind: 'unknown' as const,
        identity: input.identity,
        diagnostic: 'fixture lost erase answer',
      }
      if (loseAnswer && dropped) return unknown
      const result = await storage.commit(input, options)
      if (loseAnswer && result.kind === 'committed') {
        dropped = true
        lost.resolve(attempt)
        return unknown
      }
      return result
    }
  class WrappedStorage extends StorageService {
    readonly registerCombination: SqlStorage['registerCombination']
    readonly commit: SqlStorage['commit']
    readonly query: SqlStorage['query']
    readonly read: SqlStorage['read']
    constructor(ctx: Context, storage: SqlStorage) {
      super(ctx)
      this.registerCombination = input => storage.registerCombination(input)
      this.commit = wrap(storage)
      this.query = identity => storage.query(identity)
      this.read = (input, options) => storage.read(input, options)
    }
  }
  const row = defineRow({
    row: 'storage',
    implementation: 'real',
    manifest: { provides: [storageKey], injects: [storageHostKey], sameProviderGroup: null },
    lifecycle: { kind: 'entry-object', phase: 'storage', via: storageHostKey },
    plugin: {
      name: 'maintenance-recovery-storage',
      inject: [storageHostKey],
      async apply(ctx: Context) {
        const host = ctx.storageHost
        const created = await createSqliteStorage({
          config,
          materials: host.materials,
          closeLeases: host.closeLeases,
        })
        if (created.kind === 'rejected') throw new Error('fixture storage rejected')
        new WrappedStorage(ctx, created.storage)
        host.attachControl(created.control)
        ctx.effect(() => () => created.control.close({ initiator: 'disposal' }))
      },
    },
  })
  return { row, arm: target.resolve, lost: lost.promise, attempts }
}
