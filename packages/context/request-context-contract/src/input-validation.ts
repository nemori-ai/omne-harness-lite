import { tenantEquals } from '@omne-harness/legal-identity'
import type { AssemblyUnknown } from './values.js'
import type { AssemblyInput, AssemblyFailure } from './values.js'
/** Cross-group relations of stably read groups; each group being stable does not make them hold. */
export function validateInput<P>(
  input: AssemblyInput<P>,
): AssemblyFailure | AssemblyUnknown | null {
  const binding = validateBinding(input)
  if (binding !== null) return binding
  const target = validateTarget(input)
  if (target !== null) return target
  const material = validateContextMaterial(input)
  if (material !== null) return material
  const read = contextReadFailure(input.contextRead.read)
  if (read !== null) return read
  if (input.contextRead.read.kind === 'unknown')
    return { kind: 'unknown', source: 'read', diagnostic: input.contextRead.read.cause }
  return null
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
    return { kind: 'invalid', field: 'context.adopted', reason: 'tenant-mismatch' }
  if (adopted.target.scope.ref !== target.scope.ref)
    return { kind: 'invalid', field: 'context.adopted', reason: 'source-evidence-conflict' }
  return null
}
function validateBinding<P>(input: AssemblyInput<P>): AssemblyFailure | null {
  if (input.identity.access === undefined || input.identity.access === null)
    return { kind: 'invalid', field: 'access', reason: 'missing-access' }
  if (input.inputs.saved === null)
    return { kind: 'invalid', field: 'inputs.saved', reason: 'inputs-not-saved' }
  if (
    input.history.target.scope.ref !== input.target.scope.ref ||
    input.target.scope.ref !== input.assembleContext.scope.ref ||
    input.target.scope.ref !== input.contextRead.scope.ref
  )
    return { kind: 'invalid', field: 'scope', reason: 'scope-mismatch' }
  if (
    input.contextRead.recipient !==
    `${input.selection.recipient.route}/${input.selection.recipient.model}`
  )
    return { kind: 'invalid', field: 'contextRead.recipient', reason: 'profile-binding-conflict' }
  if (input.selection.profile.availability !== 'active')
    return { kind: 'invalid', field: 'selection.profile', reason: 'profile-binding-conflict' }
  return null
}
function validateContextMaterial<P>(input: AssemblyInput<P>): AssemblyFailure | null {
  const read = input.contextRead.read
  if (
    input.contextRead.snapshot !== null &&
    input.contextRead.snapshot.scope.ref !== input.target.scope.ref
  )
    return { kind: 'invalid', field: 'contextRead.snapshot.scope', reason: 'scope-mismatch' }
  if (read.kind === 'success' && read.value.scope.ref !== input.target.scope.ref)
    return { kind: 'invalid', field: 'contextRead.read.scope', reason: 'scope-mismatch' }
  if (
    read.kind === 'success' &&
    'viewRevision' in read.value &&
    input.contextRead.snapshot !== null &&
    read.value.viewRevision !== input.contextRead.snapshot.revision
  )
    return {
      kind: 'invalid',
      field: 'contextRead.snapshot.revision',
      reason: 'missing-snapshot-material',
    }
  return null
}
function contextReadFailure(
  read: AssemblyInput<unknown>['contextRead']['read'],
): AssemblyFailure | null {
  if (read.kind === 'refused')
    return read.reason === 'unauthorized'
      ? { kind: 'denied', action: 'assemble', diagnostic: read.reason }
      : { kind: 'unavailable', owner: 'runtime-context', diagnostic: read.reason }
  if (read.kind === 'missing')
    return {
      kind: 'unavailable',
      owner: 'runtime-context',
      diagnostic: 'Required runtime context unavailable',
    }
  if (read.kind === 'cursor-invalidated')
    return { kind: 'invalid', field: 'contextRead', reason: 'cursor-invalidated' }
  return null
}
