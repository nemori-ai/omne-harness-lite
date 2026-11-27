import {
  access,
  accountCodec,
  organizationCodec,
  tenant,
  type Access,
  type TenantId,
} from '@omne-harness/legal-identity'
import type {
  ActionDiscovery,
  ActionInvoker,
  CatalogView,
  EndpointRef,
  ContinueRequest,
  InvokeRequest,
  InvokeResult,
  KnownAction,
  OperationFailure,
  ReadFailure,
  RefreshResult,
  TaskRef,
} from '@omne-harness/mcp-contract'
import { millisOf, revisionOf } from '@omne-harness/mcp-contract/testing'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { createMcpEntrySource, type McpAsking } from '../src/index.ts'
import { ref, shape } from './support.ts'

export type Principal = Readonly<{ id: string }>

function tenantOf(last: string): TenantId {
  const organization = organizationCodec.parse(`org_0123456789abcdefghjkmnpqr${last}`)
  const account = accountCodec.parse(`acc_0123456789abcdefghjkmnpqr${last}`)
  if (!organization.ok || !account.ok) throw new TypeError('bad tenant sample')
  return tenant(organization.value, account.value)
}

export const home = tenantOf('s')
export const away = tenantOf('t')
export const alice: Access<Principal> = access({ id: 'alice' }, home)
export const bob: Access<Principal> = access({ id: 'bob' }, home)
export const mallory: Access<Principal> = access({ id: 'mallory' }, away)
export const aliceAway: Access<Principal> = access({ id: 'alice' }, away)

type Reading = Outcome<CatalogView, ReadFailure>

export function acquired(actions: readonly KnownAction[], revision = 1): CatalogView {
  return {
    kind: 'acquired',
    revision: revisionOf(revision),
    basis: { generation: 1, protocolVersion: '2025-11-25', capabilities: { kind: 'null' } },
    freshness: { acquiredAt: '2026-01-01T00:00:00.000Z', changedNotified: false },
    basisCurrent: 'matches',
    actions,
  } as CatalogView
}

export const notAcquired: CatalogView = { kind: 'not-acquired' }

export type World = ReturnType<typeof world>

/** A scripted MCP: what each endpoint reads as, what a refresh does, and what a call comes to. */
export function world(acquireWaitMs = 50, asking?: McpAsking) {
  const adopted = new Map<TenantId, readonly EndpointRef[] | 'unknown'>()
  const readings = new Map<string, (asker: Access<Principal>) => Reading>()
  const refreshes = new Map<
    string,
    () =>
      | Outcome<RefreshResult, OperationFailure>
      | Promise<Outcome<RefreshResult, OperationFailure>>
  >()
  const invoked: Array<Readonly<{ asker: Access<Principal>; request: InvokeRequest }>> = []
  const cancelledTasks: TaskRef[] = []
  const refreshed: string[] = []
  const opened = new Map<string, () => boolean>()
  const bounds: unknown[] = []
  let answer: (request: InvokeRequest) => InvokeResult | Promise<InvokeResult> = () => {
    throw new Error('the world has no answer scripted for a call')
  }
  const continued: Array<Readonly<{ asker: Access<Principal>; request: ContinueRequest }>> = []
  let continuation: (request: ContinueRequest) => InvokeResult | Promise<InvokeResult> = () => {
    throw new Error('the world has no answer scripted for a continuation')
  }

  const discovery: Pick<ActionDiscovery<Principal>, 'current' | 'refresh'> = {
    current: async (asker, endpoint) =>
      readings.get(endpoint.name)?.(asker) ?? fail({ kind: 'not-available-to-you' }),
    refresh: async (_asker, request) => {
      refreshed.push(request.ref.name)
      bounds.push(request.connectBound)
      const scripted = refreshes.get(request.ref.name)
      return scripted === undefined ? fail({ kind: 'connection-unavailable' }) : scripted()
    },
  }
  const invoker: Pick<ActionInvoker<Principal>, 'invoke' | 'cancelTask' | 'continueWithInput'> = {
    continueWithInput: async (asker, request) => {
      continued.push({ asker, request })
      return continuation(request)
    },
    invoke: async (asker, request) => {
      invoked.push({ asker, request })
      return answer(request)
    },
    cancelTask: async (_asker, task) => {
      cancelledTasks.push(task)
      return succeed('requested')
    },
  }

  const source = createMcpEntrySource<Principal>({
    endpoints: async asker => {
      const held = adopted.get(asker.tenant) ?? []
      return held === 'unknown' ? fail('unknown') : succeed(held)
    },
    discovery,
    invoker,
    programmable: async (_asker, endpoint) => opened.get(endpoint.name)?.() ?? false,
    principalKey: principal => principal.id,
    shape,
    resultMaxBytes: 65_536,
    connectBound: millisOf(7000),
    acquireWaitMs,
    ...(asking === undefined ? {} : { asking }),
  })

  return {
    source,
    invoked,
    continued,
    continuesWith(script: typeof continuation) {
      continuation = script
    },
    cancelledTasks,
    refreshed,
    bounds,
    adopt(owner: TenantId, ...names: string[]) {
      adopted.set(
        owner,
        names.map(name => ref(name)),
      )
    },
    adoptRefs(owner: TenantId, refs: readonly EndpointRef[] | 'unknown') {
      adopted.set(owner, refs)
    },
    reads(name: string, reading: Reading | ((asker: Access<Principal>) => Reading)) {
      readings.set(name, typeof reading === 'function' ? reading : () => reading)
    },
    offers(name: string, actions: readonly KnownAction[], revision = 1) {
      readings.set(name, () => succeed(acquired(actions, revision)))
    },
    refreshes(name: string, script: NonNullable<ReturnType<typeof refreshes.get>>) {
      refreshes.set(name, script)
    },
    answers(script: typeof answer) {
      answer = script
    },
    /** What the holder set for program calls of this endpoint; the script may throw, as an unread setting. */
    opens(name: string, script: () => boolean = () => true) {
      opened.set(name, script)
    },
  }
}
