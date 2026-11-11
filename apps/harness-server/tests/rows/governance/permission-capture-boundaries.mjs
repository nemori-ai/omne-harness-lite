import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'
const root = process.cwd()
const file = p => import(pathToFileURL(root + '/' + p))
const src = p => import(new URL('../../../src/' + p, import.meta.url))
const pkg = name =>
  file('apps/harness-server/node_modules/@omne-harness/' + name + '/dist/index.js')
const { canonicalText } = await pkg('authorization')
const { canonicalDigest } = await pkg('tool')
const { evaluatePermission } = await pkg('permissions')
const { loadProductionRelease, TOOL_RELEASE_TENANT } = await src('entry/tool-release.ts')
const { inProcessPrincipalAuthority } = await pkg('identity')
const { tenantCodec } = await pkg('legal-identity')
const { createPermissionReadMapping } = await src('rows/governance/permission-read-mapping.ts')
const { toolAssetPublication } = await src('rows/governance/tool-assets.ts')
const { targetCapture } = await src('rows/governance/target-snapshot.ts')
const { selectedDefinitionBinding, unmappedPermissionSnapshotCommands } = await src(
  'rows/governance/unmapped-permission-snapshot.ts',
)
const { default: unmappedParticipant } = await src(
  'rows/governance/unmapped-permission-snapshot-participant.ts',
)
const { default: selectedParticipant } = await file(
  'packages/governance/governance-local/src/selected-definition-participant.ts',
)
const { scopeKey, definitionKey } = await file(
  'packages/governance/governance-local/src/encoding.ts',
)
const { permissionCurrentMaterial } = await src('rows/governance/permission-current-material.ts')
const { settingsSnapshotFixture } = await import('./settings-snapshot-fixture.ts')
const checks = []
function checked(name, f) {
  f()
  checks.push(name)
}
const real = await loadProductionRelease()
assert.equal(real.kind, 'trusted')
const manifest = structuredClone(real.manifest)
manifest.entries = manifest.entries.filter(e => e.asset.name === 'Shell')
const entry = manifest.entries[0]
const declaration = entry.governance.declaration
declaration.settings = []
for (const p of declaration.permissions)
  Object.assign(p, {
    settings: null,
    assignmentLayers: ['session'],
    defaultRule: { pick: 'auto', allowedSet: null },
  })
for (const i of entry.governance.interpretations)
  i.definition = structuredClone(
    declaration.permissions.find(p => p.enforcementKey === i.definition.enforcementKey),
  )
const { digest: _digest, ...ref } = declaration.reference
declaration.reference.digest = canonicalDigest({ ...declaration, reference: ref }).slice(7)
const release = { ...real, manifest }
const authority = inProcessPrincipalAuthority()
const actor = authority.issuer.issueSystem({ component: 'sessionWorkPrincipals' }).ok
const principal = authority.issuer.issueActingForTenant({
  actor,
  tenant: TOOL_RELEASE_TENANT,
  work: { owner: 'session', work: 'session-1' },
}).ok
const tenant = tenantCodec.encode(TOOL_RELEASE_TENANT).value
const scope = {
  tenantRef: tenant,
  deploymentId: 'local',
  logicalServiceId: 'harness',
  visibility: { kind: 'tenant', tenantRef: tenant },
}
const action = {
  principal,
  tenant: TOOL_RELEASE_TENANT,
  operation: { owner: 'agent', operationId: 'action-1' },
  definition: entry.asset.adoption,
  effectiveArguments: '{}',
  origin: { kind: 'agent-action' },
}
let settingsReads = 0
const map = createPermissionReadMapping({
  scope,
  release: () => release,
  settings: async () => {
    settingsReads++
    throw Error('No Settings source exists')
  },
})
const mapped = await map(action)
checked('unmapped mapping reaches real asset address without Settings read', () => {
  assert.ok(mapped)
  assert.equal(mapped.source, null)
  assert.equal(settingsReads, 0)
})
const binding = {
  scope,
  epoch: 'epoch-1',
  principalRef: 'alice',
  captureId: 'capture-1',
  transactionDomain: 'test',
  definition: declaration.reference,
  target: mapped.target,
  mode: 'runtime',
}
const selectedBinding = selectedDefinitionBinding(binding)
const db = new DatabaseSync(':memory:')
db.exec(`CREATE TABLE gc_scope(scope_key TEXT,current_epoch TEXT,state TEXT,declaration_revision INTEGER,adoption_revision INTEGER,collection_digest TEXT,adoption_digest TEXT,tenant_ref TEXT,deployment_id TEXT,logical_service_id TEXT,visibility_kind TEXT,visibility_ref TEXT);
CREATE TABLE gc_definition(definition_key TEXT,body_json TEXT);
CREATE TABLE gc_contribution(scope_key TEXT,epoch TEXT,state TEXT,definition_key TEXT);
CREATE TABLE gc_selected_definition(scope_key TEXT,definition_key TEXT,epoch TEXT);`)
const sk = scopeKey(scope),
  dk = definitionKey(declaration.reference)
