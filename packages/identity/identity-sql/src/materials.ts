// The static materials of the identity storage: one participant, one migration and three read
// handlers, with build-fixed `file:` URLs and file digests (sql-contract SPEC §4). The same file
// holds the names of the system domain and the combination, so the plugin, the provider and the
// application register and address one thing.
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
  HANDLERS,
  IDENTITY_PARTICIPANT,
  IDENTITY_TABLES,
  MIGRATION,
  PROTOCOL,
} from './worker/schema.ts'

export { IDENTITY_PARTICIPANT }

/** The transaction domain of every identity record. The `system.` prefix is reserved for system domains. */
export const IDENTITY_DOMAIN = 'system.identity'

/** Identity records live in the system scope: a tenant exists only after a registration. */
export const IDENTITY_SCOPE: StorageScope = Object.freeze({ kind: 'system' })

const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js'

function module(name: string): Readonly<{ moduleUrl: string; digest: string }> {
  const moduleUrl = new URL(`./worker/${name}${extension}`, import.meta.url).href
  const digest = createHash('sha256')
    .update(readFileSync(fileURLToPath(moduleUrl)))
    .digest('hex')
  return { moduleUrl, digest }
}

const migrationRef = Object.freeze({ owner: MIGRATION.owner, id: MIGRATION.id })

type Handler = Readonly<{ handler: string; file: string; tables: readonly string[] }>

const READ_HANDLERS: readonly Handler[] = [
  {
    handler: HANDLERS.issueBasis,
    file: 'read-issue-basis',
    tables: ['id_account', 'id_credential', 'id_login'],
  },
  { handler: HANDLERS.loginByProof, file: 'read-login-by-proof', tables: ['id_login'] },
  { handler: HANDLERS.standing, file: 'read-standing', tables: ['id_membership'] },
]

export type IdentitySqlMaterials = Readonly<{
  participants: readonly ParticipantDescriptor[]
  migrations: readonly MigrationDescriptor[]
  readHandlers: readonly ReadHandlerDescriptor[]
}>

let materials: IdentitySqlMaterials | undefined

/** Reads the module files once and returns the descriptors with their digests. */
export function identitySqlMaterials(): IdentitySqlMaterials {
  if (materials !== undefined) return materials
  const participant = module('participant')
  const migration = module('migration')
  materials = {
    participants: [
      {
        participant: IDENTITY_PARTICIPANT,
        protocol: PROTOCOL,
        moduleUrl: participant.moduleUrl,
        codeDigest: participant.digest,
        ownedTables: IDENTITY_TABLES,
        readTables: [],
        requiresFacts: [],
        providesFacts: [],
        allowedFunctions: [],
        grouping: 'singleton',
      },
    ],
    migrations: [
      { ...migrationRef, moduleUrl: migration.moduleUrl, checksum: migration.digest, requires: [] },
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
        requiresMigrations: [migrationRef],
        maxOutputBytes: 1 << 16,
        maxRowsRead: 10,
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

/**
 * The combination of the identity domain: the one participant, and a version that carries the
 * manifest digest, so a changed build registers a new version and leaves the old one (DP3-C4).
 */
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
  combination = {
    participants: [IDENTITY_PARTICIPANT],
    combinationVersion: `identity-sql/${digest}`,
    manifestDigest: digest,
  }
  return combination
}

/** The registration request that the plugin body sends once; `registerCombination` is idempotent. */
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
