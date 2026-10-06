import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { SessionAccessAuthorityService } from '@omne-harness-lite/session-tenancy/cordis'
import type {
  AccessIdentity,
  AccessOperation,
  Consumer,
  SessionAccessAuthorityOperations,
  SessionScope,
} from '@omne-harness-lite/session-tenancy'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { AuthenticatedActor } from './types.ts'

type Check = 'authorized' | 'notAuthorized' | 'unavailable'
interface Entry {
  readonly identity: AccessIdentity
  readonly actor: AuthenticatedActor
  readonly operations: ReadonlySet<AccessOperation>
}
const sameScope = (left: SessionScope, right: SessionScope) =>
  left.session === right.session && tenantIdEquals(left.tenant, right.tenant)
function sameIdentity(left: AccessIdentity, right: AccessIdentity) {
  return (
    left.binding === right.binding &&
    left.principal === right.principal &&
    left.principalKind === right.principalKind &&
    left.consumer === right.consumer &&
    sameScope(left.scope, right.scope) &&
    left.contextKeys.length === right.contextKeys.length &&
    left.contextKeys.every(key => right.contextKeys.includes(key))
  )
}
const rejected = (reason: 'notAuthorized' | 'unavailable' | 'ownerStopped') => ({
  kind: 'rejected' as const,
  reason,
})

/** Private application construction. No Cordis service exposes enter or creates an ingress. */
export function createSessionIngress(
  checkCurrent: (actor: AuthenticatedActor, scope: SessionScope) => Promise<Check>,
) {
  const entries = new Map<string, Entry>()
  let active = true
  async function current(actor: AuthenticatedActor, scope: SessionScope): Promise<Check> {
    try {
      return await checkCurrent(actor, scope)
    } catch {
      return 'unavailable'
    }
  }
  const operations: SessionAccessAuthorityOperations = {
    async check(identity, operation) {
      if (!active) return rejected('ownerStopped')
      const entry = entries.get(identity?.binding)
      if (!entry || !sameIdentity(identity, entry.identity) || !entry.operations.has(operation))
        return rejected('notAuthorized')
      const verdict = await current(entry.actor, entry.identity.scope)
      if (!active) return rejected('ownerStopped')
      if (entries.get(entry.identity.binding) !== entry) return rejected('notAuthorized')
      if (verdict !== 'authorized') {
        // A revoked ingress cannot revive if later logins or memberships become valid.
        if (verdict === 'notAuthorized') entries.delete(entry.identity.binding)
        return rejected(verdict)
      }
      return { kind: 'authorized', identity: entry.identity }
    },
  }
  return Object.freeze({
    operations: Object.freeze(operations),
    async enter(
      actor: AuthenticatedActor,
      scope: SessionScope,
      consumer: Consumer,
      contextKeys: readonly string[],
      permitted: readonly AccessOperation[],
    ) {
      if (!active) return rejected('ownerStopped')
      const ownedActor = Object.freeze({ ...actor, tenant: Object.freeze({ ...actor.tenant }) })
      const ownedScope = Object.freeze({
        session: scope.session,
        tenant: Object.freeze({ ...scope.tenant }),
      })
      const keys = Object.freeze([...contextKeys]),
        allowed = new Set(permitted)
      const verdict = await current(ownedActor, ownedScope)
      if (!active) return rejected('ownerStopped')
      if (verdict !== 'authorized') return rejected(verdict)
      const identity: AccessIdentity = Object.freeze({
        binding: randomUUID(),
        principal: ownedActor.account,
        principalKind: 'human',
        scope: ownedScope,
        consumer,
        contextKeys: keys,
      })
      entries.set(identity.binding, { identity, actor: ownedActor, operations: allowed })
      return { kind: 'entered' as const, identity }
    },
    revoke(binding: string) {
      entries.delete(binding)
    },
    stop() {
      active = false
      entries.clear()
    },
  })
}

export class SessionIngressAuthority extends SessionAccessAuthorityService {
  constructor(
    ctx: Context,
    private readonly operations: SessionAccessAuthorityOperations,
  ) {
    super(ctx)
  }
  check(...args: Parameters<SessionAccessAuthorityOperations['check']>) {
    return this.operations.check(...args)
  }
}
