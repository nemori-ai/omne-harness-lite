import type { FacilityResult, OutputPolicy } from '@omne-harness/execution-environment-contract'

export function completedInDirectory<T>(
  requestId: string,
  value: T,
  directory: string | undefined,
): FacilityResult<T> {
  return directory === undefined
    ? { kind: 'done', requestId, value }
    : { kind: 'done', requestId, value, verifiedDirectories: [directory] }
}

export function outputPolicyOf(
  settings: Pick<OutputPolicy, 'maxBufferedBytes' | 'maxChunkBytes'>,
): OutputPolicy {
  return Object.freeze({
    maxBufferedBytes: settings.maxBufferedBytes,
    maxChunkBytes: settings.maxChunkBytes,
    overflow: 'discard',
  })
}