db.prepare('INSERT INTO gc_scope VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(
  sk,
  'epoch-1',
  'open',
  1,
  1,
  'a'.repeat(64),
  null,
  tenant,
  'local',
  'harness',
  'tenant',
  tenant,
)
db.prepare('INSERT INTO gc_definition VALUES(?,?)').run(dk, canonicalText(declaration))
db.prepare('INSERT INTO gc_contribution VALUES(?,?,?,?)').run(sk, 'epoch-1', 'active', dk)
let selected
const sqlPort = {
  execute(sql, args) {
    const s = db.prepare(sql)
    s.setReturnArrays(true)
    return { rows: s.all(...args) }
  },
  provideFact(_f, v) {
    selected = v
  },
}
function readSelected() {
  selectedParticipant.execute({ binding: selectedBinding }, sqlPort)
  return selected
}
checked('registration without selection is unavailable', () =>
  assert.equal(readSelected().observation.kind, 'unavailable'),
)
db.prepare('INSERT INTO gc_selected_definition VALUES(?,?,?)').run(sk, dk, 'epoch-1')
checked('selected active definition is available', () =>
  assert.equal(readSelected().observation.kind, 'available'),
)
const available = structuredClone(selected)
db.prepare("UPDATE gc_contribution SET state='released'").run()
checked('withdrawn contribution cannot retain selected fact', () =>
  assert.equal(readSelected().observation.kind, 'unavailable'),
)
db.prepare("UPDATE gc_contribution SET state='active'").run()
db.prepare("UPDATE gc_selected_definition SET epoch='old'").run()
checked('old selected epoch is unavailable', () =>
  assert.equal(readSelected().observation.kind, 'unavailable'),
)
db.prepare("UPDATE gc_selected_definition SET epoch='epoch-1'").run()
db.prepare("UPDATE gc_scope SET state='closed'").run()
checked('closed scope is unavailable', () =>
  assert.equal(readSelected().observation.kind, 'unavailable'),
)
db.close()
const publicationRef = toolAssetPublication(entry).publicationRef
const baseFacts = {
  'assets.current-publication': {
    binding: targetCapture(binding),
    views: [{ target: binding.target, definitionRef: null, ownerRevision: 1, publicationRef }],
  },
  'governance.selected-definition': available,
  'harness.governance-publications': [
    { publication: { kind: 'asset', reference: publicationRef }, declaration },
  ],
  'harness.permission-support': entry.governance.interpretations,
}
function snapshot(mutate = () => {}) {
  const facts = Object.fromEntries(
    Object.entries(baseFacts).map(([k, v]) => [k, structuredClone(v)]),
  )
  mutate(facts)
  let output
  const result = unmappedParticipant.execute(
    { binding },
    {
      requireFact(f) {
        assert.ok(f.key in facts, `Missing ${f.key}`)
        return facts[f.key]
      },
      provideFact(_f, value) {
        output = value
      },
    },
  )
  return { result, output }
}
const valid = snapshot()
checked('matching owner facts produce unmapped snapshot', () =>
  assert.equal(valid.result.kind, 'participated'),
)
for (const [name, change] of [
  ['other capture', f => (f['assets.current-publication'].binding.captureId = 'other')],
  [
    'other selected capture',
    f => (f['governance.selected-definition'].binding.captureId = 'other'),
  ],
  ['other target', f => (f['assets.current-publication'].views[0].target.targetRef = 'other')],
  [
    'other release version',
    f => (f['assets.current-publication'].views[0].publicationRef.version = 'other'),
  ],
  [
    'other release body',
    f => (f['assets.current-publication'].views[0].publicationRef.bodyDigest = 'b'.repeat(64)),
  ],
  [
    'unselected definition',
    f =>
      (f['governance.selected-definition'].observation = {
        kind: 'unavailable',
        reason: 'definition',
      }),
  ],
  ['missing support', f => (f['harness.permission-support'] = [])],
])
  checked(`unmapped snapshot rejects ${name}`, () =>
    assert.equal(snapshot(change).result.kind, 'unsupported', name),
  )
