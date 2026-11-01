// Test support: a temporary workspace, real module files with SQL, a catalog that describes them,
// and request builders. The participants here run real SQL against the provider's connection.
import { createHash } from 'node:crypto'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  combinationManifest,
  manifestDigest,
  type CloseLeasePort,
  type CombinationRegistrationV2,
  type CommitRequestV2,
  type FactCommandV2,
  type SqlIdentity,
  type SqlMaterialCatalog,
  type SqlStorage,
  type StorageControl,
  type StorageScope,
} from '@omne-harness/sql-contract'
import { createSqliteStorage, type SqliteStorageConfig } from '../src/index.ts'

export const TENANT_A: StorageScope = { kind: 'tenant', tenant: 'tenant-a' }
export const TENANT_B: StorageScope = { kind: 'tenant', tenant: 'tenant-b' }
export const DOMAIN = 'domain-a'

export function defaultConfig(storageRoot: string): SqliteStorageConfig {
  return {
    storageRoot,
    admissionQueueLimit: 64,
    globalAdmissionLimit: 256,
    lockWaitMs: 5000,
    maxCommandsPerCommit: 16,
    maxCommandBytes: 1048576,
    maxRequestBytes: 4194304,
    globalInFlightWriteBytes: 67108864,
    maxJsonDepth: 64,
    maxJsonMembers: 65536,
    maxResponseBytes: 65536,
    maxOperationResponseBytes: 1048576,
    globalWriteResponseBytes: 33554432,
    maxDiagnosticBytes: 4096,
    maxWorkers: 16,
    reservedWriterSlots: 4,
    maxReadWorkersPerDomain: 2,
    readQueuePerDomain: 32,
    readQueueGlobal: 256,
    readQueueTimeoutMs: 1000,
    maxReadInputBytes: 262144,
    maxReadResultBytes: 4194304,
    globalReadResultBytes: 33554432,
    readObservationMs: 2000,
    readerIdleMs: 30000,
    queryQueuePerDomain: 16,
    queryQueueGlobal: 64,
    controlQueuePerDomain: 8,
    controlQueueGlobal: 32,
    writesPerControlTurn: 4,
    groupMaxOperations: 8,
    groupCollectMs: 1,
    groupMaxInputBytes: 4194304,
    groupMaxResponseReservationBytes: 8388608,
    groupMaxExecutionSliceMs: 5,
    walAutocheckpointPages: 1000,
    journalSizeLimitBytes: 67108864,
    checkpointIntervalMs: 1000,
    checkpointWalBytes: 16777216,
    walReadPauseBytes: 67108864,
    walWriteStopBytes: 134217728,
    closeDeadlineMs: 10000,
  }
}

const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

/** Participant that writes `t_ledger`. The facts of the command pick the behavior. */
const LEDGER = (extra: string): string => `${extra}
export default {
  participant: 'ledger', protocol: '1',
  execute(facts, port) {
    const note = facts.note ?? 'n'
    switch (facts.mode) {
      case 'conflict': return { kind: 'conflict', basis: { why: 'ledger-conflict' } }
      case 'throw': throw new Error('ledger threw')
      case 'constraint': port.execute('insert into t_ledger(note) values (?)', [null]); break
      case 'catch-conflict':
        try { port.execute('insert into t_ledger(note) values (?)', [null]) } catch {}
        return { kind: 'conflict', basis: { why: 'caught' } }
      case 'catch-participate':
        try { port.execute('insert into t_ledger(note) values (?)', [null]) } catch {}
        return { kind: 'participated', response: {} }
      case 'write-foreign': port.execute('insert into t_other(x) values (1)', []); break
      case 'read-foreign': port.execute('select * from t_other', []); break
      case 'ddl': port.execute('create table t_new(x)', []); break
      case 'pragma': port.execute('pragma journal_mode=delete', []); break
      case 'savepoint': port.execute('savepoint inner1', []); break
      case 'txn': port.execute('commit', []); break
      case 'attach': port.execute("attach database ':memory:' as m", []); break
      case 'random': port.execute('select random()', []); break
      case 'receipts': port.execute('select * from _sql_receipt', []); break
      case 'schema': port.execute('select * from sqlite_master', []); break
      case 'die': process.exit(1); break
      case 'spin': { const end = Date.now() + Number(facts.ms); while (Date.now() < end) {} break }
      case 'big': return { kind: 'participated', response: 'x'.repeat(70000) }
      case 'invalid': return { kind: 'participated' }
      case 'no-provide': port.execute('insert into t_ledger(note) values (?)', [note]); return { kind: 'participated', response: {} }
      default: break
    }
    const result = port.execute('insert into t_ledger(note) values (?)', [note])
    port.provideFact({ key: 'ledger.id', protocol: '1' }, String(result.lastInsertRowid))
    return { kind: 'participated', response: { id: String(result.lastInsertRowid), changes: String(result.changes) } }
  },
}
`

