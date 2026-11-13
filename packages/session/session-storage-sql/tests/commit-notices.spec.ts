// The batch of a commit, from the one writer of the session log to the notifiers registered on the
// database (#1230, SPEC「本批与提交通知」): the Session participant gives the batch in its reply,
// from the one place that writes the entries; the one landing of the main thread tells it to the
// `SessionNotifier`s registered on `storage.database`. The cases drive three committers of this
// member against the real SQLite provider (the command entry, the entries channel, the log
// channel); the fourth (the Session participation of an Agent journal commit) is in session-adapters.
// Each notice must name the revision, the batch evidence and the entry kinds of that one batch; a
// recall, a refusal and a commit that wrote no entry tell nothing; a notifier never changes or holds
// up an answer.
import type {
  CommitReceipt,
  DurableEvidence,
  HistoryEntry,
  SessionEntriesObservation,
  SessionNotifier,
  SessionRevision,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { evidence, operationId, sessionId } from '@omne-harness/session-contract/testing'
import type { TenantId } from '@omne-harness/legal-identity'
import { afterEach, describe, expect, it } from 'vitest'
import { decodeValue } from '../src/codec.ts'
import { registerSessionNotifier } from '../src/index.ts'
import { app, textOf, TENANT_A, type App } from './fixtures/app.ts'
import { unpacked } from './fixtures/packed.ts'
import {
  activeRun,
  agentEventOf,
  agentPublisher,
  eventOf,
  registrationOf,
  startRun,
} from './fixtures/real-provider.ts'

type Notice = Parameters<SessionNotifier['committed']>[0]

const SESSION = sessionId('session-1')
const base = { tenant: TENANT_A, session: SESSION }

const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}

/** The commit receipt of an answer: `create` wraps it in `receipt`, `accept` is it. */
const receiptOf = (value: unknown): CommitReceipt => {
  const answer = ok<{ receipt?: CommitReceipt } & CommitReceipt>(value)
  return answer.receipt ?? answer
}

const unregisters: (() => void)[] = []
afterEach(() => {
  for (const unregister of unregisters.splice(0)) unregister()
})

/** A notifier that records every notice, registered on the database of `a`. */
function listen(a: App, committed?: SessionNotifier['committed']) {
  const notices: Notice[] = []
  const notifier: SessionNotifier = {
    committed: notice => {
      notices.push(notice)
      return committed === undefined ? Promise.resolve() : committed(notice)
    },
  }
  const unregister = registerSessionNotifier(a.provider.storage, notifier)
  unregisters.push(unregister)
  return { notices, unregister }
}

/** The entries of session-1 of tenant A, oldest first, every kind. */
async function historyOf(a: App): Promise<readonly HistoryEntry[]> {
  const access = a.access(TENANT_A)
  const entries: HistoryEntry[] = []
  let page = ok<{ entries: HistoryEntry[]; next: string | null }>(
    await a.port.history.begin({
      ...access,
      kinds: [],
      from: null,
      direction: 'forward',
      pageBytes: 1 << 20,
    }),
  )
  for (;;) {
    entries.push(...page.entries)
    if (page.next === null) return entries
    page = ok(await a.port.history.next({ ...access, cursor: page.next }))
  }
}

/** The kinds of the entries of `revision`, without repeats, sorted. */
async function kindsOf(a: App, revision: SessionRevision): Promise<readonly string[]> {
  const entries = (await historyOf(a)).filter(entry => entry.revision === revision)
  expect(entries.length, `the log has revision ${revision}`).toBeGreaterThan(0)
  return [...new Set(entries.map(entry => entry.kind))].sort()
}

/** The stored operation record of `operation`: its form and the decoded receipt and result. */
function operationRow(a: App, operation: string) {
  const rows = a.provider.select(
    'dom_0',
    'SELECT form, receipt, result FROM sl_operation WHERE tenant = ? AND session = ? AND operation = ?',
    [textOf(TENANT_A), SESSION, operationId(operation)],
  ).rows as unknown as [string, Uint8Array, Uint8Array][]
  const [row] = rows
  if (row === undefined) throw new Error(`no record of ${operation}`)
  const [form, receipt, result] = row
  return {
    form,
    receipt: decodeValue(JSON.parse(unpacked(receipt))) as Record<string, unknown>,
    result: decodeValue(JSON.parse(unpacked(result))) as Record<string, unknown>,
    raw: `${unpacked(receipt)}${unpacked(result)}`,
  }
}

/** The commit sequence of the journal row of session-1 of tenant A. */
function commitSeqOf(a: App): string {
  const [[seq]] = a.provider.select(
    'dom_0',
    'SELECT commit_seq FROM sl_journal WHERE tenant = ? AND session = ?',
    [textOf(TENANT_A), SESSION],
  ).rows as unknown as [[bigint | number]]
  return String(seq)
}

