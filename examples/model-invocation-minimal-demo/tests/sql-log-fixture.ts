import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { composeMigrations, type AtomicStorage } from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import {
  openSqlSessionLog,
  sessionLogMigrations,
  type SqlSessionLog,
} from '@omne-harness-lite/session-log-sql'
import {
  compareInteger,
  type SessionLog,
  type SourceToken,
  type LogAuthority,
  type LogAuthorityOperations,
} from '@omne-harness-lite/session-log'
export interface SqlLogFixture extends SqlSessionLog {
  readonly fixturePrefix: (
    scope: Pick<SourceToken, 'session' | 'tenant'>,
    reader?: SessionLog,
  ) => Promise<
    | {
        readonly entries: readonly import('@omne-harness-lite/session-log').LogEntry[]
        readonly tail: import('@omne-harness-lite/session-log').JsonNumber
        readonly source: SourceToken
      }
    | { readonly failure: 'unavailable' }
  >
  readonly fixtureStorage: AtomicStorage
  readonly fixtureAccess: LogAuthority
  readonly fixtureAuthority: LogAuthorityOperations
}
/** Real FULL SQLite journal. This fixture's private grant is not a login/current-membership test. */
export async function openSqlLogFixture(input: {
  readonly dir?: string
  readonly file?: string
  readonly storage?: AtomicStorage
  readonly authorize?: LogAuthorityOperations['authorize']
}): Promise<SqlLogFixture> {
  if (input.file === undefined && input.dir === undefined)
    throw new Error('explicit test journal location required')
  const file = input.file ?? join(input.dir!, 'journal.sqlite')
  await mkdir(dirname(file), { recursive: true })
  const ownedStorage =
    input.storage === undefined
      ? await openStorage({
          dialect: 'sqlite',
          file,
          synchronous: 'full',
          upgrade: false,
          ...(input.file === undefined
            ? { migrations: composeMigrations(sessionLogMigrations) }
            : {}),
        })
      : undefined
  const storage = input.storage ?? ownedStorage!
  const access = Object.freeze({}) as LogAuthority
  const authority: LogAuthorityOperations = {
    storage,
    async authorize(unit, candidate, scope, operation) {
      unit.assertStorage(storage)
      if (candidate === access) return { kind: 'authorized' }
      return input.authorize === undefined
        ? { kind: 'denied' }
        : input.authorize(unit, candidate, scope, operation)
    },
    async authorizeEnumeration(unit, candidate) {
      unit.assertStorage(storage)
      return { kind: candidate === access ? 'authorized' : 'denied' }
    },
  }
  const log = openSqlSessionLog({ storage, authority, operationLimit: 32 })
  let closed = false
  return Object.freeze({
    ...log,
    fixtureStorage: storage,
    fixtureAccess: access,
    fixtureAuthority: authority,
    async fixturePrefix(
      scope: Pick<SourceToken, 'session' | 'tenant'>,
      reader: SessionLog = log,
    ): ReturnType<SqlLogFixture['fixturePrefix']> {
      const held = await log.owner.borrow(access, scope)
      if (held.kind !== 'borrowed') return { failure: 'unavailable' }
      await held.release()
      const source = await log.participant.source(access, scope)
      if ('failure' in source) return { failure: 'unavailable' }
      const read = await reader.readSince(scope.session, 0)
      if ('failure' in read || compareInteger(read.tail, source.source.tail) !== 0)
        return { failure: 'unavailable' }
      return { ...read, source: source.source }
    },
    async close() {
      if (closed) return
      await log.close()
      if (ownedStorage !== undefined) await ownedStorage.close()
      closed = true
    },
  })
}
