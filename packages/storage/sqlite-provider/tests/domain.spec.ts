// Domain state table and DO-1 (SQL contract SPEC 5.1 to 5.5): construction touches no database,
// registration creates and migrates in one transaction, a failed open never opens write admission.
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSqliteStorage } from '../src/index.ts'
import {
  DOMAIN,
  TENANT_A,
  TENANT_B,
  buildMaterials,
  commitRequest,
  createProvider,
  defaultConfig,
  identity,
  kindOf,
  leases,
  makeWorkspace,
  registration,
  type Provider,
  type Workspace,
} from './support.ts'

const hex = (text: string): string => Buffer.from(text, 'utf8').toString('hex')

let workspace: Workspace
const providers: Provider[] = []

beforeEach(async () => {
  workspace = await makeWorkspace()
})

afterEach(async () => {
  for (const provider of providers.splice(0))
    await provider.control.close({ initiator: 'disposal' }).catch(() => undefined)
  await workspace.remove()
})

async function provide(
  built: Awaited<ReturnType<typeof buildMaterials>>,
  config = {},
): Promise<Provider> {
  const provider = await createProvider(workspace, built, config)
  providers.push(provider)
  return provider
}

const domainFile = (name: string = DOMAIN): string =>
  join(workspace.storageRoot, 'domains', `${hex(name)}.sqlite`)

function rows(file: string, sql: string): unknown[] {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return db.prepare(sql).all()
  } finally {
    db.close()
  }
}

describe('construction (DO-1: only static material)', () => {
  it('opens no database, starts no Worker and creates nothing under the storage root', async () => {
    const built = await buildMaterials(workspace)
    const before = leases.admitted.length
    await provide(built)
    await expect(stat(workspace.storageRoot)).rejects.toThrow()
    expect(leases.admitted.length).toBe(before)
  })

  it('does not look at a damaged domain file at construction', async () => {
    const built = await buildMaterials(workspace)
    await mkdir(join(workspace.storageRoot, 'domains'), { recursive: true })
    await writeFile(domainFile(), 'this is not a database')
    const provider = await provide(built)
    expect(provider.storage).toBeDefined()
  })

  it('rejects when a module file does not match its digest', async () => {
    const built = await buildMaterials(workspace)
    await writeFile(built.files['participant-ledger'] as string, '// changed\n', 'utf8')
    const result = await createSqliteStorage({
      config: defaultConfig(workspace.storageRoot),
      materials: built.catalog,
      closeLeases: leases,
    })
    expect(result.kind).toBe('rejected')
    if (result.kind === 'rejected') expect(result.reason).toBe('material_invalid')
  })

  it('rejects when a declared combination is not a valid manifest', async () => {
    const built = await buildMaterials(workspace)
    const catalog = {
      ...built.catalog,
      declaredCombinations: {
        tenant: { combinationVersion: 'v1', participants: ['auditor'] },
        system: null,
      },
    }
    const result = await createSqliteStorage({
      config: defaultConfig(workspace.storageRoot),
      materials: catalog,
      closeLeases: leases,
    })
    expect(result.kind === 'rejected' && result.reason).toBe('declared_combination_invalid')
  })

  it('rejects an invalid configuration with config_invalid and the field name', async () => {
    const built = await buildMaterials(workspace)
    const result = await createSqliteStorage({
      config: { ...defaultConfig(workspace.storageRoot), lockWaitMs: 0 },
      materials: built.catalog,
      closeLeases: leases,
    })
    expect(result.kind).toBe('rejected')
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('config_invalid')
      expect(result.problems.join(' ')).toContain('lockWaitMs')
    }
  })
})

describe('absent domain', () => {
  it('commit, query and read do not create a file', async () => {
    const built = await buildMaterials(workspace)
    const { storage } = await provide(built)
    expect(kindOf(await storage.commit(commitRequest(built)))).toBe(
      'rejected_before_accept/combination_unregistered',
    )
    expect((await storage.query(identity())).kind).toBe('unknown')
    const read = await storage.read({
      domain: { scope: TENANT_A, transactionDomain: DOMAIN },
      handler: 'any',
      protocol: '1',
      requestKey: 'k',
      input: null,
    })
    expect(read.kind).toBe('unavailable')
    await expect(stat(workspace.storageRoot)).rejects.toThrow()
  })
})

