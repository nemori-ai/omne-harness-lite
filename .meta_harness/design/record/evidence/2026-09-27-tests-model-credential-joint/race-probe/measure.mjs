import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

// Public package specifiers only. Links are local to this ignored diagnostic.
const root = process.cwd()
const taskDir = dirname(fileURLToPath(import.meta.url))
await writeFile(join(taskDir, 'trial.pid'), `${process.pid}\n`)
const scopeDir = join(taskDir, 'node_modules/@omne-harness-lite')
await mkdir(scopeDir, { recursive: true })
for (const [name, path] of Object.entries({
  'identity-values': 'packages/core/identity-values',
  'kernel-basis': 'packages/core/kernel-basis',
  storage: 'packages/core/storage',
  'storage-sql': 'packages/infra/storage-sql',
  clock: 'packages/infra/clock',
  'organization-governance': 'packages/tenancy/organization-governance',
  'model-profile-directory': 'packages/model/model-profile-directory',
  'credential-custodian-local': 'packages/infra/credential-custodian-local',
})) {
  try {
    await symlink(join(root, path), join(scopeDir, name), 'dir')
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
}

const [identity, basis, storageCore, sqlStorage, clocks, og, dirPlugin, txReads, dirMigration, replica, replicaMigration] =
  await Promise.all([
    '@omne-harness-lite/identity-values',
    '@omne-harness-lite/kernel-basis/testing',
    '@omne-harness-lite/storage',
    '@omne-harness-lite/storage-sql',
    '@omne-harness-lite/clock',
    '@omne-harness-lite/organization-governance',
    '@omne-harness-lite/model-profile-directory/plugin',
    '@omne-harness-lite/model-profile-directory/tx-reads',
    '@omne-harness-lite/model-profile-directory/migrations',
    '@omne-harness-lite/credential-custodian-local/model-replica',
    '@omne-harness-lite/credential-custodian-local/migrations',
  ].map(specifier => import(specifier)))

const { unwrap, parseTenantId, parseLoginStateId, generateHandoffKeyPair } = identity
// Account, membership, and login are explicit test fixtures; this is not actual authentication.
const tenant = unwrap(parseTenantId({ organization: 'probe-O', account: 'Alice' }))
const loginState = unwrap(parseLoginStateId('test-seeded-login-state'))
const refA = 'probe-source-A-unique'
const refB = 'probe-source-B-unique'
const bodyB = Uint8Array.of(0, 255, 129, 17)
const events = []
const outcomes = {}
const mark = (phase, outcome) => events.push({ phase, atMs: performance.now(), ...(outcome ? { outcome } : {}) })
const safeError = error => error instanceof storageCore.StorageUnavailable ? 'StorageUnavailable' : 'otherException'
const deferred = () => Promise.withResolvers()
const scratch = await mkdtemp(join(taskDir, 'trial-'))
const dbFile = join(scratch, 'joint.sqlite')
const keyFile = join(scratch, 'key')
await writeFile(keyFile, randomBytes(32), { mode: 0o600 })
const seedMigration = {
  name: 'probe_test_account_seed',
  migration: { async up(db) {
    await db.schema.createTable('probe_test_account').addColumn('account_id', 'text', c => c.primaryKey()).execute()
  } },
}
const migrations = storageCore.composeMigrations([
  seedMigration,
  ...og.organizationGovernanceMigrations({
    ownerAccountReference: { table: 'probe_test_account', column: 'account_id' },
    ownerAccountForeignKey: 'probe_test_owner_fk',
  }),
  ...clocks.clockMigrations,
  ...dirMigration.modelProfileDirectoryMigrations,
  ...replicaMigration.replicaMigrations,
])
const keys = generateHandoffKeyPair()
const diagnostics = { record() {}, sinkFailure() { throw Error('diagnostic sink failure') } }
async function bootDirectory(storage) {
  const assembly = await basis.bootAssembly({
    services: [
      { name: 'storage', value: storage },
      { name: 'accounts', value: { participate: () => ({ read() { throw Error('unused account fixture') } }) } },
      { name: 'logins', value: { participate: () => ({ verify() { throw Error('unused login fixture') } }) } },
    ],
    plugins: [
      { plugin: clocks.clockPlugin, config: {} },
      { plugin: og.organizationGovernancePlugin, config: {
        invitationTtlDefault: 1000, affiliationRequestTtlDefault: 1000,
        teamCreationKeyRetention: 1000, purgeSigningKeyPem: keys.privateKeyPem,
      } },
      { plugin: dirPlugin.modelProfileDirectoryPlugin, config: {
        faceMode: 'singleProcessCatalog', officialManifest: { ordinal: 1, entries: [] },
        factoryCredentialRef: 'probe-factory-configured', diagnostics,
      } },
    ],
  })
  return {
    assembly,
    catalog: assembly.ctx.get('modelCatalog'),
    memberships: assembly.ctx.get('memberships'),
    clock: assembly.ctx.get('clock'),
  }
}
async function makeReplica(storage, clock, reader) {
  return replica.createModelReplicaCustodian({
    storage, clock, keyFile, readCredentialBindingIn: reader, diagnostics,
  })
}
let storage, connection2, directory1, directory2, custodian, probe
let first, second, releaseTimer, watchdogTimer, releaseBarrier
const watchdog = deferred()
let exitCode = 1
try {
  storage = await sqlStorage.openStorage({ dialect: 'sqlite', file: dbFile, migrations, upgrade: false })
  await storage.write(async tx => {
    await tx.db.insertInto('organization').values({
      organization_id: tenant.organization, kind: 'team', parent: null,
      owner_account: null, created_at: 1,
    }).execute()
    await tx.db.insertInto('membership').values({
      organization_id: tenant.organization, account_id: tenant.account,
      effective: 1, role: 'superAdministrator',
    }).execute()
  })
  directory1 = await bootDirectory(storage)
  custodian = await makeReplica(storage, directory1.clock, txReads.createCredentialBindingReader(storage))
  const initialBind = await directory1.catalog.bindCredential(tenant, tenant, refB)
  assert.ok('boundAt' in initialBind)
  const initialStore = await custodian.storeBoundReplica({ loginState, tenant, sourceRef: refB, body: bodyB })
  assert.deepEqual(initialStore, { stored: true, tenant })
  connection2 = await sqlStorage.openStorage({ dialect: 'sqlite', file: dbFile })
  directory2 = await bootDirectory(connection2)
  const preflightStanding = await directory2.memberships.standing(tenant)
  outcomes.standingBeforeContention = 'standing' in preflightStanding || 'role' in preflightStanding ? 'success' : 'failure'
  assert.equal(outcomes.standingBeforeContention, 'success')
  mark('setupComplete')

  const reached = deferred()
  releaseBarrier = deferred()
  let barrierReleased = false
  const release = () => {
    if (barrierReleased) return
    barrierReleased = true
    mark('barrierReleased')
    releaseBarrier.resolve()
  }
  const realReader = txReads.createCredentialBindingReader(storage)
  const lockedReader = async (unit, owner) => {
    const value = await realReader(unit, owner)
    mark('readerBarrierReached')
    reached.resolve()
    await releaseBarrier.promise
    return value
  }
  probe = await makeReplica(storage, directory1.clock, lockedReader)
  watchdogTimer = setTimeout(() => {
    mark('outerWatchdogFired')
    release()
    watchdog.reject(Error('watchdog'))
  }, 10_000)
  mark('firstStoreLaunched')
  first = probe.storeBoundReplica({ loginState, tenant, sourceRef: refB, body: bodyB }).then(
    value => { mark('firstStoreResolved', value.stored === true ? 'stored' : 'notStored'); return { kind: 'result', value } },
    error => { mark('firstStoreResolved', safeError(error)); return { kind: 'exception' } },
  )
  await Promise.race([reached.promise, watchdog.promise])
  // Scheduled before the competing call; neither operation is awaited to release the lock.
  releaseTimer = setTimeout(release, 50)
  mark('secondBindLaunched')
  second = directory2.catalog.bindCredential(tenant, tenant, refA).then(
    value => { mark('secondBindResolved', 'boundAt' in value ? 'success' : value.failure); return { kind: 'result', value } },
    error => { mark('secondBindResolved', safeError(error)); return { kind: 'exception' } },
  )
  const [firstOutcome, secondOutcome] = await Promise.race([
    Promise.all([first, second]), watchdog.promise,
  ])
  outcomes.firstStore = firstOutcome.kind === 'result' && firstOutcome.value.stored === true ? 'stored' : 'failed'
  outcomes.secondBind = secondOutcome.kind === 'result'
    ? ('boundAt' in secondOutcome.value ? 'success' : secondOutcome.value.failure)
    : 'exception'
  const reachedAt = events.find(event => event.phase === 'readerBarrierReached')?.atMs
  const releasedAt = events.find(event => event.phase === 'barrierReleased')?.atMs
  outcomes.releaseWithin100Ms = reachedAt !== undefined && releasedAt !== undefined && releasedAt - reachedAt <= 100
  exitCode = outcomes.firstStore === 'stored' && outcomes.secondBind === 'success' && outcomes.releaseWithin100Ms ? 0 : 1
} catch (error) {
  mark('trialException', error?.message === 'watchdog' ? 'watchdog' : safeError(error))
} finally {
  clearTimeout(releaseTimer)
  clearTimeout(watchdogTimer)
  releaseBarrier?.resolve()
  // Both operations are owned here; do not close their borrowed storage while in flight.
  await Promise.allSettled([first, second].filter(Boolean))
  const resources = [
    ['probe', () => probe?.close()],
    ['custodian', () => custodian?.close()],
    ['directory2', () => directory2?.assembly.dispose()],
    ['directory1', () => directory1?.assembly.dispose()],
    ['connection2', () => connection2?.close()],
    ['storage', () => storage?.close()],
  ]
  for (const [name, close] of resources) {
    try { await close(); mark('closed:' + name) }
    catch { mark('closeFailed:' + name); exitCode = 2 }
  }
  try { await rm(scratch, { recursive: true, force: true }); mark('scratchRemoved') }
  catch { mark('scratchRemovalFailed'); exitCode = 2 }
  console.log(JSON.stringify({ status: exitCode === 0 ? 'pass' : 'fail', pid: process.pid, events, outcomes }, null, 2))
  process.exitCode = exitCode
}
