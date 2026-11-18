import type { AuthorizationContext, WorkSnapshot } from '@omne-harness/session-contract'
import type { SessionAuthorizations } from '../permission-current.ts'
import { big, oneRow, text, type Executor, type Scope } from './support.ts'

type Consumer = Readonly<{ owner: string; work: string; position: string }>
type Asked = Readonly<{ capabilityId: string; enforcementKey: string; consumer: Consumer | null }>

const gateOf = (capabilityId: string, enforcementKey: string): string =>
  JSON.stringify([capabilityId, enforcementKey])

/** The authorizations in force for one gate and one action, each read by its key. */
export function readAuthorizations(
  port: Executor,
  scope: Scope,
  asked: Asked,
): SessionAuthorizations {
  const where = [scope.tenant, scope.session] as const
  const head = oneRow(
    port,
    'SELECT revision FROM sl_authorization_head WHERE tenant = ? AND session = ? LIMIT 1',
    where,
  )
  if (head === undefined) return { revision: '0', once: null, session: null }
  const { consumer } = asked
  const once =
    consumer === null
      ? undefined
      : oneRow(
          port,
          'SELECT target, arguments, source FROM sl_authorization_once WHERE tenant = ? AND session = ? AND owner = ? AND work = ? AND position = ? LIMIT 1',
          [...where, consumer.owner, consumer.work, consumer.position],
        )
  const session = oneRow(
    port,
    'SELECT basis, source FROM sl_authorization_session WHERE tenant = ? AND session = ? AND gate = ? LIMIT 1',
    [...where, gateOf(asked.capabilityId, asked.enforcementKey)],
  )
  return {
    revision: String(big(head['revision'])),
    once:
      once === undefined || consumer === null
        ? null
        : {
            consumer,
            target: text(once['target']),
            argumentsDigest: text(once['arguments']),
            source: JSON.parse(text(once['source'])),
          },
    session:
      session === undefined
        ? null
        : {
            capabilityId: asked.capabilityId,
            enforcementKey: asked.enforcementKey,
            basis: text(session['basis']),
            source: JSON.parse(text(session['source'])),
          },
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
