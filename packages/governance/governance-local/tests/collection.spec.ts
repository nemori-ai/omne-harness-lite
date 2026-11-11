import { expect, it } from 'vitest'
import { createGovernanceCollection } from '@omne-harness/governance-local'
import { scope } from './operation-world.ts'
import { declaration } from './definition-fixture.ts'

function input() {
  const definition = declaration().reference
  const target = { policyId: 'asset', scopeRef: scope.tenantRef, targetRef: 'target-a' }
  return {
    scope: structuredClone(scope),
    declarationRevision: 7,
    complete: ['first', 'second'].map(registrationId => ({
      contribution: {
        scope: structuredClone(scope),
        contributorId: 'tools',
        generation: '1',
        registrationId,
      },
      definition,
      selectedTargets: [target, { ...target, targetRef: 'target-b' }],
    })),
  }
}
it('uses set order for members and targets without changing the collection identity', () => {
  const original = input()
  const reordered = structuredClone(original)
  reordered.complete.reverse()
  for (const member of reordered.complete) member.selectedTargets.reverse()
  expect(createGovernanceCollection(reordered)).toEqual(createGovernanceCollection(original))
})
it('binds the revision and exact definition and target choices', () => {
  const original = input(),
    expected = createGovernanceCollection(original)
  const changed = input()
  changed.declarationRevision++
  expect(createGovernanceCollection(changed).digest).not.toBe(expected.digest)
  const member = changed.complete[0]
  if (member === undefined) throw new Error('missing test member')
  changed.declarationRevision = original.declarationRevision
  member.definition = { ...member.definition, digest: '0'.repeat(64) }
  expect(createGovernanceCollection(changed).digest).not.toBe(expected.digest)
  member.definition = declaration().reference
  member.selectedTargets.pop()
  expect(createGovernanceCollection(changed).digest).not.toBe(expected.digest)
})
it('returns a detached scope and does not silently remove duplicate members', () => {
  const original = input(),
    reference = createGovernanceCollection(original)
  original.scope.logicalServiceId = 'changed'
  expect(reference.scope.logicalServiceId).toBe(scope.logicalServiceId)
  const repeated = input()
  repeated.complete.push(...repeated.complete)
  expect(createGovernanceCollection(repeated).digest).not.toBe(reference.digest)
})
