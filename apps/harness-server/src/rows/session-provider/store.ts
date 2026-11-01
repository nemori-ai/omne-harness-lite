// The process memory of the contract double: sessions by (tenant, session), each with its log,
// its operation records and the inputs it accepted, and the history cursors that the double issued.
// Nothing here is written anywhere. A restart, or a reload of the row, starts empty.
import { createHash, randomUUID } from 'node:crypto'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type {
  CommitReceipt,
  DurableEvidence,
  EntryId,
  HistoryEntry,
  InputId,
  SessionControlReceipt,
  SessionCreation,
  SessionId,
  SessionOperationId,
  SessionRevision,
} from '@omne-harness/session-contract'
import type { Payload } from './payload.ts'

export const OWNER = 'session-provider'

/** The digest text of the given parts. The parts are plain text, so their order fixes the result. */
export function digestOf(...parts: readonly string[]): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(parts)).digest('hex')}`
}

/** An evidence of this double: its owner is this row, so no reader takes it for a storage record. */
export function evidenceOf(record: string, ...parts: readonly string[]): DurableEvidence {
  return { owner: OWNER, record, revision: '1', digest: digestOf(record, ...parts) }
}

/** What the double remembers of one operation, so a replay answers the original result. */
export type OperationRecord =
  | Readonly<{ kind: 'create'; digest: string; receipt: CommitReceipt }>
  | Readonly<{ kind: 'accept'; digest: string; receipt: CommitReceipt }>
  | Readonly<{ kind: 'control'; digest: string; receipt: SessionControlReceipt<never> }>

export type EntryDraft = Readonly<{ kind: string; payload: Payload }>

const entryId = (position: number): EntryId => `entry-${position + 1}` as EntryId

/** One registered session. The log is append-only and its entries are never changed. */
export class SessionRecord {
  readonly creation: SessionCreation
  readonly operations = new Map<SessionOperationId, OperationRecord>()
  readonly inputs = new Set<InputId>()
  private readonly entries: HistoryEntry[] = []
  private committed = 0

  constructor(creation: SessionCreation) {
    this.creation = creation
  }

  get revision(): SessionRevision {
    return String(this.committed) as SessionRevision
  }

  get length(): number {
    return this.entries.length
  }

  at(position: number): HistoryEntry | undefined {
    return this.entries[position]
  }

  positionOf(id: string): number {
    return this.entries.findIndex(entry => entry.id === id)
  }

  /** Appends the drafts as one revision and returns the receipt of that commit. */
  commit(
    session: SessionId,
    operation: SessionOperationId,
    drafts: readonly EntryDraft[],
  ): CommitReceipt {
    this.committed += 1
    const revision = this.revision
    const source = evidenceOf('commit', session, operation, revision)
    const first = entryId(this.entries.length)
    for (const draft of drafts) {
      this.entries.push({
        id: entryId(this.entries.length),
        revision,
        kind: draft.kind,
        schema: {
          owner: OWNER,
          name: draft.kind,
          revision: '1',
          digest: digestOf(draft.kind),
        },
        payload: draft.payload,
        origin: { owner: OWNER, via: null, source },
      })
    }
    const last = entryId(this.entries.length - 1)
    return { operation, revision, first, last, recovered: false, source }
  }
}

/** The fixed state of one history walk: what the cursor stands for. */
export type CursorState = Readonly<{
  tenant: string
  session: SessionId
  kinds: readonly string[]
  direction: 'forward' | 'backward'
  /** The log length when the walk began: later appends are not part of this walk. */
  upper: number
  upperRevision: SessionRevision
  /** The next log position to scan. */
  position: number
  pageBytes: number
}>

const MAX_CURSORS = 1024

/** The text key of a tenant, or `undefined` for a value that legal-identity did not mint. */
export function tenantKeyOf(tenant: TenantId): string | undefined {
  const encoded = tenantCodec.encode(tenant)
  return encoded.ok ? encoded.value : undefined
}

export class SessionStore {
  private readonly tenants = new Map<string, Map<SessionId, SessionRecord>>()
  private readonly cursors = new Map<string, CursorState>()

  find(tenant: string, session: SessionId): SessionRecord | undefined {
    return this.tenants.get(tenant)?.get(session)
  }

  register(tenant: string, session: SessionId, record: SessionRecord): void {
    const sessions = this.tenants.get(tenant) ?? new Map<SessionId, SessionRecord>()
    sessions.set(session, record)
    this.tenants.set(tenant, sessions)
  }

  /** Issues an opaque token for `state`. The oldest token is dropped when there are too many. */
  issueCursor(state: CursorState): string {
    const token = `cursor-${randomUUID()}`
    this.cursors.set(token, state)
    if (this.cursors.size > MAX_CURSORS) {
      const oldest = this.cursors.keys().next()
      if (!oldest.done) this.cursors.delete(oldest.value)
    }
    return token
  }

  /** The state of a token, only for the tenant and session that it was issued for. */
  cursor(token: string, tenant: string, session: SessionId): CursorState | undefined {
    const state = this.cursors.get(token)
    return state !== undefined && state.tenant === tenant && state.session === session
      ? state
      : undefined
  }
}