describe('registration creates the domain (path B)', () => {
  it('writes the file named by the hex of the domain, with binding, registration and migration', async () => {
    const built = await buildMaterials(workspace)
    const { storage, control } = await provide(built)
    expect((await storage.registerCombination(registration(built))).kind).toBe('registered')
    await control.close({ initiator: 'disposal' })
    const file = domainFile()
    expect(rows(file, 'select transaction_domain, scope from _sql_domain')).toEqual([
      { transaction_domain: DOMAIN, scope: JSON.stringify({ kind: 'tenant', tenant: 'tenant-a' }) },
    ])
    expect(rows(file, 'select generation from _sql_generation')).toEqual([{ generation: 1 }])
    expect(rows(file, 'select owner, id from _sql_migration order by owner')).toEqual([
      { owner: 'auditor', id: '0001-base' },
      { owner: 'ledger', id: '0001-base' },
    ])
    expect(rows(file, 'select combination_version from _sql_registration')).toEqual([
      { combination_version: 'v1' },
    ])
    expect(rows(file, "select name from sqlite_schema where name = 't_ledger'")).toHaveLength(1)
    expect(rows(file, 'pragma journal_mode')).toEqual([{ journal_mode: 'wal' }])
  })

  for (const variant of ['throw', 'verify-fails'] as const) {
    it(`a migration that ${variant} saves no binding and no registration, and the domain stays absent`, async () => {
      const failing = await buildMaterials(workspace, { migration: variant })
      const first = await provide(failing)
      const result = await first.storage.registerCombination(registration(failing))
      expect(kindOf(result)).toBe('rejected_before_accept/domain_unavailable')
      expect(kindOf(await first.storage.commit(commitRequest(failing)))).toBe(
        'rejected_before_accept/combination_unregistered',
      )
      expect((await first.storage.query(identity())).kind).toBe('unknown')
      await first.control.close({ initiator: 'disposal' })
      const files = await readdir(join(workspace.storageRoot, 'domains')).catch(() => [])
      for (const name of files.filter(entry => entry.endsWith('.sqlite'))) {
        const file = join(workspace.storageRoot, 'domains', name)
        expect(
          rows(file, "select name from sqlite_schema where name like '\\_sql\\_%' escape '\\'"),
        ).toEqual([])
      }
      const good = await buildMaterials(workspace, { suffix: '-good' })
      const second = await provide(good)
      expect((await second.storage.registerCombination(registration(good))).kind).toBe('registered')
    })
  }

  it('does not let another scope register a domain that is bound', async () => {
    const built = await buildMaterials(workspace)
    const { storage } = await provide(built)
    await storage.registerCombination(registration(built))
    const taken = await storage.registerCombination(registration(built, { scope: TENANT_B }))
    expect(kindOf(taken)).toBe('rejected_before_accept/domain_occupied')
  })
})

