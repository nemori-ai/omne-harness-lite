import type {
  EnvironmentProvider,
  EnvironmentRejection,
  EnvironmentLease,
} from '@omne-harness-lite/execution-environments'

export interface ProviderEntry {
  readonly provider: EnvironmentProvider
  active: boolean
  readonly jobs: Set<Promise<unknown>>
  readonly provisional: Set<EnvironmentLease>
  dispose(): Promise<void>
}

/** Every pending original lease remains owned by this registration until release confirms. */
export async function releaseProvisional(entry: ProviderEntry): Promise<void> {
  const results = await Promise.allSettled(
    [...entry.provisional].map(async lease => {
      const result = await lease.release()
      if (result.kind !== 'released') throw new Error('original provisional cleanup pending')
      entry.provisional.delete(lease)
    }),
  )
  if (results.some(result => result.status === 'rejected'))
    throw new Error('environment provisional cleanup pending; original leases retained')
}
export const rejectEnvironment = <R extends EnvironmentRejection['reason']>(
  reason: R,
): EnvironmentRejection & { readonly reason: R } => ({ kind: 'rejected', reason })

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
