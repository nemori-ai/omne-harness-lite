// The read-session-diagnostics operation on the session location (SPEC「会话位置」,「会话诊断投影」):
// the judgment order of read-history, `denied` byte for byte, the deployment bound, the sealed
// cursor and its re-judged continuation, the absent ports and configuration, and the read-only
// promise against the Session, Model and Tool doubles.
import { afterEach, describe, expect, it } from 'vitest'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { HistoryEntry, HistoryPage, SessionHistory } from '@omne-harness/session-contract'
import {
  ServerEntryConfigError,
  createServerEntry,
  type ServerEntryConfig,
  type SessionIngressFaces,
} from '../src/index.ts'
import {
  SESSION_PATH,
  baseConfig,
  createSession,
  login,
  send,
  sessionMessage,
  startFixture,
  type Fixture,
  type Login,
} from './support/harness.ts'

type P = ActingForTenantPrincipal

const KINDS = ['run.started', 'run.terminal', 'call.bound', 'message.user']
const adoption = { owner: 'fixture', name: 'thing', revision: '1', digest: 'sha256:thing' }
const evidence = (record: string) => ({ owner: 'fixture', record, revision: '1', digest: 'd' })

function tree(value: unknown): JsonValue {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(tree) }
  return {
    kind: 'object',
    entries: Object.entries(value as object).map(([key, item]) => ({ key, value: tree(item) })),
  }
}

function entry(id: string, kind: string, payload: unknown): HistoryEntry {
  return {
    id: id as never,
    revision: '1' as never,
    kind,
    schema: adoption,
    payload: tree(payload),
    origin: { owner: 'session', via: null, source: evidence(id) },
  }
}

const runEntries = (run: string, at: number): HistoryEntry[] => [
  entry(`e${at}`, 'run.started', {
    run,
    execution: `exec-${run}`,
    entry: 'interactive',
    first: 'in',
    predecessor: null,
    adoption,
  }),
  entry(`e${at + 1}`, 'call.bound', {
    consumption: `c${at}`,
    binding: {
      producer: { kind: 'model', call: 'mc' },
      action: 'a',
      consumer: { owner: 'agent', id: 'x' },
      request: evidence('r'),
      initiatingAttempt: null,
    },
    reference: `m-${run}`,
    purpose: 'main',
    kind: 'model',
  }),
  entry(`e${at + 2}`, 'run.terminal', {
    terminal: { run, outcome: 'failed', evidence: evidence('t') },
    sequence: null,
    cause: evidence('model-refused'),
    disposition: null,
    bounded: null,
  }),
]

type Doubles = Readonly<{
  writes: () => number
  entries: HistoryEntry[]
  begins: unknown[]
}>

/**
 * A fixture whose Session faces delegate to the harness double, except that a history read that
 * the double admits answers the entries of this file. The ports count their writes.
 */
