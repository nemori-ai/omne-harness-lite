import { describe, expect, it } from 'vitest'
import {
  adoptedInitializationFixture,
  creation,
  initializationFixtureFacts,
  initializationFixtureGuard,
  memoryAccess,
  operationId,
  ordinaryInput,
} from '@omne-harness/session-contract/testing'
import type { SessionCommand } from '@omne-harness/session-contract'
import { sessionCommandFacts } from '@omne-harness/session-storage-sql/participants'

const depth = (value: unknown): number =>
  value !== null && typeof value === 'object'
    ? 1 + Math.max(0, ...Object.values(value).map(depth))
    : 0

function createDepth(initial: ReturnType<typeof ordinaryInput> | null): number {
  const access = memoryAccess('tester', 'create-depth')
  const command: SessionCommand = {
    kind: 'create',
    input: {
      tenant: access.tenant,
      session: access.session,
      operation: operationId('create'),
      creation: creation({ initial }),
    },
  }
  const guard = initializationFixtureGuard(
    initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
  )
  return depth(sessionCommandFacts(command, [guard]).facts)
}

describe('the nesting of a Session create commit', () => {
  it('is 48 levels without an initial input and 69 with one, so a limit of 64 refuses the second', () => {
    expect(createDepth(null)).toBe(48)
    expect(createDepth(ordinaryInput('input-1'))).toBe(69)
  })
})