const AUDITOR = `
export default {
  participant: 'auditor', protocol: '1',
  execute(facts, port) {
    const id = port.requireFact({ key: 'ledger.id', protocol: '1' })
    if (facts.mode === 'conflict') return { kind: 'conflict', basis: { why: 'auditor-conflict' } }
    const rows = port.execute('select count(*), max(id) from t_ledger', [])
    return { kind: 'participated', response: { saw: id, count: String(rows.rows[0][0]), max: String(rows.rows[0][1]) } }
  },
}
`

const AUDITOR_MIGRATION = `
export default {
  owner: 'auditor', id: '0001-base',
  up(port) { port.execute('create table t_other(x)', []) },
  verify(port) { port.execute('select count(*) from t_other', []); return { kind: 'verified' } },
}
`

const JOURNAL = `
export default {
  participant: 'journal', protocol: '1',
  execute() { return { kind: 'participated', response: { journal: true } } },
}
`

const JOURNAL_MIGRATION = (variant: 'ok' | 'throw'): string => `
export default {
  owner: 'journal', id: '0001-base',
  up(port) {
    port.execute('create table t_journal(id integer primary key)', [])
    ${variant === 'throw' ? "throw new Error('journal migration failed')" : ''}
  },
  verify(port) { port.execute('select count(*) from t_journal', []); return { kind: 'verified' } },
}
`

const LEDGER_MIGRATION = (variant: 'ok' | 'throw' | 'verify-fails'): string => `
export default {
  owner: 'ledger', id: '0001-base',
  up(port) {
    port.execute('create table t_ledger(id integer primary key autoincrement, note text not null)', [])
    ${variant === 'throw' ? "throw new Error('migration up failed')" : ''}
  },
  verify(port) {
    port.execute('select count(*) from t_ledger', [])
    return ${variant === 'verify-fails' ? "{ kind: 'failed', diagnostic: 'nope' }" : "{ kind: 'verified' }"}
  },
}
`

export type Workspace = Readonly<{
  root: string
  storageRoot: string
  materialsDir: string
  remove(): Promise<void>
}>

export async function makeWorkspace(): Promise<Workspace> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sqlite-provider-')))
  return {
    root,
    storageRoot: join(root, 'storage'),
    materialsDir: root,
    remove: () => rm(root, { recursive: true, force: true }),
  }
}

export type MaterialsOptions = Readonly<{
  migration?: 'ok' | 'throw' | 'verify-fails'
  suffix?: string
  /** Appended to the ledger participant source, so its code digest and manifest change. */
  ledgerExtra?: string
  /** Adds a journal participant with a migration, and declares the combination with it. */
  journal?: 'ok' | 'throw'
  /** The combination version that the build declares for tenants. Default v1, or v2 with journal. */
  declaredVersion?: string
}>

export type Built = Readonly<{
  catalog: SqlMaterialCatalog
  files: Readonly<Record<string, string>>
  digest(participants: readonly string[]): string
}>

