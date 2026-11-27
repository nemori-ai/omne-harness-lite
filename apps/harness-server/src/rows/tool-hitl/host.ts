import { randomBytes } from 'node:crypto'
import type { CardRef, Origin } from '@omne-harness/human-intervention'
import type { CardChangeListener, CardChanges } from '@omne-harness/human-intervention-access'
import {
  createHitlStandingDestination,
  createIndependentHitlApplication,
  independentControlCommands,
  type IndependentCommand,
} from '@omne-harness/human-intervention-local'
import type {
  ActingForTenantPrincipal,
  PrincipalVerifier,
  StandingDestinationResolver,
  StandingReservations,
  TenantStandingSource,
} from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import { runLiveGuardFacts } from '@omne-harness/session-storage-sql/participants'
import type {
  CommitResultV2,
  DomainRef,
  FactCommandV2,
  SqlStorage,
  TenantDomainLookup,
} from '@omne-harness/sql-contract'
import { canonicalDigest } from '@omne-harness/tool'
import { toolWaitOpenGuardFacts } from '@omne-harness/tool-storage-sql'

export const HITL_DESTINATION = 'harness.hitl'
export const HITL_LOCATION = 'local'
const HITL_RESERVATION_OWNER = 'human-intervention'

export type HitlApplication = ReturnType<typeof createIndependentHitlApplication>

// A card of a Run holds while that Run is live; a card of a call that outlives its Run holds while the call still waits.
export function toolOriginGuards(tenant: string): (origin: Origin) => readonly FactCommandV2[] {
  return origin => {
    if (origin.sessionRef === undefined) return []
    if (origin.runRef !== undefined)
      return [runLiveGuardFacts({ tenant, session: origin.sessionRef, run: origin.runRef })]
    if (origin.kind !== 'tool') return []
    return [toolWaitOpenGuardFacts({ tenant, call: origin.toolCallRef, wait: origin.positionRef })]
  }
}

export type ToolHitlHostInput = Readonly<{
  storage: SqlStorage
  domains: TenantDomainLookup
  combination: Readonly<{ combinationVersion: string; manifestDigest: string }>
  verifier: () => PrincipalVerifier | undefined
  standing: () => TenantStandingSource | undefined
  reservations: () => StandingReservations | undefined
  /** The moment a batch of cards is registered; a clock that cannot answer leaves the moment out. */
  now: () => string
  decided?: (
    input: Readonly<{
      application: HitlApplication
      access: ActingForTenantPrincipal
      card: CardRef
    }>,
  ) => void
}>

type Tenant = Readonly<{
  domain: DomainRef
  application: HitlApplication
  destination: StandingDestinationResolver
}>

