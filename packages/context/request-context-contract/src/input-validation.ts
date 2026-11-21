import { tenantEquals } from '@omne-harness/legal-identity'
import type { AssemblyInput, AssemblyFailure } from './values.js'
export function validateInput<P>(input: AssemblyInput<P>): AssemblyFailure | null {
  const binding = validateBinding(input)
  if (binding !== null) return binding
  return validateTarget(input)
}
function validateTarget<P>(input: AssemblyInput<P>): AssemblyFailure | null {
  const target = input.target
  if (!tenantEquals(input.history.target.tenant, target.tenant))
    return { kind: 'invalid', field: 'history.evidence.target', reason: 'tenant-mismatch' }
  const adopted = input.adopted
  if (adopted === null) return null
  if (
    !tenantEquals(adopted.target.tenant, target.tenant) ||
    !tenantEquals(adopted.call.tenant, target.tenant)
  )
    return { kind: 'invalid', field: 'history.adopted', reason: 'tenant-mismatch' }
  if (adopted.target.scope.ref !== target.scope.ref)
    return { kind: 'invalid', field: 'history.adopted', reason: 'source-evidence-conflict' }
  return null
}
function validateBinding<P>(input: AssemblyInput<P>): AssemblyFailure | null {
  if (input.identity.access === undefined || input.identity.access === null)
    return { kind: 'invalid', field: 'access', reason: 'missing-access' }
  if (input.inputs.saved === null)
    return { kind: 'invalid', field: 'inputs.saved', reason: 'inputs-not-saved' }
  if (
    input.history.target.scope.ref !== input.target.scope.ref ||
    input.target.scope.ref !== input.assembleContext.scope.ref
  )
    return { kind: 'invalid', field: 'scope', reason: 'scope-mismatch' }
  if (input.selection.profile.availability !== 'active')
    return { kind: 'invalid', field: 'selection.profile', reason: 'profile-binding-conflict' }
  return null
}
