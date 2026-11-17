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
  SessionWaiting,
  SessionWork,
} from '@omne-harness/session-contract'
import { evidence } from '@omne-harness/session-contract/testing'
import type { Principal } from '@omne-harness/access-cordis-contract'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { SessionAccessFaces } from '../../src/ports.ts'

type P = Principal
type FaceMethod =
  | 'create'
  | 'accept'
  | 'queryOperation'
  | 'cancelRun'
  | 'stopCall'
  | 'retryRun'
  | 'history.begin'
  | 'history.next'
  | 'readWaiting'
  | 'control'
  | 'readBackgroundCalls'

export type SessionDoubleRecord = Readonly<{
  method: FaceMethod
  principal: P
  tenant: TenantId
  session: SessionId
  operation?: SessionOperationId
  input: unknown
}>

type ControlAnswer = SessionControlReceipt<never>['answer']

type Committed = Readonly<{ kind: string; digest: string; receipt: CommitReceipt }>
type SessionRecord = {
  readonly tenant: TenantId
  readonly runs: Set<string>
  readonly entries: Readonly<{ id: string; kind: string; payload: unknown }>[]
}

export type SessionDoubleControls = Readonly<{
  calls(): readonly SessionDoubleRecord[]
  committed(): ReadonlyMap<SessionOperationId, Committed>
  throwOn(method: FaceMethod, error: unknown): void
  checkExistenceOnQuery(check: boolean): void
  failWith(failure: SessionFailure): void
  failNext(...failures: readonly SessionFailure[]): void
  failQueryWith(failure: SessionFailure | undefined): void
  resolveQueryWith(resolution: OperationResolution | undefined): void
  answerControlWith(answer: ControlAnswer | undefined): void
  settleBackgroundAt(state: 'propagating' | 'reconciled'): void
  listBackground(calls: readonly Readonly<{ kind: 'tool'; call: string }>[]): void
  loseAnswers(count: number): void
  restore(): void
  addRun(session: SessionId, run: string): void
  addEntry(
    session: SessionId,
    entry: Readonly<{ id: string; kind: string; payload: unknown }>,
  ): void
  sessions(): ReadonlyMap<string, SessionRecord>
  waitWith(waiting: SessionWaiting | null): void
}>

export type SessionDouble = Readonly<{
  faces: SessionAccessFaces
  controls: SessionDoubleControls
}>

