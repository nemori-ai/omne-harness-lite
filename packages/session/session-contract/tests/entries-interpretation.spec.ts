// The range check of the same-log entries interpretation (docs/same-log-pure.md「entries 通道的解释
// 提交」). Every refusal case changes one field of the base input B0 so that exactly one rule fails,
// and asserts the failure kind and its field. The reduction cases replay the progress rows of the
// channel and quarantine a broken chain.
import { describe, expect, it, beforeAll } from 'vitest'
import type {
  CommitReceipt,
  Decision,
  EntryId,
  HistoryEntry,
  RunId,
  SessionEntriesInterpretation,
  SessionEntriesItem,
  SessionEntriesObservation,
  SessionEntriesProgress,
  SessionEntriesStart,
  SessionFailure,
  SessionOperationId,
  SessionRevision,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  evidence,
  memoryOtherAccess,
  operationId,
  sessionId,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { decodeEntry, encodeEntry } from '../src/entries.ts'
import { digestSessionEntries, projectSessionEntries } from '../src/entries-interpretation.ts'
import { reduceWithEntriesProgress } from '../src/reduce.ts'
import { open } from './scene.ts'

type Context = Readonly<{ snapshot: WorkSnapshot; r0: RunId; ex0: string; r1: RunId; ex1: string }>

/**
 * Σ0 through real commits: Run R0 with execution ex-0 ended, Run R1 with execution ex-1 active,
 * and the external Tool calls call-0 and call-1 bound.
 */
async function sigma0(): Promise<Context> {
  const s = await open()
  const bind = async (call: string) =>
    succeeded(
      await s.commit({
        kind: 'bindExternalCall',
        input: {
          ...s.base,
          operation: operationId(`bind-${call}`),
          expected: (await s.read()).revision,
          qualification: evidence('qualified'),
          binding: {
            producer: { kind: 'tool', call },
            action: 'action',
            consumer: { owner: 'session', work: 'work', position: `at-${call}`, purpose: 'action' },
            request: evidence(`request-${call}`),
            initiatingAttempt: null,
          },
        },
      }),
      `bind ${call}`,
    )
  const first = await s.active()
  await bind('call-0')
  succeeded(
    await s.commit({
      kind: 'finishRun',
      input: {
        ...s.base,
        operation: operationId('finish-0'),
        run: first.run.run,
        expected: (await s.read()).revision,
        bounded: { kind: 'uninterpretable', evidence: evidence('agent/uninterpretable') },
      },
    }),
    'finish R0',
  )
  await s.accept('second')
  await s.start('start-1')
  const second = await s.active()
  await bind('call-1')
  return {
    snapshot: await s.read(),
    r0: first.run.run,
    ex0: first.run.execution.execution,
    r1: second.run.run,
    ex1: second.run.execution.execution,
  }
}

const E7 = evidence('agent/head/7')
const P2 = evidence('session/batch/2')
const observed: SessionEntriesInterpretation = { kind: 'observed' }
const execution = (call: string): SessionEntriesInterpretation => ({
  kind: 'execution',
  producer: { kind: 'tool', call },
  source: evidence(`tool/fact/${call}`),
})
const item = (
  ordinal: string,
  key: string,
  interpretation: readonly SessionEntriesInterpretation[],
): SessionEntriesItem => ({
  ordinal,
  key,
  fact: evidence(`agent/entry/${ordinal}`),
  interpretation,
})

function b0(c: Context): SessionEntriesObservation {
  return {
    tenant: c.snapshot.tenant,
    session: c.snapshot.session,
    run: c.r1,
    execution: c.ex1,
    channel: 'tool-received',
    operation: operationId('op-1'),
    after: '0',
    through: '2',
    boundary: {
      execution: c.ex1,
      channel: 'tool-received',
      revision: '7',
      executionEvidence: E7,
      count: '3',
    },
    items: [item('1', 'k1', [execution('call-1')]), item('2', 'k2', [observed])],
  }
}

/** Σ1: the channel of B0 saved through 2. */
const saved1 = (c: Context): readonly SessionEntriesProgress[] => [
  { run: c.r1, execution: c.ex1, channel: 'tool-received', through: '2', interpreted: P2 },
]

type Input = Parameters<typeof projectSessionEntries>[1]

function judge(c: Context, edit: Partial<Input> = {}, snapshot = c.snapshot) {
  return projectSessionEntries(snapshot, {
    observation: b0(c),
    start: { kind: 'initial' },
    saved: [],
    record: null,
    ...edit,
  })
}

function failureOf(decision: Decision): SessionFailure {
  if (decision.kind !== 'rejected')
    throw new Error(`expected a refusal, got ${JSON.stringify(decision)}`)
  return decision.failure
}

function expectInvalid(decision: Decision, field: string): void {
  expect(failureOf(decision)).toMatchObject({ kind: 'invalid', field })
}

const oneItem = (ordinal: string) => [item(ordinal, `k${ordinal}`, [execution('call-1')])]

let c: Context
beforeAll(async () => {
  c = await sigma0()
})

describe('projectSessionEntries: the legal range', () => {
  it('B0 gives the consequence, then the progress row, and echoes the row in progress and interpreted', () => {
    const decision = judge(c)
    if (decision.kind !== 'entries') throw new Error(JSON.stringify(decision))
    expect(decision.entries.map(entry => entry.kind)).toEqual([
      'call.execution-fact',
      'entries.interpreted',
    ])
    expect(decision.progress).toEqual({
      run: c.r1,
      execution: c.ex1,
      channel: 'tool-received',
      through: '2',
    })
    expect(decision.interpreted).toEqual([
      { ordinal: '1', key: 'k1' },
      { ordinal: '2', key: 'k2' },
    ])
    const [consequence, progress] = decision.entries
    expect(consequence?.origin).toEqual({
      owner: 'agent',
      via: 'same-log-entries',
      source: evidence('agent/entry/1'),
    })
    expect(progress?.origin).toEqual({
      owner: 'agent',
      via: 'same-log-entries',
      source: evidence('agent/entry/2'),
    })
    const row = decodeEntry(progress!)
    if (!('ok' in row)) throw new Error(JSON.stringify(row))
    expect(row.ok).toEqual({
      kind: 'entries.interpreted',
      ...decision.progress,
      after: '0',
      boundary: { revision: '7', executionEvidence: E7, count: '3' },
      interpreted: decision.interpreted,
    })
  })

  it('accepts a range of a Run that has ended (late results still register)', () => {
    const observation = b0(c)
    const decision = judge(c, {
      observation: {
        ...observation,
        run: c.r0,
        execution: c.ex0,
        boundary: { ...observation.boundary, execution: c.ex0 },
        items: [item('1', 'k1', [execution('call-0')]), item('2', 'k2', [observed])],
      },
    })
    expect(decision.kind).toBe('entries')
  })

  it('continues from the saved progress of the channel', () => {
    const decision = judge(c, {
      saved: saved1(c),
      start: { kind: 'saved', progress: saved1(c)[0]! },
      observation: { ...b0(c), after: '2', through: '3', items: oneItem('3') },
    })
    expect(decision).toMatchObject({ kind: 'entries', progress: { through: '3' } })
  })

  it('runs on a deeply frozen input, refusing or accepting, and leaves it unchanged', () => {
    const freeze = <T>(value: T): T => {
      if (typeof value === 'object' && value !== null) {
        for (const member of Object.values(value)) freeze(member)
        Object.freeze(value)
      }
      return value
    }
    const input: Input = freeze({
      observation: b0(c),
      start: { kind: 'initial' },
      saved: saved1(c),
      record: null,
    })
    const copy = structuredClone(input)
    judge(c, input)
    judge(c, { ...input, saved: [] })
    expect(input).toEqual(copy)
  })
})

describe('digestSessionEntries', () => {
  it('ignores the operation identity and follows every other member of the observation', () => {
    const observation = b0(c)
    expect(digestSessionEntries({ ...observation, operation: operationId('op-other') })).toBe(
      digestSessionEntries(observation),
    )
    expect(digestSessionEntries({ ...observation, through: '3' })).not.toBe(
      digestSessionEntries(observation),
    )
  })
})

describe('projectSessionEntries: one case per rule', () => {
  it('EI-01 another session or tenant is denied for commitEntries', () => {
    for (const observation of [
      { ...b0(c), session: sessionId('S2') },
      { ...b0(c), tenant: memoryOtherAccess('other').tenant },
    ])
      expect(failureOf(judge(c, { observation }))).toEqual({
        kind: 'denied',
        action: 'commitEntries',
      })
  })

  it('EI-02 an empty operation is invalid', () => {
    expectInvalid(
      judge(c, { observation: { ...b0(c), operation: '' as SessionOperationId } }),
      'operation',
    )
  })

  const receipt: CommitReceipt = {
    operation: operationId('op-1'),
    revision: '12' as SessionRevision,
    first: '40' as EntryId,
    last: '41' as EntryId,
    recovered: false,
    source: evidence('provider/receipt'),
  }

  it('EI-03 the same operation with the same observation recalls the original receipt', () => {
    const record = { operation: operationId('op-1'), digest: digestSessionEntries(b0(c)), receipt }
    expect(judge(c, { record })).toEqual({ kind: 'recovered', receipt })
  })

  it('EI-04 the same operation with another input, or of another form, is a conflict', () => {
    const conflict = { kind: 'conflict', operation: operationId('op-1') }
    const record = { operation: operationId('op-1'), digest: digestSessionEntries(b0(c)), receipt }
    const changed = { ...b0(c), items: [item('1', 'k9', [execution('call-1')]), b0(c).items[1]!] }
    expect(failureOf(judge(c, { record, observation: changed }))).toEqual(conflict)
    const batch = { ...record, digest: 'the-digest-of-a-batch-command' }
    expect(failureOf(judge(c, { record: batch }))).toEqual(conflict)
  })

  it('EI-05 counts and ordinals are canonical decimals', () => {
    const observation = b0(c)
    const cases: readonly [SessionEntriesObservation, string][] = [
      [{ ...observation, after: '00' }, 'after'],
      [{ ...observation, through: '02' }, 'through'],
      [{ ...observation, boundary: { ...observation.boundary, count: '-1' } }, 'boundary.count'],
      [
        { ...observation, boundary: { ...observation.boundary, revision: 'x' } },
        'boundary.revision',
      ],
      [
        {
          ...observation,
          items: [{ ...observation.items[0]!, ordinal: '01' }, observation.items[1]!],
        },
        'items[0].ordinal',
      ],
      [
        {
          ...observation,
          items: [{ ...observation.items[0]!, ordinal: '0' }, observation.items[1]!],
        },
        'items[0].ordinal',
      ],
    ]
    for (const [edited, field] of cases) expectInvalid(judge(c, { observation: edited }), field)
  })

  it('EI-06 every evidence of the observation is complete', () => {
    const observation = b0(c)
    const first = observation.items[0]!
    const cases: readonly [SessionEntriesObservation, string][] = [
      [
        {
          ...observation,
          boundary: { ...observation.boundary, executionEvidence: { ...E7, digest: '' } },
        },
        'boundary.executionEvidence.digest',
      ],
      [
        {
          ...observation,
          items: [{ ...first, fact: { ...first.fact, owner: '' } }, observation.items[1]!],
        },
        'items[0].fact.owner',
      ],
      [
        {
          ...observation,
          items: [
            {
              ...first,
              interpretation: [
                {
                  kind: 'execution',
                  producer: { kind: 'tool', call: 'call-1' },
                  source: { ...evidence('x'), record: '' },
                },
              ],
            },
            observation.items[1]!,
          ],
        },
        'items[0].interpretation[0].source.record',
      ],
    ]
    for (const [edited, field] of cases) expectInvalid(judge(c, { observation: edited }), field)
  })

  it('EI-07 an execution that Session never recorded is unavailable, not guessed', () => {
    const observation = b0(c)
    const failure = failureOf(
      judge(c, {
        observation: {
          ...observation,
          execution: 'ex-9',
          boundary: { ...observation.boundary, execution: 'ex-9' },
        },
      }),
    )
    expect(failure).toMatchObject({ kind: 'unavailable', owner: 'session-history' })
    expect(failure.kind === 'unavailable' && failure.diagnostic).toMatch(/^execution:/u)
  })

  it('EI-08 the execution belongs to the run of the observation', () => {
    expectInvalid(judge(c, { observation: { ...b0(c), run: c.r0 } }), 'run')
  })

  it('EI-09 the boundary names the execution of the observation', () => {
    const observation = b0(c)
    expectInvalid(
      judge(c, {
        observation: { ...observation, boundary: { ...observation.boundary, execution: c.ex0 } },
      }),
      'boundary.execution',
    )
  })

  it('EI-10 the boundary names the channel of the observation', () => {
    const observation = b0(c)
    expectInvalid(
      judge(c, {
        observation: {
          ...observation,
          boundary: { ...observation.boundary, channel: 'model-received' },
        },
      }),
      'boundary.channel',
    )
  })

  it('EI-11 an empty or inverted range is invalid', () => {
    expectInvalid(judge(c, { observation: { ...b0(c), through: '0', items: [] } }), 'through')
  })

  it('EI-12 the range does not pass the channel count', () => {
    const observation = b0(c)
    expectInvalid(
      judge(c, {
        observation: { ...observation, boundary: { ...observation.boundary, count: '1' } },
      }),
      'through',
    )
  })

  it('EI-13 after agrees with the start', () => {
    expectInvalid(judge(c, { observation: { ...b0(c), after: '1', items: oneItem('2') } }), 'after')
  })

  it('EI-14 a start behind the saved progress is changed, at the snapshot revision', () => {
    const changed = { kind: 'changed', revision: c.snapshot.revision }
    expect(
      failureOf(
        judge(c, { saved: saved1(c), observation: { ...b0(c), operation: operationId('op-2') } }),
      ),
    ).toEqual(changed)
    const behind: SessionEntriesStart = {
      kind: 'saved',
      progress: { ...saved1(c)[0]!, through: '1' },
    }
    expect(
      failureOf(
        judge(c, {
          saved: saved1(c),
          start: behind,
          observation: {
            ...b0(c),
            operation: operationId('op-2'),
            after: '1',
            items: oneItem('2'),
          },
        }),
      ),
    ).toEqual(changed)
  })

  it('EI-15 a start that is not behind equals the saved progress', () => {
    const progress = saved1(c)[0]!
    const next = { ...b0(c), after: '2', through: '3', items: oneItem('3') }
    const cases: readonly [readonly SessionEntriesProgress[], SessionEntriesStart][] = [
      [[], { kind: 'saved', progress }],
      [
        saved1(c),
        { kind: 'saved', progress: { ...progress, interpreted: evidence('session/batch/9') } },
      ],
      [saved1(c), { kind: 'saved', progress: { ...progress, channel: 'model-received' } }],
    ]
    for (const [saved, start] of cases)
      expectInvalid(judge(c, { saved, start, observation: next }), 'start')
  })

  it('EI-16 the items fill the range', () => {
    expectInvalid(judge(c, { observation: { ...b0(c), items: [b0(c).items[0]!] } }), 'items')
  })

  it('EI-17 item i has ordinal after + 1 + i', () => {
    const observation = b0(c)
    const withOrdinals = (ordinals: readonly string[]) =>
      ordinals.map((ordinal, at) =>
        item(ordinal, `key-${at}`, at === 0 ? [execution('call-1')] : [observed]),
      )
    const cases: readonly [SessionEntriesObservation, string][] = [
      [{ ...observation, items: withOrdinals(['2', '3']) }, 'items[0].ordinal'],
      [{ ...observation, items: withOrdinals(['1', '1']) }, 'items[1].ordinal'],
      [{ ...observation, items: withOrdinals(['1', '3']) }, 'items[1].ordinal'],
      [{ ...observation, through: '3', items: withOrdinals(['1', '2', '1']) }, 'items[2].ordinal'],
    ]
    for (const [edited, field] of cases) expectInvalid(judge(c, { observation: edited }), field)
  })

  it('EI-18 every key is non-empty', () => {
    const observation = b0(c)
    expectInvalid(
      judge(c, {
        observation: {
          ...observation,
          items: [{ ...observation.items[0]!, key: '' }, observation.items[1]!],
        },
      }),
      'items[0].key',
    )
  })

  it('EI-19 a key appears once in a batch', () => {
    const observation = b0(c)
    expectInvalid(
      judge(c, {
        observation: {
          ...observation,
          items: [observation.items[0]!, { ...observation.items[1]!, key: 'k1' }],
        },
      }),
      'items[1].key',
    )
  })

  it('EI-20 an interpretation is non-empty, and observed stands alone', () => {
    const observation = b0(c)
    for (const interpretation of [[], [observed, execution('call-1')]])
      expectInvalid(
        judge(c, {
          observation: {
            ...observation,
            items: [observation.items[0]!, { ...observation.items[1]!, interpretation }],
          },
        }),
        'items[1].interpretation',
      )
  })

  it('EI-21 a producer fact needs the original binding of the producer', () => {
    const observation = b0(c)
    expectInvalid(
      judge(c, {
        observation: {
          ...observation,
          items: [item('1', 'k1', [execution('call-9')]), observation.items[1]!],
        },
      }),
      'items[0].interpretation[0].fact.producer',
    )
  })

  it('EI-23 a range of only observed items is invalid: it carries over to the next batch', () => {
    const observation = b0(c)
    expectInvalid(
      judge(c, {
        observation: {
          ...observation,
          items: [item('1', 'k1', [observed]), observation.items[1]!],
        },
      }),
      'items',
    )
  })
})

/** The committed batch of one decision at `revision`. */
function batchOf(decision: Decision, revision: bigint) {
  if (decision.kind !== 'entries') throw new Error(JSON.stringify(decision))
  const text = String(revision) as SessionRevision
  const entries: HistoryEntry[] = decision.entries.map((entry, at) => ({
    ...entry,
    id: `entries-${text}-${at}` as EntryId,
    revision: text,
  }))
  return { revision: text, entries }
}

function progressRow(
  row: Readonly<{ run: RunId; execution: string; after: string; through: string }>,
  revision: bigint,
) {
  const entry = encodeEntry(
    {
      kind: 'entries.interpreted',
      ...row,
      channel: 'tool-received',
      boundary: { revision: '7', executionEvidence: E7, count: '9' },
      interpreted: [],
    },
    { owner: 'agent', via: 'same-log-entries', source: evidence('agent/entry/x') },
  )
  const text = String(revision) as SessionRevision
  return {
    revision: text,
    entries: [{ ...entry, id: `broken-${text}` as EntryId, revision: text }],
  }
}

describe('reduceWithEntriesProgress: the progress chain', () => {
  const next = (snapshot: WorkSnapshot) => BigInt(snapshot.revision) + 1n

  function twoBatches() {
    const first = batchOf(judge(c), next(c.snapshot))
    const one = reduceWithEntriesProgress(c.snapshot, [], first)
    if (one.kind !== 'reduced') throw new Error(one.diagnostic)
    const start: SessionEntriesStart = { kind: 'saved', progress: one.progress[0]! }
    const second = batchOf(
      projectSessionEntries(one.snapshot, {
        observation: {
          ...b0(c),
          operation: operationId('op-2'),
          after: '2',
          through: '3',
          items: oneItem('3'),
        },
        start,
        saved: one.progress,
        record: null,
      }),
      next(one.snapshot),
    )
    return { first, one, second }
  }

  it('keeps one item per channel: the last through and the evidence of the batch that set it', () => {
    const { one, second } = twoBatches()
    expect(one.progress).toEqual([
      {
        run: c.r1,
        execution: c.ex1,
        channel: 'tool-received',
        through: '2',
        interpreted: one.snapshot.source,
      },
    ])
    const two = reduceWithEntriesProgress(one.snapshot, one.progress, second)
    if (two.kind !== 'reduced') throw new Error(two.diagnostic)
    expect(two.progress).toEqual([
      {
        run: c.r1,
        execution: c.ex1,
        channel: 'tool-received',
        through: '3',
        interpreted: two.snapshot.source,
      },
    ])
  })

  it('replays the same batches into the same progress', () => {
    const { first, second } = twoBatches()
    const fold = () => {
      const one = reduceWithEntriesProgress(c.snapshot, [], first)
      if (one.kind !== 'reduced') throw new Error(one.diagnostic)
      return reduceWithEntriesProgress(one.snapshot, one.progress, second)
    }
    expect(fold()).toEqual(fold())
  })

  it('keeps the progress of another channel apart', () => {
    const { one } = twoBatches()
    const observation = b0(c)
    const model = batchOf(
      projectSessionEntries(one.snapshot, {
        observation: {
          ...observation,
          operation: operationId('op-model'),
          channel: 'model-received',
          boundary: { ...observation.boundary, channel: 'model-received' },
        },
        start: { kind: 'initial' },
        saved: one.progress,
        record: null,
      }),
      next(one.snapshot),
    )
    const two = reduceWithEntriesProgress(one.snapshot, one.progress, model)
    if (two.kind !== 'reduced') throw new Error(two.diagnostic)
    expect(two.progress.map(item => [item.channel, item.through])).toEqual([
      ['tool-received', '2'],
      ['model-received', '2'],
    ])
  })

  it('the same batch applied again recalls the state and leaves the progress', () => {
    const { first, one } = twoBatches()
    expect(reduceWithEntriesProgress(one.snapshot, one.progress, first)).toEqual(one)
  })

  it('RD-1 a progress row that does not start at the saved through quarantines', () => {
    const answer = reduceWithEntriesProgress(
      c.snapshot,
      [],
      progressRow({ run: c.r1, execution: c.ex1, after: '1', through: '2' }, next(c.snapshot)),
    )
    expect(answer).toMatchObject({
      kind: 'quarantined',
      diagnostic: expect.stringMatching(/saved through 0/u),
    })
  })

  it('RD-2 a progress row that does not advance quarantines', () => {
    const answer = reduceWithEntriesProgress(
      c.snapshot,
      [],
      progressRow({ run: c.r1, execution: c.ex1, after: '0', through: '0' }, next(c.snapshot)),
    )
    expect(answer).toMatchObject({
      kind: 'quarantined',
      diagnostic: expect.stringMatching(/does not advance/u),
    })
  })

  it('RD-3 a progress row whose execution is not of its run quarantines', () => {
    const answer = reduceWithEntriesProgress(
      c.snapshot,
      [],
      progressRow({ run: c.r0, execution: c.ex1, after: '0', through: '2' }, next(c.snapshot)),
    )
    expect(answer).toMatchObject({
      kind: 'quarantined',
      diagnostic: expect.stringMatching(/missing historical execution binding/u),
    })
  })
})
