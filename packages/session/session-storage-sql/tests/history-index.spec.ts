// K-5 and the observed-only prefixes (R2-D28 candidate C) over the node:sqlite test provider. The
// history index of a decision is read in its own write transaction from the same-root index of
// `execution-record`: the execution boundary, the fact boundaries, the batches and the original
// input directory of the relations the decision names, by point and range lookups. A placeholder
// head receipt, a missing fact row, an empty or unknown kind and a mixed tail are not proofs: the
// pure layer answers `unavailable` for them. The prefix rule is a pure function; its table runs
// every small input.
import { afterEach, describe, expect, it } from 'vitest'
import type {
  ExecutionHistoryBoundary,
  SessionFailure,
  SessionLogConsequence,
  SessionLogReceipt,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { evidence, operationId, sessionId } from '@omne-harness/session-contract/testing'
import { encodeValue } from '../src/codec.ts'
import { executionRecordFacts } from '../src/participants.ts'
import { observedPrefix, readHistory } from '../src/worker/history-index.ts'
import { app, textOf, TENANT_A, type App } from './fixtures/app.ts'
import {
  activeRun,
  agentEventOf,
  agentPublisher,
  cancelRun,
  eventOf,
  identityOf,
  openRealApp,
  registrationOf,
  startRun,
  workOf,
  type AgentPublisher,
  type RealApp,
} from './fixtures/real-provider.ts'

const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}
const failureOf = (value: unknown): SessionFailure => {
  expect(value, JSON.stringify(value)).toHaveProperty('failure')
  return (value as { failure: SessionFailure }).failure
}

const SESSION = 'session-1'
const commitLog = (a: App, observation: Parameters<NonNullable<App['port']['commitLog']>>[0]) => {
  if (a.port.commitLog === undefined) throw new Error('the SQL port offers no commitLog')
  return a.port.commitLog(observation)
}

type Scene = Readonly<{ a: App; agent: AgentPublisher }>

async function created(): Promise<Scene> {
  const a = await app()
  const agent = agentPublisher({
    storage: a.provider.storage,
    combination: { combinationVersion: 'c1', manifestDigest: 'a'.repeat(64) },
    domainOf: () => 'dom_0',
  })
  ok(await a.create(TENANT_A))
  return { a, agent }
}

/** Opens Run `n` on the first pending input: accepts `input-<n>` first when `accept` is set. */
async function open(s: Scene, n: number, accept = true) {
  if (accept) ok(await s.a.accept(TENANT_A, SESSION, `input-${String(n)}`))
  ok(await startRun(s.a, `start-run-${String(n)}`))
  return activeRun(await workOf(s.a))
}

/** Publishes event `n` of the Run and interprets it with one registration. */
async function interpreted(s: Scene, run: ReturnType<typeof activeRun>, n: number) {
  const event = eventOf(
    run,
    n,
    [registrationOf(run.attempt, `${run.execution}-${String(n)}`)],
    `log-${run.execution}-${String(n)}`,
  )
  await s.agent.publish(agentEventOf(event))
  return ok<SessionLogReceipt>(await commitLog(s.a, { observation: event }))
}

/** The history index of session-1 as one decision reads it, over the committed rows. */
function indexOf(a: App, work: WorkSnapshot, execution: string) {
  const port = {
    execute: (sql: string, params: readonly unknown[]) =>
      a.provider.select('dom_0', sql, params as never),
  }
  const history = readHistory(
    port,
    textOf(TENANT_A),
    SESSION,
    work,
    { kind: 'pending', inputs: work.pending },
    undefined,
    {
      executions: [execution],
      event: null,
    },
  )
  if (history === 'too-many') throw new Error('too many rows')
  return history
}

