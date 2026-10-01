import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { mkdtemp, writeFile, rm, chmod, mkdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolve every product through its declared public package exports. The script-only
// links permit package-specifier imports outside the package workspace directories.
const root = process.cwd()
const localScope = join(dirname(fileURLToPath(import.meta.url)), 'node_modules/@omne-harness-lite')
await mkdir(localScope, { recursive: true })
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
  try { await symlink(join(root, path), join(localScope, name), 'dir') }
  catch (error) { if (error.code !== 'EEXIST') throw error }
}
async function publicImport(specifier) {
  return import(specifier)
}
const [identity, basis, storageCore, sqlStorage, clocks, og, directory, directoryPlugin, txReads, dirMigration, replica, replicaMigration] =
  await Promise.all([
    '@omne-harness-lite/identity-values',
    '@omne-harness-lite/kernel-basis/testing',
    '@omne-harness-lite/storage',
    '@omne-harness-lite/storage-sql',
    '@omne-harness-lite/clock',
    '@omne-harness-lite/organization-governance',
    '@omne-harness-lite/model-profile-directory',
    '@omne-harness-lite/model-profile-directory/plugin',
    '@omne-harness-lite/model-profile-directory/tx-reads',
    '@omne-harness-lite/model-profile-directory/migrations',
    '@omne-harness-lite/credential-custodian-local/model-replica',
    '@omne-harness-lite/credential-custodian-local/migrations',
  ].map(publicImport))

