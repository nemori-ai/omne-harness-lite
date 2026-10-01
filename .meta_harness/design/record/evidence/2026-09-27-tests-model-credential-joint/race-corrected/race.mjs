import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

// Public package specifiers only. Links are local to this ignored diagnostic.
const root = process.cwd()
const taskDir = dirname(fileURLToPath(import.meta.url))
await writeFile(join(taskDir, 'race.pid'), `${process.pid}\n`)
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
const bodyA = Uint8Array.of(254, 0, 99, 18)
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
async function bootDirectory(storage, sharedClock) {
  const assembly = await basis.bootAssembly({
    services: [
      { name: 'storage', value: storage },
      ...(sharedClock === undefined ? [] : [{ name: 'clock', value: sharedClock }]),
      { name: 'accounts', value: { participate: () => ({ read() { throw Error('unused account fixture') } }) } },
      { name: 'logins', value: { participate: () => ({ verify() { throw Error('unused login fixture') } }) } },
    ],
    plugins: [
      ...(sharedClock === undefined ? [{ plugin: clocks.clockPlugin, config: {} }] : []),
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
async function replicaRow(storage) {
  return storage.read(async tx => tx.db.selectFrom('credential_custodian_replica')
    .select(['login_state', 'stored_at', 'source_ref', 'sealed_body'])
    .where('tenant_organization', '=', tenant.organization)
    .where('tenant_account', '=', tenant.account).executeTakeFirst())
}
async function bindingRow(storage) {
  return storage.read(async tx => tx.db.selectFrom('model_credential_binding')
    .select(['credential_ref', 'bound_at'])
    .where('organization_id', '=', tenant.organization)
    .where('account_id', '=', tenant.account).executeTakeFirst())
}
const hasBody = (result, expected) => 'body' in result &&
  result.body instanceof Uint8Array &&
  result.body.length === expected.length &&
  result.body.every((value, index) => value === expected[index])
const hasBoundAt = result => result !== null && typeof result === 'object' && 'boundAt' in result
const isStored = result => result !== null && typeof result === 'object' && result.stored === true
let storage, connection2, directory1, directory2, custodian, probe, readProbe
let first, second, lateStore, reading, afterReadBindWork, startLateStore
let releaseTimer, readReleaseTimer, watchdogTimer, releaseBarrier, releaseReadBarrier
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
  outcomes.distinctStorageHandles = storage !== connection2
  assert.equal(outcomes.distinctStorageHandles, true, 'independent SQLite storage handles')
  // Both directory instances borrow the same live LeaseClock service, while
  // each keeps its own real SQLite storage/transaction owner.
  directory2 = await bootDirectory(connection2, directory1.clock)
  outcomes.sameLiveClock = directory2.clock === directory1.clock &&
    directory2.assembly.ctx.get('clock') === directory1.clock
  outcomes.clockAvailableBeforeRace = directory1.clock.now() !== 'unavailable' &&
    directory2.clock.now() !== 'unavailable'
  assert.equal(outcomes.sameLiveClock, true, 'second assembly must inject first real clock')
  assert.equal(outcomes.clockAvailableBeforeRace, true, 'shared LeaseClock must be live')
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
    value => { mark('firstStoreResolved', isStored(value) ? 'stored' : 'notStored'); return { kind: 'result', value } },
    error => { mark('firstStoreResolved', safeError(error)); return { kind: 'exception' } },
  )
  await Promise.race([reached.promise, watchdog.promise])
  // Scheduled before the competing call; neither operation is awaited to release the lock.
  releaseTimer = setTimeout(release, 50)
  mark('secondBindLaunched')
  second = directory2.catalog.bindCredential(tenant, tenant, refA).then(
    value => { mark('secondBindResolved', hasBoundAt(value) ? 'success' : value.failure); return { kind: 'result', value } },
    error => { mark('secondBindResolved', safeError(error)); return { kind: 'exception' } },
  )
  const [firstOutcome, secondOutcome] = await Promise.race([
    Promise.all([first, second]), watchdog.promise,
  ])
  outcomes.firstStore = firstOutcome.kind === 'result' && isStored(firstOutcome.value) ? 'stored' : 'failed'
  outcomes.secondBind = secondOutcome.kind === 'result'
    ? (hasBoundAt(secondOutcome.value) ? 'success' : secondOutcome.value.failure)
    : 'exception'
  const reachedAt = events.find(event => event.phase === 'readerBarrierReached')?.atMs
  const releasedAt = events.find(event => event.phase === 'barrierReleased')?.atMs
  const storeResolvedAt = events.find(event => event.phase === 'firstStoreResolved')?.atMs
  const bindResolvedAt = events.find(event => event.phase === 'secondBindResolved')?.atMs
  outcomes.releaseWithin100Ms = reachedAt !== undefined && releasedAt !== undefined && releasedAt - reachedAt <= 100
  outcomes.orderAStoreResolvedBeforeBind = storeResolvedAt !== undefined && bindResolvedAt !== undefined && storeResolvedAt <= bindResolvedAt
  assert.equal(outcomes.firstStore, 'stored', 'order A store must commit')
  assert.equal(outcomes.secondBind, 'success', 'order A bind must commit after release')
  assert.equal(outcomes.releaseWithin100Ms, true, 'order A barrier release must be prompt')
  assert.equal(outcomes.orderAStoreResolvedBeforeBind, true, 'order A store must resolve before bind')
  assert.equal((await bindingRow(storage))?.credential_ref === refA, true, 'order A binding row')
  assert.equal((await replicaRow(storage))?.source_ref === refB, true, 'order A old replica row')
  const afterOrderA = await storage.atomic(unit => custodian.readBoundReplicaIn(unit, tenant, refA))
  assert.equal('absent' in afterOrderA, true, 'order A must reject old replica under new ref')
  const staleB = await custodian.storeBoundReplica({ loginState, tenant, sourceRef: refB, body: bodyB })
  assert.equal(staleB.stored === false, true, 'late B must not overwrite A binding')
  const validA = await custodian.storeBoundReplica({ loginState, tenant, sourceRef: refA, body: bodyA })
  assert.equal(isStored(validA), true, 'valid A store after order A')
  assert.equal(hasBody(await storage.atomic(unit => custodian.readBoundReplicaIn(unit, tenant, refA)), bodyA), true, 'valid A body')
  outcomes.orderA = { bindingRow: 'A', replicaRowBeforeValidStore: 'B', newRead: 'absent', staleStore: 'false', validStore: 'true' }
  mark('orderAObserved', 'store-then-bind')
  await probe.close()
  probe = undefined

  // Order B: capture a trusted A source/body pair, arrange a delayed A store,
  // commit the B bind on the other real connection, then permit A to capture.
  startLateStore = deferred()
  const lateInput = { loginState, tenant, sourceRef: refA, body: Uint8Array.from(bodyA) }
  lateStore = startLateStore.promise.then(() => custodian.storeBoundReplica(lateInput)).then(
    value => { mark('lateAStoreResolved', value.stored === false ? 'drift' : 'unexpected'); return value },
    error => { mark('lateAStoreResolved', safeError(error)); throw error },
  )
  mark('orderBBindLaunched')
  const orderBBind = await Promise.race([
    directory2.catalog.bindCredential(tenant, tenant, refB), watchdog.promise,
  ])
  assert.equal(hasBoundAt(orderBBind), true, 'order B bind must commit first')
  mark('orderBBindResolved', 'success')
  startLateStore.resolve()
  const orderBLate = await Promise.race([lateStore, watchdog.promise])
  assert.equal(orderBLate.stored === false, true, 'order B stale A must be refused')
  assert.equal((await bindingRow(storage))?.credential_ref === refB, true, 'order B binding row')
  assert.equal((await replicaRow(storage))?.source_ref === refA, true, 'order B old replica unchanged')
  assert.equal('absent' in await storage.atomic(unit => custodian.readBoundReplicaIn(unit, tenant, refB)), true, 'B absent until valid store')
  const validB = await custodian.storeBoundReplica({ loginState, tenant, sourceRef: refB, body: bodyB })
  assert.equal(isStored(validB), true, 'valid B store')
  assert.equal((await replicaRow(storage))?.source_ref === refB, true, 'order B replica row')
  assert.equal(hasBody(await storage.atomic(unit => custodian.readBoundReplicaIn(unit, tenant, refB)), bodyB), true, 'valid B body')
  outcomes.orderB = { bindingRow: 'B', replicaRowBeforeValidStore: 'A', newRead: 'absent', staleStore: 'false', validStore: 'true' }
  mark('orderBObserved', 'bind-then-stale-store')

  // A matching read and competing bind share the same real directory row lock.
  const readReached = deferred()
  releaseReadBarrier = deferred()
  const realReadReader = txReads.createCredentialBindingReader(storage)
  const heldReadReader = async (unit, owner) => {
    const value = await realReadReader(unit, owner)
    mark('matchReadBarrierReached')
    readReached.resolve()
    await releaseReadBarrier.promise
    return value
  }
  readProbe = await makeReplica(storage, directory1.clock, heldReadReader)
  mark('matchReadLaunched')
  reading = storage.atomic(unit => readProbe.readBoundReplicaIn(unit, tenant, refB)).then(
    value => { mark('matchReadResolved', hasBody(value, bodyB) ? 'body' : 'other'); return value },
    error => { mark('matchReadResolved', safeError(error)); throw error },
  )
  await Promise.race([readReached.promise, watchdog.promise])
  const readGateStart = performance.now()
  let readGateReleasedAt
  readReleaseTimer = setTimeout(() => {
    readGateReleasedAt = performance.now()
    mark('matchReadBarrierReleased')
    releaseReadBarrier.resolve()
  }, 50)
  mark('afterReadBindLaunched')
  afterReadBindWork = directory2.catalog.bindCredential(tenant, tenant, refA).then(
    value => { mark('afterReadBindResolved', hasBoundAt(value) ? 'success' : value.failure); return value },
    error => { mark('afterReadBindResolved', safeError(error)); throw error },
  )
  const [readResult, bindAfterReadResult] = await Promise.race([
    Promise.all([reading, afterReadBindWork]), watchdog.promise,
  ])
  assert.equal(hasBody(readResult, bodyB), true, 'read selected B before bind A commit')
  assert.equal(hasBoundAt(bindAfterReadResult), true, 'bind A commits after held read')
  assert.equal((await bindingRow(storage))?.credential_ref === refA, true, 'post-read binding A')
  assert.equal((await replicaRow(storage))?.source_ref === refB, true, 'post-read replica remains B')
  assert.equal('absent' in await storage.atomic(unit => custodian.readBoundReplicaIn(unit, tenant, refA)), true, 'new A read rejects old B')
  outcomes.matchReadRows = { bindingRow: 'A', replicaRow: 'B', oldRead: 'body', newRead: 'absent' }
  outcomes.matchReadInterleave = 'body-before-bind-success'
  outcomes.afterReadGateReleasedWithin100Ms = readGateReleasedAt !== undefined && readGateReleasedAt - readGateStart <= 100
  assert.equal(outcomes.afterReadGateReleasedWithin100Ms, true, 'read barrier release must be prompt')
  mark('matchReadObserved', 'body-before-bind')
  exitCode = 0
} catch (error) {
  mark('trialException', error?.message === 'watchdog' ? 'watchdog' : safeError(error))
} finally {
  clearTimeout(releaseTimer)
  clearTimeout(readReleaseTimer)
  clearTimeout(watchdogTimer)
  releaseBarrier?.resolve()
  releaseReadBarrier?.resolve()
  startLateStore?.resolve()
  // Both operations are owned here; do not close their borrowed storage while in flight.
  await Promise.allSettled([first, second, lateStore, reading, afterReadBindWork].filter(Boolean))
  const resources = [
    ['readProbe', () => readProbe?.close()],
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
