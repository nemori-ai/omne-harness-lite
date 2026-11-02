// A non-durable double of `AgentInstanceProvision` with the directory that serves its instances.
// It keeps the rules of the provision that a caller can observe: one published instance for each
// slot, one build for the calls of a slot that run at the same time, a new instance after a
// reclaim, and a reclaim that skips an instance which is not idle. A test gives the runtime
// factory, the qualification check and the idle state, as the host plugin gets them from the
// factory, the authorization domain and the registration handle.
import {
  decodeAgentInstanceId,
  decodeAgentRegistrationId,
  judgeAdoption,
  judgeEvidence,
  type Access,
  type AgentDirectory,
  type AgentInstanceId,
  type AgentRuntime,
  type Failure,
  type Registration,
  type Reply,
} from '@omne-harness/agent-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentInstanceProvision, AgentInstanceSlotInput } from './index.ts'

/** What the double asks the qualification check about: the caller's `reserve`, then the host. */
export type ProvisionOperation = 'reserve' | 'publish' | 'quiesce'

export type MemoryInstanceProvisionInput<P> = Readonly<{
  /** Builds the runtime of a slot under the instance that the double minted. */
  create(slot: AgentInstanceSlotInput<P>, instance: AgentInstanceId): Reply<AgentRuntime<P>>
  /**
   * The qualification check. `reserve` asks for the caller. `publish` and `quiesce` ask for the
   * host principal, with the tenant of the instance. It answers allowed when absent.
   */
  check?(access: Access<P>, operation: ProvisionOperation): Outcome<void, Failure>
  /** The principal of the host. When absent the double uses the principal of the caller. */
  hostPrincipal?: P
}>

/** A non-durable double. It must not be assembled into production. */
export interface MemoryInstanceProvision<P> {
  readonly durability: 'none'
  readonly provision: AgentInstanceProvision<P>
  /** `resolve` and `connect` over the published instances. Another tenant gets denied. */
  readonly directory: AgentDirectory<P>
  /** The number of published instances that are not reclaimed. */
  live(): number
  /** Sets the last state that the runtime reported through its registration handle. */
  setIdle(instance: AgentInstanceId, idle: boolean): void
  /** The expiry of `instanceIdleMs` for all instances at once: the reclaim of the guard point. */
  reclaimIdle(): Promise<void>
}

type Held<P> = {
  readonly host: Access<P>
  readonly instance: AgentInstanceId
  readonly registration: Registration
  readonly runtime: AgentRuntime<P>
  readonly slotKey: string
  readonly instanceKey: string
  idle: boolean
}

type Granted = Readonly<{ instance: AgentInstanceId; registration: Registration }>

const invalid = (field: string, reason: string): Failure => ({ kind: 'invalid', field, reason })
const unavailable = (diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: 'memory-provision',
  diagnostic,
})

/** The text of a tenant that the identity parser made, or undefined for any other value. */
function tenantText(value: unknown): string | undefined {
  try {
    const encoded = tenantCodec.encode(value as TenantId)
    return encoded.ok ? encoded.value : undefined
  } catch {
    return undefined
  }
}