checked('registration-only fact cannot replace selected-definition fact', () => {
  assert.throws(
    () =>
      snapshot(f => {
        f['governance.definition-projection'] = f['governance.selected-definition']
        delete f['governance.selected-definition']
      }),
    /Missing governance.selected-definition/,
  )
  assert.ok(
    unmappedPermissionSnapshotCommands(binding).some(
      c => c.participant === 'governance.selected-definition-projection',
    ),
  )
})
const material = permissionCurrentMaterial(valid.output, mapped.permission, ['agent-definition'])
checked('unmapped material retains Session and Agent missing-basis requirements', () => {
  assert.equal(material.sources.tenant.kind, 'absent')
  assert.equal(material.sources.session.kind, 'unavailable')
  assert.deepEqual(material.requiredConstraintIds, ['agent-definition'])
  assert.deepEqual(evaluatePermission(material).missingBasis, [
    'organization',
    'session',
    'constraint/agent-definition',
  ])
})
checked('unmapped material rejects a declaration with Settings mapping', () => {
  const wrong = structuredClone(valid.output)
  wrong.declaration.permissions[0].settings = real.manifest.entries.find(
    e => e.asset.name === 'Shell',
  ).governance.declaration.permissions[0].settings
  assert.equal(permissionCurrentMaterial(wrong, mapped.permission, []), undefined)
})
checked('mapped material rejects a declaration without Settings mapping', () => {
  const { snapshot: old } = settingsSnapshotFixture()
  old.binding.mode = 'runtime'
  const p = old.declaration.permissions[0]
  p.settings = null
  const enforcement = old.enforcementBindings.find(
    b => b.capabilityId === p.capabilityId && b.enforcementKey === p.enforcementKey,
  )
  const req = {
    ...mapped.permission,
    scope: {
      ...mapped.permission.scope,
      tenantId: old.binding.scope.tenantRef,
      targetId: canonicalText(old.binding.target),
      deploymentId: old.binding.scope.deploymentId,
      logicalServiceId: old.binding.scope.logicalServiceId,
    },
    definition: p.reference,
    implementationRef: enforcement.implementationRef,
    capabilityId: enforcement.capabilityId,
    enforcementKey: enforcement.enforcementKey,
  }
  assert.equal(permissionCurrentMaterial(old, req, []), undefined)
})

for (const [name, change] of [
  ['tenant', p => (p.scope.tenantId = 'foreign')],
  ['target', p => (p.scope.targetId = 'foreign')],
  ['deployment', p => (p.scope.deploymentId = 'foreign')],
  ['service', p => (p.scope.logicalServiceId = 'foreign')],
  ['definition', p => (p.definition.revision = 'foreign')],
  ['implementation', p => (p.implementationRef = 'foreign')],
  ['capability', p => (p.capabilityId = 'foreign')],
  ['enforcement', p => (p.enforcementKey = 'foreign')],
])
  checked(`material rejects changed ${name}`, () => {
    const request = structuredClone(mapped.permission)
    change(request)
    assert.equal(permissionCurrentMaterial(valid.output, request, []), undefined)
  })
checked('runtime material refuses management mode', () => {
  const value = structuredClone(valid.output)
  value.binding.mode = 'management'
  assert.equal(permissionCurrentMaterial(value, mapped.permission, []), undefined)
})
checked('material requires exactly one definition', () => {
  const value = structuredClone(valid.output)
  value.declaration.permissions.push(structuredClone(value.declaration.permissions[0]))
  assert.equal(permissionCurrentMaterial(value, mapped.permission, []), undefined)
})
for (const [name, change] of [
  [
    'duplicate publication views',
    f =>
      f['assets.current-publication'].views.push(
        structuredClone(f['assets.current-publication'].views[0]),
      ),
  ],
  [
    'different selected principal',
    f => (f['governance.selected-definition'].binding.principalRef = 'another'),
  ],
])
  checked(`snapshot rejects ${name}`, () =>
    assert.equal(snapshot(change).result.kind, 'unsupported'),
  )
checked('snapshot only publishes runtime material', () => {
  binding.mode = 'management'
  try {
    assert.equal(snapshot().result.kind, 'unsupported')
  } finally {
    binding.mode = 'runtime'
  }
})
const foreignMap = createPermissionReadMapping({
  scope: { ...scope, tenantRef: 'foreign' },
  release: () => release,
  settings: async () => {
    throw Error('must not read Settings')
  },
})
assert.equal(await foreignMap(action), undefined)
checks.push('mapping rejects a different tenant scope')

