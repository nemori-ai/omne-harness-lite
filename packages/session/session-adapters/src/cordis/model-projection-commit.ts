import { createHash } from 'node:crypto'
import {
  deriveSessionOperation,
  type SessionCommand,
  type SessionId,
  type SessionRevision,
} from '@omne-harness/session-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type { ModelHistoryProjection } from './model-reminders.ts'

/** A qualified removal changes the native view, never the original messages. */
export function projectionCommand(
  input: Readonly<{
    tenant: TenantId
    session: SessionId
    scope: ScopeRef
    at: SessionRevision
    projection: ModelHistoryProjection
  }>,
): Extract<SessionCommand, { kind: 'commitDerived' }> {
  const source = {
    owner: '@omne-harness/session-adapters/workspace-guidance',
    record: `${input.scope.ref}/projection/at/${input.at}`,
    revision: String(input.at),
    digest: 'sha256:' + createHash('sha256').update(JSON.stringify(input.projection)).digest('hex'),
  }
  return {
    kind: 'commitDerived',
    input: {
      tenant: input.tenant,
      session: input.session,
      expected: input.at,
      operation: deriveSessionOperation({
        kind: 'model-projection',
        session: input.session,
        source,
      }),
      value: { kind: 'model-projection', ...input.projection, source },
    },
  }
}
