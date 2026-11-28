import type {
  AccessContribution,
  AnswerOf,
  BodyOf,
  LoginIdentity,
  Principal,
} from '@omne-harness/access-cordis-contract'
import {
  access as accessOf,
  tenantCodec,
  type Access,
  type TenantId,
} from '@omne-harness/legal-identity'
import { failureText } from '@omne-harness/mcp-bridge'
import type { CatalogView, EndpointStatusView, RefreshResult } from '@omne-harness/mcp-contract'
import type { AdoptedEndpoint } from '@omne-harness/mcp-contract/provider'
import type { McpProtocol } from '@omne-harness/mcp-protocol'
import { beginOn, disconnectOn } from './connect.ts'
import { eventTypesOn } from './events.ts'
import { createEndpointObservation } from './observe-endpoints.ts'
import { readEventsOn, subscribeOn, unsubscribeOn, type Named } from './subscriptions.ts'
import type { McpAccessSettings, McpFaces, McpPrincipals } from './ports.ts'
import {
  blockedText,
  connectionText,
  keptText,
  notAcquiredText,
  summaryOf,
  unavailableText,
} from './texts.ts'

export type McpContributionInput = Readonly<{
  faces: () => McpFaces | undefined
  principals: McpPrincipals
  settings: McpAccessSettings
}>

type Operations = McpProtocol['operations']
type Handlers = Omit<AccessContribution<McpProtocol>, 'protocol'>
type Call = Readonly<{ principal: LoginIdentity }>
type Wire<K extends keyof Operations> =
  AnswerOf<Operations[K]> extends infer A
    ? A extends { readonly outcome: 'succeeded'; readonly body: infer B }
      ? B
      : never
    : never
type Current = Awaited<ReturnType<McpFaces['discovery']['current']>>
type Endpoint = Wire<'list-endpoints'>['items'][number]
type Action = NonNullable<Wire<'read-endpoint'>['actions']>[number]

const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const NOT_VISIBLE = Object.freeze({ outcome: 'not-visible' as const, body: Object.freeze({}) })

type Known = Readonly<{ access: Access<Principal>; faces: McpFaces }>
type Refusal = Readonly<{ outcome: 'denied' | 'basis-unavailable' }>

function tenantTextOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('mcp-access: tenant is not a minted TenantId')
  return encoded.value
}

async function actingFor(
  principals: McpPrincipals,
  login: LoginIdentity,
  tenantText: string,
): Promise<Readonly<{ principal: Principal }> | Refusal> {
  try {
    const issued = await principals.actingFor(login, tenantText)
    return 'refused' in issued ? { outcome: issued.refused } : { principal: issued.ok }
  } catch {
    return UNAVAILABLE
  }
}

async function readCall<T>(call: () => Promise<T>): Promise<T | 'basis-unavailable'> {
  try {
    return await call()
  } catch {
    return 'basis-unavailable'
  }
}

function catalogOf(
  read: Current,
  adopted: AdoptedEndpoint,
  status: EndpointStatusView,
): Endpoint['catalog'] {
  if ('failure' in read) return { kind: 'not-acquired', reason: failureText(read.failure) }
  const view = read.ok
  return view.kind === 'acquired'
    ? { kind: 'acquired', actions: view.actions.length }
    : { kind: 'not-acquired', reason: notAcquiredText(adopted, status.connection) }
}

// The field of revision 1 has no word for a grant that wants a new connection: there is one, so it is present.
function credentialOf(status: EndpointStatusView): Endpoint['credential'] {
  return status.credential === 'reconnect-required' ? 'present' : status.credential
}

// A present static credential the endpoint refused is rejected until the connection is ready again; an OAuth grant says how it stands itself.
function credentialStateOf(status: EndpointStatusView): NonNullable<Endpoint['credentialState']> {
  const refused =
    status.connection.kind === 'lost' && status.connection.reason === 'credential-rejected'
  const oauth = status.connect !== undefined
  return status.credential === 'present' && refused && !oauth ? 'rejected' : status.credential
}