describe('K-5: the Agent rows of a decision in its own transaction', () => {
  it('the index holds the boundary, the facts, the batch and the admissions of the rows as written', async () => {
    const s = await created()
    const run = await open(s, 1)
    ok(await s.a.accept(TENANT_A, SESSION, 'input-2'))
    const second = (await workOf(s.a)).pending[0]
    if (second === undefined) throw new Error('input-2 is not pending')
    const batch = { id: 'batch-1', watermark: evidence('agent/watermark/1'), ordered: [second] }
    await s.agent.publish({
      ...agentEventOf(eventOf(run, 1, [{ kind: 'input-taken', batch: batch as never }], 'unused')),
      batch,
    })
    await s.agent.admit({
      tenant: TENANT_A,
      session: SESSION,
      execution: run.execution,
      input: second,
      operation: 'aop-submit-2',
      accepted: evidence('agent/accepted/2'),
      grant: evidence('agent/grant/2'),
      attachment: 'attachment-1',
    })
    const work = await workOf(s.a)
    const { index, reads } = indexOf(s.a, work, run.execution)
    const boundary = index.executions.find(item => item.execution === run.execution)
    expect(boundary).toMatchObject({
      run: run.run,
      revision: '1',
      executionEvidence: evidence(`${run.execution}/head/1`),
      emittedThrough: '1',
      readThrough: '0',
      interpreted: null,
      ended: null,
      facts: [
        { sequence: '1', source: evidence(`${run.execution}/event/1`), kinds: ['input-taken'] },
      ],
    } satisfies Partial<ExecutionHistoryBoundary>)
    expect(index.batches).toEqual([
      {
        run: run.run,
        execution: run.execution,
        sequence: '1',
        source: evidence(`${run.execution}/event/1`),
        batch,
      },
    ])
    const directory = index.inputs.find(item => item.input === second)
    expect(directory).toMatchObject({
      count: '1',
      members: [
        {
          ordinal: '0',
          execution: run.execution,
          run: run.run,
          attempt: run.attempt,
          operation: 'aop-submit-2',
        },
      ],
    })
    expect(reads.admissions).toEqual([
      expect.objectContaining({
        input: second,
        offset: '0',
        next: null,
        records: [
          expect.objectContaining({
            grant: evidence('agent/grant/2'),
            attachment: 'attachment-1',
            accepted: evidence('agent/accepted/2'),
          }),
        ],
      }),
    ])
  })

  it('one storage commit publishes the Agent event and interprets it: the judgment reads the rows of the same transaction', async () => {
    const s = await created()
    const run = await open(s, 1)
    const event = eventOf(run, 1, [registrationOf(run.attempt, 1)], 'log-joint')
    const result = await s.a.provider.storage.commit({
      identity: identityOf(TENANT_A, 'dom_0', 'aop_joint_log'),
      combinationVersion: 'c1',
      manifestDigest: 'a'.repeat(64),
      commands: [
        executionRecordFacts({
          tenant: TENANT_A,
          session: sessionId(SESSION),
          execution: run.execution,
          expected: null,
          revision: '1',
          published: '0',
          operation: 'aop_joint_log',
          digest: 'sha256:joint-log',
          answer: { joint: true },
          state: { joint: true },
          boundaries: [
            {
              execution: run.execution,
              revision: '1',
              receipt: event.executionEvidence,
              emittedThrough: '1',
              ended: null,
            },
          ],
          facts: [
            {
              execution: run.execution,
              sequence: '1',
              source: event.source,
              kinds: ['call-registration'],
            },
          ],
          batches: [],
          admissions: [],
        }),
        { participant: 'session', facts: { intent: 'log', observation: encodeValue(event) } },
      ],
    })
    expect(result.kind).toBe('committed')
    const work = await workOf(s.a)
    expect(work.run.kind === 'active' ? work.run.execution.readThrough : null).toBe('1')
    // Without the Agent row a commit has no fact boundary of the event to judge on.
    const unpublished = eventOf(
      run,
      2,
      [registrationOf(run.attempt, 'unpublished')],
      'log-unpublished',
    )
    expect(failureOf(await commitLog(s.a, { observation: unpublished }))).toMatchObject({
      kind: 'invalid',
    })
  })

  it('a placeholder head receipt is no receipt: the execution is not indexed and the commit is unavailable', async () => {
    const s = await created()
    const run = await open(s, 1)
    const placeholder = {
      owner: 'session-log-journal',
      record: `${run.execution}/head`,
      revision: '1',
      digest: 'unknown',
    }
    const event = {
      ...eventOf(run, 1, [registrationOf(run.attempt, 1)], 'log-placeholder'),
      executionEvidence: placeholder,
    }
    await s.agent.publish(agentEventOf(event))
    expect(indexOf(s.a, await workOf(s.a), run.execution).index.executions).toEqual([])
    expect(failureOf(await commitLog(s.a, { observation: event }))).toMatchObject({
      kind: 'unavailable',
    })
  })
})