/** The one notice the commit since `from` gave: tenant, session and the sorted kinds checked. */
async function oneNotice(a: App, notices: readonly Notice[], from: number): Promise<Notice> {
  const fresh = notices.slice(from)
  expect(fresh).toHaveLength(1)
  const notice = fresh[0] as Notice
  expect(notice.tenant as TenantId).toEqual(TENANT_A)
  expect(notice.session).toBe(SESSION)
  expect([...notice.kinds].sort()).toEqual(await kindsOf(a, notice.revision))
  expect(notice.source.revision).toBe(notice.revision)
  return notice
}

/** A session with a running Run, and an entries observation of one Tool call of it. */
async function entriesScene() {
  const a = await app()
  ok(await a.create(TENANT_A))
  ok(await a.accept(TENANT_A, 'session-1', 'input-1'))
  ok(await startRun(a, 'start-run-1'))
  const snapshot = ok<WorkSnapshot>(await a.port.readWork(a.access(TENANT_A)))
  if (snapshot.run.kind !== 'active') throw new Error('the Run is not active')
  const call = 'entries-call-1'
  ok(
    await a.port.commit({
      access: a.access(TENANT_A),
      command: {
        kind: 'bindExternalCall',
        input: {
          ...base,
          operation: operationId('entries-bind'),
          expected: snapshot.revision,
          qualification: evidence('entries/qualified'),
          binding: {
            producer: { kind: 'tool', call },
            action: 'action',
            consumer: { owner: 'session', work: 'work', position: 'entries-at', purpose: 'action' },
            request: evidence('entries/request'),
            initiatingAttempt: null,
          },
        },
      },
      guards: [],
    }),
  )
  const execution = snapshot.run.execution.execution
  const observation: SessionEntriesObservation = {
    ...base,
    run: snapshot.run.run,
    execution,
    channel: 'tool-received',
    operation: operationId('entries-1'),
    after: '0',
    through: '2',
    boundary: {
      execution,
      channel: 'tool-received',
      revision: '1',
      executionEvidence: evidence('agent/head'),
      count: '3',
    },
    items: [
      {
        ordinal: '1',
        key: 'key-1',
        fact: evidence('agent/entry/1'),
        interpretation: [
          { kind: 'execution', producer: { kind: 'tool', call }, source: evidence('t/f') },
        ],
      },
      {
        ordinal: '2',
        key: 'key-2',
        fact: evidence('agent/entry/2'),
        interpretation: [{ kind: 'observed' }],
      },
    ],
  }
  const commitEntries = a.port.commitEntries
  return { a, observation, commitEntries }
}

/** A session with a running Run, the Agent event 1 of its execution published, and its observation. */
async function logScene() {
  const a = await app()
  const agent = agentPublisher({
    storage: a.provider.storage,
    combination: { combinationVersion: 'c1', manifestDigest: 'a'.repeat(64) },
    domainOf: () => 'dom_0',
  })
  ok(await a.create(TENANT_A))
  ok(await a.accept(TENANT_A, 'session-1', 'input-1'))
  ok(await startRun(a, 'start-run-1'))
  const run = activeRun(ok(await a.port.readWork(a.access(TENANT_A))))
  const observation = eventOf(run, 1, [registrationOf(run.attempt, 1)], 'log-1')
  await agent.publish(agentEventOf(observation))
  const commitLog = a.port.commitLog
  if (commitLog === undefined) throw new Error('the SQL port offers no commitLog')
  return { a, observation, commitLog }
}

describe('each committer of this member: one notice of the batch it wrote', () => {
  it('the command entry: revision, batch evidence and kinds of the receipt', async () => {
    const a = await app()
    const { notices } = listen(a)
    const created = receiptOf(await a.create(TENANT_A))
    const first = await oneNotice(a, notices, 0)
    expect(first.revision).toBe(created.revision)
    expect(first.source).toEqual(created.source)
    const accepted = receiptOf(await a.accept(TENANT_A, 'session-1', 'input-1'))
    const second = await oneNotice(a, notices, 1)
    expect(second.revision).toBe(accepted.revision)
    expect(second.source).toEqual(accepted.source)
    expect([...second.kinds].sort()).toEqual(['intake.routed', 'message.user'])
  })

  it('the entries channel: the batch receipt the record keeps', async () => {
    const { a, observation, commitEntries } = await entriesScene()
    const { notices } = listen(a)
    ok(await commitEntries({ observation, start: { kind: 'initial' } }))
    const notice = await oneNotice(a, notices, 0)
    const record = operationRow(a, 'entries-1')
    expect(record.form).toBe('entries')
    expect(notice.revision).toBe(record.receipt['revision'])
    expect(notice.source).toEqual(record.receipt['source'] as DurableEvidence)
    expect(notice.kinds).toContain('entries.interpreted')
  })

  it('the log channel: the batch evidence, not the evidence of the progress row', async () => {
    const { a, observation, commitLog } = await logScene()
    const { notices } = listen(a)
    const receipt = ok<{ interpreted: DurableEvidence }>(await commitLog({ observation }))
    const notice = await oneNotice(a, notices, 0)
    expect(notice.source.record).toBe(`${textOf(TENANT_A)}/${SESSION}/${commitSeqOf(a)}`)
    expect(notice.source).not.toEqual(receipt.interpreted)
    expect(notice.kinds).toContain('call.bound')
    expect(notice.kinds).toContain('history.annotated')
  })
})

