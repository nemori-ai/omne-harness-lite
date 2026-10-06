import type {
  EnvironmentProvider,
  EnvironmentRejection,
} from '@omne-harness-lite/execution-environments'

export interface ProviderEntry {
  readonly provider: EnvironmentProvider
  active: boolean
  readonly jobs: Set<Promise<unknown>>
  dispose(): Promise<void>
}
export const rejectEnvironment = (
  reason: EnvironmentRejection['reason'],
): EnvironmentRejection => ({ kind: 'rejected', reason })

/** Retirement retains exactly the callbacks admitted to the original provider. */
export async function observeProvider<T>(entry: ProviderEntry, work: () => Promise<T>): Promise<T> {
  const job = Promise.resolve().then(work)
  entry.jobs.add(job)
  try {
    return await job
  } finally {
    entry.jobs.delete(job)
  }
}