describe('R2-D28: the observed-only tail of an earlier execution', () => {
  /**
   * The counterexample of R2-D28: execution E reads through 1; input-2 is handed over to it and
   * not taken; E emits events 2 and 3; a forced cancel ends the Run. The next startRun selects
   * input-2, so it needs the tail (1, 3] of E.
   */
  async function handedTail(tail: (s: Scene, run: ReturnType<typeof activeRun>) => Promise<void>) {
    const s = await created()
    const run = await open(s, 1)
    await interpreted(s, run, 1)
    ok(await s.a.accept(TENANT_A, SESSION, 'input-2'))
    const second = (await workOf(s.a)).pending[0]
    if (second === undefined) throw new Error('input-2 is not pending')
    await s.agent.admit({
      tenant: TENANT_A,
      session: SESSION,
      execution: run.execution,
      input: second,
      operation: 'aop-submit-2',
      accepted: evidence('agent/accepted/2'),
      grant: evidence('agent/grant/2'),
      attachment: 'attachment-1',
    })
    ok(
      await s.a.port.commit({
        access: s.a.access(TENANT_A),
        command: {
          kind: 'receive',
          input: {
            tenant: TENANT_A,
            session: sessionId(SESSION),
            operation: operationId('handover-2'),
            fact: {
              kind: 'input-handover',
              execution: run.execution,
              input: second,
              result: { kind: 'accepted', receipt: evidence('agent/accepted/2') },
            },
          },
        } as never,
        guards: [],
      }),
    )
    await tail(s, run)
    ok(await cancelRun(s.a, run.run, 'cancel-1'))
    return { s, run, second }
  }

  const observed =
    (kinds: readonly string[]) => async (s: Scene, run: ReturnType<typeof activeRun>) => {
      for (const n of [2, 3])
        await s.agent.publish(
          agentEventOf(eventOf(run, n, [], 'unused'), n === 2 ? kinds : ['observed']),
        )
    }

  it('a complete observed tail lets the next startRun select the handed input', async () => {
    const { s } = await handedTail(observed(['observed']))
    ok(await startRun(s.a, 'start-run-2'))
  })

  it.each([
    [
      'a missing row',
      async (s: Scene, run: ReturnType<typeof activeRun>) => {
        await s.agent.publish(agentEventOf(eventOf(run, 3, [], 'unused'), ['observed']))
      },
    ],
    ['an empty kinds list', observed([])],
    ['an unknown kind', observed(['bogus'])],
    ['a mixed tail', observed(['observed', 'call-registration'])],
  ] as const)('%s answers unavailable, and nothing is written', async (_name, tail) => {
    const { s } = await handedTail(tail)
    const before = (await workOf(s.a)).revision
    expect(failureOf(await startRun(s.a, 'start-run-2'))).toMatchObject({ kind: 'unavailable' })
    expect((await workOf(s.a)).revision).toBe(before)
  })

  it('a tail that is not observed-only passes once its consequence is committed by commitLog', async () => {
    const { s, run } = await handedTail(async (s, run) => {
      const event = eventOf(
        run,
        2,
        [{ kind: 'observed' }, registrationOf(run.attempt, 'late')],
        'log-late',
      )
      await s.agent.publish(agentEventOf(event))
      await s.agent.publish(agentEventOf(eventOf(run, 3, [], 'unused'), ['observed']))
    })
    expect(failureOf(await startRun(s.a, 'start-run-2'))).toMatchObject({ kind: 'unavailable' })
    // The event is interpreted at the current head of the execution: the head of event 3.
    const event = {
      ...eventOf(run, 2, [{ kind: 'observed' }, registrationOf(run.attempt, 'late')], 'log-late'),
      revision: '3',
      executionEvidence: evidence(`${run.execution}/head/3`),
    }
    ok(await commitLog(s.a, { observation: event }))
    ok(await startRun(s.a, 'start-run-2-again'))
  })
})