/** Creates the double. */
export function createMemoryInstanceProvision<P>(
  input: MemoryInstanceProvisionInput<P>,
): MemoryInstanceProvision<P> {
  const bySlot = new Map<string, Held<P>>()
  const byInstance = new Map<string, Held<P>>()
  const building = new Map<string, Reply<Granted>>()
  let sequence = 0

  const check = (access: Access<P>, operation: ProvisionOperation) =>
    input.check?.(access, operation) ?? succeed(undefined)

  // Step: validate the slot before anyone is asked. A failure names the member.
  function judged(
    raw: AgentInstanceSlotInput<P>,
  ): Outcome<Readonly<{ slot: AgentInstanceSlotInput<P>; tenant: string }>, Failure> {
    try {
      const tenant = tenantText(raw.tenant)
      if (tenant === undefined) return fail(invalid('tenant', 'not made by the identity parser'))
      const scope = judgeEvidence(raw.scope)
      if ('failure' in scope) return fail(invalid('scope', scope.failure.reason))
      const definition = judgeAdoption(raw.definition)
      if ('failure' in definition) return fail(invalid('definition', definition.failure.reason))
      const { principal } = raw
      const slot = { principal, tenant: raw.tenant, scope: scope.ok, definition: definition.ok }
      return succeed({ slot, tenant })
    } catch {
      return fail(invalid('input', 'the input cannot be read'))
    }
  }

  function mint(): Outcome<Granted, Failure> {
    sequence += 1
    const instance = decodeAgentInstanceId(`memory-instance-${sequence}`)
    const registration = decodeAgentRegistrationId(`memory-registration-${sequence}`)
    if ('failure' in instance || 'failure' in registration) return fail(unavailable('no identity'))
    return succeed({
      instance: instance.ok,
      registration: { registration: registration.ok, state: 'published' },
    })
  }

  // Step: build, check the host principal, publish. It never rejects, so the promise that
  // concurrent calls share always settles with an outcome.
  async function build(
    slot: AgentInstanceSlotInput<P>,
    tenant: string,
    slotKey: string,
  ): Promise<Outcome<Granted, Failure>> {
    const minted = mint()
    if ('failure' in minted) return minted
    const { instance, registration } = minted.ok
    let created: Outcome<AgentRuntime<P>, Failure>
    try {
      created = await input.create(slot, instance)
    } catch {
      return fail(unavailable('the factory threw'))
    }
    if ('failure' in created) return created
    const host = { principal: input.hostPrincipal ?? slot.principal, tenant: slot.tenant }
    const allowed = check(host, 'publish')
    if ('failure' in allowed) return allowed
    const instanceKey = JSON.stringify([tenant, instance])
    const held = { host, instance, registration, runtime: created.ok, slotKey, instanceKey }
    const record: Held<P> = { ...held, idle: true }
    bySlot.set(slotKey, record)
    byInstance.set(instanceKey, record)
    return succeed({ instance, registration })
  }

  const provision: AgentInstanceProvision<P> = {
    async acquire(raw) {
      const checked = judged(raw)
      if ('failure' in checked) return checked
      const { slot, tenant } = checked.ok
      const allowed = check({ principal: slot.principal, tenant: slot.tenant }, 'reserve')
      if ('failure' in allowed) return allowed
      const { scope, definition } = slot
      const slotKey = JSON.stringify([
        tenant,
        [scope.owner, scope.record, scope.revision, scope.digest],
        [definition.owner, definition.name, definition.revision, definition.digest],
      ])
      const held = bySlot.get(slotKey)
      if (held !== undefined)
        return succeed({ instance: held.instance, registration: held.registration })
      const shared = building.get(slotKey)
      if (shared !== undefined) return shared
      const started = build(slot, tenant, slotKey)
      building.set(slotKey, started)
      void started.then(() => building.delete(slotKey))
      return started
    },
  }

  function reach(
    access: Access<unknown> & Readonly<{ instance: AgentInstanceId }>,
    action: string,
  ) {
    const tenant = tenantText(access.tenant)
    if (tenant === undefined) return fail(invalid('tenant', 'not made by the identity parser'))
    const held = byInstance.get(JSON.stringify([tenant, access.instance]))
    return held === undefined ? fail<Failure>({ kind: 'denied', action }) : succeed(held)
  }

  const directory: AgentDirectory<P> = {
    async resolve(access) {
      const reached = reach(access, 'resolve')
      return 'failure' in reached ? reached : succeed(reached.ok.runtime)
    },
    async connect(access) {
      const reached = reach(access, 'connect')
      return 'failure' in reached ? reached : succeed({ kind: 'no-live-route' } as const)
    },
  }

  return {
    durability: 'none',
    provision,
    directory,
    live: () => bySlot.size,
    setIdle(instance, idle) {
      const held = [...byInstance.values()].find(entry => entry.instance === instance)
      if (held === undefined)
        throw new TypeError(`the double has no published instance ${instance}`)
      held.idle = idle
    },
    // The guard point. The expiry reads the last reported state, marks the instance and removes it
    // in one step that never yields, so a call that arrives later builds a new instance. An
    // instance that is not idle stays, and so does one whose quiesce the host principal is refused.
    async reclaimIdle() {
      for (const held of bySlot.values()) {
        if (!held.idle) continue
        if ('failure' in check(held.host, 'quiesce')) continue
        bySlot.delete(held.slotKey)
        byInstance.delete(held.instanceKey)
      }
    },
  }
}
