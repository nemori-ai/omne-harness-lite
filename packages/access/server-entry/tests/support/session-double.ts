// An in-memory stand-in for the Session faces that the server entry calls. It keeps the documented
// order of Session's own judgment (access first, Tool `stopCall` before the existence check, then
// existence, then recall by operation identity), so a test can tell which step answered. It proves
// nothing about the real Session; it is the fixture of this member's tests only.
import { createHash } from 'node:crypto'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  CommitReceipt,
  HistoryPage,
  OperationResolution,
  SessionAccess,
  SessionControlReceipt,
  SessionFailure,
  SessionHistory,
  SessionId,
  SessionManagement,
  SessionOperationId,
  SessionRevision,
  SessionWork,
} from '@omne-harness/session-contract'
import { evidence } from '@omne-harness/session-contract/testing'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { SessionIngressFaces } from '../../src/faces.ts'

type P = ActingForTenantPrincipal
type FaceMethod =
  | 'create'
  | 'accept'
  | 'queryOperation'
  | 'cancelRun'
  | 'stopCall'
  | 'history.begin'
  | 'history.next'

export type SessionDoubleRecord = Readonly<{
  method: FaceMethod
  principal: P
  tenant: TenantId
  session: SessionId
  operation?: SessionOperationId
  input: unknown
}>

type Committed = Readonly<{ kind: string; digest: string; receipt: CommitReceipt }>
type SessionRecord = {
  readonly tenant: TenantId
  readonly runs: Set<string>
  readonly entries: Readonly<{ id: string; kind: string; payload: unknown }>[]
}

export type SessionDoubleControls = Readonly<{
  /** The calls that reached the faces, in order. */
  calls(): readonly SessionDoubleRecord[]
  /** The committed operations by identity. */
  committed(): ReadonlyMap<SessionOperationId, Committed>
  /** Makes `method` throw until `restore()`. */
  throwOn(method: FaceMethod, error: unknown): void
  /** Whether `stopCall` refuses a Tool target itself, as Session's SPEC says. Default true. */
  refuseToolTargets(refuse: boolean): void
  /** Whether `queryOperation` answers `denied` for a session that does not exist. Default true. */
  checkExistenceOnQuery(check: boolean): void
  /** Makes every mutation answer this failure until `restore()`. */
  failWith(failure: SessionFailure): void
  restore(): void
  /** Makes a Run known to a session, so `cancelRun` finds it. */
  addRun(session: SessionId, run: string): void
  /** Appends a history entry to a session. */
  addEntry(
    session: SessionId,
    entry: Readonly<{ id: string; kind: string; payload: unknown }>,
  ): void
  sessions(): ReadonlyMap<string, SessionRecord>
}>

export type SessionDouble = Readonly<{
  faces: SessionIngressFaces<P>
  controls: SessionDoubleControls
}>

export type SessionDoubleOptions = Readonly<{
  /** The accounts (account text) that are members of each tenant (tenant text). Absent: denied. */
  members: ReadonlyMap<string, ReadonlySet<string>>
}>

function digestOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function tenantText(tenant: TenantId): string {
  return `${tenant.organization.text}/${tenant.account.text}`
}

function revision(n: number): SessionRevision {
  return String(n) as SessionRevision
}