describe('the prefix rule (a pure function)', () => {
  const boundary = (
    readThrough: string,
    facts: readonly (readonly [string, readonly string[], boolean])[],
  ) => ({
    run: 'run-1' as never,
    execution: 'execution-1',
    readThrough,
    facts: facts.map(([sequence, kinds, readable]) => ({
      sequence,
      source: readable ? evidence(`event/${sequence}`) : ({ owner: '' } as never),
      kinds: kinds as SessionLogConsequence['kind'][],
    })),
  })
  const KINDS: readonly (readonly string[])[] = [
    ['observed'],
    [],
    ['call-registration'],
    ['observed', 'ended'],
    ['observed', 'observed'],
  ]

  // Every input with progress 0 or 1 and up to three facts over sequences 1 to 4, each fact taking
  // one of the kinds above and a readable or unreadable source.
  it('gives the longest continuous, readable, observed-only run after the progress, or none', () => {
    let cases = 0
    for (const readThrough of ['0', '1'])
      for (const sequences of [[], [1], [2], [1, 2], [2, 3], [1, 3], [2, 4], [1, 2, 3], [2, 3, 4]])
        for (const kinds of product(KINDS, sequences.length))
          for (const readable of product([true, false], sequences.length)) {
            const facts = sequences.map(
              (sequence, at) => [String(sequence), kinds[at]!, readable[at]!] as const,
            )
            const prefix = observedPrefix(boundary(readThrough, facts))
            // The expectation, written independently of the walk: the longest k with every
            // sequence of (readThrough, k] present once, observed-only, non-empty and readable.
            let through = Number(readThrough)
            for (;;) {
              const next = facts.find(([sequence]) => Number(sequence) === through + 1)
              if (
                next === undefined ||
                next[1].length === 0 ||
                next[1].some(kind => kind !== 'observed') ||
                !next[2]
              )
                break
              through += 1
            }
            cases += 1
            if (through === Number(readThrough)) expect(prefix).toBeNull()
            else
              expect(prefix).toEqual({
                execution: 'execution-1',
                run: 'run-1',
                after: readThrough,
                through: String(through),
                facts: facts
                  .filter(
                    ([sequence]) =>
                      Number(sequence) > Number(readThrough) && Number(sequence) <= through,
                  )
                  .map(([sequence, kinds]) => ({
                    sequence,
                    source: evidence(`event/${sequence}`),
                    consequences: kinds.map(() => ({ kind: 'observed' })),
                  })),
              })
          }
    expect(cases).toBeGreaterThan(1000)
  })
})

function product<T>(values: readonly T[], length: number): T[][] {
  if (length === 0) return [[]]
  return product(values, length - 1).flatMap(rest => values.map(value => [...rest, value]))
}

/** The rows a participant read inside one call, split into the Agent index tables and the Session log. */
async function counted(a: App, call: () => Promise<unknown>) {
  const from = a.provider.participantReads.length
  ok(await call())
  const reads = a.provider.participantReads.slice(from)
  const sum = (pattern: RegExp) =>
    reads.filter(item => pattern.test(item.sql)).reduce((total, item) => total + item.rows, 0)
  return {
    execution: sum(/FROM er_execution/u),
    facts: sum(/FROM er_fact_idx/u),
    agent: sum(/FROM er_(execution|fact_idx|batch_idx|admission_idx)/u),
    log: sum(/FROM sl_entry/u),
  }
}

