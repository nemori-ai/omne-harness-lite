import type { AuthorizationContext, WorkSnapshot } from '@omne-harness/session-contract'
import type { SessionAuthorizations } from '../permission-current.ts'
import { big, oneRow, text, type Executor, type Scope } from './support.ts'

type Consumer = Readonly<{ owner: string; work: string; position: string }>
type Asked = Readonly<{ capabilityId: string; enforcementKey: string; consumer: Consumer | null }>

const gateOf = (capabilityId: string, enforcementKey: string): string =>
  JSON.stringify([capabilityId, enforcementKey])

/** The once authorization in force for one action, by its key. */
export function onceAuthorizationOf(
  port: Executor,
  scope: Scope,
  consumer: Consumer,
): SessionAuthorizations['once'] {
  const row = oneRow(
    port,
    'SELECT target, arguments, source FROM sl_authorization_once WHERE tenant = ? AND session = ? AND owner = ? AND work = ? AND position = ? LIMIT 1',
    [scope.tenant, scope.session, consumer.owner, consumer.work, consumer.position],
  )
  return row === undefined
    ? null
    : {
        consumer,
        target: text(row['target']),
        argumentsDigest: text(row['arguments']),
        source: JSON.parse(text(row['source'])),
      }
}

/** The session authorization in force for one gate, by its key. */
export function sessionAuthorizationOf(
  port: Executor,
  scope: Scope,
  capabilityId: string,
  enforcementKey: string,
): SessionAuthorizations['session'] {
  const row = oneRow(
    port,
    'SELECT basis, source FROM sl_authorization_session WHERE tenant = ? AND session = ? AND gate = ? LIMIT 1',
    [scope.tenant, scope.session, gateOf(capabilityId, enforcementKey)],
  )
  return row === undefined
    ? null
    : {
        capabilityId,
        enforcementKey,
        basis: text(row['basis']),
        source: JSON.parse(text(row['source'])),
      }
}

/** The authorizations in force for one gate and one action, each read by its key. */
export function readAuthorizations(
  port: Executor,
  scope: Scope,
  asked: Asked,
): SessionAuthorizations {
  const head = oneRow(
    port,
    'SELECT revision FROM sl_authorization_head WHERE tenant = ? AND session = ? LIMIT 1',
    [scope.tenant, scope.session],
  )
  if (head === undefined) return { revision: '0', once: null, session: null }
  const { consumer } = asked
  return {
    revision: String(big(head['revision'])),
    once: consumer === null ? null : onceAuthorizationOf(port, scope, consumer),
    session: sessionAuthorizationOf(port, scope, asked.capabilityId, asked.enforcementKey),
  }
}

function rewrite(port: Executor, scope: Scope, context: AuthorizationContext): void {
  const where = [scope.tenant, scope.session] as const
  port.execute('DELETE FROM sl_authorization_once WHERE tenant = ? AND session = ?', where)
  port.execute('DELETE FROM sl_authorization_session WHERE tenant = ? AND session = ?', where)
  for (const row of context.once)
    port.execute(
      'INSERT INTO sl_authorization_once (tenant, session, owner, work, position, target, arguments, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        ...where,
        row.consumer.owner,
        row.consumer.work,
        row.consumer.position,
        row.target,
        row.argumentsDigest,
        JSON.stringify(row.source),
      ],
    )
  for (const row of context.session)
    port.execute(
      'INSERT INTO sl_authorization_session (tenant, session, gate, basis, source) VALUES (?, ?, ?, ?, ?)',
      [
        ...where,
        gateOf(row.capabilityId, row.enforcementKey),
        row.basis,
        JSON.stringify(row.source),
      ],
    )
}

// The rows are the snapshot's authorizations, rewritten in the commit that changes them: a session
// holds a row per action still to start and one per gate, so the rewrite stays small.
export function writeAuthorizations(
  port: Executor,
  scope: Scope,
  previous: WorkSnapshot | null,
  snapshot: WorkSnapshot,
): void {
  const { authorizations } = snapshot
  if (previous?.authorizations.revision === authorizations.revision) return
  if (previous === null && authorizations.revision === '0') return
  rewrite(port, scope, authorizations)
  port.execute(
    `INSERT INTO sl_authorization_head (tenant, session, revision) VALUES (?, ?, ?)
      ON CONFLICT (tenant, session) DO UPDATE SET revision = excluded.revision`,
    [scope.tenant, scope.session, BigInt(authorizations.revision)],
  )
}
