import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { SessionFailure } from '@omne-harness/session-contract'
import {
  commitCall,
  readCall,
  refused,
  UNAVAILABLE,
  type Admitted,
  type Answer,
  type Body,
  type Refusal,
} from './answers.ts'
import { controlOperation } from './derivation.ts'
import type {
  PrincipalFact,
  SessionAccessSettings,
  SessionListEntry,
  SessionListing,
} from './ports.ts'

export type ArchivePorts = Readonly<{
  admit(login: LoginIdentity, tenant: TenantId, session: string): Promise<Admitted | Refusal>
  factOf(principal: Principal): PrincipalFact | undefined
}>

// Session refuses an archive of an archived session, and an unarchive of one that is not, as
// invalid on the intent; neither control has another invalid intent, so that is the answer "already".
const already = (failure: SessionFailure): boolean =>
  failure.kind === 'invalid' && failure.field === 'intent'

async function control(
  ports: ArchivePorts,
  login: LoginIdentity,
  body: Body<'archive-session'>,
  kind: 'archive' | 'unarchive',
) {
  const admitted = await ports.admit(login, body.tenant, body.session)
  if ('outcome' in admitted) return admitted
  const { access, tenantText, faces } = admitted
  const caller = ports.factOf(access.principal)
  if (caller === undefined) return UNAVAILABLE
  const operation = controlOperation(caller.login, tenantText, access.session, body.controlId)
  return commitCall(() => faces.work.control({ ...access, operation, intent: { kind } }))
}

export async function archiveSession(
  ports: ArchivePorts,
  login: LoginIdentity,
  body: Body<'archive-session'>,
): Promise<Answer<'archive-session'>> {
  const result = await control(ports, login, body, 'archive')
  if (result === 'unknown') return { outcome: 'unknown' }
  if ('outcome' in result) return result
  const { controlId } = body
  if ('failure' in result)
    return already(result.failure)
      ? { outcome: 'succeeded', body: { kind: 'already-archived', controlId } }
      : refused('archive-session', result.failure)
  const collapsed = result.ok.collapsed
  if (collapsed == null) return UNAVAILABLE
  return { outcome: 'succeeded', body: { kind: 'archived', controlId, ...collapsed } }
}

export async function unarchiveSession(
  ports: ArchivePorts,
  login: LoginIdentity,
  body: Body<'unarchive-session'>,
): Promise<Answer<'unarchive-session'>> {
  const result = await control(ports, login, body, 'unarchive')
  if (result === 'unknown') return { outcome: 'unknown' }
  if ('outcome' in result) return result
  const { controlId } = body
  if ('failure' in result)
    return already(result.failure)
      ? { outcome: 'succeeded', body: { kind: 'not-archived', controlId } }
      : refused('unarchive-session', result.failure)
  return { outcome: 'succeeded', body: { kind: 'unarchived', controlId } }
}

export type ListingPorts = Readonly<{
  principalFor(
    login: LoginIdentity,
    tenant: TenantId,
  ): Promise<Readonly<{ principal: Principal }> | Refusal>
  listing(): SessionListing | undefined
  settings: Pick<SessionAccessSettings, 'defaultListLimit' | 'maxListLimit'>
}>

type ListName = 'list-sessions' | 'list-archived-sessions'

const plain = ({ archivedAt: _at, archivedBy: _by, ...item }: SessionListEntry) => item

// The two lists share the caller, the limit and the page; the archived list adds its filters.
async function listed<K extends ListName>(
  ports: ListingPorts,
  login: LoginIdentity,
  body: Body<K>,
  read: (
    listing: SessionListing,
    input: Parameters<SessionListing['list']>[0],
  ) => ReturnType<SessionListing['list']>,
): Promise<Answer<K> | Readonly<{ page: Awaited<ReturnType<SessionListing['list']>> }>> {
  const issued = await ports.principalFor(login, body.tenant)
  if ('outcome' in issued) return issued as Answer<K>
  const listing = ports.listing()
  if (listing === undefined) return UNAVAILABLE as Answer<K>
  const limit = body.limit ?? ports.settings.defaultListLimit
  if (limit > ports.settings.maxListLimit) return { outcome: 'invalid', body: {} } as Answer<K>
  const input = { principal: issued.principal, tenant: body.tenant, after: body.cursor, limit }
  const page = await readCall(() => read(listing, input))
  if (page === 'basis-unavailable') return UNAVAILABLE as Answer<K>
  return { page }
}

function answerOf<K extends ListName>(
  page: Awaited<ReturnType<SessionListing['list']>>,
  item: (entry: SessionListEntry) => unknown,
): Answer<K> {
  if ('refused' in page)
    return (
      page.refused === 'invalid' ? { outcome: 'invalid', body: {} } : { outcome: page.refused }
    ) as Answer<K>
  const { items, next, completeness } = page.ok
  return {
    outcome: 'succeeded',
    body: { sessions: items.map(item), next, completeness },
  } as Answer<K>
}

export async function listSessions(
  ports: ListingPorts,
  login: LoginIdentity,
  body: Body<'list-sessions'>,
): Promise<Answer<'list-sessions'>> {
  const out = await listed<'list-sessions'>(ports, login, body, (listing, input) =>
    listing.list(input),
  )
  return 'page' in out ? answerOf<'list-sessions'>(out.page, plain) : out
}

export async function listArchivedSessions(
  ports: ListingPorts,
  login: LoginIdentity,
  body: Body<'list-archived-sessions'>,
): Promise<Answer<'list-archived-sessions'>> {
  const filters = {
    from: body.from ?? null,
    to: body.to ?? null,
    by: body.by ?? null,
    titleContains: body.titleContains ?? null,
  }
  const out = await listed<'list-archived-sessions'>(ports, login, body, (listing, input) =>
    listing.listArchived({ ...input, ...filters }),
  )
  return 'page' in out ? answerOf<'list-archived-sessions'>(out.page, entry => entry) : out
}
