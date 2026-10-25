import type { AssemblyInput, AssemblyResult, PreparedInputKey } from './values.js'
import type { HistoryRow } from './ports.js'
import type { OperationContext } from './operation-context.js'
import { assembleInputs } from './assembly.js'
import { invalid } from './compaction-request.js'
/** Re-assembles after a committed compaction; the third group must carry a full snapshot (RQ-06). */
export async function resumeInputs<P>(
  input: AssemblyInput<P>,
  key: PreparedInputKey,
  rows: readonly HistoryRow[],
  context: OperationContext<P>,
): Promise<AssemblyResult> {
  if (
    input.contextRead.read.kind !== 'success' ||
    !('viewRevision' in input.contextRead.read.value)
  )
    return { kind: 'invalid', field: 'contextRead', reason: 'resume-without-full-snapshot' }
  const transition = input.transition
  if (transition === null) return invalid('missing-input', 'context.transition')
  if (transition.candidate !== input.identity.candidate || transition.epoch !== input.history.epoch)
    return invalid('plan-mismatch')
  return assembleInputs(input, key, rows, context)
}
