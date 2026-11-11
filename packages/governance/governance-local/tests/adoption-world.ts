import { expect } from 'vitest'
import { z } from 'zod'
import {
  GovernanceContributionRefSchema,
  type GovernanceDefinitionBundle,
} from '@omne-harness/governance-contract'
import type { SettingsTarget } from '@omne-harness/settings'
import { recordSchema, type AcceptOperation } from '../src/operation-schema.ts'
import type { Candidate } from '../src/candidates.ts'
import { selectionDigest, type AdoptionMember } from '../src/adoption-plan.ts'
import type { AdoptionEvidence } from '../src/adoption-schema.ts'
import { definitionKey, digest, canonical } from '../src/encoding.ts'
import { command, binding, scope, execution, openOperations } from './operation-world.ts'
import { declaration } from './definition-fixture.ts'

export const target = (id: string): SettingsTarget => ({
  policyId: 'independent',
  targetRef: id,
  scopeRef: scope.tenantRef,
})
export const found = z.object({ kind: z.literal('found'), record: recordSchema })
const registration = z.object({
  kind: z.literal('registered'),
  contribution: GovernanceContributionRefSchema,
})
export async function openAdoptionWorld(existing?: string) {
  const world = await openOperations(existing)
  await world.call({ kind: 'bootstrap', input: { scope, epoch: 'first', previousEpoch: null } })
  async function run(input: AcceptOperation, evidence?: AdoptionEvidence) {
    await world.call({ kind: 'accept', input })
    await world.call({ kind: 'submit', binding: binding(input), execution })
    const facts = {
      kind: 'apply',
      binding: binding(input),
      execution,
      ...(evidence ? { evidence } : {}),
    }
    return found.parse(await world.call(facts)).record
  }
  async function register(
    id: string,
    value: GovernanceDefinitionBundle = declaration(),
  ): Promise<Candidate> {
    const input = command(id)
    if (input.request.owner !== 'contribute') throw new Error('Expected registration fixture')
    input.request.command.declaration = value
    const record = await run(input)
    expect(record.state).toBe('committed')
    return {
      contribution: registration.parse(record.result).contribution,
      declaration: value,
      definitionKey: definitionKey(value.reference),
    }
  }
  return { ...world, run, register }
}
export function adoption(
  members: readonly AdoptionMember[],
  operationId: string,
  declarationRevision: number,
  adoptionRevision = 0,
) {
  const command = {
    scope,
    operationId,
    expectedAdoptionRevision: adoptionRevision,
    expectedDeclarationRevision: declarationRevision,
    collection: {
      scope,
      declarationRevision,
      digest: selectionDigest({ scope, expectedDeclarationRevision: declarationRevision }, members),
    },
    complete: members.map(member => ({
      contribution: member.candidate.contribution,
      selectedTargets: [...member.targets],
    })),
  }
  const input = {
    principalRef: 'assembler',
    epoch: 'first',
    transactionDomain: 'governance-operations',
    request: { owner: 'adopt', command },
  } satisfies AcceptOperation
  const targets = new Map<string, AdoptionEvidence['targets'][number]>()
  const enforcement = new Map<string, AdoptionEvidence['enforcementBindings'][number]>()
  for (const { candidate, targets: selected } of members) {
    for (const target of selected) {
      const definition = candidate.declaration.settings[0]!
      targets.set(canonical(target), {
        target,
        origin: candidate.declaration.origin,
        enabled: true,
        ownerRevision: 1,
        definition,
        definitionRef: {
          providerId: definition.providerId,
          definitionId: definition.definitionId,
          version: definition.version,
          digest: digest(definition),
        },
      })
    }
    for (const entry of candidate.declaration.enforcementBindings)
      enforcement.set(canonical([entry.capabilityId, entry.enforcementKey]), entry)
  }
  const evidence: AdoptionEvidence = {
    binding: binding(input),
    epoch: 'first',
    transactionDomain: input.transactionDomain,
    targets: [...targets.values()],
    enforcementBindings: [...enforcement.values()],
  }
  return { input, evidence }
}