export type TenantHitl =
  | Readonly<{ kind: 'ready'; tenant: Tenant }>
  | Readonly<{ kind: 'unregistered' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type ToolHitlHost = Readonly<{
  tenant(tenant: string): Promise<TenantHitl>
  prepare(
    tenant: Tenant,
    command: Extract<IndependentCommand, { kind: 'prepare' }>,
  ): Promise<CommitResultV2>
  destination: StandingDestinationResolver
  qualify(tenant: string, principal: ActingForTenantPrincipal): Promise<Qualification>
  changes: CardChanges
  close(): Promise<void>
}>

export type Qualification =
  | Readonly<{ kind: 'qualified' }>
  | Readonly<{ kind: 'denied'; reason: string }>
  | Readonly<{ kind: 'unavailable'; reason: string }>

function prepareKey(command: Extract<IndependentCommand, { kind: 'prepare' }>): string {
  return canonicalDigest(['tool-hitl/prepare', command.operation]).replace(/^sha256:/, '')
}

export function withDecided(
  application: HitlApplication,
  decided: ToolHitlHostInput['decided'],
): HitlApplication {
  if (decided === undefined) return application
  return {
    ...application,
    async submitReply(access, command) {
      const result = await application.submitReply(access, command)
      if (result.kind === 'decided')
        try {
          decided({ application, access, card: command.cardRef })
        } catch {}
      return result
    },
  }
}

function signalled<A extends readonly unknown[], R>(
  write: (...args: A) => Promise<R>,
  changed: () => void,
): (...args: A) => Promise<R> {
  return async (...args) => {
    try {
      return await write(...args)
    } finally {
      changed()
    }
  }
}

export function withChanges(application: HitlApplication, changed: () => void): HitlApplication {
  return {
    ...application,
    registerRequest: signalled(application.registerRequest, changed),
    submitReply: signalled(application.submitReply, changed),
    invalidateWait: signalled(application.invalidateWait, changed),
    acknowledgeDelivery: signalled(application.acknowledgeDelivery, changed),
    bindReceiver: signalled(application.bindReceiver, changed),
    consumeDecision: signalled(application.consumeDecision, changed),
  }
}

type CardSignals = Readonly<{
  changes: CardChanges
  changed(tenant: string): void
  close(): void
}>

function createCardSignals(): CardSignals {
  const listeners = new Map<string, Set<{ listener: CardChangeListener }>>()
  let closed = false
  const tell = (
    entries: Iterable<{ listener: CardChangeListener }>,
    what: 'changed' | 'closed',
  ) => {
    for (const entry of entries)
      try {
        entry.listener[what]()
      } catch {}
  }
  return {
    changes: Object.freeze({
      subscribe(tenant: string, listener: CardChangeListener) {
        if (closed) {
          tell([{ listener }], 'closed')
          return () => {}
        }
        const entry = { listener }
        const set = listeners.get(tenant) ?? new Set()
        set.add(entry)
        listeners.set(tenant, set)
        return () => {
          set.delete(entry)
          if (set.size === 0 && listeners.get(tenant) === set) listeners.delete(tenant)
        }
      },
    }),
    changed(tenant) {
      const set = listeners.get(tenant)
      if (set !== undefined) tell(set, 'changed')
    },
    close() {
      closed = true
      const all = [...listeners.values()].flatMap(set => [...set])
      listeners.clear()
      tell(all, 'closed')
    },
  }
}

export function createToolHitlHost(input: ToolHitlHostInput): ToolHitlHost {
  const cursorKey = randomBytes(32)
  const tenants = new Map<string, Tenant>()
  const signals = createCardSignals()
  let closed = false

  const tenant = async (text: string): Promise<TenantHitl> => {
    if (closed) return { kind: 'unavailable', diagnostic: 'the HITL host is closed' }
    const known = tenants.get(text)
    if (known !== undefined) return { kind: 'ready', tenant: known }
    const verifier = input.verifier()
    const standing = input.standing()
    const reservations = input.reservations()
    if (verifier === undefined || standing === undefined || reservations === undefined)
      return { kind: 'unavailable', diagnostic: 'identity reads are absent' }
    const found = await input.domains.lookup({ tenant: text })
    if (found.kind === 'unregistered') return found
    if (found.kind !== 'ready')
      return { kind: 'unavailable', diagnostic: `tenant domain lookup answered ${found.kind}` }
    if (found.domain.scope.kind !== 'tenant' || found.domain.scope.tenant !== text)
      return {
        kind: 'unavailable',
        diagnostic: 'the tenant domain directory answered another scope',
      }
    const raced = tenants.get(text)
    if (raced !== undefined) return { kind: 'ready', tenant: raced }
    const terminal = {
      storage: input.storage,
      domain: found.domain,
      combinationVersion: input.combination.combinationVersion,
      manifestDigest: input.combination.manifestDigest,
    }
    const application = createIndependentHitlApplication({
      ...terminal,
      destination: HITL_DESTINATION,
      required: [],
      identity: { verifier, standing, reservations },
      locationRef: HITL_LOCATION,
      cursorKey,
      guards: toolOriginGuards(text),
      clock: { now: input.now },
    })
    const made: Tenant = {
      domain: found.domain,
      application: withChanges(withDecided(application, input.decided), () =>
        signals.changed(text),
      ),
      destination: createHitlStandingDestination({ ...terminal, destination: HITL_DESTINATION }),
    }
    tenants.set(text, made)
    return { kind: 'ready', tenant: made }
  }

  return Object.freeze({
    tenant,
    prepare: (at, command) =>
      input.storage.commit({
        identity: {
          scope: at.domain.scope,
          transactionDomain: at.domain.transactionDomain,
          operation: 'hitl.command',
          protocolVersion: '2',
          operationKey: prepareKey(command),
        },
        combinationVersion: input.combination.combinationVersion,
        manifestDigest: input.combination.manifestDigest,
        commands: independentControlCommands(command),
      }),
    async qualify(text, principal) {
      const verifier = input.verifier()
      const standing = input.standing()
      if (verifier === undefined || standing === undefined)
        return { kind: 'unavailable', reason: 'identity reads are absent' }
      try {
        const verified = await verifier.verify(principal)
        if (verified.kind === 'unavailable')
          return { kind: 'unavailable', reason: 'identity-verifier' }
        if (verified.kind !== 'verified' || verified.principal.kind !== 'acting-for-tenant')
          return { kind: 'denied', reason: 'principal' }
        const own = tenantCodec.encode(verified.principal.tenant)
        if (!own.ok || own.value !== text) return { kind: 'denied', reason: 'tenant' }
        const read = await standing.read({ tenant: verified.principal.tenant })
        if (read.kind === 'unavailable') return { kind: 'unavailable', reason: 'identity-standing' }
        return read.kind === 'member'
          ? { kind: 'qualified' }
          : { kind: 'denied', reason: 'qualification' }
      } catch {
        return { kind: 'unavailable', reason: 'identity-read' }
      }
    },
    destination: {
      async seal(reservation) {
        const scope = reservation.binding.scopeRef
        const at = await tenant(scope)
        if (at.kind === 'ready') return at.tenant.destination.seal(reservation)
        return {
          kind: 'unavailable',
          diagnostic: at.kind === 'unregistered' ? 'the tenant has no domain' : at.diagnostic,
        }
      },
    },
    changes: signals.changes,
    async close() {
      closed = true
      signals.close()
      const open = [...tenants.values()]
      tenants.clear()
      await Promise.allSettled(open.map(entry => entry.application.close()))
    },
  })
}

export function isHitlReservation(
  reservation: Parameters<StandingDestinationResolver['seal']>[0],
): boolean {
  return (
    reservation.binding.owner === HITL_RESERVATION_OWNER &&
    reservation.binding.destination === HITL_DESTINATION
  )
}