async function diagnosticsFixture(
  options: Readonly<{
    config?: Partial<ServerEntryConfig>
    ports?: boolean
    throwOnBegin?: boolean
    /** False leaves the three projection fields out of the configuration. */
    configured?: boolean
  }> = {},
): Promise<Fixture & { doubles: Doubles }> {
  let target: SessionIngressFaces<P> | undefined
  const entries: HistoryEntry[] = []
  const begins: unknown[] = []
  const page = (from: string | null): HistoryPage => {
    const end = from === null ? entries.length : entries.findIndex(item => item.id === from)
    return {
      source: 'double',
      interpreter: adoption,
      upper: '7' as never,
      entries: entries.slice(0, end).reverse(),
      scannedThrough: 'pos:0',
      next: null,
      exhausted: true,
      annotations: [],
    }
  }
  const history: Pick<SessionHistory<P>, 'begin' | 'next'> = {
    async begin(input) {
      if (options.throwOnBegin) throw new Error('read lost')
      begins.push({
        kinds: input.kinds,
        from: input.from,
        direction: input.direction,
        pageBytes: input.pageBytes,
      })
      const admitted = await target!.history.begin(input)
      if ('failure' in admitted) return admitted
      return succeed(page(input.from))
    },
    next: input => target!.history.next(input),
  }
  const faces: SessionIngressFaces<P> = {
    management: { create: input => target!.management.create(input) },
    work: {
      accept: input => target!.work.accept(input),
      queryOperation: input => target!.work.queryOperation(input),
      cancelRun: input => target!.work.cancelRun(input),
      stopCall: input => target!.work.stopCall(input),
    },
    history,
  }
  let writes = 0
  const ports =
    options.ports === false
      ? {}
      : {
          modelCalls: {
            inspect: async () => succeed({ kind: 'not-accepted', operation: 'op' }),
            admit: async () => {
              writes += 1
              return fail({ kind: 'denied', action: 'admit' })
            },
          } as never,
          modelDiagnostics: { list: async () => fail({ kind: 'denied', action: 'list' }) } as never,
          toolQueries: {
            lookup: async () => fail({ kind: 'denied', action: 'lookup' }),
            account: async () => fail({ kind: 'denied', action: 'account' }),
            control: async () => {
              writes += 1
              return { kind: 'rejected' }
            },
          } as never,
          agentJournal: {
            readFinish: async () =>
              succeed({
                candidate: 'f1',
                conclusion: { kind: 'fail', cause: evidence('c') },
                inputWatermark: evidence('w'),
                obligations: null,
                beforeTerminal: null,
                failure: {
                  kind: 'model-refused',
                  call: 'mc',
                  failure: { kind: 'capacity', required: {} },
                  step: null,
                  at: '0',
                  source: evidence('f'),
                },
              }),
          } as never,
        }
  const fixture = await startFixture({
    config: {
      maxPageBytes: 4096,
      ...(options.configured === false
        ? {}
        : { diagnosticsKinds: KINDS, maxRuns: 1, maxCallsPerRun: 4 }),
      ...options.config,
    },
    dependencies: { session: faces, ...ports },
  })
  target = fixture.session.faces
  return { ...fixture, doubles: { writes: () => writes, entries, begins } }
}

let fixture: (Fixture & { doubles: Doubles }) | undefined
afterEach(async () => {
  await fixture?.stop()
  fixture = undefined
})

type Page = Readonly<{
  runs: readonly Readonly<{ run: string; terminal: unknown; modelCalls: readonly unknown[] }>[]
  next: string | null
  exhausted: boolean
  basis: Readonly<{ upper: string }>
  gaps: readonly unknown[]
}>

const diagnostics = (
  who: Login,
  body: Record<string, unknown>,
  messageId = 'm-1',
  proof: string | undefined = who.loginProof,
) =>
  send(fixture!.port, SESSION_PATH, {
    body: sessionMessage(
      'read-session-diagnostics',
      body,
      proof === undefined ? {} : { loginProof: proof },
      messageId,
    ),
  })
const firstPage = (who: Login, session: string, extra: Record<string, unknown> = {}) =>
  diagnostics(who, {
    tenant: who.tenantText,
    session,
    cursor: null,
    run: null,
    pageBytes: '1024',
    ...extra,
  })
const outcomeOf = (json: unknown): string => (json as { outcome: string }).outcome
const bodyOf = (json: unknown): Page => (json as { body: Page }).body