function endpointOf(
  adopted: AdoptedEndpoint,
  status: EndpointStatusView,
  catalog: Endpoint['catalog'],
): Endpoint {
  return {
    name: adopted.ref.name,
    connection: { state: status.connection.kind, reason: connectionText(status.connection) },
    credential: credentialOf(status),
    credentialState: credentialStateOf(status),
    ...(status.connect === undefined ? {} : { connect: status.connect }),
    use:
      status.use.kind === 'usable'
        ? { kind: 'usable' }
        : { kind: 'blocked', reason: blockedText(status.use) },
    catalog,
  }
}

function actionsOf(view: CatalogView): readonly Action[] | null {
  if (view.kind !== 'acquired') return null
  return view.actions.map(known => ({
    name: known.name,
    summary: summaryOf(known),
    available: known.availability.kind === 'available',
    reason:
      known.availability.kind === 'available' ? null : unavailableText(known.availability.reason),
  }))
}

function refreshedOf(result: RefreshResult): Wire<'refresh-endpoint'> {
  if (result.kind === 'published') return { refreshed: 'published', reason: null }
  const { reason } = result
  if (reason.kind === 'superseded') return { refreshed: 'superseded', reason: null }
  if (reason.kind === 'cancelled') return { refreshed: 'cancelled', reason: null }
  return { refreshed: 'failed', reason: keptText(reason) }
}

type OnEndpoint = <A>(
  call: Call,
  body: BodyOf<Operations['read-endpoint']>,
  commit: (stood: Known, adopted: AdoptedEndpoint) => Promise<A>,
) => Promise<A | Refusal | typeof NOT_VISIBLE>

function subscriptionOperations(
  onEndpoint: OnEndpoint,
  principals: McpPrincipals,
  settings: McpAccessSettings,
) {
  const namedOf = (stood: Known, body: BodyOf<Operations['subscribe-events']>): Named => ({
    event: body.event,
    arguments: body.arguments,
    subscriber: principals.subscriberOf(stood.access.principal),
    connectBound: settings.refresh.connectBoundMs,
  })
  const subscribeEvents: Handlers['operations']['subscribe-events'] = (call, body) =>
    onEndpoint(call, body, (stood, { ref }) =>
      subscribeOn(stood.faces.subscriptions, stood.access, ref, namedOf(stood, body)),
    )
  const unsubscribeEvents: Handlers['operations']['unsubscribe-events'] = (call, body) =>
    onEndpoint(call, body, (stood, { ref }) =>
      unsubscribeOn(stood.faces.subscriptions, stood.access, ref, namedOf(stood, body)),
    )
  const readEvents: Handlers['operations']['read-events'] = (call, body) =>
    onEndpoint(call, body, (stood, { ref }) =>
      readEventsOn(stood.faces.subscriptions, stood.access, ref, {
        ...namedOf(stood, body),
        after: body.after,
        limit: body.limit,
      }),
    )
  return {
    'subscribe-events': subscribeEvents,
    'unsubscribe-events': unsubscribeEvents,
    'read-events': readEvents,
  }
}

