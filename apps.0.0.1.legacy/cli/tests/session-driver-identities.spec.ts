import { describe, expect, it } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { parseTenantId, parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { createSessionDriverIdentities } from '../src/session-driver-identities.ts'

const source = createSessionDriverIdentities()
const scope = {
  tenant: unwrap(parseTenantId({ organization: 'identity-org', account: 'identity-account' })),
  session: unwrap(parseOpaqueIdentifier('identity-session', 'SessionRef')),
}

describe('official model identity recovery', () => {
  it.each([6, 174, new LosslessNumber('174')])(
    'preserves all original model identities for %s',
    position => {
      const original = source.model(scope, 'identity-run', 1, position)
      expect(
        source.restoreModel?.({
          run: 'identity-run',
          attempt: 1,
          stepKey: original.prepareKey,
          call: original.call,
          originalPosition: original.originalPosition,
        }),
      ).toEqual(original)
    },
  )
  it.each(['call', 'stepKey', 'originalPosition'] as const)('refuses a changed %s', field => {
    const original = source.model(scope, 'identity-run', 1, 174)
    expect(
      source.restoreModel?.({
        run: 'identity-run',
        attempt: 1,
        stepKey: original.prepareKey,
        call: original.call,
        originalPosition: original.originalPosition,
        [field]: 'changed',
      }),
    ).toEqual({ unavailable: true })
  })
})