describe('the judgment order of read-history', () => {
  it('reads the first page from begin with the configured kinds, backward from the newest, and the next page from the cursor', async () => {
    fixture = await diagnosticsFixture()
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    fixture.doubles.entries.push(...runEntries('r1', 1), ...runEntries('r2', 4))
    const first = await firstPage(who, session)
    expect(first.status).toBe(200)
    const page = bodyOf(first.json)
    expect(Object.keys(page).sort()).toEqual([
      'basis',
      'exhausted',
      'gaps',
      'next',
      'runs',
      'scannedThrough',
    ])
    expect(page.runs.map(run => run.run)).toEqual(['r2'])
    expect(page.runs[0]!.terminal).toEqual({
      outcome: 'failed',
      cause: {
        record: 'model-refused',
        structured: { kind: 'model-refused', failure: 'capacity' },
      },
    })
    expect(page.runs[0]!.modelCalls[0]).toMatchObject({
      reference: 'm-r2',
      call: { kind: 'unknown', reason: 'not-accepted' },
    })
    expect(page.basis).toEqual({ upper: '7' })
    expect(page.exhausted).toBe(false)
    expect(page.next).not.toBeNull()
    expect(fixture.doubles.begins[0]).toEqual({
      kinds: KINDS,
      from: null,
      direction: 'backward',
      pageBytes: 1024,
    })
    const second = await diagnostics(who, { tenant: who.tenantText, session, cursor: page.next })
    expect(second.status).toBe(200)
    const next = bodyOf(second.json)
    expect(next.runs.map(run => run.run)).toEqual(['r1'])
    expect(next.exhausted).toBe(true)
    expect(next.next).toBeNull()
    expect(fixture.doubles.begins[1]).toMatchObject({
      kinds: KINDS,
      from: 'e4',
      direction: 'backward',
      pageBytes: 1024,
    })
  })

  it('rejects a null cursor without run or pageBytes, and a cursor beside them, before any identity call', async () => {
    fixture = await diagnosticsFixture()
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    const calls = fixture.session.controls.calls().length
    for (const body of [
      { tenant: who.tenantText, session, cursor: null, pageBytes: '10' },
      { tenant: who.tenantText, session, cursor: null, run: null },
      { tenant: who.tenantText, session, cursor: 'c', run: null },
      { tenant: who.tenantText, session, cursor: 'c', pageBytes: '10' },
    ]) {
      const reply = await diagnostics(who, body)
      expect(reply.status, JSON.stringify(body)).toBe(400)
      expect(outcomeOf(reply.json)).toBe('protocol-rejected')
    }
    expect(fixture.session.controls.calls().length).toBe(calls)
  })

  it('answers invalid to pageBytes over the deployment bound without calling Session', async () => {
    fixture = await diagnosticsFixture({ config: { maxPageBytes: 1000 } })
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    const calls = fixture.session.controls.calls().length
    const over = await firstPage(who, session, { pageBytes: '1001' })
    expect(over.status).toBe(422)
    expect(outcomeOf(over.json)).toBe('invalid')
    expect(fixture.session.controls.calls().length).toBe(calls)
    const at = await firstPage(who, session, { pageBytes: '1000' })
    expect(at.status).toBe(200)
  })

  it('answers denied byte for byte like read-history to another tenant session and to an unknown session', async () => {
    fixture = await diagnosticsFixture()
    const alice = await login(fixture, 'alice')
    const bob = await login(fixture, 'bob')
    const aliceSession = await createSession(fixture, alice)
    const unknownSession = 'f'.repeat(64)
    const replies = await Promise.all([
      diagnostics(
        bob,
        {
          tenant: alice.tenantText,
          session: aliceSession,
          cursor: null,
          run: null,
          pageBytes: '10',
        },
        'm-same',
      ),
      diagnostics(
        alice,
        {
          tenant: alice.tenantText,
          session: unknownSession,
          cursor: null,
          run: null,
          pageBytes: '10',
        },
        'm-same',
      ),
      diagnostics(
        alice,
        {
          tenant: alice.tenantText,
          session: aliceSession,
          cursor: null,
          run: null,
          pageBytes: '10',
        },
        'm-same',
        'forged',
      ),
      send(fixture.port, SESSION_PATH, {
        body: sessionMessage(
          'read-history',
          {
            tenant: alice.tenantText,
            session: unknownSession,
            cursor: null,
            direction: 'backward',
            pageBytes: '10',
          },
          { loginProof: alice.loginProof },
          'm-same',
        ),
      }),
    ])
    for (const reply of replies) {
      expect(reply.status).toBe(403)
      expect(reply.text).toBe(replies[0].text)
      expect(reply.headers['content-length']).toBe(replies[0].headers['content-length'])
    }
    expect(replies[0].json).toEqual({
      protocolVersion: 'session-public/1',
      messageId: 'm-same',
      outcome: 'denied',
      body: {},
    })
  })

  it('answers basis-unavailable when the Session read throws, with status 503', async () => {
    fixture = await diagnosticsFixture({ throwOnBegin: true })
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    const reply = await firstPage(who, session)
    expect(reply.status).toBe(503)
    expect(outcomeOf(reply.json)).toBe('basis-unavailable')
  })

  it('answers basis-unavailable before Session when the deployment has not configured the projection', async () => {
    fixture = await diagnosticsFixture({ configured: false })
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    const calls = fixture.session.controls.calls().length
    const reply = await firstPage(who, session)
    expect(reply.status).toBe(503)
    expect(outcomeOf(reply.json)).toBe('basis-unavailable')
    expect(fixture.session.controls.calls().length).toBe(calls)
  })

  it('refuses a configuration that gives only some of the three projection fields', () => {
    expect(() =>
      createServerEntry({
        config: baseConfig({ diagnosticsKinds: KINDS, maxRuns: 1 }),
        dependencies: {} as never,
      }),
    ).toThrow(ServerEntryConfigError)
    expect(() =>
      createServerEntry({
        config: baseConfig({ diagnosticsKinds: KINDS, maxRuns: 1, maxCallsPerRun: 0 }),
        dependencies: {} as never,
      }),
    ).toThrow(ServerEntryConfigError)
  })
})