export function createMcpContribution(input: McpContributionInput): Handlers {
  const { principals, settings } = input

  async function known(
    call: Call,
    body: BodyOf<Operations['list-endpoints']>,
  ): Promise<Known | Refusal> {
    const tenantText = tenantTextOf(body.tenant)
    const issued = await actingFor(principals, call.principal, tenantText)
    if ('outcome' in issued) return issued
    const faces = input.faces()
    if (faces === undefined) return UNAVAILABLE
    return { access: accessOf(issued.principal, body.tenant), faces }
  }

  async function adoptedOf(
    { access, faces }: Known,
    name: string,
  ): Promise<AdoptedEndpoint | 'not-visible' | 'basis-unavailable'> {
    const adopted = await readCall(() => faces.adoption.endpoints(access, null))
    if (adopted === 'basis-unavailable' || 'failure' in adopted) return 'basis-unavailable'
    return adopted.ok.find(item => item.ref.name === name) ?? 'not-visible'
  }

  // The status of one endpoint, with the catalog beside it; an endpoint that is not available to the asker is none.
  async function viewOf(
    { access, faces }: Known,
    adopted: AdoptedEndpoint,
  ): Promise<
    | Readonly<{ endpoint: Endpoint; catalog: CatalogView | null }>
    | 'not-visible'
    | 'basis-unavailable'
  > {
    const { ref } = adopted
    const status = await readCall(() => faces.status.inspect(access, ref))
    if (status === 'basis-unavailable') return status
    if ('failure' in status)
      return status.failure.kind === 'not-available-to-you' ? 'not-visible' : 'basis-unavailable'
    const current = await readCall(() => faces.discovery.current(access, ref))
    if (current === 'basis-unavailable') return current
    return {
      endpoint: endpointOf(adopted, status.ok, catalogOf(current, adopted, status.ok)),
      catalog: 'failure' in current ? null : current.ok,
    }
  }

  const listEndpoints: Handlers['operations']['list-endpoints'] = async (call, body) => {
    const stood = await known(call, body)
    if ('outcome' in stood) return stood
    const adopted = await readCall(() => stood.faces.adoption.endpoints(stood.access, null))
    if (adopted === 'basis-unavailable' || 'failure' in adopted) return UNAVAILABLE
    const views = await Promise.all(adopted.ok.map(item => viewOf(stood, item)))
    const items: Endpoint[] = []
    for (const view of views) {
      if (view === 'basis-unavailable') return UNAVAILABLE
      if (view !== 'not-visible') items.push(view.endpoint)
    }
    return { outcome: 'succeeded', body: { items } }
  }

  const readEndpoint: Handlers['operations']['read-endpoint'] = async (call, body) => {
    const stood = await known(call, body)
    if ('outcome' in stood) return stood
    const adopted = await adoptedOf(stood, body.name)
    if (adopted === 'basis-unavailable') return UNAVAILABLE
    if (adopted === 'not-visible') return NOT_VISIBLE
    const view = await viewOf(stood, adopted)
    if (view === 'basis-unavailable') return UNAVAILABLE
    if (view === 'not-visible') return NOT_VISIBLE
    const actions = view.catalog === null ? null : actionsOf(view.catalog)
    return { outcome: 'succeeded', body: { endpoint: view.endpoint, actions } }
  }

  // A commit on one endpoint the asker sees; when the endpoints cannot be read, it is unavailable.
  async function onEndpoint<A>(
    call: Call,
    body: BodyOf<Operations['read-endpoint']>,
    commit: (stood: Known, adopted: AdoptedEndpoint) => Promise<A>,
  ): Promise<A | Refusal | typeof NOT_VISIBLE> {
    const stood = await known(call, body)
    if ('outcome' in stood) return stood
    const adopted = await adoptedOf(stood, body.name)
    if (adopted === 'not-visible') return NOT_VISIBLE
    if (adopted === 'basis-unavailable') return UNAVAILABLE
    return commit(stood, adopted)
  }

  const refreshEndpoint: Handlers['operations']['refresh-endpoint'] = (call, body) =>
    onEndpoint(call, body, refreshCall)

  async function refreshCall(stood: Known, { ref }: AdoptedEndpoint) {
    try {
      const refreshed = await stood.faces.discovery.refresh(stood.access, {
        ref,
        connectBound: settings.refresh.connectBoundMs,
      })
      if ('failure' in refreshed)
        return refreshed.failure.kind === 'not-available-to-you'
          ? NOT_VISIBLE
          : {
              outcome: 'succeeded' as const,
              body: { refreshed: 'failed' as const, reason: failureText(refreshed.failure) },
            }
      return { outcome: 'succeeded' as const, body: refreshedOf(refreshed.ok) }
    } catch {
      return { outcome: 'unknown' as const }
    }
  }

  const beginConnect: Handlers['operations']['begin-connect'] = (call, body) =>
    onEndpoint(call, body, ({ faces, access }, { ref }) => beginOn(faces.connect, access, ref))

  const disconnect: Handlers['operations']['disconnect'] = (call, body) =>
    onEndpoint(call, body, ({ faces, access }, { ref }) => disconnectOn(faces.connect, access, ref))

  const listEventTypes: Handlers['operations']['list-event-types'] = (call, body) =>
    onEndpoint(call, body, ({ faces, access }, { ref }) =>
      eventTypesOn(faces.discovery, access, ref),
    )

  return {
    operations: {
      'list-endpoints': listEndpoints,
      'read-endpoint': readEndpoint,
      'refresh-endpoint': refreshEndpoint,
      'begin-connect': beginConnect,
      disconnect,
      'list-event-types': listEventTypes,
      ...subscriptionOperations(onEndpoint, principals, settings),
    },
    observations: { 'observe-endpoints': createEndpointObservation(input) },
  }
}