describe('the rows a decision reads per Run', () => {
  /** `rounds` Runs: each one opens, interprets one event, and is cancelled. */
  async function rounds(count: number) {
    const s = await created()
    const per: {
      start: Awaited<ReturnType<typeof counted>>
      log: Awaited<ReturnType<typeof counted>>
    }[] = []
    for (let n = 1; n <= count; n += 1) {
      ok(await s.a.accept(TENANT_A, SESSION, `input-${String(n)}`))
      const start = await counted(s.a, () => startRun(s.a, `start-run-${String(n)}`))
      const run = activeRun(await workOf(s.a))
      const event = eventOf(
        run,
        1,
        [registrationOf(run.attempt, run.execution)],
        `log-${String(n)}`,
      )
      await s.agent.publish(agentEventOf(event))
      const log = await counted(s.a, () => commitLog(s.a, { observation: event }))
      ok(await cancelRun(s.a, run.run, `cancel-${String(n)}`))
      per.push({ start, log })
    }
    return per
  }

  // Why slow: it drives 220 Runs through the real participant (heavy CPU).
  it(
    '20 and 200 Runs read the same Agent rows in the same round, and the same in every round',
    { tags: ['slow'], timeout: 600_000 },
    async () => {
      const short = await rounds(20)
      const long = await rounds(200)
      for (let at = 0; at < short.length; at += 1) {
        expect(long[at]?.start.agent).toBe(short[at]?.start.agent)
        expect(long[at]?.log.agent).toBe(short[at]?.log.agent)
      }
      expect(new Set(long.map(item => item.log.agent))).toEqual(new Set([long[0]?.log.agent]))
      expect(new Set(long.map(item => item.start.agent))).toEqual(new Set([long[0]?.start.agent]))
      expect(long.every(item => item.log.execution === 1)).toBe(true)
      // The Session log rows of the index grow with the Runs; recorded, not asserted constant.
      const report = [0, 19, 199].map(at => ({
        round: at + 1,
        start: long[at]?.start,
        log: long[at]?.log,
      }))
      console.log(`K-5 read counts: ${JSON.stringify(report)}`)
    },
  )

  it('three fixed rounds: the startRun after an observed tail reads one fact row per unread event', async () => {
    const facts: number[] = []
    for (const unread of [1, 2, 3]) {
      const s = await created()
      const run = await open(s, 1)
      await interpreted(s, run, 1)
      ok(await s.a.accept(TENANT_A, SESSION, 'input-2'))
      const second = (await workOf(s.a)).pending[0]
      if (second === undefined) throw new Error('input-2 is not pending')
      await s.agent.admit({
        tenant: TENANT_A,
        session: SESSION,
        execution: run.execution,
        input: second,
        operation: 'aop-submit-2',
        accepted: evidence('agent/accepted/2'),
        grant: evidence('agent/grant/2'),
        attachment: 'attachment-1',
      })
      for (let n = 2; n <= unread + 1; n += 1)
        await s.agent.publish(agentEventOf(eventOf(run, n, [], 'unused'), ['observed']))
      ok(await cancelRun(s.a, run.run, 'cancel-1'))
      facts.push((await counted(s.a, () => startRun(s.a, 'start-run-2'))).facts)
    }
    expect(facts).toEqual([1, 2, 3])
  })
})

describe('readWork carries the history index of its snapshot', () => {
  const reals: RealApp[] = []
  afterEach(async () => {
    for (const real of reals.splice(0)) await real.dispose()
  })

  // Why slow: real write and read Workers over real files in a temporary directory.
  it(
    'on the real provider the attempt of a call names its original execution',
    { tags: ['slow'] },
    async () => {
      const real = await openRealApp()
      reals.push(real)
      ok(await real.create(TENANT_A))
      ok(await real.accept(TENANT_A, SESSION, 'input-1'))
      ok(await startRun(real, 'start-run-1'))
      const work = await workOf(real)
      const run = activeRun(work)
      // What Session's stopCall propagation reads (session/src/control.ts): the one SE15 record of
      // the initiating attempt, and the execution it started under.
      expect(work.historyIndex?.attempts.filter(item => item.attempt === run.attempt)).toEqual([
        expect.objectContaining({ run: run.run, attempt: run.attempt, execution: run.execution }),
      ])
      expect(work.historyIndex?.root.session).toBe(SESSION)
    },
  )
})
