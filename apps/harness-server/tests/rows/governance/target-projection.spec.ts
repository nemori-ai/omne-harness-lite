import { afterEach, expect, it } from 'vitest'
import {
  createGovernanceCollection,
  type GovernanceTargetBinding,
} from '@omne-harness/governance-local'
import { governanceAdoptionWorld } from './governance-adoption-world.ts'

const worlds: Awaited<ReturnType<typeof governanceAdoptionWorld>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
async function open() {
  const w = await governanceAdoptionWorld()
  worlds.push(w)
  await w.setup()
  const registered = await w.service.contribute(w.access, {
    scope: w.scope,
    contributorId: 'tools',
    generation: '1',
    operationId: 'register-shell',
    declaration: w.declaration,
  })
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const page = await w.service.readCatalog(w.access, {
    scope: w.scope,
    mode: 'management',
    targets: [],
    cursor: null,
    limit: 10,
  })
  if (page.kind !== 'page') throw new Error(JSON.stringify(page))
  const selected = { contribution: registered.contribution, selectedTargets: [w.target] }
  return {
    ...w,
    registered,
    epoch: page.snapshot.epoch,
    async adopt() {
      const result = await w.service.adopt(w.access, {
        scope: w.scope,
        operationId: 'adopt',
        expectedAdoptionRevision: page.snapshot.adoptionRevision,
        expectedDeclarationRevision: page.snapshot.declarationRevision,
        collection: createGovernanceCollection({
          scope: w.scope,
          declarationRevision: page.snapshot.declarationRevision,
          complete: [{ ...selected, definition: w.declaration.reference }],
        }),
        complete: [selected],
      })
      if (result.kind !== 'adopted') throw new Error(JSON.stringify(result))
      return result
    },
  }
}

it('separates management declaration availability from current runtime adoption and observes withdrawal', async () => {
  const w = await open()
  expect(await w.captureTarget(w.epoch, 'management')).toMatchObject({
    observation: { kind: 'available', declaration: w.declaration },
  })
  expect(await w.captureTarget(w.epoch)).toMatchObject({
    observation: { kind: 'unavailable', reason: 'selection' },
  })
  const adopted = await w.adopt()
  const before = await w.captureTarget(w.epoch)
  expect(before).toMatchObject({
    binding: { scope: w.scope, target: w.target, definition: w.declaration.reference },
    observation: {
      kind: 'available',
      declaration: w.declaration,
      adoptionRevision: adopted.basis.adoptionRevision,
      declarationRevision: adopted.basis.declarationRevision,
    },
  })
  expect(
    await w.service.withdraw(w.access, {
      operationId: 'withdraw',
      contribution: w.registered.contribution,
    }),
  ).toMatchObject({ kind: 'released' })
  const after = await w.captureTarget(w.epoch)
  expect(after.observation).toEqual({ kind: 'unavailable', reason: 'definition' })
  expect(after.binding.captureId).not.toBe(before.binding.captureId)
  expect(before.observation.kind).toBe('available')
  expect((await w.captureTarget(w.epoch, 'management')).observation.kind).toBe('unavailable')
})

it('rejects another epoch, full definition digest, target and tenant even after successful adoption', async () => {
  const w = await open()
  await w.adopt()
  const foreignTenant = JSON.stringify({
    organization: 'org_00000000000000000000000001',
    account: 'acc_00000000000000000000000002',
  })
  expect(foreignTenant).not.toBe(w.scope.tenantRef)
  const cases: [Partial<GovernanceTargetBinding>, string][] = [
    [{ epoch: 'old-epoch' }, 'scope'],
    [{ definition: { ...w.declaration.reference, digest: 'f'.repeat(64) } }, 'definition'],
    [{ target: { ...w.target, targetRef: 'another-holding' } }, 'selection'],
    [
      {
        scope: {
          ...w.scope,
          tenantRef: foreignTenant,
          visibility: { kind: 'tenant', tenantRef: foreignTenant },
        },
      },
      'scope',
    ],
  ]
  for (const [patch, reason] of cases)
    expect((await w.captureTarget(w.epoch, 'runtime', patch)).observation).toEqual({
      kind: 'unavailable',
      reason,
    })
  expect((await w.captureTarget(w.epoch)).observation.kind).toBe('available')
})

it('combines adopted Governance, native publication, actual Settings values and interpreter support in one transaction', async () => {
  const w = await open()
  const native = await w.capture()
  if (!('views' in native)) throw new Error(JSON.stringify(native))
  const ownerRevision = native.views[0]!.ownerRevision
  const management = await w.captureSnapshot(w.epoch, 'management')
  expect(management).toMatchObject({
    binding: { mode: 'management' },
    declaration: w.declaration,
    values: {
      presence: 'absent',
      view: { target: w.target, ownerRevision, enabled: true, state: { revision: 0 } },
    },
    enforcementBindings: w.declaration.enforcementBindings,
  })
  expect(await w.captureSnapshot(w.epoch)).toMatchObject({ kind: 'rolled_back' })
  const adopted = await w.adopt()
  const current = await w.captureSnapshot(w.epoch)
  expect(current).toMatchObject({
    declaration: w.declaration,
    adoptionRevision: adopted.basis.adoptionRevision,
    values: { view: { enabled: true, state: { revision: 0 } } },
  })
  expect(
    await w.owner.changeHolding({
      operationId: 'disable-snapshot',
      holdingRef: w.target.targetRef,
      scopeRef: w.target.scopeRef,
      expectedRevision: 1,
      change: { kind: 'setEnabled', enabled: false },
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(await w.captureSnapshot(w.epoch)).toMatchObject({ kind: 'rolled_back' })
  const disabled = await w.captureSnapshot(w.epoch, 'management')
  expect(disabled).toMatchObject({
    values: { presence: 'absent', view: { enabled: false } },
  })
  if ('kind' in disabled) throw new Error(JSON.stringify(disabled))
  expect(disabled.values.view.ownerRevision).not.toBe(ownerRevision)
  expect(
    await w.service.withdraw(w.access, {
      operationId: 'withdraw-snapshot',
      contribution: w.registered.contribution,
    }),
  ).toMatchObject({ kind: 'released' })
  expect(await w.captureSnapshot(w.epoch, 'management')).toMatchObject({ kind: 'rolled_back' })
})

it('does not compose another capture or omit any required owner fact', async () => {
  const w = await open()
  await w.adopt()
  for (const participant of ['governance.target-projection', 'settings.value-projection']) {
    expect(
      await w.captureSnapshot(w.epoch, 'runtime', commands =>
        commands.map(command => {
          if (command.participant !== participant) return command
          const binding = command.facts['binding']
          if (binding === null || typeof binding !== 'object' || Array.isArray(binding))
            throw new Error('expected binding command')
          return {
            ...command,
            facts: { ...command.facts, binding: { ...binding, captureId: 'another-capture' } },
          }
        }),
      ),
    ).toMatchObject({ kind: 'rolled_back' })
  }
  for (const participant of [
    'governance.target-projection',
    'settings.value-projection',
    'assets.settings',
    'settings.target-projection',
    'harness.tool-permission-release',
    'harness.permission-support',
  ]) {
    expect(
      await w.captureSnapshot(w.epoch, 'runtime', commands =>
        commands.filter(command => command.participant !== participant),
      ),
    ).toMatchObject({ kind: 'rejected_before_accept', reason: 'participant_dependency_missing' })
  }
  expect(await w.captureSnapshot(w.epoch)).toMatchObject({ declaration: w.declaration })
})
