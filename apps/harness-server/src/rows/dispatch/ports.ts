import type {
  AgentDefinitions,
  ContextCopies,
  DispatchAuthority,
  DispatchSessions,
  ReportWaits,
} from '@omne-harness/dispatch'
import { sessionOfDispatch } from '@omne-harness/dispatch-session'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { AgentDefinitionCatalog } from '../agent-adoptions/definition-catalog.ts'
import { verifySessionWork } from '../tool-runtime/session-work.ts'
import type { DispatcherTurns, DispatchHolder } from './holder.ts'

const UNAVAILABLE = { kind: 'unavailable' } as const
const UNKNOWN = { kind: 'unknown' } as const

/** The session port as it is mounted now. While the adapter row is not started every read is unavailable and no write is made. */
export function lateSessions(holder: DispatchHolder): DispatchSessions {
  return {
    sessionOf: sessionOfDispatch,
    row: (...input) => holder.sessions?.row(...input) ?? Promise.resolve(UNAVAILABLE),
    create: (...input) => holder.sessions?.create(...input) ?? Promise.resolve(UNKNOWN),
    startFate: (...input) => holder.sessions?.startFate(...input) ?? Promise.resolve(UNAVAILABLE),
    send: (...input) => holder.sessions?.send(...input) ?? Promise.resolve(UNKNOWN),
    has: (...input) => holder.sessions?.has(...input) ?? Promise.resolve(UNAVAILABLE),
    cancelStart: (...input) => holder.sessions?.cancelStart(...input) ?? Promise.resolve('unknown'),
  }
}

export function lateWaits(holder: DispatchHolder): ReportWaits {
  return { hand: (...input) => holder.waits?.hand(...input) ?? Promise.resolve('unreadable') }
}

export type AuthorityPorts = Readonly<{
  verifier(): PrincipalVerifier | undefined
  /** The system principal of dispatch: the adapter rows read the registry as it. */
  system(): unknown
}>

/** A caller acts as a session when it is the verified work principal of that session in that tenant. */
export function createDispatchAuthority(ports: AuthorityPorts): DispatchAuthority {
  return {
    async decide(ctx, action) {
      const system = ports.system()
      if (system !== undefined && ctx.subject === system)
        return action === 'read' ? 'permitted' : 'denied'
      const tenant = tenantCodec.parse(ctx.tenant)
      if (!tenant.ok) return 'denied'
      const work = await verifySessionWork(ports.verifier(), ctx.subject, tenant.value)
      if (work.kind === 'unavailable') return 'unavailable'
      return work.kind === 'session' && work.session === ctx.session ? 'permitted' : 'denied'
    },
  }
}

/** `turns` gives the turn of the dispatching session: with it the definitions of its workspace are seen too. */
export function definitionsOf(
  catalog: () => AgentDefinitionCatalog | undefined,
  turns?: () => DispatcherTurns | null,
): AgentDefinitions {
  return {
    async typeOf(tenant, name, dispatcher) {
      const legal = tenantCodec.parse(tenant)
      const listing = catalog()
      if (listing === undefined) return UNAVAILABLE
      if (!legal.ok) return { kind: 'read', value: null }
      const turn = turns === undefined ? null : await turns()?.(legal.value, dispatcher)
      if (turn === undefined) return UNAVAILABLE
      const seen = await listing.visibleTo(legal.value, turn ?? undefined)
      if (seen === undefined) return UNAVAILABLE
      return { kind: 'read', value: seen.find(item => item.name === name)?.type ?? null }
    },
  }
}

/** The context copies as they are mounted now: unreadable while the row that knows Session is not started. */
export function lateCopies(holder: DispatchHolder): ContextCopies {
  return {
    moment: (...input) => holder.copies?.moment(...input) ?? Promise.resolve(UNAVAILABLE),
  }
}
