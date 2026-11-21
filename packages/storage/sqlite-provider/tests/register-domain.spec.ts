import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import { openDomain, registerInDomain, type WorkerState } from '../src/worker/domain.ts'
import { ModuleCache } from '../src/worker/modules.ts'
import type { RegistrationSpec, WorkerEnv } from '../src/worker/protocol.ts'
import { domainFile } from './group-support.ts'
import {
  BOTH,
  DOMAIN,
  TENANT_A,
  buildMaterials,
  defaultConfig,
  makeWorkspace,
  type Built,
  type Workspace,
} from './support.ts'

const WITH_JOURNAL = ['auditor', 'journal', 'ledger'] as const

let workspace: Workspace
let built: Built
let env: WorkerEnv
let state: WorkerState

function envOf(catalog: SqlMaterialCatalog): WorkerEnv {
  const config = defaultConfig(workspace.storageRoot)
  return {
    file: domainFile(workspace),
    domain: DOMAIN,
    catalog,
    lockWaitMs: config.lockWaitMs,
    walAutocheckpointPages: config.walAutocheckpointPages,
    journalSizeLimitBytes: config.journalSizeLimitBytes,
    maxResponseBytes: config.maxResponseBytes,
    maxOperationResponseBytes: config.maxOperationResponseBytes,
    maxDiagnosticBytes: config.maxDiagnosticBytes,
    groupMaxOperations: config.groupMaxOperations,
    groupCollectMs: 0,
    groupMaxInputBytes: config.groupMaxInputBytes,
    groupMaxResponseReservationBytes: config.groupMaxResponseReservationBytes,
    groupMaxExecutionSliceMs: 1000,
    generation: 1,
    checkpointIntervalMs: config.checkpointIntervalMs,
    checkpointWalBytes: config.checkpointWalBytes,
    walReadPauseBytes: config.walReadPauseBytes,
    walWriteStopBytes: config.walWriteStopBytes,
    closingFlag: new SharedArrayBuffer(4),
  }
}

const spec = (version: string, participants: readonly string[]): RegistrationSpec => ({
  scope: TENANT_A,
  combinationVersion: version,
  manifestDigest: built.digest(participants),
  participants: [...participants].sort(),
})

function stored(): Readonly<{ migrations: unknown[]; registrations: unknown[] }> {
  const db = state.db
  if (db === null) throw new Error('the domain is not open')
  return {
    migrations: db.prepare('select owner, id from _sql_migration order by owner, id').all(),
    registrations: db.prepare('select combination_version from _sql_registration order by 1').all(),
  }
}

beforeEach(async () => {
  workspace = await makeWorkspace()
  built = await buildMaterials(workspace, { journal: 'ok' })
  env = envOf(built.catalog)
  await mkdir(dirname(domainFile(workspace)), { recursive: true })
  state = { db: null, modules: new ModuleCache(), writeGeneration: null }
  expect((await openDomain(env, state, spec('v1', BOTH))).kind).toBe('ready')
})

afterEach(async () => {
  state.db?.close()
  await workspace.remove()
})

describe('a registration decides its migration in the Worker step that handles it (SPEC 登记)', () => {
  it('answers migration_pending and writes nothing while the readers are not paused', async () => {
    const before = stored()
    expect(await registerInDomain(env, state, spec('v2', WITH_JOURNAL), false)).toEqual({
      reply: { kind: 'migration_pending' },
      migrated: false,
    })
    expect(stored()).toEqual(before)
  })

  it('runs the migration and saves the registration only when the readers are paused', async () => {
    expect(await registerInDomain(env, state, spec('v2', WITH_JOURNAL), true)).toEqual({
      reply: { kind: 'registered' },
      migrated: true,
    })
    expect(stored()).toEqual({
      migrations: [
        { owner: 'auditor', id: '0001-base' },
        { owner: 'journal', id: '0001-base' },
        { owner: 'ledger', id: '0001-base' },
      ],
      registrations: [{ combination_version: 'v1' }, { combination_version: 'v2' }],
    })
  })

  it('saves a new version whose migrations are all applied without paused readers', async () => {
    expect(await registerInDomain(env, state, spec('v2', ['ledger']), false)).toEqual({
      reply: { kind: 'registered' },
      migrated: false,
    })
    expect(stored().registrations).toEqual([
      { combination_version: 'v1' },
      { combination_version: 'v2' },
    ])
  })
})
