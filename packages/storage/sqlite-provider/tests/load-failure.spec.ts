// A module load that fails for an input or output reason is transient; only a module whose content
// is wrong quarantines the domain (SPEC 5.2, 「模块加载失败的定性」). Both places that load modules
// in the write Worker are covered: the participants of a group (SPEC 7.5) and the migrations of a
// reopen (SPEC 5.3 path A step 7). The module cache is replaced by one that fails on demand.
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  inputDigestV2,
  type CommitRequestV2,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import { openDomain, type WorkerState } from '../src/worker/domain.ts'
import { loadFailure } from '../src/worker/errors.ts'
import { GroupRunner, type CommitJob } from '../src/worker/group.ts'
import { MaterialMismatch, ModuleCache } from '../src/worker/modules.ts'
import type { CommitReply, WorkerEnv } from '../src/worker/protocol.ts'
import {
  buildGroupMaterials,
  domainFile,
  groupRegistration,
  op,
  seqCommand,
} from './group-support.ts'
import {
  DOMAIN,
  buildMaterials,
  createProvider,
  defaultConfig,
  registration,
  type Workspace,
  makeWorkspace,
} from './support.ts'

const systemError = (code: string): Error =>
  Object.assign(new Error(`${code}: injected`), { code, errno: -1, syscall: 'open' })

/** A module cache whose next loads fail with the given errors, one each, then load for real. */
class FailingModules extends ModuleCache {
  private readonly faults: unknown[]
  constructor(faults: readonly unknown[]) {
    super()
    this.faults = [...faults]
  }
  override load<T>(moduleUrl: string, digest: string): Promise<T> {
    if (this.faults.length === 0) return super.load<T>(moduleUrl, digest)
    return Promise.reject(this.faults.shift())
  }
}

let workspace: Workspace
const connections: DatabaseSync[] = []

beforeEach(async () => {
  workspace = await makeWorkspace()
})

afterEach(async () => {
  for (const db of connections.splice(0)) {
    try {
      if (db.isTransaction) db.exec('rollback')
      db.close()
    } catch {
      // Closed already.
    }
  }
  await workspace.remove()
})

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
    checkpointIntervalMs: 1000,
    checkpointWalBytes: 16777216,
    walReadPauseBytes: 67108864,
    walWriteStopBytes: 134217728,
    closingFlag: new SharedArrayBuffer(4),
  }
}

describe('loadFailure', () => {
  it.each([
    'EMFILE',
    'ENFILE',
    'EIO',
    'ENOMEM',
    'EAGAIN',
    'EBUSY',
    'ETIMEDOUT',
    'EACCES',
    'ENOENT',
  ])('judges a system error %s as transient', code =>
    expect(loadFailure(systemError(code))).toBe('transient'),
  )

  it.each([
    ['a digest mismatch', new MaterialMismatch('module file does not match its digest')],
    ['an evaluation error', new SyntaxError('Unexpected token')],
    [
      'a Node error code that is not a system code',
      Object.assign(new Error('x'), { code: 'ERR_MODULE_NOT_FOUND' }),
    ],
    ['a thrown value that is not an error', 'boom'],
    ['null', null],
  ])('judges %s as content', (_name, error) => expect(loadFailure(error)).toBe('content'))
})

describe('participant modules of a group (SPEC 7.5)', () => {
  let catalog: SqlMaterialCatalog
  let request: CommitRequestV2

  beforeEach(async () => {
    const built = await buildGroupMaterials(workspace)
    const provider = await createProvider(workspace, built)
    const registered = await provider.storage.registerCombination(groupRegistration(built))
    if (registered.kind !== 'registered') throw new Error(registered.kind)
    await provider.control.close({ initiator: 'disposal' })
    catalog = built.catalog
    request = op(built, 'key-1', [seqCommand({ tag: 'one' })])
  })

  function runner(modules: ModuleCache): GroupRunner {
    const db = new DatabaseSync(domainFile(workspace))
    connections.push(db)
    db.exec('PRAGMA foreign_keys = ON')
    const { generation } = db.prepare('select generation from _sql_generation').get() as {
      generation: number
    }
    return new GroupRunner(envOf(catalog), { db, modules, writeGeneration: generation })
  }

  async function commitOnce(group: GroupRunner): Promise<CommitReply | undefined> {
    const job: CommitJob = {
      id: 1,
      arrivedAt: 0,
      request: { kind: 'commit', request, inputDigest: inputDigestV2(request) },
    }
    let reply: CommitReply | undefined
    await group.run([job], (_id, posted) => {
      reply = posted
    })
    return reply
  }

  it('answers an EMFILE as domain_unavailable without a quarantine, and loads again next time', async () => {
    const group = runner(new FailingModules([systemError('EMFILE')]))
    expect(await commitOnce(group)).toEqual({ kind: 'rejected', reason: 'domain_unavailable' })
    expect(await commitOnce(group)).toMatchObject({ kind: 'receipt', recalled: false })
  })

  it('still quarantines when the module content is wrong', async () => {
    const group = runner(new FailingModules([new SyntaxError('Unexpected token')]))
    expect(await commitOnce(group)).toEqual({
      kind: 'quarantine',
      diagnostic: 'module_load_failed',
    })
  })

  it('still quarantines on a digest mismatch', async () => {
    const group = runner(new FailingModules([new MaterialMismatch('digest')]))
    expect(await commitOnce(group)).toEqual({
      kind: 'quarantine',
      diagnostic: 'material_digest_mismatch',
    })
  })
})

describe('migration modules of a reopen (SPEC 5.3 path A)', () => {
  let catalog: SqlMaterialCatalog

  beforeEach(async () => {
    // The domain is registered without the journal participant. The next build declares it, so
    // the reopen has a pending migration to load.
    const before = await buildMaterials(workspace)
    const provider = await createProvider(workspace, before)
    const registered = await provider.storage.registerCombination(registration(before))
    if (registered.kind !== 'registered') throw new Error(registered.kind)
    await provider.control.close({ initiator: 'disposal' })
    catalog = (await buildMaterials(workspace, { journal: 'ok' })).catalog
  })

  async function reopen(modules: ModuleCache): Promise<string> {
    const state: WorkerState = { db: null, modules, writeGeneration: null }
    const reply = await openDomain(envOf(catalog), state, null)
    if (state.db !== null) connections.push(state.db)
    return reply.kind
  }

  it('answers an EIO of a migration read as transient, and opens at the next try', async () => {
    expect(await reopen(new FailingModules([systemError('EIO')]))).toBe('transient')
    expect(await reopen(new ModuleCache())).toBe('ready')
  })

  it('still quarantines when the migration module content is wrong', async () => {
    expect(await reopen(new FailingModules([new SyntaxError('Unexpected token')]))).toBe(
      'quarantined',
    )
  })
})
