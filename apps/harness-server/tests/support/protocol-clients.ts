import { assetsProtocol } from '@omne-harness/assets-protocol'
import { goalProtocol } from '@omne-harness/goal-protocol'
import { humanInterventionProtocol } from '@omne-harness/human-intervention-protocol'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  createClient,
  createHttpProtocolTransport,
  type ClientOf,
  type ClientSettings,
  type Credentials,
  type Transport,
} from '@omne-harness/sdk/core'
import { sessionDiagnosticsProtocol } from '@omne-harness/session-diagnostics-protocol'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { slashCommandProtocol } from '@omne-harness/slash-command-protocol'
import { savedLoginProof, savedTenant } from '../r9/support.ts'

export type ProtocolClients = Readonly<{
  identity: ClientOf<typeof identityProtocol>
  session: ClientOf<typeof sessionProtocol>
  humanIntervention: ClientOf<typeof humanInterventionProtocol>
  sessionDiagnostics: ClientOf<typeof sessionDiagnosticsProtocol>
  assets: ClientOf<typeof assetsProtocol>
  slashCommand: ClientOf<typeof slashCommandProtocol>
  goal: ClientOf<typeof goalProtocol>
}>

type SendBody = Parameters<ClientOf<typeof sessionProtocol>['send-input']>[0]
export type SessionRef = SendBody['session']

export function clientsOver(
  transport: Transport,
  settings: Readonly<{ session?: ClientSettings }> = {},
): ProtocolClients {
  return {
    identity: createClient(identityProtocol, transport),
    session: createClient(sessionProtocol, transport, settings.session),
    humanIntervention: createClient(humanInterventionProtocol, transport),
    sessionDiagnostics: createClient(sessionDiagnosticsProtocol, transport),
    assets: createClient(assetsProtocol, transport),
    slashCommand: createClient(slashCommandProtocol, transport),
    goal: createClient(goalProtocol, transport),
  }
}

export const protocolTransport = (
  origin: string,
  credentials: () => Credentials = () => ({}),
): Transport => createHttpProtocolTransport({ origin, credentials })

export function protocolClients(
  origin: string,
  credentials: () => Credentials = () => ({}),
): ProtocolClients {
  return clientsOver(protocolTransport(origin, credentials))
}

export const originOf = (port: number): string => `http://127.0.0.1:${String(port)}`

export function savedCredentials(
  home: string,
  given: Readonly<{ proof?: string; tenant?: string }> = {},
): () => Credentials {
  return () => ({
    proof: given.proof ?? savedLoginProof(home),
    tenant: given.tenant ?? savedTenant(home),
  })
}

export function savedClients(
  port: number,
  home: string,
  given: Readonly<{ proof?: string; tenant?: string }> = {},
): ProtocolClients {
  return protocolClients(originOf(port), savedCredentials(home, given))
}

export function tenantOf(text: string): TenantId {
  const parsed = tenantCodec.parse(text)
  if (!parsed.ok) throw new Error('the tenant text does not parse')
  return parsed.value
}

type ListCardsBody = Parameters<ClientOf<typeof humanInterventionProtocol>['list-cards']>[0]
export type PageLimit = ListCardsBody['limit']
export const pageLimit = (limit: number): PageLimit => limit as unknown as PageLimit

export const sessionRef = (text: string): SessionRef => text as unknown as SessionRef

export type HistoryEntry = Readonly<{
  entryId: string
  revision: string
  kind: string
  payload: Record<string, unknown>
}>

export type HistoryPage = Readonly<{
  entries: readonly HistoryEntry[]
  next: string | null
  exhausted: boolean
}>

export type HistoryAnswer = Readonly<{ outcome: string; body: HistoryPage }>

const NO_PAGE: HistoryPage = { entries: [], next: null, exhausted: false }

type ReadHistory = ProtocolClients['session']['read-history']

function plainOf(value: JsonValue): unknown {
  return JSON.parse(writeJsonText(value))
}

async function readHistory(clients: ProtocolClients, body: Parameters<ReadHistory>[0]) {
  const answer = await clients.session['read-history'](body)
  if (answer.outcome !== 'succeeded') return { outcome: answer.outcome, body: NO_PAGE }
  const page = answer.body
  return {
    outcome: answer.outcome,
    body: {
      entries: page.entries.map(entry => ({
        entryId: entry.entryId,
        revision: entry.revision,
        kind: entry.kind,
        payload: plainOf(entry.payload) as Record<string, unknown>,
      })),
      next: page.next,
      exhausted: page.exhausted,
    },
  } satisfies HistoryAnswer
}

export function readHistoryPage(
  clients: ProtocolClients,
  tenant: string,
  session: string,
  pageBytes = '262144',
  direction: 'forward' | 'backward' = 'forward',
): Promise<HistoryAnswer> {
  return readHistory(clients, {
    tenant: tenantOf(tenant),
    session: sessionRef(session),
    cursor: null,
    direction,
    pageBytes,
  } as Parameters<ReadHistory>[0])
}

export function readHistoryFrom(
  clients: ProtocolClients,
  tenant: string,
  session: string,
  cursor: string,
): Promise<HistoryAnswer> {
  return readHistory(clients, {
    tenant: tenantOf(tenant),
    session: sessionRef(session),
    cursor,
  })
}

export const entriesOf = (answer: HistoryAnswer): readonly HistoryEntry[] => answer.body.entries
