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

export type ProvisionOperation = 'reserve' | 'publish' | 'quiesce'

export type MemoryInstanceProvisionInput<P> = Readonly<{
  create(slot: AgentInstanceSlotInput<P>, instance: AgentInstanceId): Reply<AgentRuntime<P>>
  check?(access: Access<P>, operation: ProvisionOperation): Outcome<void, Failure>
  hostPrincipal?: P
}>

export interface MemoryInstanceProvision<P> {
  readonly durability: 'none'
  readonly provision: AgentInstanceProvision<P>
  readonly directory: AgentDirectory<P>
  live(): number
  setIdle(instance: AgentInstanceId, idle: boolean): void
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

function tenantText(value: unknown): string | undefined {
  try {
    const encoded = tenantCodec.encode(value as TenantId)
    return encoded.ok ? encoded.value : undefined
  } catch {
    return undefined
  }
}

export function createMemoryInstanceProvision<P>(
  input: MemoryInstanceProvisionInput<P>,
): MemoryInstanceProvision<P> {
  const bySlot = new Map<string, Held<P>>()
  const byInstance = new Map<string, Held<P>>()
  const building = new Map<string, Reply<Granted>>()
  let sequence = 0

  const check = (access: Access<P>, operation: ProvisionOperation) =>
    input.check?.(access, operation) ?? succeed(undefined)

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
