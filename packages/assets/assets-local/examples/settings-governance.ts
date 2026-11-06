import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { openCatalogWorld } from '../../settings-local/tests/catalog-world.ts'
import {
  assetsSqlMaterials,
  assetsSettingsProjectionCommand,
  createAssetsLocal,
} from '../src/index.ts'
import { categories, pinned, definition, definitionRef } from '../tests/world.ts'
const inputPath =
  process.argv[2] ?? fileURLToPath(new URL('./settings-governance.json', import.meta.url))
const input = z
  .strictObject({ enabled: z.boolean(), retainOnUpgrade: z.boolean() })
  .parse(JSON.parse(readFileSync(inputPath, 'utf8')))
const w = await openCatalogWorld({
  assets: {
    materials: assetsSqlMaterials({ settingsGuard: false }),
    command: assetsSettingsProjectionCommand,
  },
})
const assets = createAssetsLocal({ ...w.terminalOptions, categories })
const show = (step: string, result: unknown) => console.log(JSON.stringify({ step, result }))
const target = {
  policyId: 'asset',
  targetRef: 'manual-holding',
  scopeRef: w.change.target.scopeRef,
}
try {
  show('storage', {
    root: w.world.root,
    providers: ['identity-sql', 'sqlite-provider', 'assets-local', 'settings-local'],
    input,
  })
  const published = await assets.publish({
    operationId: 'publish',
    assetRef: 'manual-asset',
    pinned: pinned(),
    expectedRevision: 0,
  })
  assert.equal(published.kind, 'committed')
  const held = await assets.hold({
    operationId: 'hold',
    holdingRef: target.targetRef,
    scopeRef: target.scopeRef,
    assetRef: 'manual-asset',
    selection: { kind: 'follow' },
    sources: [
      {
        sourceId: 'tenant',
        ownerRef: 'deployment',
        scope: { kind: 'tenant', subjectRef: 'tenant-a' },
      },
    ],
    grants: [{ sourceId: 'tenant', actions: ['set', 'clear', 'lock', 'unlock'] }],
  })
  assert.equal(held.kind, 'committed')
  w.registry.registerContribution(definition())
  const page = await w.service.queries.readCatalog(w.principal, {
    view: w.view,
    filter: '',
    locale: 'zh-CN',
    pageSize: 10,
    cursor: null,
  })
  assert.equal(page.kind, 'catalog')
  show('one-catalog-two-targets', page)
  const command = {
    ...w.change,
    target,
    operationId: 'manual-set',
    definitionRef: definitionRef(),
    action: { kind: 'set' as const, value: input.enabled },
  }
  const saved = await w.service.commands.change(w.principal, command)
  assert.equal(saved.kind, 'committed')
  show('save', saved)
  const replay = await w.service.commands.change(w.principal, command)
  assert.deepEqual(replay, saved)
  show('same-operation-replay', replay)
  assert.equal(
    (
      await assets.publish({
        operationId: 'publish-v2',
        assetRef: 'manual-asset',
        pinned: pinned('2', true),
        expectedRevision: 1,
      })
    ).kind,
    'committed',
  )
  w.registry.registerContribution(definition('2', true))
  const view = { ...w.view, targets: [target] }
  const incompatible = await w.service.queries.evaluate(w.principal, view)
  assert.deepEqual(incompatible, { kind: 'rejected', reason: 'definition_changed' })
  show('new-definition-needs-decision', incompatible)
  const adopted = await w.maintenance.rebase({
    protocol: 'settings-rebase/1',
    requestId: 'adopt',
    operationId: 'adopt',
    target,
    from: definitionRef(),
    to: definitionRef('2', true),
    expectedRevision: 1,
    assignments: [
      {
        sourceId: 'tenant',
        itemId: 'enabled',
        disposition: input.retainOnUpgrade ? 'retain' : 'discard',
      },
    ],
  })
  assert.equal(adopted.kind, 'committed')
  show('explicit-maintenance-adoption', adopted)
  const effective = await w.service.queries.evaluate(w.principal, view)
  assert.equal(effective.kind, 'complete')
  if (effective.kind === 'complete')
    assert.deepEqual(effective.entries[0]?.resolution.value, {
      kind: 'value',
      value: input.retainOnUpgrade ? input.enabled : true,
    })
  show('effective-value-after-upgrade', effective)
  assert.deepEqual(await w.remove(), { kind: 'succeeded' })
  const denied = await w.service.queries.evaluate(w.principal, view)
  assert.deepEqual(denied, { kind: 'rejected', reason: 'forbidden' })
  show('real-membership-revocation', denied)
  show('acceptance', { automaticAssertions: 'passed', userManualAcceptance: 'not-recorded' })
} finally {
  await assets.close()
  await w.close()
}
