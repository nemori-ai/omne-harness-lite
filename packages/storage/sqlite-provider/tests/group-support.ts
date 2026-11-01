// Fixtures of the group commit tests (SPEC 7.3, 7.7). The participants run real SQL. The `seq`
// participant has modes that fail, hang, end the whole transaction, exit the Worker, or look at
// the file through its own read-only connection. That last probe tells whether an earlier
// operation is already durable, so it shows which physical transaction an operation ran in.
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import type {
  CombinationRegistrationV2,
  CommitRequestV2,
  FactCommandV2,
  SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import { DOMAIN, TENANT_A, digestOf, identity, type Built, type Workspace } from './support.ts'

const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

/** Module-level `cached` is the defect that SQ-1 puts on the material owner (SPEC 7.7.6 item 4). */
const SEQ = `
import { DatabaseSync } from 'node:sqlite'
let cached = 0
export default {
  participant: 'seq', protocol: '1',
  execute(facts, port) {
    const tag = facts.tag ?? 't'
    switch (facts.mode) {
      case 'exit': process.exit(7)
      case 'hang': Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, facts.ms); break
      case 'probe': {
        const db = new DatabaseSync(facts.file, { readOnly: true })
        try {
          const rows = db.prepare('select count(*) n from t_seq').get().n
          const receipts = db.prepare('select count(*) n from _sql_receipt').get().n
          return { kind: 'participated', response: { rows, receipts } }
        } finally { db.close() }
      }
      case 'fail':
        port.execute('insert into t_seq(tag) values (?)', [tag])
        return { kind: 'conflict', basis: { why: 'fail' } }
      case 'cached':
      case 'cached-fail':
        cached += 1
        port.execute('insert into t_seq(n, tag) values (?, ?)', [BigInt(cached), tag])
        if (facts.mode === 'cached-fail') return { kind: 'conflict', basis: { why: 'cached-fail' } }
        return { kind: 'participated', response: { n: String(cached) } }
      case 'end-tx': port.execute('insert or rollback into t_seq(n, tag) values (1, ?)', [tag]); break
      case 'receipts': port.execute('select * from _sql_receipt', []); break
      default: break
    }
    const result = port.execute('insert into t_seq(tag) values (?)', [tag])
    const n = String(result.lastInsertRowid)
    port.provideFact({ key: 'seq.n', protocol: '1' }, n)
    return { kind: 'participated', response: { n } }
  },
}
`

const ECHO = `
import { DatabaseSync } from 'node:sqlite'
export default {
  participant: 'echo', protocol: '1',
  execute(facts, port) {
    const n = port.requireFact({ key: 'seq.n', protocol: '1' })
    if (facts.mode === 'probe') {
      const db = new DatabaseSync(facts.file, { readOnly: true })
      try {
        const rows = db.prepare('select count(*) n from t_seq').get().n
        return { kind: 'participated', response: { saw: n, rows } }
      } finally { db.close() }
    }
    port.execute('insert into t_echo(n) values (?)', [n])
    return { kind: 'participated', response: { saw: n } }
  },
}
`

const FK = `
export default {
  participant: 'fk', protocol: '1',
  execute(facts, port) {
    if (facts.mode === 'child') port.execute('insert into t_child(parent) values (?)', [BigInt(facts.parent)])
    else port.execute('insert into t_parent(id) values (?)', [BigInt(facts.id)])
    return { kind: 'participated', response: {} }
  },
}
`

const migration = (owner: string, statements: readonly string[], probe: string): string => `
export default {
  owner: '${owner}', id: '0001-base',
  up(port) { ${statements.map(sql => `port.execute(${JSON.stringify(sql)}, [])`).join('; ')} },
  verify(port) { port.execute('select count(*) from ${probe}', []); return { kind: 'verified' } },
}
`

export const GROUP_PARTICIPANTS = ['echo', 'fk', 'seq'] as const
export const GROUP_VERSION = 'g1'

export async function buildGroupMaterials(
  workspace: Workspace,
  seqGrouping: 'groupable' | 'singleton' = 'groupable',
): Promise<Built> {
  const files: Record<string, string> = {}
  const put = async (name: string, source: string): Promise<{ url: string; digest: string }> => {
    const file = join(workspace.materialsDir, `${name}.mjs`)
    await writeFile(file, source, 'utf8')
    files[name] = file
    return { url: pathToFileURL(file).href, digest: sha(source) }
  }
  const seq = await put('g-seq', SEQ)
  const echo = await put('g-echo', ECHO)
  const fk = await put('g-fk', FK)
  const seqMigration = await put(
    'g-seq-migration',
    migration(
      'seq',
      ['create table t_seq(n integer primary key autoincrement, tag text not null)'],
      't_seq',
    ),
  )
  const echoMigration = await put(
    'g-echo-migration',
    migration('echo', ['create table t_echo(n)'], 't_echo'),
  )
  const fkMigration = await put(
    'g-fk-migration',
    migration(
      'fk',
      [
        'create table t_parent(id integer primary key)',
        'create table t_child(id integer primary key autoincrement, parent integer references t_parent(id) deferrable initially deferred)',
      ],
      't_child',
    ),
  )
  const base = {
    protocol: '1',
    readTables: [],
    allowedFunctions: [],
    grouping: 'groupable' as const,
  }
  const catalog: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants: [
      {
        ...base,
        participant: 'seq',
        grouping: seqGrouping,
        moduleUrl: seq.url,
        codeDigest: seq.digest,
        ownedTables: ['t_seq'],
        requiresFacts: [],
        providesFacts: [{ key: 'seq.n', protocol: '1' }],
      },
      {
        ...base,
        participant: 'echo',
        moduleUrl: echo.url,
        codeDigest: echo.digest,
        ownedTables: ['t_echo'],
        requiresFacts: [{ key: 'seq.n', protocol: '1' }],
        providesFacts: [],
      },
      {
        ...base,
        participant: 'fk',
        moduleUrl: fk.url,
        codeDigest: fk.digest,
        ownedTables: ['t_parent', 't_child'],
        requiresFacts: [],
        providesFacts: [],
      },
    ],
    migrations: [
      {
        owner: 'seq',
        id: '0001-base',
        moduleUrl: seqMigration.url,
        checksum: seqMigration.digest,
        requires: [],
      },
      {
        owner: 'echo',
        id: '0001-base',
        moduleUrl: echoMigration.url,
        checksum: echoMigration.digest,
        requires: [],
      },
      {
        owner: 'fk',
        id: '0001-base',
        moduleUrl: fkMigration.url,
        checksum: fkMigration.digest,
        requires: [],
      },
    ],
    readHandlers: [],
    declaredCombinations: { tenant: null, system: null },
  }
  return { catalog, files, digest: participants => digestOf(catalog, participants) }
}

