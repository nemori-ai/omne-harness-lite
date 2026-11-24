import { readTenantText, type TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import { compareInstants } from '@omne-harness/utc-instant'
import type { ArchivedItem } from './archive.ts'
import { notSent } from './session-driver.ts'
import {
  sessionName,
  shownBy,
  type ListedSession,
  type ListPage,
  type SessionList,
} from './session-list.ts'

export const SESSION_KIND = 'session.session'

export type PaperReference = Readonly<{ kind: string; ref: string }>

export type PaperFrame = 'sheet' | 'pile' | 'search'

export type PaperElementSubject = Readonly<{ reference: PaperReference; frame: PaperFrame }>

export type PaperPickerSubject = Readonly<{
  query: string
  pick: (reference: PaperReference) => void
}>

export type ArchivedScan =
  | Readonly<{ kind: 'reading'; after: ListPage }>
  | Readonly<{ kind: 'read'; after: ListPage; rows: ReadonlyMap<string, ArchivedItem> }>
  | Readonly<{ kind: 'refused' | 'unavailable'; after: ListPage }>

/** The row of the directory a session on the paper is drawn from; missing and not this person's read the same. */
export type PaperRow =
  | Readonly<{ kind: 'row'; item: ListedSession; archived: boolean }>
  | Readonly<{ kind: 'reading' | 'unreadable' | 'unavailable' }>

/** `again`: the directory this page met first is read through without the session; read it once more. */
export type PaperStep = Readonly<{ row: PaperRow; read: 'more' | 'archived' | 'again' | null }>

const READING: PaperStep = { row: { kind: 'reading' }, read: null }
const UNREADABLE: PaperStep = { row: { kind: 'unreadable' }, read: null }
const UNAVAILABLE: PaperStep = { row: { kind: 'unavailable' }, read: null }

const AGAIN: PaperStep = { row: { kind: 'reading' }, read: 'again' }

/** The read of the open directory that this one is, once it is read through; a later read is a newer directory. */
export const readThrough = (list: SessionList): number | undefined =>
  list.kind === 'read' && list.page.next === null ? list.issued : undefined

function archivedRow(
  scan: ArchivedScan | undefined,
  list: Extract<SessionList, { kind: 'read' }>,
  session: string,
  since: number | undefined,
): PaperStep {
  if (scan === undefined || scan.after !== list.page)
    return { row: { kind: 'reading' }, read: 'archived' }
  switch (scan.kind) {
    case 'reading':
      return READING
    case 'refused':
      return UNREADABLE
    case 'unavailable':
      return UNAVAILABLE
    case 'read': {
      const item = scan.rows.get(session)
      if (item !== undefined) return { row: { kind: 'row', item, archived: true }, read: null }
      return since !== undefined && list.issued > since ? UNREADABLE : AGAIN
    }
  }
}

// The open directory page after page, then the archived one. In neither is unreadable only in a directory newer
// than the one the page met first (`since`): a session made after a read is missing from it, not gone.
export function paperRow(
  list: SessionList,
  scan: ArchivedScan | undefined,
  session: string,
  since: number | undefined,
): PaperStep {
  const item = shownBy(list)?.sessions.find(listed => listed.session === session)
  if (item !== undefined) return { row: { kind: 'row', item, archived: false }, read: null }
  switch (list.kind) {
    case 'unread':
    case 'reading':
      return READING
    case 'failed':
      return list.retry ? UNAVAILABLE : UNREADABLE
    case 'read':
      return list.page.next === null
        ? archivedRow(scan, list, session, since)
        : { row: { kind: 'reading' }, read: 'more' }
  }
}

const latestFirst = (left: ListedSession, right: ListedSession): number => {
  if (left.lastActivityAt === null || right.lastActivityAt === null)
    return (left.lastActivityAt === null ? 1 : 0) - (right.lastActivityAt === null ? 1 : 0)
  return compareInstants(right.lastActivityAt, left.lastActivityAt)
}

/** The open sessions read so far whose name holds the words, latest activity first; without words, the latest. */
export function pickable(
  list: SessionList,
  query: string,
  limit: number,
): readonly ListedSession[] {
  const words = query.trim().toLocaleLowerCase()
  const sessions = shownBy(list)?.sessions ?? []
  return sessions
    .filter(item => sessionName(item).toLocaleLowerCase().includes(words))
    .toSorted(latestFirst)
    .slice(0, limit)
}

type Client = Pick<ClientOf<SessionProtocol>, 'list-archived-sessions'>
type ArchivedAnswer =
  | Awaited<ReturnType<Client['list-archived-sessions']>>
  | Readonly<{ outcome: 'unavailable' | 'invalid' }>

// One scan for each tenant: a newer read of the open directory starts another, and the older one's
// answers are dropped.
export class ArchivedDirectory {
  readonly #client: Client
  readonly #scans = new Map<string, ArchivedScan>()
  readonly #listeners = new Map<string, Set<() => void>>()

  constructor(client: Client) {
    this.#client = client
  }

  read = (tenant: string): ArchivedScan | undefined => this.#scans.get(tenant)

  subscribe(tenant: string, listener: () => void): () => void {
    const listeners = this.#listeners.get(tenant) ?? new Set()
    this.#listeners.set(tenant, listeners)
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  scan(tenant: string, after: ListPage): void {
    if (this.#scans.get(tenant)?.after === after) return
    this.#set(tenant, { kind: 'reading', after })
    void this.#readThrough(tenant, after)
  }

  async #readThrough(tenant: string, after: ListPage): Promise<void> {
    const owner = readTenantText(tenant)
    const rows = new Map<string, ArchivedItem>()
    let cursor: string | null = null
    for (;;) {
      const answer: ArchivedAnswer =
        owner === undefined ? { outcome: 'invalid' } : await this.#page(owner, cursor)
      if (this.#scans.get(tenant)?.after !== after) return
      if (answer.outcome !== 'succeeded') {
        this.#set(tenant, { kind: answer.outcome === 'denied' ? 'refused' : 'unavailable', after })
        return
      }
      for (const item of answer.body.sessions) rows.set(item.session, item)
      if (answer.body.next === null) break
      cursor = answer.body.next
    }
    this.#set(tenant, { kind: 'read', after, rows })
  }

  #page(tenant: TenantId, cursor: string | null): Promise<ArchivedAnswer> {
    return notSent(() => this.#client['list-archived-sessions']({ tenant, cursor }))
  }

  #set(tenant: string, scan: ArchivedScan): void {
    this.#scans.set(tenant, scan)
    for (const listener of this.#listeners.get(tenant) ?? []) listener()
  }
}