function mappedFixture() {
  const { snapshot: value } = settingsSnapshotFixture()
  value.binding.mode = 'runtime'
  const permission = value.declaration.permissions[0]
  const enforcement = value.enforcementBindings.find(
    b =>
      b.capabilityId === permission.capabilityId && b.enforcementKey === permission.enforcementKey,
  )
  const request = {
    ...mapped.permission,
    scope: {
      ...mapped.permission.scope,
      tenantId: value.binding.scope.tenantRef,
      targetId: canonicalText(value.binding.target),
      deploymentId: value.binding.scope.deploymentId,
      logicalServiceId: value.binding.scope.logicalServiceId,
    },
    definition: permission.reference,
    implementationRef: enforcement.implementationRef,
    capabilityId: enforcement.capabilityId,
    enforcementKey: enforcement.enforcementKey,
  }
  return { value, request, permission }
}
checked('mapped material reads a present tenant prohibition', () => {
  const { value, request, permission } = mappedFixture()
  value.values.view.state.sources[0].values.push({
    itemId: permission.settings.itemId,
    value: { kind: 'value', value: { pick: 'deny', allowedSet: null } },
    locked: false,
  })
  const evaluation = permissionCurrentMaterial(value, request, [])
  assert.equal(evaluation.sources.tenant.kind, 'available')
  assert.equal(evaluatePermission(evaluation).reason, 'active-prohibition')
})
checked('mapped material retains a known absent tenant value', () => {
  const { value, request } = mappedFixture()
  assert.equal(permissionCurrentMaterial(value, request, []).sources.tenant.kind, 'absent')
})
checked('mapped material refuses a disabled target', () => {
  const { value, request } = mappedFixture()
  value.values.view.enabled = false
  assert.equal(permissionCurrentMaterial(value, request, []), undefined)
})
for (const [name, change] of [
  ['unavailable values', value => (value.values.presence = 'unavailable')],
  ['no tenant descriptor', value => (value.values.view.sources = [])],
  [
    'another tenant descriptor',
    value => (value.values.view.sources[0].scope.subjectRef = 'foreign'),
  ],
  [
    'another scope kind',
    value =>
      (value.values.view.sources[0].scope = { kind: 'organization', subjectRef: 'tenant-a' }),
  ],
  [
    'duplicate tenant descriptor',
    value => value.values.view.sources.push(structuredClone(value.values.view.sources[0])),
  ],
  ['missing source state', value => (value.values.view.state.sources = [])],
  ['different source state', value => (value.values.view.state.sources[0].id = 'foreign')],
])
  checked(`mapped material preserves unavailable: ${name}`, () => {
    const { value, request } = mappedFixture()
    change(value)
    assert.equal(permissionCurrentMaterial(value, request, []).sources.tenant.kind, 'unavailable')
  })

checked('a foreign tenant descriptor cannot make the valid tenant source ambiguous', () => {
  const { value, request } = mappedFixture()
  value.values.view.sources.push({
    ...value.values.view.sources[0],
    sourceId: 'foreign',
    scope: { kind: 'tenant', subjectRef: 'foreign' },
  })
  assert.equal(permissionCurrentMaterial(value, request, []).sources.tenant.kind, 'absent')
})
checked(
  'a supported binding from another capability cannot replace the requested definition',
  () => {
    const value = structuredClone(valid.output)
    const request = structuredClone(mapped.permission)
    request.capabilityId = 'another-capability'
    value.enforcementBindings.push({
      ...value.enforcementBindings[0],
      capabilityId: request.capabilityId,
    })
    assert.equal(permissionCurrentMaterial(value, request, []), undefined)
  },
)
checked('matching declarations for a different asset cannot authorize this publication', () => {
  const result = snapshot(facts => {
    facts['governance.selected-definition'].observation.declaration.origin.assetId = 'another-asset'
    facts['harness.governance-publications'][0].declaration.origin.assetId = 'another-asset'
  })
  assert.equal(result.result.kind, 'unsupported')
})
const nonSessionPrincipal = authority.issuer.issueActingForTenant({
  actor,
  tenant: TOOL_RELEASE_TENANT,
  work: { owner: 'another-owner', work: 'session-1' },
}).ok
let invalidPrincipalReads = 0
const configuredMap = createPermissionReadMapping({
  scope,
  release: () => real,
  settings: async () => {
    invalidPrincipalReads++
    return undefined
  },
})
assert.equal(await configuredMap({ ...action, principal: nonSessionPrincipal }), undefined)
assert.equal(invalidPrincipalReads, 0)
checks.push('invalid original principal does not query Settings')
console.log(
  JSON.stringify(
    {
      checks: checks.length,
      passed: checks,
      boundary:
        'Source mapping and participant checks with explicit owner facts and minimal SQLite rows. Full owner transactions and production assembly are verified by separate scenarios.',
    },
    null,
    2,
  ),
)
