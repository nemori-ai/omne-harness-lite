import type { ExecutionRef, ResultStoreFailure } from '@omne-harness-lite/tool-execution-runtime'
import type { createRecords } from './records.ts'
import { fileKey, same } from './records.ts'
import { captureResult, originalMatches } from './values.ts'

export async function readStoredResult(
  records: ReturnType<typeof createRecords>,
  ref: ExecutionRef,
  returned: unknown,
) {
  const stored = await records.read(fileKey(ref, ['result']))
  if (typeof stored === 'string') return unavailable()
  const value = captureResult(stored.value)
  if (
    stored.format !== 'tool-result-files/1' ||
    stored.kind !== 'result' ||
    Object.keys(stored).length !== 3 ||
    !value ||
    !same(value.ref, ref) ||
    !originalMatches(value, returned)
  )
    return unavailable()
  return { kind: 'found' as const, value }
}
function unavailable(): ResultStoreFailure {
  return { kind: 'rejected', reason: 'storageUnavailable' }
}
