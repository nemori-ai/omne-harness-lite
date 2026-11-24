import type { Context } from '@deepseek-ai/cordis'
import type { Access, TenantId } from '@omne-harness/legal-identity'
import type { SessionCreation, SessionId, WorkSnapshot } from '@omne-harness/session-contract'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'

export type Turn = Readonly<{ access: Access<unknown>; key: string }>

type Stood = Pick<WorkSnapshot, 'creation' | 'changes' | 'run'>

/** The key of the turn a session is in, once it has stood at a workspace; with `last`, of the last turn it had. */
export function turnKeyOf(snapshot: Stood, last = false): string | null {
  const stood =
    snapshot.creation.workspace !== null ||
    (snapshot.changes ?? []).some(change => change.kind === 'workspace' && change.value !== null)
  if (!stood) return null
  const { run } = snapshot
  if (run.kind === 'active') return run.run
  return last && run.kind === 'terminal' ? run.terminal.run : null
}

const readers = new WeakMap<object, Context>()
const maintainers = new WeakMap<object, Context>()

/** The turn of the session a principal works for; null when it has none, undefined when the session cannot be read. */
export async function turnOfSession(
  ctx: Context,
  access: Access<unknown> & Readonly<{ session: SessionId }>,
): Promise<Turn | null | undefined> {
  const scope = readers.get(ctx.root) ?? ctx.intercept(sessionKey, { caller: 'coordinator' })
  readers.set(ctx.root, scope)
  try {
    const read = await scope.get(sessionKey, false)?.work.readWork(access)
    if (read === undefined || 'failure' in read) return undefined
    const key = turnKeyOf(read.ok)
    const { principal, tenant } = access
    return key === null ? null : { access: { principal, tenant }, key }
  } catch {
    return undefined
  }
}

/** The turn an access works in; null when it works for no session or has no turn, undefined when its session cannot be read. */
export async function turnOfAccess(
  ctx: Context,
  access: Access<unknown>,
): Promise<Turn | null | undefined> {
  const work = sessionWorkOf(access.principal, access.tenant)
  if (work === undefined) return null
  return turnOfSession(ctx, { ...access, session: work.session as SessionId })
}

/** The turn of another session, or the last one it had, read as its maintainer: what a dispatch of that turn reads the workspace by. */
export async function lastTurnOf(
  ctx: Context,
  tenant: TenantId,
  session: SessionId,
): Promise<Turn | null | undefined> {
  try {
    const issued = await toolRuntimeHolder(ctx)
      .workPrincipals()
      ?.forSession({ actor: 'maintainer', tenant, session })
    if (issued === undefined || !('ok' in issued)) return undefined
    const scope = maintainers.get(ctx.root) ?? ctx.intercept(sessionKey, { caller: 'maintainer' })
    maintainers.set(ctx.root, scope)
    const access = { principal: issued.ok as unknown, tenant }
    const read = await scope.get(sessionKey, false)?.work.readWork({ ...access, session })
    if (read === undefined || 'failure' in read) return undefined
    const key = turnKeyOf(read.ok, true)
    return key === null ? null : { access, key }
  } catch {
    return undefined
  }
}

export function madeFrom(relation: SessionCreation['relation']): SessionId | null {
  if (relation === undefined || relation === null) return null
  return 'parent' in relation ? relation.parent : 'origin' in relation ? relation.origin : null
}
