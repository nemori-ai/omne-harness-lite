import type { LoginIdentity } from '@omne-harness/access-cordis-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { HistoryPage } from '@omne-harness/session-contract'
import {
  readCall,
  refused,
  UNAVAILABLE,
  type Admitted,
  type Answer,
  type Body,
  type Refusal,
} from './answers.ts'
import type { SessionAccessSettings } from './ports.ts'

export type ReadHistoryPorts = Readonly<{
  admit(login: LoginIdentity, tenant: TenantId, session: string): Promise<Admitted | Refusal>
  settings: Pick<SessionAccessSettings, 'maxPageBytes' | 'historyKinds'>
}>

function withinPageBound(pageBytes: string, bound: number): boolean {
  const boundText = String(bound)
  return (
    pageBytes.length < boundText.length ||
    (pageBytes.length === boundText.length && pageBytes <= boundText)
  )
}

function pageOf(page: HistoryPage) {
  return {
    entries: page.entries.map(entry => ({
      entryId: entry.id,
      revision: entry.revision,
      kind: entry.kind,
      payload: entry.payload,
    })),
    next: page.next,
    exhausted: page.exhausted,
    scannedThrough: page.scannedThrough,
    upper: page.upper,
  }
}

export async function readHistory(
  ports: ReadHistoryPorts,
  login: LoginIdentity,
  body: Body<'read-history'>,
): Promise<Answer<'read-history'>> {
  const admitted = await ports.admit(login, body.tenant, body.session)
  if ('outcome' in admitted) return admitted
  if (body.cursor === null && !withinPageBound(body.pageBytes, ports.settings.maxPageBytes))
    return { outcome: 'invalid', body: {} }
  const { access, faces } = admitted
  const result = await readCall(() =>
    body.cursor === null
      ? faces.history.begin({
          ...access,
          kinds: ports.settings.historyKinds,
          from: null,
          direction: body.direction,
          pageBytes: Number(body.pageBytes),
        })
      : faces.history.next({ ...access, cursor: body.cursor }),
  )
  if (result === 'basis-unavailable') return UNAVAILABLE
  if ('failure' in result) return refused('read-history', result.failure)
  return { outcome: 'succeeded', body: pageOf(result.ok) }
}
