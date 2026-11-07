import { afterEach, expect, it } from 'vitest'
import { openRegistrarWorld } from './registrar-world.ts'
import { selectionDigest } from '../src/adoption-plan.ts'
import { definitionKey, json } from '../src/encoding.ts'

const worlds: Awaited<ReturnType<typeof openRegistrarWorld>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
async function setup() {
  const w = await openRegistrarWorld()
  worlds.push(w)
  const registered = await w.services().registrar.contribute(w.context, w.command('register'))
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const declaration = w.command('register').declaration
  const members = [
    {
      candidate: {
        contribution: registered.contribution,
        declaration,
        definitionKey: definitionKey(declaration.reference),
      },
      targets: [],
    },
  ]
  const scope = registered.contribution.scope
  const command = {
    scope,
    operationId: 'adopt',
    expectedAdoptionRevision: 0,
    expectedDeclarationRevision: registered.declarationRevision,
    collection: {
      scope,
      declarationRevision: registered.declarationRevision,
      digest: selectionDigest(
        { scope, expectedDeclarationRevision: registered.declarationRevision },
        members,
      ),
    },
    complete: [{ contribution: registered.contribution, selectedTargets: [] }],
  }
  const current: NonNullable<Parameters<typeof w.services>[0]>['current'] = input =>
    json({
      binding: input.binding,
      epoch: input.epoch,
      transactionDomain: w.activation.domain.transactionDomain,
      targets: [],
      enforcementBindings: declaration.enforcementBindings,
    })
  return { w, command, current }
}
it('adopts through real Identity and SQL, retains the original result across reopen and source absence', async () => {
  const { w, command, current } = await setup()
  const { registrar } = w.services({ current })
  const adopted = await registrar.adopt(w.context, command)
  expect(adopted).toMatchObject({
    kind: 'adopted',
    basis: { scope: command.scope, adoptionRevision: 1 },
  })
  await w.reopen()
  w.setSourceAvailable(false)
  const restored = w.services({
    current: () => {
      throw new Error('current owner offline')
    },
  }).registrar
  expect(await restored.adopt(w.context, command)).toEqual(adopted)
  expect(await restored.adopt(w.context, { ...command, expectedAdoptionRevision: 1 })).toEqual({
    kind: 'conflict',
    reason: 'operation',
  })
})
it('does not adopt without current enforcement and keeps failure as the original operation', async () => {
  const { w, command } = await setup()
  const registrar = w.services({
    current: input =>
      json({
        binding: input.binding,
        epoch: input.epoch,
        transactionDomain: w.activation.domain.transactionDomain,
        targets: [],
        enforcementBindings: [],
      }),
  }).registrar
  expect(await registrar.adopt(w.context, command)).toEqual({
    kind: 'unavailable',
    owner: 'adoption-current',
  })
  const retry = w.services({
    current: () => {
      throw new Error('must not recapture original terminal')
    },
  }).registrar
  expect(await retry.adopt(w.context, command)).toEqual({
    kind: 'unavailable',
    owner: 'adoption-current',
  })
})
it('permits at most one adoption at the same expected revision', async () => {
  const { w, command, current } = await setup()
  const registrar = w.services({ current }).registrar
  const outcomes = await Promise.all([
    registrar.adopt(w.context, command),
    registrar.adopt(w.context, { ...command, operationId: 'competing' }),
  ])
  expect(outcomes.filter(result => result.kind === 'adopted')).toHaveLength(1)
  expect(outcomes.filter(result => result.kind === 'conflict')).toEqual([
    { kind: 'conflict', reason: 'basis' },
  ])
})
it('stops adoption at ingress and rejects foreign scope before capture', async () => {
  const { w, command } = await setup()
  let captures = 0
  const registrar = w.services({
    current: () => {
      captures++
      return null
    },
  }).registrar
  expect(
    await registrar.adopt(w.context, {
      ...command,
      scope: { ...command.scope, deploymentId: 'foreign' },
    }),
  ).toEqual({ kind: 'denied' })
  registrar.stopAccepting()
  expect(await registrar.adopt(w.context, command)).toEqual({
    kind: 'unavailable',
    owner: 'governance-provider',
  })
  expect(captures).toBe(0)
})
