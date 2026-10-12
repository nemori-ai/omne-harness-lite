import { vi } from 'vitest'
import type { CredentialsService } from '@omne-harness-lite/account-identity'

// Wait for an actual scrypt result, then hold its return to Accounts. No fake credential algorithm.
export function holdDerivation(credentials: CredentialsService) {
  const reached = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const derive = credentials.derive.bind(credentials)
  vi.spyOn(credentials, 'derive').mockImplementation(async value => {
    const result = await derive(value)
    reached.resolve()
    await release.promise
    return result
  })
  return { reached: reached.promise, release: release.resolve }
}
