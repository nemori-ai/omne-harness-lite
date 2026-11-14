import { tenantEquals } from '@omne-harness/legal-identity'
import {
  commandDigest,
  type SessionAccessCheck,
  type SessionAccessRequest,
  type SessionCheckedAccess,
  type SessionCommand,
} from '@omne-harness/session-contract'

function sameCheckedCommand(left: SessionCommand, right: SessionCommand): boolean {
  const strip = (command: SessionCommand): SessionCommand => {
    const { expected: _expected, ...input } = command.input as Record<string, unknown>
    return { kind: command.kind, input } as SessionCommand
  }
  return (
    left.kind === right.kind &&
    left.input.operation === right.input.operation &&
    commandDigest(strip(left)) === commandDigest(strip(right))
  )
}

export function withinBinding<P>(
  bound: SessionAccessRequest<P>,
  request: SessionAccessRequest<P>,
): boolean {
  if (bound.target.kind !== 'session' || request.target.kind !== 'session') return false
  if (!('tenant' in bound.access) || !('tenant' in request.access)) return false
  if (!tenantEquals(bound.access.tenant, request.access.tenant)) return false
  if (bound.target.session !== request.target.session) return false
  if (!('command' in request.target)) return true
  return (
    'command' in bound.target && sameCheckedCommand(bound.target.command, request.target.command)
  )
}

export function boundAccessCheck<P>(checked: SessionCheckedAccess<P>): SessionAccessCheck<P> {
  return {
    check: request =>
      Promise.resolve(
        withinBinding(checked.request, request)
          ? {
              kind: 'allowed',
              evidence: checked.evidence,
              ...(checked.writeQualification === undefined
                ? {}
                : { writeQualification: checked.writeQualification }),
            }
          : { kind: 'denied' },
      ),
  }
}
