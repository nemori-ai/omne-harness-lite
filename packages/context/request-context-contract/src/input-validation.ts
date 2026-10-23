import type { AssemblyPorts } from './ports.js'
import type { AssemblyUnknown } from './values.js'
import type { AssemblyInput, AssemblyFailure } from './values.js'
export function validateInput<P>(input: AssemblyInput<P>): AssemblyFailure | null {
  const binding = validateBinding(input)
  if (binding !== null) return binding
  const material = validateContextMaterial(input)
  if (material !== null) return material
  return contextReadFailure(input.contextRead.read)
}
function validateBinding<P>(input: AssemblyInput<P>): AssemblyFailure | null {
  if (input.identity.access === undefined || input.identity.access === null)
    return { kind: 'invalid', field: 'identity.access', reason: 'missing-access' }
  if (input.inputs.saved === null)
    return { kind: 'invalid', field: 'inputs.saved', reason: 'inputs-not-saved' }
  if (
    input.history.scope.ref !== input.assembleContext.scope.ref ||
    input.history.scope.ref !== input.contextRead.scope.ref
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
    input.contextRead.snapshot.scope.ref !== input.history.scope.ref
  )
    return { kind: 'invalid', field: 'contextRead.snapshot.scope', reason: 'scope-mismatch' }
  if (read.kind === 'success' && read.value.scope.ref !== input.history.scope.ref)
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

export function validateAssembly<P>(
  input: AssemblyInput<P>,
  ports: AssemblyPorts<P>,
): AssemblyFailure | AssemblyUnknown | null {
  if (ports.history === undefined)
    return { kind: 'unavailable', owner: 'history-source', diagnostic: 'History port is absent' }
  if (ports.meter === undefined || ports.serializer === undefined)
    return {
      kind: 'unavailable',
      owner: 'meter',
      diagnostic: 'Meter or actual serializer port is absent',
    }
  if (ports.conversions === undefined)
    return {
      kind: 'unavailable',
      owner: 'conversion-results',
      diagnostic: 'Conversion result port is absent',
    }
  const invalid = validateInput(input)
  if (invalid !== null) return invalid
  if (input.contextRead.read.kind === 'unknown')
    return { kind: 'unknown', source: 'read', diagnostic: input.contextRead.read.cause }
  return null
}