export function groupRegistration(built: Built): CombinationRegistrationV2 {
  return {
    scope: TENANT_A,
    transactionDomain: DOMAIN,
    combinationVersion: GROUP_VERSION,
    manifestDigest: built.digest(GROUP_PARTICIPANTS),
    participants: [...GROUP_PARTICIPANTS],
  }
}

export function seqCommand(facts: FactCommandV2['facts'] = {}): FactCommandV2 {
  return { participant: 'seq', facts }
}

/** One operation. The operation key is its identity inside the domain. */
export function op(built: Built, key: string, commands: readonly FactCommandV2[]): CommitRequestV2 {
  return {
    identity: identity({ operationKey: key }),
    combinationVersion: GROUP_VERSION,
    manifestDigest: built.digest(GROUP_PARTICIPANTS),
    commands: [...commands],
  }
}

export const domainFile = (workspace: Workspace): string =>
  join(workspace.storageRoot, 'domains', `${Buffer.from(DOMAIN).toString('hex')}.sqlite`)

export function readRows(workspace: Workspace, sql: string): unknown[] {
  const db = new DatabaseSync(domainFile(workspace), { readOnly: true })
  try {
    return db.prepare(sql).all()
  } finally {
    db.close()
  }
}

/** The first missing number of a sequence that must start at 1 and have no gap, or null. */
export function firstGap(numbers: readonly number[]): number | null {
  const sorted = [...numbers].sort((a, b) => a - b)
  for (const [index, value] of sorted.entries()) if (value !== index + 1) return index + 1
  return null
}

export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
