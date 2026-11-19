import type { AssemblyInput, AssemblyResult, PreparedInputKey } from './values.js'
import type { HistoryRow } from './ports.js'
import type { OperationContext } from './operation-context.js'
import { assembleInputs } from './assembly.js'
import type { ReuseBasis } from './preparation.js'
import type { AssemblyReuse } from './reuse.js'
export async function resumeInputs<P>(
  input: AssemblyInput<P>,
  key: PreparedInputKey,
  rows: readonly HistoryRow[],
  context: OperationContext<P>,
  basis?: ReuseBasis & Readonly<{ reuse?: AssemblyReuse | undefined }>,
): Promise<AssemblyResult> {
  const transition = input.transition
  if (transition === null)
    return { kind: 'invalid', reason: 'missing-input', field: 'history.transition' }
  if (transition.candidate !== input.identity.candidate || transition.epoch !== input.history.epoch)
    return { kind: 'invalid', reason: 'transition-mismatch', field: 'history.transition' }
  return assembleInputs(input, key, rows, context, basis)
}