describe('the cursor', () => {
  it('answers invalid to a tampered cursor and to the cursor of another session, and re-judges eligibility when continuing', async () => {
    fixture = await diagnosticsFixture()
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    const other = await createSession(fixture, who, 'create-2')
    fixture.doubles.entries.push(...runEntries('r1', 1), ...runEntries('r2', 4))
    const cursor = bodyOf((await firstPage(who, session)).json).next
    if (cursor === null) throw new Error('expected a cursor')
    // Flip a character in the middle of the payload part. The last character of a base64url text
    // may differ only in padding bits, which decode to the same bytes, so the end is no place to tamper.
    const payloadEnd = cursor.indexOf('.')
    const middle = Math.floor(payloadEnd / 2)
    const tampered = `${cursor.slice(0, middle)}${cursor[middle] === 'A' ? 'B' : 'A'}${cursor.slice(middle + 1)}`
    for (const [name, body] of [
      ['tampered', { tenant: who.tenantText, session, cursor: tampered }],
      ['another session', { tenant: who.tenantText, session: other, cursor }],
      ['forged', { tenant: who.tenantText, session, cursor: 'forged' }],
    ] as const) {
      const reply = await diagnostics(who, body)
      expect(reply.status, name).toBe(422)
      expect(outcomeOf(reply.json)).toBe('invalid')
    }
    const calls = fixture.session.controls.calls().length
    fixture.members.get(`${who.tenant.organization.text}/${who.accountText}`)?.clear()
    const revoked = await diagnostics(who, { tenant: who.tenantText, session, cursor })
    expect(revoked.status).toBe(403)
    expect(outcomeOf(revoked.json)).toBe('denied')
    // The continuation reached Session, which judged the eligibility again.
    expect(fixture.session.controls.calls().length).toBe(calls + 1)
  })
})

describe('absent ports and the read-only promise', () => {
  it('answers gaps for the Model, Tool and Agent branches when their ports are absent', async () => {
    fixture = await diagnosticsFixture({ ports: false })
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    fixture.doubles.entries.push(...runEntries('r1', 1))
    const page = bodyOf((await firstPage(who, session)).json)
    const gaps = page.gaps as readonly { reason: string }[]
    // The deployment discloses four kinds, so the other projected kinds are not-disclosed gaps.
    expect(gaps.filter(gap => gap.reason === 'not-disclosed')).toHaveLength(11)
    expect(gaps.filter(gap => gap.reason !== 'not-disclosed')).toEqual([
      { source: 'agent', subject: 'exec-r1', reason: 'unsupported' },
      { source: 'model', subject: 'm-r1', reason: 'unsupported' },
    ])
    expect(page.runs[0]!.terminal).toMatchObject({
      cause: { structured: { kind: 'unknown', reason: 'unsupported' } },
    })
  })

  it('writes nothing to Session, Model or Tool', async () => {
    fixture = await diagnosticsFixture()
    const who = await login(fixture, 'alice')
    const session = await createSession(fixture, who)
    fixture.doubles.entries.push(...runEntries('r1', 1))
    const committed = fixture.session.controls.committed().size
    const before = fixture.session.controls.calls().length
    const reply = await firstPage(who, session)
    expect(reply.status).toBe(200)
    expect(fixture.session.controls.committed().size).toBe(committed)
    const calls = fixture.session.controls.calls().slice(before)
    expect(calls.map(call => call.method)).toEqual(['history.begin'])
    expect(fixture.doubles.writes()).toBe(0)
  })
})
