import { type Storage, StorageDefect, narrow } from '@omne-harness-lite/storage'

/** Timeout ends the observation; the admitted storage read continues. */
export const STORAGE_PROBE_TIMEOUT_MS = 2_000
interface ProbeTable {
  readonly governance_center: { readonly slot: string }
}
export interface ProbeSources {
  readonly storage: Storage
  readonly reportProbeDefect: (errorName: string) => void
}

/** `storageReachable`：一次只读事务读 `governance_center`，与超时竞速。 */
export async function probeStorage(sources: ProbeSources): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<boolean>(resolve => {
    timer = setTimeout(() => resolve(false), STORAGE_PROBE_TIMEOUT_MS)
  })
  const read = sources.storage
    .read(async tx => {
      await narrow<ProbeTable>(tx).selectFrom('governance_center').select('slot').limit(1).execute()
      return true
    })
    .catch((error: unknown) => {
      if (error instanceof StorageDefect) sources.reportProbeDefect(error.name)
      return false
    })
  try {
    return await Promise.race([read, timeout])
  } finally {
    clearTimeout(timer)
  }
}
