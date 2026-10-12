import {
  createOriginalIssueOwner,
  originalIssueMigrations,
} from '@omne-harness-lite/model-request-runtime-local'
import type { OriginalIssueAdmission } from '@omne-harness-lite/model-request-runtime'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
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
  readonly fixtureOriginalIssue: OriginalIssueAdmission
  readonly fixtureStorage: AtomicStorage
  readonly fixtureAccess: LogAuthority
  readonly fixtureAuthority: LogAuthorityOperations
}
/** Real FULL SQLite journal. This fixture's private grant is not a login/current-membership test. */
export async function openSqlLogFixture(input: {
  readonly dir: string
  readonly storage?: AtomicStorage
}): Promise<SqlLogFixture> {
  await mkdir(input.dir, { recursive: true })
  const ownedStorage =
    input.storage === undefined
      ? await openStorage({
          dialect: 'sqlite',
          file: join(input.dir, 'journal.sqlite'),
          synchronous: 'full',
          upgrade: false,
          migrations: composeMigrations([...sessionLogMigrations, ...originalIssueMigrations]),
        })
      : undefined
  const storage = input.storage ?? ownedStorage!
  const access = Object.freeze({}) as LogAuthority
  const authority: LogAuthorityOperations = {
    storage,
    async authorize(unit, candidate) {
      unit.assertStorage(storage)
      return { kind: candidate === access ? 'authorized' : 'denied' }
    },
    async authorizeEnumeration(unit, candidate) {
      unit.assertStorage(storage)
      return { kind: candidate === access ? 'authorized' : 'denied' }
    },
  }
  const log = openSqlSessionLog({ storage, authority, operationLimit: 32 })
  const issue = createOriginalIssueOwner({
    storage,
    log: log.participant,
    access,
    limit: 32,
    authority: {
      async authorizeIn(unit, identity) {
        const result = await authority.authorize(unit, access, identity, 'write')
        return result
      },
    },
  })
  let closed = false
  return Object.freeze({
    ...log,
    fixtureOriginalIssue: issue,
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
      if ('failure' in read) return { failure: 'unavailable' }
      return { ...read, source: source.source }
    },
    async close() {
      if (closed) return
      if ((await issue.close()).kind !== 'released') throw new Error('original claim still owned')
      await log.close()
      if (ownedStorage !== undefined) await ownedStorage.close()
      closed = true
    },
  })
}