const { unwrap, parseTenantId, parseLoginStateId, generateHandoffKeyPair } = identity
const alice = unwrap(parseTenantId({ organization: 'joint-O', account: 'Alice' }))
const bob = unwrap(parseTenantId({ organization: 'joint-O', account: 'Bob' }))
const login = unwrap(parseLoginStateId('test-seeded-login-state'))
const refA = 'joint-source-A-unique'
const refB = 'joint-source-B-unique'
const bodyA = Uint8Array.of(0, 255, 129, 17, 42)
const bodyB = Uint8Array.of(254, 0, 99, 18, 76)
const factoryBody = Uint8Array.of(77, 88, 99)
const results = []
const diagnostics = []
let factoryCalls = 0
let outboundCalls = 0
const originalFetch = globalThis.fetch
globalThis.fetch = async () => { outboundCalls++; throw Error('unexpected outbound HTTP') }
function stage(name, value) { results.push({ name, status: 'pass', ...value }) }
function sameBody(actual, expected) {
  assert.ok('value' in actual, `expected credential value; got ${JSON.stringify(actual)}`)
  assert.deepEqual(actual.value, expected)
}
function deferred() {
  const p = Promise.withResolvers()
  return { promise: p.promise, release: () => p.resolve() }
}
const scratch = await mkdtemp(join(tmpdir(), 'omne-joint-credential-'))
const dbFile = join(scratch, 'joint.sqlite')
const keyFile = join(scratch, 'key')
await writeFile(keyFile, randomBytes(32), { mode: 0o600 })
const seedMigration = {
  name: 'joint_test_account_seed',
  migration: { async up(db) {
    await db.schema.createTable('joint_test_account').addColumn('account_id', 'text', c => c.primaryKey()).execute()
  } },
}
const migrations = storageCore.composeMigrations([
  seedMigration,
  ...og.organizationGovernanceMigrations({
    ownerAccountReference: { table: 'joint_test_account', column: 'account_id' },
    ownerAccountForeignKey: 'joint_test_owner_fk',
  }),
  ...clocks.clockMigrations,
  ...dirMigration.modelProfileDirectoryMigrations,
  ...replicaMigration.replicaMigrations,
])
const keys = generateHandoffKeyPair()
async function open(initial = false) {
  return sqlStorage.openStorage({
    dialect: 'sqlite', file: dbFile,
    ...(initial ? { migrations, upgrade: false } : {}),
  })
}
async function seedMemberships(storage) {
  await storage.write(async tx => {
    await tx.db.insertInto('organization').values({ organization_id: alice.organization,
      kind: 'team', parent: null, owner_account: null, created_at: 1 }).execute()
    for (const person of [alice, bob]) await tx.db.insertInto('membership').values({
      organization_id: person.organization, account_id: person.account,
      effective: 1, role: 'superAdministrator',
    }).execute()
  })
}
async function bootDirectory(storage) {
  const assembly = await basis.bootAssembly({
    services: [
      { name: 'storage', value: storage },
      // OG's actual membership/standing implementation runs. Account and login ports
      // below are inert test fixtures and establish no authenticated provenance.
      { name: 'accounts', value: { participate: () => ({ read() { throw Error('unused account fixture') } }) } },
      { name: 'logins', value: { participate: () => ({ verify() { throw Error('unused login fixture') } }) } },
    ],
    plugins: [
      { plugin: clocks.clockPlugin, config: {} },
      { plugin: og.organizationGovernancePlugin, config: {
        invitationTtlDefault: 1000, affiliationRequestTtlDefault: 1000,
        teamCreationKeyRetention: 1000, purgeSigningKeyPem: keys.privateKeyPem,
      } },
      { plugin: directoryPlugin.modelProfileDirectoryPlugin, config: {
        faceMode: 'singleProcessCatalog',
        officialManifest: { ordinal: 1, entries: [] },
        factoryCredentialRef: 'joint-factory-configured',
        diagnostics: { record: event => diagnostics.push(event) },
      } },
    ],
  })
  const catalog = assembly.ctx.get('modelCatalog')
  const read = assembly.ctx.get('modelCatalogRead')
  const clock = assembly.ctx.get('clock')
  assert.equal(typeof catalog.bindCredential, 'function')
  assert.equal(typeof read.credentialPresent, 'function')
  assert.equal(typeof clock.now, 'function')
  return { assembly, catalog, read, clock }
}
async function bootLookup(storage, custodian) {
  const a = await basis.bootAssembly({
    services: [{ name: 'storage', value: storage }],
    plugins: [{ plugin: directoryPlugin.localCredentialLookupPlugin, config: {
      mode: 'localCredentialOnly', readBoundReplicaIn: custodian.readBoundReplicaIn,
      factoryCredential: async () => { factoryCalls++; return { body: Uint8Array.from(factoryBody) } },
      diagnostics: { record: event => diagnostics.push(event) },
    } }],
  })
  const lookup = a.ctx.get('credentialLookup')
  assert.equal(typeof lookup.value, 'function')
  return { assembly: a, lookup }
}
async function makeReplica(storage, clock, reader = txReads.createCredentialBindingReader(storage)) {
  return replica.createModelReplicaCustodian({
    storage, clock, keyFile, readCredentialBindingIn: reader,
    diagnostics: { record: event => diagnostics.push(event), sinkFailure() { throw Error('diagnostic sink failure') } },
  })
}
async function row(storage, tenant) {
  return storage.read(async tx => tx.db.selectFrom('credential_custodian_replica')
    .select(['login_state', 'stored_at', 'source_ref', 'sealed_body'])
    .where('tenant_organization', '=', tenant.organization)
    .where('tenant_account', '=', tenant.account).executeTakeFirst())
}
async function bind(catalog, tenant, ref) {
  const result = await catalog.bindCredential(tenant, tenant, ref)
  assert.ok('boundAt' in result, JSON.stringify(result))
}
async function store(custodian, tenant, ref, body) {
  return custodian.storeBoundReplica({ loginState: login, tenant, sourceRef: ref, body: Uint8Array.from(body) })
}
let storage, d, ccl, l, connection2, secondDirectory, probe
try {
  storage = await open(true)
  await seedMemberships(storage)
  d = await bootDirectory(storage)
  ccl = await makeReplica(storage, d.clock)
  l = await bootLookup(storage, ccl)
  const reader = txReads.createCredentialBindingReader(storage)

  assert.deepEqual(await l.lookup.value(alice, 'official'), { scope: { layer: 'factory' }, value: factoryBody })
  assert.deepEqual(await l.lookup.value(alice, 'custom'), { failure: 'credentialUnavailable' })
  assert.equal(factoryCalls, 1)
  stage('unbound official factory; custom no factory', { factoryCalls })

  await bind(d.catalog, alice, refA)
  assert.deepEqual(await l.lookup.value(alice, 'official'), { failure: 'credentialUnavailable' })
  assert.equal(factoryCalls, 1)
  assert.deepEqual(await store(ccl, alice, refA, bodyA), { stored: true, tenant: alice })
  const first = await l.lookup.value(alice, 'official')
  assert.deepEqual(first.scope, { layer: 'tenant', tenant: alice })
  sameBody(first, bodyA)
  assert.equal(factoryCalls, 1)
  const firstRow = await row(storage, alice)
  assert.equal(firstRow.source_ref, refA)
  assert.equal(firstRow.login_state, login)
  assert.ok(firstRow.sealed_body instanceof Uint8Array)
  assert.equal(Buffer.from(firstRow.sealed_body).includes(Buffer.from(bodyA)), false)
  stage('actual directory bind A / CCL store A / Cordis lookup A', {
    source: firstRow.source_ref, sealedSha256: createHash('sha256').update(firstRow.sealed_body).digest('hex'),
    factoryCalls,
  })

  assert.deepEqual(await d.read.credentialPresent(alice, 'official'), {
    present: true, scope: { layer: 'tenant', tenant: alice }, boundAt: (await readerValue()).binding.boundAt,
  })
  async function readerValue() { return storage.atomic(u => reader(u, alice)) }
  assert.ok(!JSON.stringify(await d.catalog.listProfiles(alice)).includes(refA))
  assert.ok(!JSON.stringify(await d.catalog.listProfiles(alice)).includes(Buffer.from(bodyA).toString('hex')))
  assert.ok(!JSON.stringify(diagnostics).includes(refA))
  stage('read/list/diagnostic reference and body exclusion', { observedEvents: diagnostics.length })

  await l.assembly.dispose(); await ccl.close(); await d.assembly.dispose(); await storage.close()
  l = ccl = d = storage = undefined
  storage = await open()
  d = await bootDirectory(storage)
  ccl = await makeReplica(storage, d.clock)
  l = await bootLookup(storage, ccl)
  sameBody(await l.lookup.value(alice, 'official'), bodyA)
  stage('reopen same file and key returns A only with current binding', {})

  await bind(d.catalog, alice, refB)
  assert.deepEqual(await l.lookup.value(alice, 'official'), { failure: 'credentialUnavailable' })
  assert.equal(factoryCalls, 1)
  assert.deepEqual(await store(ccl, alice, refA, bodyA), { stored: false })
  assert.equal((await row(storage, alice)).source_ref, refA)
  assert.deepEqual(await store(ccl, alice, refB, bodyB), { stored: true, tenant: alice })
  sameBody(await l.lookup.value(alice, 'official'), bodyB)
  assert.equal((await row(storage, alice)).source_ref, refB)
  stage('A to B rotation and late A rejection', { sourceAfter: refB, factoryCalls })

  await bind(d.catalog, bob, refB)
  await storage.write(async tx => {
    const source = await tx.db.selectFrom('credential_custodian_replica').selectAll()
      .where('tenant_organization', '=', alice.organization)
      .where('tenant_account', '=', alice.account).executeTakeFirstOrThrow()
    await tx.db.insertInto('credential_custodian_replica').values({
      ...source, tenant_organization: bob.organization, tenant_account: bob.account,
    }).execute()
  })
  assert.deepEqual(await l.lookup.value(bob, 'official'), { failure: 'credentialUnavailable' })
  await storage.write(async tx => tx.db.updateTable('credential_custodian_replica')
    .set({ source_ref: null }).where('tenant_organization', '=', alice.organization)
    .where('tenant_account', '=', alice.account).execute())
  assert.deepEqual(await l.lookup.value(alice, 'official'), { failure: 'credentialUnavailable' })
  stage('cross-tenant ciphertext and legacy NULL-source rejection', {})
  assert.deepEqual(await store(ccl, alice, refB, bodyB), { stored: true, tenant: alice })

  const before = await storage.read(async tx => tx.db.selectFrom('model_manifest_state')
    .select('ordinal_json').where('id', '=', 1).executeTakeFirstOrThrow())
  await chmod(keyFile, 0o400)
  await assert.rejects(storage.atomic(async unit => {
    await unit.mutate(tx => tx.db.updateTable('model_manifest_state').set({ ordinal_json: '999' })
      .where('id', '=', 1).execute().then(() => undefined))
    try { await ccl.readBoundReplicaIn(unit, alice, refB) }
    catch (e) { assert.ok(e instanceof storageCore.StorageUnavailable) }
    return 'must not commit'
  }), storageCore.StorageUnavailable)
  assert.deepEqual(await storage.read(async tx => tx.db.selectFrom('model_manifest_state')
    .select('ordinal_json').where('id', '=', 1).executeTakeFirstOrThrow()), before)
  assert.deepEqual(await l.lookup.value(alice, 'official'), { failure: 'unavailable' })
  assert.equal(factoryCalls, 1)
  await chmod(keyFile, 0o600)
  stage('key fault poisons caught participating read; sentinel rolls back', {})

  connection2 = await open()
  secondDirectory = await bootDirectory(connection2)
  const secondStanding = await secondDirectory.assembly.ctx.get('memberships').standing(alice)
  assert.ok('standing' in secondStanding || 'role' in secondStanding, JSON.stringify(secondStanding))
  const secondPreflight = await secondDirectory.catalog.bindCredential(alice, alice, refB)
  console.error(JSON.stringify({ secondPreflight }))
  assert.ok('boundAt' in secondPreflight, JSON.stringify(secondPreflight))
  // Instrumentation waits after the *real* directory reader has acquired its row lock.
  const reached = deferred(), release = deferred()
  const lockedReader = async (unit, tenant) => {
    const value = await txReads.createCredentialBindingReader(storage)(unit, tenant)
    reached.release(); await release.promise
    return value
  }
  probe = await makeReplica(storage, d.clock, lockedReader)
  const writing = store(probe, alice, refB, bodyB)
  await reached.promise
  let rotated = false
  const rotating = secondDirectory.catalog.bindCredential(alice, alice, refA).then(result => {
    console.error(JSON.stringify({ concurrentBindResult: result, lastDiagnostics: diagnostics.slice(-6) }))
    assert.ok('boundAt' in result, JSON.stringify(result)); rotated = true
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(rotated, false)
  release.release()
  assert.deepEqual(await writing, { stored: true, tenant: alice })
  await rotating
  assert.deepEqual(await l.lookup.value(alice, 'official'), { failure: 'credentialUnavailable' })
  assert.deepEqual(await store(ccl, alice, refB, bodyB), { stored: false })
  assert.deepEqual(await store(ccl, alice, refA, bodyA), { stored: true, tenant: alice })
  sameBody(await l.lookup.value(alice, 'official'), bodyA)
  stage('two SQLite connections: store lock first, then directory bind; reverse order stale store refused', {})
  await probe.close(); probe = undefined

  const captured = deferred(), drainRelease = deferred()
  const drainReader = async (unit, tenant) => {
    const value = await txReads.createCredentialBindingReader(storage)(unit, tenant)
    captured.release(); await drainRelease.promise
    return value
  }
  probe = await makeReplica(storage, d.clock, drainReader)
  const admitted = store(probe, alice, refA, bodyA)
  await captured.promise
  let closed = false
  const closing = probe.close().then(() => { closed = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(closed, false)
  assert.deepEqual(await store(probe, alice, refA, bodyA), { failure: 'custodianWithdrawn' })
  drainRelease.release()
  assert.deepEqual(await admitted, { stored: true, tenant: alice })
  await closing
  assert.equal(closed, true)
  sameBody(await l.lookup.value(alice, 'official'), bodyA)
  stage('close waits admitted store; borrowed storage and persisted facts survive', {})
  probe = undefined

  // Isolated negative: a constant reader is *only* a deliberately broken instrument,
  // never the successful path. It must fail the B-source oracle.
  const badReader = async () => ({ binding: { credentialRef: refA, boundAt: (await readerValue()).binding.boundAt } })
  const broken = await makeReplica(storage, d.clock, badReader)
  try {
    await bind(d.catalog, alice, refB)
    const result = await store(broken, alice, refB, bodyB)
    assert.deepEqual(result, { stored: false })
    let oracleFailed = false
    try { assert.deepEqual(result, { stored: true, tenant: alice }) }
    catch (e) { oracleFailed = e instanceof assert.AssertionError }
    assert.equal(oracleFailed, true)
    stage('behavioral negative: constant binding reader fails B-store oracle', {})
  } finally { await broken.close() }

  assert.deepEqual(await d.catalog.unbindCredential(alice, alice), { tenant: alice, present: false })
  assert.deepEqual(await l.lookup.value(alice, 'custom'), { failure: 'credentialUnavailable' })
  assert.deepEqual(await l.lookup.value(alice, 'official'), { scope: { layer: 'factory' }, value: factoryBody })
  assert.equal(outboundCalls, 0)
  stage('unbind changes branch to factory only for official; zero fetch in this test', { factoryCalls, outboundCalls })

  console.log(JSON.stringify({ status: 'pass', worktreeHead: '553222412f56facad3cc0bb0c69a7e31e3d4fbbc', results }, null, 2))
} finally {
  globalThis.fetch = originalFetch
  await Promise.allSettled([probe?.close(), l?.assembly.dispose(), ccl?.close(), d?.assembly.dispose(), secondDirectory?.assembly.dispose()])
  await Promise.allSettled([connection2?.close(), storage?.close()])
  await rm(scratch, { recursive: true, force: true })
}