/** Creates the double. `members` decides the access judgment: the principal must act for the target tenant and its account must be a member. */
export function createSessionDouble(options: SessionDoubleOptions): SessionDouble {
  const calls: SessionDoubleRecord[] = []
  const committed = new Map<SessionOperationId, Committed>()
  const sessions = new Map<string, SessionRecord>()
  const throwing = new Map<FaceMethod, unknown>()
  let forcedFailure: SessionFailure | undefined
  let refuseTool = true
  let existenceOnQuery = true
  let commits = 0

  const record = (method: FaceMethod, access: SessionAccess<P>, input: unknown): void => {
    calls.push({
      method,
      principal: access.principal,
      tenant: access.tenant,
      session: access.session,
      ...('operation' in access ? { operation: access.operation as SessionOperationId } : {}),
      input,
    })
    const error = throwing.get(method)
    if (error !== undefined) throw error
  }

  const accessDenied = (access: SessionAccess<P>): boolean => {
    const principal: unknown = access.principal
    if (
      typeof principal !== 'object' ||
      principal === null ||
      (principal as { kind?: unknown }).kind !== 'acting-for-tenant'
    )
      return true
    const acting = principal as ActingForTenantPrincipal
    if (!tenantEquals(acting.tenant, access.tenant)) return true
    const members = options.members.get(tenantText(access.tenant))
    return members === undefined || !members.has(acting.tenant.account.text)
  }

  const sessionKey = (access: SessionAccess<P>): string =>
    `${tenantText(access.tenant)}#${access.session}`

  const existing = (access: SessionAccess<P>): SessionRecord | undefined => {
    const found = sessions.get(sessionKey(access))
    return found !== undefined && tenantEquals(found.tenant, access.tenant) ? found : undefined
  }

  const receiptOf = (operation: SessionOperationId, recovered: boolean): CommitReceipt => {
    commits += 1
    return {
      operation,
      revision: revision(commits),
      first: `entry-${commits}` as CommitReceipt['first'],
      last: `entry-${commits}` as CommitReceipt['last'],
      recovered,
      source: evidence(`double/${operation}`),
    }
  }

  /** Recall by operation identity: same content gives the original receipt, other content gives conflict. */
  const commit = (
    kind: string,
    operation: SessionOperationId,
    content: unknown,
  ): Outcome<CommitReceipt, SessionFailure> => {
    if (forcedFailure !== undefined) return fail(forcedFailure)
    const digest = digestOf(content)
    const found = committed.get(operation)
    if (found !== undefined) {
      if (found.kind !== kind || found.digest !== digest)
        return fail({ kind: 'conflict', operation })
      return succeed({ ...found.receipt, recovered: true })
    }
    const receipt = receiptOf(operation, false)
    committed.set(operation, { kind, digest, receipt })
    return succeed(receipt)
  }

  const management: Pick<SessionManagement<P>, 'create'> = {
    async create(input) {
      record('create', input, input.creation)
      if (accessDenied(input)) return fail({ kind: 'denied', action: 'create' })
      const outcome = commit('create', input.operation, {
        session: input.session,
        creation: input.creation,
      })
      if ('ok' in outcome && !sessions.has(sessionKey(input)))
        sessions.set(sessionKey(input), { tenant: input.tenant, runs: new Set(), entries: [] })
      if ('failure' in outcome) return outcome
      return succeed({ receipt: outcome.ok, state: {} as never })
    },
  }

  const work: Pick<SessionWork<P>, 'accept' | 'queryOperation' | 'cancelRun' | 'stopCall'> = {
    async accept(input) {
      record('accept', input, input.value)
      if (accessDenied(input)) return fail({ kind: 'denied', action: 'accept' })
      if (existing(input) === undefined) return fail({ kind: 'denied', action: 'accept' })
      return commit('accept', input.operation, { session: input.session, value: input.value })
    },
    async queryOperation(input) {
      record('queryOperation', input, input.operation)
      if (accessDenied(input)) return fail({ kind: 'denied', action: 'queryOperation' })
      if (existenceOnQuery && existing(input) === undefined)
        return fail({ kind: 'denied', action: 'queryOperation' })
      const found = committed.get(input.operation)
      const resolution: OperationResolution =
        found === undefined
          ? { kind: 'not-committed', exclusion: evidence(`double/excluded/${input.operation}`) }
          : { kind: 'committed', receipt: found.receipt }
      return succeed(resolution)
    },
    async cancelRun(input) {
      record('cancelRun', input, { run: input.run, urgency: input.urgency })
      if (accessDenied(input)) return fail({ kind: 'denied', action: 'cancelRun' })
      const session = existing(input)
      if (session === undefined) return fail({ kind: 'denied', action: 'cancelRun' })
      const content = { kind: 'cancelRun', run: input.run, urgency: input.urgency }
      const outcome = commit('cancelRun', input.operation, content)
      if ('failure' in outcome) return outcome
      const answer: SessionControlReceipt<never>['answer'] = session.runs.has(input.run)
        ? {
            kind: 'requested',
            progress: {
              operation: input.operation,
              target: { kind: 'run', run: input.run } as never,
              intent: { kind: 'cancel' } as never,
              state: 'committed',
              pending: [],
            },
          }
        : { kind: 'not-found' }
      return succeed({ operation: input.operation, source: outcome.ok.source, answer })
    },
    async stopCall(input) {
      record('stopCall', input, { producer: input.producer })
      if (accessDenied(input)) return fail({ kind: 'denied', action: 'stopCall' })
      // Session's own order: the Tool target is refused before the existence check and writes nothing.
      if (refuseTool && input.producer.kind === 'tool') return fail({ kind: 'unsupported' })
      if (existing(input) === undefined) return fail({ kind: 'denied', action: 'stopCall' })
      const outcome = commit('stopCall', input.operation, {
        kind: 'stopCall',
        producer: input.producer,
      })
      if ('failure' in outcome) return outcome
      return succeed({
        operation: input.operation,
        source: outcome.ok.source,
        answer: { kind: 'not-found' },
      })
    },
  }

  const page = (session: SessionRecord, from: number, pageBytes: number): HistoryPage => {
    const entries = session.entries.slice(from, from + Math.max(1, Math.floor(pageBytes / 64)))
    const end = from + entries.length
    return {
      source: 'double',
      interpreter: { owner: 'double', name: 'history', revision: '1', digest: 'sha256:history' },
      upper: revision(commits),
      entries: entries.map(entry => ({
        id: entry.id as HistoryPage['entries'][number]['id'],
        revision: revision(1),
        kind: entry.kind,
        schema: {
          owner: 'double',
          name: entry.kind,
          revision: '1',
          digest: `sha256:${entry.kind}`,
        },
        payload: { kind: 'string', value: String(entry.payload) },
        origin: { owner: 'double', via: null, source: evidence(`double/${entry.id}`) },
      })),
      scannedThrough: String(end),
      next: end < session.entries.length ? `cursor:${end}` : null,
      exhausted: end >= session.entries.length,
      annotations: [],
    }
  }

  const history: Pick<SessionHistory<P>, 'begin' | 'next'> = {
    async begin(input) {
      record('history.begin', input, { kinds: input.kinds, pageBytes: input.pageBytes })
      if (accessDenied(input)) return fail({ kind: 'denied', action: 'history.begin' })
      const session = existing(input)
      if (session === undefined) return fail({ kind: 'denied', action: 'history.begin' })
      if (forcedFailure !== undefined) return fail(forcedFailure)
      return succeed(page(session, 0, input.pageBytes))
    },
    async next(input) {
      record('history.next', input, { cursor: input.cursor })
      if (accessDenied(input)) return fail({ kind: 'denied', action: 'history.next' })
      const session = existing(input)
      if (session === undefined) return fail({ kind: 'denied', action: 'history.next' })
      const match = /^cursor:(\d+)$/.exec(input.cursor)
      if (match === null) return fail({ kind: 'invalid', field: 'cursor', reason: 'foreign' })
      return succeed(page(session, Number(match[1]), 1024))
    },
  }

  return Object.freeze({
    faces: { management, work, history },
    controls: Object.freeze({
      calls: () => [...calls],
      committed: () => new Map(committed),
      throwOn: (method: FaceMethod, error: unknown) => {
        throwing.set(method, error)
      },
      refuseToolTargets: (refuse: boolean) => {
        refuseTool = refuse
      },
      checkExistenceOnQuery: (check: boolean) => {
        existenceOnQuery = check
      },
      failWith: (failure: SessionFailure) => {
        forcedFailure = failure
      },
      restore: () => {
        throwing.clear()
        forcedFailure = undefined
      },
      addRun: (session: SessionId, run: string) => {
        for (const [key, record] of sessions) if (key.endsWith(`#${session}`)) record.runs.add(run)
      },
      addEntry: (
        session: SessionId,
        entry: Readonly<{ id: string; kind: string; payload: unknown }>,
      ) => {
        for (const [key, record] of sessions)
          if (key.endsWith(`#${session}`)) record.entries.push(entry)
      },
      sessions: () => new Map(sessions),
    }),
  })
}
