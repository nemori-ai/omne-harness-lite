import { expect, it } from 'vitest'
import {
  GovernanceDefinitionIdentitySchema,
  GovernanceDefinitionReadSchema,
} from '@omne-harness/governance-contract'

it('does not let requested digest, body or tenant choose the publication', () => {
  const identity = { ownerId: 'publisher', definitionId: 'preferences', version: '1' }
  expect(GovernanceDefinitionIdentitySchema.safeParse(identity).success).toBe(true)
  for (const extra of [{ digest: 'a'.repeat(64) }, { declaration: {} }, { tenantRef: 'tenant' }])
    expect(GovernanceDefinitionIdentitySchema.safeParse({ ...identity, ...extra }).success).toBe(
      false,
    )
})
it('requires the full publication rather than a permission boolean', () => {
  expect(GovernanceDefinitionReadSchema.safeParse({ kind: 'unavailable' }).success).toBe(true)
  for (const input of [{ allowed: true }, { kind: 'definition' }, { kind: 'absent' }])
    expect(GovernanceDefinitionReadSchema.safeParse(input).success).toBe(false)
})
