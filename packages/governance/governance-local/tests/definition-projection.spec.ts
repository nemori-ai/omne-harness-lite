import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import {
  createGovernanceLocal,
  GovernanceDefinitionProjectionSchema,
  governanceDefinitionProjectionCommand,
  governanceDefinitionProjectionParticipant,
  type GovernanceDefinitionBinding,
} from '@omne-harness/governance-local'
import { combinationManifest, manifestDigest } from '@omne-harness/sql-contract'
import { openProviderWorld } from './provider-world.ts'

const worlds: Array<{ close(): Promise<unknown> }> = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

async function open() {
  const { w, options, definition } = await openProviderWorld()
  const declaration = {
    ...definition,
    settings: [],
    permissions: definition.permissions.map(permission => ({ ...permission, settings: null })),
  }
  const made = await createGovernanceLocal({
    ...options,
    definitions: { resolve: async () => ({ kind: 'definition', declaration }) },
  })
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  const epoch = made.epoch
  if (epoch === undefined) throw new Error('Governance scope epoch missing')
  worlds.push({
    async close() {
      await made.close()
      await w.close()
    },
  })
  const registered = await made.service.contribute(w.context, {
    ...w.command('without-settings'),
    declaration,
  })
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  const participants = [
    'governance.metadata-plan',
    'governance.activation',
    governanceDefinitionProjectionParticipant.participant,
  ]
  const checked = combinationManifest({ catalog: w.activation.materials, participants })
  if (checked.kind !== 'manifest') throw new Error(JSON.stringify(checked))
  const combination = {
    combinationVersion: 'definition-capture/1',
    manifestDigest: manifestDigest(checked.manifest),
  }
  expect(
    await w.activation.storage.registerCombination({
      ...w.activation.domain,
      ...combination,
      participants,
    }),
  ).toMatchObject({ kind: 'registered' })

  async function capture(patch: Partial<GovernanceDefinitionBinding> = {}) {
    const binding: GovernanceDefinitionBinding = {
      scope: w.scope,
      epoch,
      principalRef: w.principalRef,
      captureId: randomUUID(),
      transactionDomain: w.activation.domain.transactionDomain,
      definition: declaration.reference,
      ...patch,
    }
    const command = governanceDefinitionProjectionCommand(binding)
    expect(command.facts['binding']).not.toHaveProperty('target')
    const receipt = await w.activation.storage.commit({
      identity: {
        ...w.activation.domain,
        operation: 'definition-capture',
        protocolVersion: '2',
        operationKey: randomUUID(),
      },
      ...combination,
      commands: [command],
    })
    if (receipt.kind !== 'committed') throw new Error(JSON.stringify(receipt))
    return GovernanceDefinitionProjectionSchema.parse(receipt.responses[0].reply.response)
  }
  return { w, made, declaration, registered, capture }
}

it('captures a registered permission without a Settings target and observes withdrawal', async () => {
  const { w, made, declaration, registered, capture } = await open()
  expect(await capture()).toMatchObject({
    observation: {
      kind: 'available',
      declaration,
      declarationRevision: registered.declarationRevision,
    },
  })
  expect(
    await made.service.withdraw(w.context, {
      operationId: 'withdraw-no-settings',
      contribution: registered.contribution,
    }),
  ).toMatchObject({ kind: 'released' })
  expect(await capture()).toMatchObject({
    observation: { kind: 'unavailable', reason: 'definition' },
  })
})

it('does not borrow the declaration from another scope, epoch or full definition identity', async () => {
  const { w, declaration, capture } = await open()
  expect(await capture({ epoch: 'old-epoch' })).toMatchObject({
    observation: { kind: 'unavailable', reason: 'scope' },
  })
  expect(
    await capture({ scope: { ...w.scope, logicalServiceId: 'another-service' } }),
  ).toMatchObject({
    observation: { kind: 'unavailable', reason: 'scope' },
  })
  expect(
    await capture({ definition: { ...declaration.reference, digest: 'f'.repeat(64) } }),
  ).toMatchObject({
    observation: { kind: 'unavailable', reason: 'definition' },
  })
})

it('does not expose a declaration after its owning scope has closed', async () => {
  const { made, capture } = await open()
  expect(await made.close()).toEqual({ kind: 'closed' })
  expect(await capture()).toMatchObject({
    observation: { kind: 'unavailable', reason: 'scope' },
  })
})
