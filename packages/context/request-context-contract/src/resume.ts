import type { AssemblyInput, AssemblyResult, TransitionEvidence } from './values.js'
import type { AssemblyPolicies, AssemblyPorts } from './ports.js'
import { assemble } from './assembly.js'
import { invalid } from './compaction-request.js'
export async function resume<P>(
  input: AssemblyInput<P> & Readonly<{ transition: TransitionEvidence }>,
  ports: AssemblyPorts<P>,
  policies: AssemblyPolicies,
): Promise<AssemblyResult> {
  if (
    input.contextRead.read.kind !== 'success' ||
    !('viewRevision' in input.contextRead.read.value)
  )
    return { kind: 'invalid', field: 'contextRead', reason: 'resume-without-full-snapshot' }
  if (
    input.transition.candidate !== input.identity.candidate ||
    input.transition.epoch !== input.history.epoch
  )
    return invalid('plan-mismatch')
  return assemble(input, ports, policies)
}
