import type { GovernanceUse } from '@omne-harness-lite/governance-client-operations'

/** Own only this use. Preserve both original errors when work and close fail. */
export async function usingGovernanceUse<T>(
  use: GovernanceUse,
  work: (use: GovernanceUse) => Promise<T>,
): Promise<T> {
  let failure: unknown,
    failed = false
  try {
    return await work(use)
  } catch (error) {
    failed = true
    failure = error
    throw error
  } finally {
    try {
      await use.close()
    } catch (close) {
      if (failed) throw new AggregateError([failure, close], 'governance work and use close failed')
      throw close
    }
  }
}