describe('opening an existing domain (path A)', () => {
  it('a new provider opens the file on first touch, raises the write generation and recognizes receipts', async () => {
    const built = await buildMaterials(workspace)
    const first = await provide(built)
    await first.storage.registerCombination(registration(built))
    const committed = await first.storage.commit(commitRequest(built))
    expect(committed.kind).toBe('committed')
    await first.control.close({ initiator: 'disposal' })

    const second = await provide(built)
    const again = await second.storage.commit(commitRequest(built))
    expect(again).toEqual(committed)
    await second.control.close({ initiator: 'disposal' })
    expect(rows(domainFile(), 'select generation from _sql_generation')).toEqual([
      { generation: 2 },
    ])
  })

  it('takes a migration of the declared combination and saves the registration only after it succeeded', async () => {
    const plain = await buildMaterials(workspace)
    const first = await provide(plain)
    await first.storage.registerCombination(registration(plain))
    await first.control.close({ initiator: 'disposal' })

    const failing = await buildMaterials(workspace, { suffix: '-j', journal: 'throw' })
    const second = await provide(failing)
    const result = await second.storage.commit(commitRequest(failing, { combinationVersion: 'v1' }))
    expect(kindOf(result)).toBe('rejected_before_accept/domain_unavailable')
    await second.control.close({ initiator: 'disposal' })
    expect(rows(domainFile(), 'select combination_version from _sql_registration')).toEqual([
      { combination_version: 'v1' },
    ])
    expect(rows(domainFile(), "select name from sqlite_schema where name = 't_journal'")).toEqual(
      [],
    )

    const working = await buildMaterials(workspace, { suffix: '-k', journal: 'ok' })
    const third = await provide(working)
    const ok = await third.storage.commit(commitRequest(working, { combinationVersion: 'v1' }))
    expect(ok.kind).toBe('committed')
    await third.control.close({ initiator: 'disposal' })
    expect(
      rows(domainFile(), 'select combination_version from _sql_registration order by 1'),
    ).toEqual([{ combination_version: 'v1' }, { combination_version: 'v2' }])
    expect(rows(domainFile(), 'select owner from _sql_migration order by 1')).toEqual([
      { owner: 'auditor' },
      { owner: 'journal' },
      { owner: 'ledger' },
    ])
  })

  it('quarantines a domain whose migration marker no longer matches the catalog', async () => {
    const built = await buildMaterials(workspace)
    const first = await provide(built)
    await first.storage.registerCombination(registration(built))
    await first.control.close({ initiator: 'disposal' })
    const changed = await buildMaterials(workspace, { suffix: '-c', migration: 'verify-fails' })
    const second = await provide(changed)
    const result = await second.storage.commit(commitRequest(changed))
    expect(kindOf(result)).toBe('rejected_before_accept/domain_unavailable')
    expect((await second.storage.query(identity())).kind).toBe('unknown')
    expect(kindOf(await second.storage.registerCombination(registration(changed)))).toBe(
      'rejected_before_accept/domain_unavailable',
    )
  })

  it('quarantines a file whose binding row does not match its path', async () => {
    const built = await buildMaterials(workspace)
    const first = await provide(built)
    await first.storage.registerCombination(registration(built))
    await first.control.close({ initiator: 'disposal' })
    await copyFile(domainFile(), domainFile('domain-b'))
    const second = await provide(built)
    const result = await second.storage.commit(
      commitRequest(built, { identity: identity({ transactionDomain: 'domain-b' }) }),
    )
    expect(kindOf(result)).toBe('rejected_before_accept/domain_unavailable')
    expect((await second.storage.query(identity({ transactionDomain: 'domain-b' }))).kind).toBe(
      'unknown',
    )
  })

  it('an open failure is never reported as rolled_back or not_committed', async () => {
    const built = await buildMaterials(workspace)
    await mkdir(join(workspace.storageRoot, 'domains'), { recursive: true })
    await writeFile(domainFile(), 'this is not a database, but long enough to be read as a header')
    const { storage } = await provide(built)
    const commit = await storage.commit(commitRequest(built))
    expect(kindOf(commit)).toBe('rejected_before_accept/domain_unavailable')
    const query = await storage.query(identity())
    expect(query.kind).toBe('unknown')
    const register = await storage.registerCombination(registration(built))
    expect(['rejected_before_accept', 'unknown']).toContain(register.kind)
    for (const result of [commit, query]) {
      expect(['rolled_back', 'not_committed']).not.toContain(result.kind)
    }
  })

  it('another scope gets the same result as for an absent domain', async () => {
    const built = await buildMaterials(workspace)
    const first = await provide(built)
    await first.storage.registerCombination(registration(built))
    await first.control.close({ initiator: 'disposal' })
    const second = await provide(built)
    const other = await second.storage.commit(
      commitRequest(built, { identity: identity({ scope: TENANT_B }) }),
    )
    const absent = await second.storage.commit(
      commitRequest(built, {
        identity: identity({ scope: TENANT_B, transactionDomain: 'nowhere' }),
      }),
    )
    expect(other).toEqual({
      ...absent,
      identity: identity({ scope: TENANT_B }),
    })
    expect(kindOf(other)).toBe('rejected_before_accept/combination_unregistered')
  })
})