export async function buildMaterials(
  workspace: Workspace,
  options: MaterialsOptions = {},
): Promise<Built> {
  const dir = workspace.materialsDir
  const suffix = options.suffix ?? ''
  const files: Record<string, string> = {}
  const put = async (name: string, source: string): Promise<{ url: string; digest: string }> => {
    const file = join(dir, `${name}${suffix}.mjs`)
    await writeFile(file, source, 'utf8')
    files[name] = file
    return { url: pathToFileURL(file).href, digest: sha(source) }
  }
  const ledger = await put('participant-ledger', LEDGER(options.ledgerExtra ?? ''))
  const auditor = await put('participant-auditor', AUDITOR)
  const migration = await put('migration-ledger', LEDGER_MIGRATION(options.migration ?? 'ok'))
  const auditorMigration = await put('migration-auditor', AUDITOR_MIGRATION)
  const journal =
    options.journal === undefined
      ? null
      : {
          participant: await put('participant-journal', JOURNAL),
          migration: await put('migration-journal', JOURNAL_MIGRATION(options.journal)),
        }
  const catalog: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants: [
      {
        participant: 'ledger',
        protocol: '1',
        moduleUrl: ledger.url,
        codeDigest: ledger.digest,
        ownedTables: ['t_ledger'],
        readTables: [],
        requiresFacts: [],
        providesFacts: [{ key: 'ledger.id', protocol: '1' }],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      {
        participant: 'auditor',
        protocol: '1',
        moduleUrl: auditor.url,
        codeDigest: auditor.digest,
        ownedTables: ['t_other'],
        readTables: ['t_ledger'],
        requiresFacts: [{ key: 'ledger.id', protocol: '1' }],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'groupable',
      },
      ...(journal === null
        ? []
        : [
            {
              participant: 'journal',
              protocol: '1',
              moduleUrl: journal.participant.url,
              codeDigest: journal.participant.digest,
              ownedTables: ['t_journal'],
              readTables: [],
              requiresFacts: [],
              providesFacts: [],
              allowedFunctions: [],
              grouping: 'groupable' as const,
            },
          ]),
    ],
    migrations: [
      {
        owner: 'ledger',
        id: '0001-base',
        moduleUrl: migration.url,
        checksum: migration.digest,
        requires: [],
      },
      {
        owner: 'auditor',
        id: '0001-base',
        moduleUrl: auditorMigration.url,
        checksum: auditorMigration.digest,
        requires: [],
      },
      ...(journal === null
        ? []
        : [
            {
              owner: 'journal',
              id: '0001-base',
              moduleUrl: journal.migration.url,
              checksum: journal.migration.digest,
              requires: [],
            },
          ]),
    ],
    readHandlers: [],
    declaredCombinations: {
      tenant:
        journal === null
          ? {
              combinationVersion: options.declaredVersion ?? 'v1',
              participants: ['auditor', 'ledger'],
            }
          : { combinationVersion: 'v2', participants: ['auditor', 'journal', 'ledger'] },
      system: null,
    },
  }
  return { catalog, files, digest: participants => digestOf(catalog, participants) }
}

export function digestOf(catalog: SqlMaterialCatalog, participants: readonly string[]): string {
  const result = combinationManifest({ catalog, participants })
  if (result.kind !== 'manifest') throw new Error(`combination is ${result.kind}`)
  return manifestDigest(result.manifest)
}

export const BOTH = ['auditor', 'ledger'] as const

export function registration(
  built: Built,
  overrides: Partial<CombinationRegistrationV2> = {},
): CombinationRegistrationV2 {
  return {
    scope: TENANT_A,
    transactionDomain: DOMAIN,
    combinationVersion: 'v1',
    manifestDigest: built.digest(BOTH),
    participants: [...BOTH],
    ...overrides,
  }
}

export function identity(overrides: Partial<SqlIdentity> = {}): SqlIdentity {
  return {
    scope: TENANT_A,
    transactionDomain: DOMAIN,
    operation: 'op',
    protocolVersion: '2',
    operationKey: 'key-1',
    ...overrides,
  }
}

export function command(participant: string, facts: FactCommandV2['facts'] = {}): FactCommandV2 {
  return { participant, facts }
}

export function commitRequest(
  built: Built,
  overrides: Partial<CommitRequestV2> = {},
): CommitRequestV2 {
  return {
    identity: identity(),
    combinationVersion: 'v1',
    manifestDigest: built.digest(BOTH),
    commands: [command('ledger', { note: 'first' }), command('auditor')],
    ...overrides,
  }
}

export const leases: CloseLeasePort & { admitted: string[]; released: number } = {
  admitted: [],
  released: 0,
  admit(name) {
    this.admitted.push(name)
    return {}
  },
  release() {
    this.released += 1
  },
}

export type Provider = Readonly<{ storage: SqlStorage; control: StorageControl }>

/** A lease port that records the order of admit and release, so a test can see when a lease ends. */
export type RecordingLeases = CloseLeasePort & { admitted: string[]; released: string[] }

export function recordingLeases(): RecordingLeases {
  const names = new Map<object, string>()
  const port: RecordingLeases = {
    admitted: [],
    released: [],
    admit(name) {
      const handle = {}
      names.set(handle, name)
      port.admitted.push(name)
      return handle
    },
    release(handle) {
      port.released.push(names.get(handle) ?? '?')
    },
  }
  return port
}

export async function createProvider(
  workspace: Workspace,
  built: Built,
  config: Partial<SqliteStorageConfig> = {},
  closeLeases: CloseLeasePort = leases,
): Promise<Provider> {
  const result = await createSqliteStorage({
    config: { ...defaultConfig(workspace.storageRoot), ...config },
    materials: built.catalog,
    closeLeases,
  })
  if (result.kind !== 'created') throw new Error(`rejected: ${result.problems.join('; ')}`)
  return result
}

export function kindOf(result: { kind: string; reason?: string }): string {
  return result.reason === undefined ? result.kind : `${result.kind}/${result.reason}`
}
