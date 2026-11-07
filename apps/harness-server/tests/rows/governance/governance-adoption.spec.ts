import { afterEach, expect, it } from 'vitest'
import { createGovernanceCollection } from '@omne-harness/governance-local'
import { governanceAdoptionWorld } from './governance-adoption-world.ts'

const worlds: Awaited<ReturnType<typeof governanceAdoptionWorld>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

it('adopts the real held Tool release through public Governance and real Identity reservations', async () => {
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
  expect(registered).toMatchObject({ kind: 'registered' })
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const page = await w.service.readCatalog(w.access, {
    scope: w.scope,
    mode: 'management',
    targets: [],
    cursor: null,
    limit: 10,
  })
  expect(page).toMatchObject({ kind: 'page', items: [{ declaration: w.declaration }] })
  if (page.kind !== 'page') throw new Error(JSON.stringify(page))
  const selection = { contribution: registered.contribution, selectedTargets: [w.target] }
  const collection = createGovernanceCollection({
    scope: w.scope,
    declarationRevision: registered.declarationRevision,
    complete: [{ ...selection, definition: w.declaration.reference }],
  })
  const command = {
    scope: w.scope,
    operationId: 'adopt-shell',
    expectedDeclarationRevision: registered.declarationRevision,
    expectedAdoptionRevision: page.snapshot.adoptionRevision,
    collection,
    complete: [selection],
  }
  const adopted = await w.service.adopt(w.access, command)
  expect(adopted).toMatchObject({ kind: 'adopted' })
  if (adopted.kind !== 'adopted') throw new Error(JSON.stringify(adopted))
  expect(
    await w.service.queryOperation(w.access, {
      scope: w.scope,
      owner: 'adopt',
      operationId: command.operationId,
    }),
  ).toMatchObject({ kind: 'committed', original: { result: adopted } })
  expect(
    await w.owner.changeHolding({
      operationId: 'disable',
      holdingRef: w.target.targetRef,
      scopeRef: w.target.scopeRef,
      expectedRevision: 1,
      change: { kind: 'setEnabled', enabled: false },
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(
    await w.service.readCatalog(w.access, {
      scope: w.scope,
      mode: 'management',
      targets: [w.target],
      cursor: null,
      limit: 10,
    }),
  ).toMatchObject({
    kind: 'page',
    items: [{ availability: 'unavailable' }],
    completeness: 'complete',
  })
  expect(
    await w.service.readCatalog(w.access, {
      scope: w.scope,
      mode: 'runtime',
      targets: [w.target],
      cursor: null,
      limit: 10,
    }),
  ).toMatchObject({ kind: 'page', items: [], completeness: 'complete' })
  const disabled = await w.service.adopt(w.access, {
    ...command,
    operationId: 'adopt-after-disable',
    expectedAdoptionRevision: adopted.basis.adoptionRevision,
  })
  expect(disabled).toEqual({ kind: 'conflict', reason: 'basis' })
  expect(
    await w.service.queryOperation(w.access, {
      scope: w.scope,
      owner: 'adopt',
      operationId: 'adopt-after-disable',
    }),
  ).toMatchObject({ kind: 'not-committed', sealRef: expect.stringMatching(/^governance-seal\//) })
  expect(await w.service.adopt(w.access, command)).toEqual(adopted)
  expect(
    await w.service.withdraw(w.access, {
      operationId: 'withdraw',
      contribution: registered.contribution,
    }),
  ).toMatchObject({ kind: 'released' })
})