export type SessionDoubleOptions = Readonly<{
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

export function createSessionDouble(options: SessionDoubleOptions): SessionDouble {
  const calls: SessionDoubleRecord[] = []
  const committed = new Map<SessionOperationId, Committed>()
  const sessions = new Map<string, SessionRecord>()
  const throwing = new Map<FaceMethod, unknown>()
  let forcedFailure: SessionFailure | undefined
  let existenceOnQuery = true
  let commits = 0
  let lostAnswers = 0
  let queryFailure: SessionFailure | undefined
  let queryResolution: OperationResolution | undefined
  let controlAnswer: ControlAnswer | undefined
  let backgroundState: 'propagating' | 'reconciled' = 'propagating'
  let backgroundList: readonly Readonly<{ kind: 'tool'; call: string }>[] = []
  const failures: SessionFailure[] = []
  let waitingAnswer: SessionWaiting | null = null

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

  const commit = (
    kind: string,
    operation: SessionOperationId,
    content: unknown,
  ): Outcome<CommitReceipt, SessionFailure> => {
    const next = failures.shift()
    if (next !== undefined) return fail(next)
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
    if (lostAnswers > 0) {
      lostAnswers -= 1
      return fail({ kind: 'commit-unknown', operation })
    }
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

  const work: Pick<
    SessionWork<P>,
    | 'accept'
    | 'queryOperation'
    | 'cancelRun'
    | 'stopCall'
    | 'retryRun'
    | 'readWaiting'
    | 'control'
    | 'readBackgroundCalls'
  > = {
    async control(input) {
      record('control', input, input.intent)
      if (accessDenied(input)) return fail({ kind: 'denied', action: 'control' })
      if (existing(input) === undefined) return fail({ kind: 'denied', action: 'control' })
      const outcome = commit('control', input.operation, { kind: 'control', intent: input.intent })
      if ('failure' in outcome) return outcome
      const progress = {
        operation: input.operation,
        target: { kind: 'session' },
        intent: { kind: 'control', value: input.intent },
        state: backgroundState,
        pending: [],
      } as never
      return succeed({ receipt: outcome.ok, progress })
    },
    async readBackgroundCalls(input) {
      record('readBackgroundCalls', input, {})
      if (accessDenied(input)) return fail({ kind: 'denied', action: 'readBackgroundCalls' })
      if (existing(input) === undefined)
        return fail({ kind: 'denied', action: 'readBackgroundCalls' })
      if (forcedFailure !== undefined) return fail(forcedFailure)
      return succeed(
        backgroundList.map((producer, index) => ({
          id: `b${index + 1}`,
          producer,
          label: { intent: 'build', tool: 'Shell', command: 'execute', preview: 'pnpm build' },
          source: 'launched' as const,
          status: 'running' as const,
          lastLine: null,
        })),
      )
    },
    async readWaiting(input) {
      record('readWaiting', input, {})
      if (accessDenied(input)) return fail({ kind: 'denied', action: 'readWaiting' })
      if (existing(input) === undefined) return fail({ kind: 'denied', action: 'readWaiting' })
      if (forcedFailure !== undefined) return fail(forcedFailure)
      return succeed(waitingAnswer)
    },
    async retryRun(input) {
      record('retryRun', input, { run: input.run })
      if (accessDenied(input)) return fail({ kind: 'denied', action: 'retryRun' })
      if (existing(input) === undefined) return fail({ kind: 'denied', action: 'retryRun' })
      return commit('retryRun', input.operation, { kind: 'retryRun', run: input.run })
    },
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
      if (queryFailure !== undefined) return fail(queryFailure)
      if (queryResolution !== undefined) return succeed(queryResolution)
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
      const known: ControlAnswer = session.runs.has(input.run)
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
      const answer = controlAnswer ?? known
      return succeed({ operation: input.operation, source: outcome.ok.source, answer })
    },
    async stopCall(input) {
      record('stopCall', input, { producer: input.producer })
      if (accessDenied(input)) return fail({ kind: 'denied', action: 'stopCall' })
      if (existing(input) === undefined) return fail({ kind: 'denied', action: 'stopCall' })
      const outcome = commit('stopCall', input.operation, {
        kind: 'stopCall',
        producer: input.producer,
      })
      if ('failure' in outcome) return outcome
      return succeed({
        operation: input.operation,
        source: outcome.ok.source,
        answer: controlAnswer ?? { kind: 'not-found' },
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
      checkExistenceOnQuery: (check: boolean) => {
        existenceOnQuery = check
      },
      failWith: (failure: SessionFailure) => {
        forcedFailure = failure
      },
      failNext: (...next: readonly SessionFailure[]) => {
        failures.push(...next)
      },
      failQueryWith: (failure: SessionFailure | undefined) => {
        queryFailure = failure
      },
      resolveQueryWith: (resolution: OperationResolution | undefined) => {
        queryResolution = resolution
      },
      answerControlWith: (answer: ControlAnswer | undefined) => {
        controlAnswer = answer
      },
      settleBackgroundAt: (state: 'propagating' | 'reconciled') => {
        backgroundState = state
      },
      listBackground: (list: readonly Readonly<{ kind: 'tool'; call: string }>[]) => {
        backgroundList = list
      },
      loseAnswers: (count: number) => {
        lostAnswers = count
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
      waitWith: (waiting: SessionWaiting | null) => {
        waitingAnswer = waiting
      },
    }),
  })
}
