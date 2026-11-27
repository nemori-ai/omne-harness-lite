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

// A present credential the endpoint refused is rejected until the connection is ready again.
function credentialStateOf(status: EndpointStatusView): NonNullable<Endpoint['credentialState']> {
  const refused =
    status.connection.kind === 'lost' && status.connection.reason === 'credential-rejected'
  return status.credential === 'present' && refused ? 'rejected' : status.credential
}

function endpointOf(
  adopted: AdoptedEndpoint,
  status: EndpointStatusView,
  catalog: Endpoint['catalog'],
): Endpoint {
  return {
    name: adopted.ref.name,
    connection: { state: status.connection.kind, reason: connectionText(status.connection) },
    credential: status.credential,
    credentialState: credentialStateOf(status),
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

  const refreshEndpoint: Handlers['operations']['refresh-endpoint'] = async (call, body) => {
    const stood = await known(call, body)
    if ('outcome' in stood) return stood
    const adopted = await adoptedOf(stood, body.name)
    if (adopted === 'not-visible') return NOT_VISIBLE
    if (adopted === 'basis-unavailable') return UNAVAILABLE
    return refreshCall(stood, adopted)
  }

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

  return {
    operations: {
      'list-endpoints': listEndpoints,
      'read-endpoint': readEndpoint,
      'refresh-endpoint': refreshEndpoint,
    },
    observations: {},
  }
}