describe('no notice without a fresh batch', () => {
  it('the same command again is recalled by the storage: no notice', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    const { notices } = listen(a)
    ok(await a.accept(TENANT_A, 'session-1', 'input-1'))
    ok(await a.accept(TENANT_A, 'session-1', 'input-1'))
    expect(notices).toHaveLength(1)
  })

  it('the same entries commit again: no notice', async () => {
    const { a, observation, commitEntries } = await entriesScene()
    const { notices } = listen(a)
    ok(await commitEntries({ observation, start: { kind: 'initial' } }))
    ok(await commitEntries({ observation, start: { kind: 'initial' } }))
    expect(notices).toHaveLength(1)
  })

  it('the same log commit again: no notice', async () => {
    const { a, observation, commitLog } = await logScene()
    const { notices } = listen(a)
    ok(await commitLog({ observation }))
    ok(await commitLog({ observation }))
    expect(notices).toHaveLength(1)
  })

  it('a fresh storage commit whose writer answers recovered (a covered event, another operation): no notice', async () => {
    const { a, observation, commitLog } = await logScene()
    ok(await commitLog({ observation }))
    const { notices } = listen(a)
    const again = ok<{ recovered: boolean }>(
      await commitLog({ observation: { ...observation, operation: operationId('log-1-again') } }),
    )
    expect(again.recovered).toBe(true)
    expect(notices).toHaveLength(0)
  })

  it('a refused commit rolls back: no notice', async () => {
    const { a, observation, commitEntries } = await entriesScene()
    const { notices } = listen(a)
    const refused = await commitEntries({
      observation: { ...observation, after: '5' },
      start: { kind: 'initial' },
    })
    expect(refused).toHaveProperty('failure')
    expect(notices).toHaveLength(0)
  })

  it('a command the writer answers without writing an entry: no notice', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    const { notices } = listen(a)
    const before = (await historyOf(a)).length
    // Auto archive is not enabled for the session: the writer answers success and writes nothing.
    ok(
      await a.port.commit({
        access: a.access(TENANT_A),
        command: {
          kind: 'considerAutoArchive',
          input: { ...base, operation: operationId('consider'), idleEvidence: evidence('idle') },
        },
        guards: [],
      }),
    )
    expect((await historyOf(a)).length).toBe(before)
    expect(notices).toHaveLength(0)
  })

  it('a receipt lookup (a read-only intent) tells nothing', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    const { notices } = listen(a)
    ok(
      await a.port.queryOperation({
        ...a.access(TENANT_A),
        operation: operationId('create-session-1'),
      }),
    )
    expect(notices).toHaveLength(0)
  })
})

describe('a notifier never changes or holds up an answer', () => {
  it('a notifier that throws, rejects or never settles: the same answers, on time', async () => {
    const plain = await app()
    const throwing = await app()
    const rejecting = await app()
    const hanging = await app()
    listen(throwing, () => {
      throw new Error('bus down')
    })
    listen(rejecting, () => Promise.reject(new Error('bus down')))
    listen(hanging, () => new Promise<void>(() => undefined))
    for (const a of [plain, throwing, rejecting, hanging]) {
      const created = receiptOf(await a.create(TENANT_A))
      const accepted = receiptOf(await a.accept(TENANT_A, 'session-1', 'input-1'))
      expect(created.revision).toBe('1')
      expect(accepted.revision).toBe('2')
      expect(accepted.recovered).toBe(false)
    }
  })

  it('after the notifier is unregistered it hears nothing; with none registered all is as before', async () => {
    const a = await app()
    const { notices, unregister } = listen(a)
    ok(await a.create(TENANT_A))
    unregister()
    ok(await a.accept(TENANT_A, 'session-1', 'input-1'))
    expect(notices).toHaveLength(1)
  })

  it('each registered notifier of the database hears the batch once', async () => {
    const a = await app()
    const one = listen(a)
    const two = listen(a)
    ok(await a.create(TENANT_A))
    expect(one.notices).toHaveLength(1)
    expect(two.notices).toHaveLength(1)
  })
})

describe('the stored operation record keeps no batch', () => {
  it('sl_operation of the three committers has no batch member', async () => {
    const { a, observation, commitEntries } = await entriesScene()
    ok(await commitEntries({ observation, start: { kind: 'initial' } }))
    for (const operation of ['create-session-1', 'accept-input-1', 'entries-bind', 'entries-1'])
      expect(operationRow(a, operation).raw).not.toContain('"batch"')
    const log = await logScene()
    ok(await log.commitLog({ observation: log.observation }))
    expect(operationRow(log.a, 'log-1').raw).not.toContain('"batch"')
  })
})
