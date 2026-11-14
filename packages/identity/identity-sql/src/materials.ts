import { STANDING_TABLES } from './worker/standing.ts'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  combinationManifest,
  manifestDigest,
  type CombinationRegistrationV2,
  type MigrationDescriptor,
  type ParticipantDescriptor,
  type ReadHandlerDescriptor,
  type SqlMaterialCatalog,
  type StorageScope,
} from '@omne-harness/sql-contract'
import {
  GOVERNANCE_LIST_LIMIT,
  GOVERNANCE_MIGRATION,
  GOVERNANCE_TABLES,
  HANDLERS,
  IDENTITY_PARTICIPANT,
  IDENTITY_TABLES,
  MIGRATION,
  PROTOCOL,
} from './worker/schema.ts'

export { IDENTITY_PARTICIPANT }

export const IDENTITY_DOMAIN = 'system.identity'

export const IDENTITY_SCOPE: StorageScope = Object.freeze({ kind: 'system' })

const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js'

function fileDigest(moduleUrl: string): string {
  return createHash('sha256')
    .update(readFileSync(fileURLToPath(moduleUrl)))
    .digest('hex')
}

function module(name: string): Readonly<{ moduleUrl: string; digest: string }> {
  const moduleUrl = new URL(`./worker/${name}${extension}`, import.meta.url).href
  return { moduleUrl, digest: fileDigest(moduleUrl) }
}

const RELATIVE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/gu

function moduleClosure(entry: string): readonly string[] {
  const base = new URL('.', entry).href
  const seen = new Set<string>()
  const pending = [entry]
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (seen.has(next)) continue
    seen.add(next)
    const source = readFileSync(fileURLToPath(next), 'utf8')
    for (const match of source.matchAll(RELATIVE_IMPORT))
      if (match[1] !== undefined) pending.push(new URL(match[1], next).href)
  }
  return [...seen].sort().map(url => `${url.slice(base.length)} ${fileDigest(url)}`)
}

const migrationRef = Object.freeze({ owner: MIGRATION.owner, id: MIGRATION.id })
const governanceRef = Object.freeze({
  owner: GOVERNANCE_MIGRATION.owner,
  id: GOVERNANCE_MIGRATION.id,
})

const standingRef = Object.freeze({ owner: 'identity', id: '003-standing' })
const OWNED_TABLES: readonly string[] = Object.freeze([
  ...IDENTITY_TABLES,
  ...GOVERNANCE_TABLES,
  ...STANDING_TABLES,
])

type Handler = Readonly<{
  handler: string
  file: string
  tables: readonly string[]
  migrations: readonly Readonly<{ owner: string; id: string }>[]
  maxRowsRead: number
  maxOutputBytes: number
}>

const SINGLE = { maxRowsRead: 10, maxOutputBytes: 1 << 16 }
const LIST = { maxRowsRead: GOVERNANCE_LIST_LIMIT + 16, maxOutputBytes: 1 << 20 }

const READ_HANDLERS: readonly Handler[] = [
  {
    handler: 'identity.coordination',
    file: 'read-coordination',
    tables: OWNED_TABLES,
    migrations: [migrationRef, governanceRef, standingRef],
    ...LIST,
  },
  {
    handler: HANDLERS.issueBasis,
    file: 'read-issue-basis',
    tables: ['id_account', 'id_credential', 'id_login'],
    migrations: [migrationRef],
    ...SINGLE,
  },
  {
    handler: HANDLERS.loginByProof,
    file: 'read-login-by-proof',
    tables: ['id_login', 'id_login_revocation'],
    migrations: [migrationRef, governanceRef],
    ...SINGLE,
  },
  {
    handler: HANDLERS.standing,
    file: 'read-standing',
    tables: ['id_membership'],
    migrations: [migrationRef],
    ...SINGLE,
  },
  {
    handler: HANDLERS.governance,
    file: 'read-governance',
    tables: OWNED_TABLES,
    migrations: [migrationRef, governanceRef],
    ...LIST,
  },
]

export type IdentitySqlMaterials = Readonly<{
  participants: readonly ParticipantDescriptor[]
  migrations: readonly MigrationDescriptor[]
  readHandlers: readonly ReadHandlerDescriptor[]
}>

let materials: IdentitySqlMaterials | undefined

export function identitySqlMaterials(): IdentitySqlMaterials {
  if (materials !== undefined) return materials
  const participant = module('participant')
  const migration = module('migration')
  const governanceMigration = module('migration-governance')
  const standingMigration = module('migration-standing')
  materials = {
    participants: [
      {
        participant: IDENTITY_PARTICIPANT,
        protocol: PROTOCOL,
        moduleUrl: participant.moduleUrl,
        codeDigest: participant.digest,
        ownedTables: OWNED_TABLES,
        readTables: [],
        requiresFacts: [],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'singleton',
      },
    ],
    migrations: [
      { ...migrationRef, moduleUrl: migration.moduleUrl, checksum: migration.digest, requires: [] },
      {
        ...governanceRef,
        moduleUrl: governanceMigration.moduleUrl,
        checksum: governanceMigration.digest,
        requires: [migrationRef],
      },
      {
        ...standingRef,
        moduleUrl: standingMigration.moduleUrl,
        checksum: standingMigration.digest,
        requires: [governanceRef],
      },
    ],
    readHandlers: READ_HANDLERS.map(item => {
      const file = module(item.file)
      return {
        handler: item.handler,
        protocol: PROTOCOL,
        moduleUrl: file.moduleUrl,
        codeDigest: file.digest,
        ordering: 'snapshot',
        readTables: item.tables,
        requiresMigrations: item.migrations,
        maxOutputBytes: item.maxOutputBytes,
        maxRowsRead: item.maxRowsRead,
      }
    }),
  }
  return materials
}

export type IdentitySqlCombination = Readonly<{
  participants: readonly string[]
  combinationVersion: string
  manifestDigest: string
}>

let combination: IdentitySqlCombination | undefined

export function identitySqlCombination(): IdentitySqlCombination {
  if (combination !== undefined) return combination
  const own = identitySqlMaterials()
  const catalog: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants: own.participants,
    migrations: own.migrations,
    readHandlers: own.readHandlers,
    declaredCombinations: { tenant: null, system: null },
  }
  const manifest = combinationManifest({ catalog, participants: [IDENTITY_PARTICIPANT] })
  if (manifest.kind !== 'manifest')
    throw new Error(`the identity materials do not form a combination: ${manifest.kind}`)
  const digest = manifestDigest(manifest.manifest)
  const participantUrl = own.participants[0]?.moduleUrl
  if (participantUrl === undefined) throw new Error('the identity materials have no participant')
  const version = createHash('sha256')
    .update([`manifest ${digest}`, ...moduleClosure(participantUrl)].join('\n'))
    .digest('hex')
  combination = {
    participants: [IDENTITY_PARTICIPANT],
    combinationVersion: `identity-sql/${version}`,
    manifestDigest: digest,
  }
  return combination
}

export function identitySqlRegistration(): CombinationRegistrationV2 {
  const current = identitySqlCombination()
  return {
    scope: IDENTITY_SCOPE,
    transactionDomain: IDENTITY_DOMAIN,
    combinationVersion: current.combinationVersion,
    manifestDigest: current.manifestDigest,
    participants: current.participants,
  }
}
