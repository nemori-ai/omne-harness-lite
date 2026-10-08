import { fixturePayload, replaceFixtureValue } from './log-payload-fixture.ts'
import { expect, test, vi } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import {
  prepareToolJournalEntry,
  captureToolJournalValue,
} from '@omne-harness-lite/tool-execution-runtime'
import type { CheckedPrefix, LogEntry } from '@omne-harness-lite/session-log'
import { inspectContextLogEntry } from '@omne-harness-lite/runtime-context-local'
import { createToolDriverRunReader } from '../src/tool-driver-run-reader.ts'
import { toolActionHistory, readToolDriverHistory } from '../src/tool-driver-history.ts'
import type { DriverValue } from '../src/tool-driver-types.ts'
import {
  at,
  completeActions as complete,
  dk,
  historyFixture,
  officialPiece,
  origin,
  scope,
  tool,
  toolCall,
} from './tool-driver-history-fixture.ts'

type Fixture = Awaited<ReturnType<typeof historyFixture>>

const inspect = (prefix: CheckedPrefix, call = 'call') =>
  toolActionHistory.inspect(prefix, call as never)
function changed(
  prefix: CheckedPrefix,
  predicate: (row: LogEntry) => boolean,
  change: (row: LogEntry) => unknown,
): CheckedPrefix {
  return {
    ...prefix,
    entries: prefix.entries.map(row => (predicate(row) ? (change(row) as LogEntry) : row)),
  }
}
const payload = (row: LogEntry) => fixturePayload(row.payload)

test('reads actual model provenance as pending, then completed, and survives physical reopen', async () => {
  const f = await historyFixture([toolCall(), toolCall('broken', true)])
  try {
    expect(inspect(await f.prefix())).toMatchObject({
      kind: 'known',
      facts: {
        batch: { kind: 'pending' },
        route: { kind: 'none' },
        latestAttempt: 1,
        runState: 'open',
      },
    })
    expect(inspect(await f.prefix(), 'absent')).toEqual({ kind: 'notFound' })
    await complete(f)
    const before = inspect(await f.prefix())
    expect(before).toMatchObject({ kind: 'known', facts: { batch: { kind: 'complete' } } })
    await f.reopen()
    expect(inspect({ ...(await f.prefix()), ownerGeneration: 'next-owner' })).toEqual(before)
  } finally {
    await f.close()
  }
})
test('attempt advancement preserves original provenance and does not pretend the Run ended', async () => {
  const f = await historyFixture()
  try {
    await complete(f)
    await f.attempt(2)
    expect(inspect(await f.prefix())).toMatchObject({
      kind: 'known',
      facts: { origin, latestAttempt: 2, runState: 'open' },
    })
    const basis = await f.reply([])
    await f.append([
      f.driver({ kind: 'run_ended', run: 'run', reason: 'completed', basis: [basis], at }),
    ])
    expect(inspect(await f.prefix())).toMatchObject({
      kind: 'known',
      facts: { runState: 'ended', latestAttempt: 2 },
    })
  } finally {
    await f.close()
  }
})
test('strictly classifies every record and accepts lossless position representations', async () => {
  const f = await historyFixture()
  try {
    const prefix = await f.prefix()
    expect(
      inspect({
        ...prefix,
        tail: new LosslessNumber(String(prefix.entries.length)),
        entries: prefix.entries.map((row, i) => ({
          ...row,
          position: new LosslessNumber(`${i + 1}.00`),
        })),
      }),
    ).toMatchObject({ kind: 'known' })
    expect(
      inspect({
        ...prefix,
        entries: [
          ...prefix.entries,
          {
            tenant: scope.tenant,
            session: scope.session,
            position: prefix.entries.length + 1,
            dedupeKey: 'future',
            readKeys: [],
            payload: {},
          },
        ],
        tail: prefix.entries.length + 1,
      }),
    ).toEqual({ kind: 'unavailable' })
    const get = vi.fn(() => prefix.entries)
    const hostile = { ...prefix }
    Object.defineProperty(hostile, 'entries', { enumerable: true, get })
    expect(inspect(hostile)).toEqual({ kind: 'unavailable' })
    expect(get).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})
test('joins equivalent dispatch spellings without accepting another dispatch', async () => {
  const f = await historyFixture()
  try {
    const prefix = await f.prefix()
    const equivalent = changed(
      prefix,
      row => {
        const body = payload(row)
        return (
          body.value.kind === 'model_call_dispatched' ||
          body.value.kind === 'model_call_opened' ||
          body.category === 'response'
        )
      },
      row => {
        const body = payload(row)
        return replaceFixtureValue(row, {
          ...body.value,
          dispatch: new LosslessNumber(body.category === 'response' ? '1.00' : '1e0'),
        })
      },
    )
    expect(inspect(equivalent)).toEqual(inspect(prefix))
    expect(inspect(equivalent)).toMatchObject({ kind: 'known' })
    const different = changed(
      equivalent,
      row => payload(row).category === 'response',
      row => replaceFixtureValue(row, { ...payload(row).value, dispatch: 2 }),
    )
    expect(inspect(different)).toEqual({ kind: 'unavailable' })
  } finally {
    await f.close()
  }
})
test.each([
  ['creation', (row: LogEntry) => payload(row).value?.kind === 'model_call_created'],
  [
    'response',
    (row: LogEntry) => payload(row).format === 'mrr/3' && payload(row).category === 'response',
  ],
  ['attempt marker', (row: LogEntry) => payload(row).value?.kind === 'attempt_adopted'],
  ['Run', (row: LogEntry) => payload(row).value?.kind === 'run_started'],
  [
    'context declaration',
    (row: LogEntry) => (row.payload as { owner?: string }).owner === 'runtime-context',
  ],
] as const)('rejects missing actual %s provenance', async (_name, remove) => {
  const f = await historyFixture()
  try {
    const prefix = await f.prefix(),
      entries = prefix.entries
        .filter(row => !remove(row))
        .map((row, i) => ({ ...row, position: i + 1 }))
    expect(entries.length).toBeLessThan(prefix.entries.length)
    expect(inspect({ ...prefix, entries, tail: entries.length })).toEqual({ kind: 'unavailable' })
  } finally {
    await f.close()
  }
})
test.each([
  'omit',
  'reorder',
  'wrong-adoption',
  'wrong-effective',
  'unparseable-pass',
  'fake-allow',
  'wrong-gate',
  'wrong-shell',
] as const)('rejects contradictory complete batch: %s', async scenario => {
  const f = await historyFixture([toolCall(), toolCall('second'), toolCall('broken', true)])
  try {
    await complete(f)
    const prefix = await f.prefix()
    const bad = changed(
      prefix,
      row => payload(row).value?.kind === 'actions_completed',
      row => {
        const shell = row.payload as unknown as {
          value: Extract<DriverValue, { kind: 'actions_completed' }>
        }
        const value = payload(row).value as unknown as Extract<
            DriverValue,
            { kind: 'actions_completed' }
          >,
          completion = value.completion,
          items = completion.items
        let altered: unknown = value
        if (scenario === 'omit')
          altered = { ...value, completion: { ...completion, items: items.slice(0, -1) } }
        if (scenario === 'reorder')
          altered = { ...value, completion: { ...completion, items: [...items].reverse() } }
        if (scenario === 'wrong-adoption') altered = { ...value, adoption: 'different' }
        if (scenario === 'wrong-effective')
          altered = {
            ...value,
            completion: {
              ...completion,
              items: [
                {
                  ...items[0],
                  effectiveCall: { ...items[0].effectiveCall, arguments: { altered: true } },
                },
                ...items.slice(1),
              ],
            },
          }
        if (scenario === 'unparseable-pass')
          altered = {
            ...value,
            completion: {
              ...completion,
              items: items.map((item, index) =>
                index === 2 ? { ...item, anchor: 'fabricated' } : item,
              ),
            },
          }
        if (scenario === 'fake-allow')
          altered = {
            ...value,
            completion: {
              ...completion,
              items: [{ ...items[0], conclusions: [] }, ...items.slice(1)],
            },
          }
        if (scenario === 'wrong-gate')
          altered = {
            ...value,
            completion: { ...completion, gate: { kind: 'missing', reason: 'chain' } },
          }
        return {
          ...row,
          ...(scenario === 'wrong-shell' ? { run: 'another' } : {}),
          payload: replaceFixtureValue(row, altered).payload,
        }
      },
    )
    expect(inspect(bad)).toEqual({ kind: 'unavailable' })
  } finally {
    await f.close()
  }
})
test('missing official closes the whole batch through a denial route without an execution account', async () => {
  const f = await historyFixture([toolCall(), toolCall('broken', true)])
  try {
    const reason = {
      kind: 'admission_unavailable',
      by: officialPiece().definition.name,
      conclusion: dk(['actions', origin.assistantMessage]),
      explanation: 'Official chain absent',
    }
    const items = f.calls.map(call => ({
      callId: call.callId,
      effectiveCall: call,
      ...(call.unparseable ? {} : { anchor: `action-${call.callId}` }),
      conclusions: [],
      decision: { kind: 'denied', reason, conclusion: reason.conclusion },
    }))
    await f.append([
      f.driver({
        kind: 'actions_completed',
        origin,
        adoption: f.adoption,
        chain: [],
        completion: { key: reason.conclusion, gate: { kind: 'missing', reason: 'chain' }, items },
      }),
    ])
    await f.append([
      f.driver({
        kind: 'action_denial_intended',
        origin,
        adoption: f.adoption,
        call: f.calls[0],
        reason,
      }),
    ])
    expect(inspect(await f.prefix())).toMatchObject({
      kind: 'known',
      facts: { route: { kind: 'denial' } },
    })
    const message = {
      id: 'denied-message',
      createdAt: at,
      type: 'tool',
      callId: 'call',
      blocks: [
        {
          id: 'denied-block',
          kind: 'tool_result',
          callId: 'call',
          outcome: 'denied',
          reason,
          blocks: [],
          visibility: { toHuman: true, toModel: true },
        },
      ],
    }
    await f.append([
      f.model('message', message),
      f.driver({ kind: 'action_denied', origin, callId: 'call', reason, message }),
    ])
    expect(inspect(await f.prefix())).toMatchObject({
      kind: 'known',
      facts: { route: { kind: 'denial' } },
    })
    const value = captureToolJournalValue({
      kind: 'execution_intended',
      revision: 1,
      ref: { ...scope, callId: 'call' },
      origin,
      input: {},
      selected: { ...tool, adoption: f.adoption },
    })
    // The deliberately conflicting entry is prepared with the actual public core codec.
    const exact = captureToolJournalValue({
      kind: 'execution_intended',
      revision: 1,
      ref: { ...scope, callId: 'call' },
      origin,
      input: {},
    })
    expect(value).toEqual({ invalid: true }) // 'name' is not a SelectedTool field.
    if ('invalid' in exact) throw new Error('route fixture')
    const entry = prepareToolJournalEntry({ value: exact, origin })
    if ('invalid' in entry) throw new Error('route entry fixture')
    await f.append([entry.entry])
    expect(inspect(await f.prefix())).toEqual({ kind: 'unavailable' })
  } finally {
    await f.close()
  }
})
test('unexplained Run completion and duplicate call identities remain unavailable', async () => {
  const f = await historyFixture()
  try {
    await f.append([
      f.driver({ kind: 'run_ended', run: 'run', reason: 'completed', basis: [f.replyKey], at }),
    ])
    expect(readToolDriverHistory(await f.prefix())).toEqual({ unavailable: true })
  } finally {
    await f.close()
  }
  const duplicate = await historyFixture([toolCall(), toolCall('second')])
  try {
    const prefix = await duplicate.prefix()
    const text = JSON.stringify(prefix).replaceAll('second', 'call')
    expect(inspect(JSON.parse(text) as CheckedPrefix)).toEqual({ kind: 'unavailable' })
  } finally {
    await duplicate.close()
  }
})

async function toolEntry(value: unknown) {
  const captured = captureToolJournalValue({
    revision: 1,
    ref: { ...scope, callId: 'call' },
    ...(value as object),
  })
  if ('invalid' in captured) throw new Error('invalid tool event fixture')
  const prepared = prepareToolJournalEntry({ origin, value: captured })
  if ('invalid' in prepared) throw new Error('invalid tool entry fixture')
  return prepared.entry
}
test('executes one known route; an older attempt makes its later terminal late in the same prefix', async () => {
  const f = await historyFixture()
  try {
    await complete(f)
    const selected = {
      capability: tool.capability,
      asset: tool.asset,
      version: tool.version,
      definition: tool.definition,
      adoption: f.adoption,
    }
    await f.append([
      await toolEntry({
        kind: 'execution_intended',
        origin,
        selected,
        input: { call: f.calls[0] },
      }),
    ])
    await f.append([await toolEntry({ kind: 'execution_started', at })])
    expect(inspect(await f.prefix())).toMatchObject({
      kind: 'known',
      facts: { route: { kind: 'execution' } },
    })
    await f.attempt(2)
    const value = {
      kind: 'execution_ended',
      terminal: { outcome: 'completed', result: 'done' },
      account: {
        callId: 'call',
        initiator: scope.tenant,
        externalEffect: 'unknown',
        cost: { items: [], total_usd: 0 },
        frames: 'unknown',
        wallClock: { startedAt: at, endedAt: at },
        late: true,
      },
      delivery: {
        result: {
          id: 'result',
          kind: 'tool_result',
          callId: 'call',
          outcome: 'completed',
          blocks: [],
          visibility: { toHuman: true, toModel: true },
        },
        pass: 'after-call',
        selectedChain: [],
      },
    }
    await f.append([await toolEntry(value)])
    const prefix = await f.prefix()
    expect(inspect(prefix)).toMatchObject({ kind: 'known', facts: { latestAttempt: 2 } })
    const nonlate = await toolEntry({
      ...value,
      account: {
        callId: 'call',
        initiator: scope.tenant,
        externalEffect: 'unknown',
        cost: { items: [], total_usd: 0 },
        frames: 'unknown',
        wallClock: { startedAt: at, endedAt: at },
      },
    })
    expect(
      inspect(
        changed(
          prefix,
          row => payload(row).value?.kind === 'execution_ended',
          row => ({ ...row, ...nonlate }),
        ),
      ),
    ).toEqual({ kind: 'unavailable' })
  } finally {
    await f.close()
  }
})
test('declines a newly intended execution after attempt advancement', async () => {
  const f = await historyFixture()
  try {
    await complete(f)
    await f.attempt(2)
    await f.append([
      await toolEntry({
        kind: 'execution_intended',
        origin,
        input: {},
        selected: {
          capability: tool.capability,
          asset: tool.asset,
          version: tool.version,
          definition: tool.definition,
          adoption: f.adoption,
        },
      }),
    ])
    expect(inspect(await f.prefix())).toEqual({ kind: 'unavailable' })
  } finally {
    await f.close()
  }
})
test('keeps a valid later rewrite as known evidence for arguments_changed verification', async () => {
  const f = await historyFixture()
  try {
    await complete(f)
    const call = f.calls[0]!
    await f.conclusion(
      call,
      'late-rewriter',
      {
        kind: 'rewrite',
        subject: {
          call: { ...call, arguments: { changed: true } },
          definition: { name: 'echo' },
          batch: ['call'],
        },
      },
      'action-call',
      'rewrite',
    )
    expect(inspect(await f.prefix())).toMatchObject({
      kind: 'known',
      facts: { batch: { kind: 'complete' } },
    })
  } finally {
    await f.close()
  }
})
test('rejects an invalid empty-prefix scope without reading getters', () => {
  const prefix = {
    scope: { tenant: {}, session: 'session' },
    ownerGeneration: 'owner',
    entries: [],
    tail: 0,
  } as unknown as CheckedPrefix
  expect(inspect(prefix)).toEqual({ kind: 'unavailable' })
})

test('the context owner rejects claimed future versions, wrong keys and accessor scopes', async () => {
  const f = await historyFixture()
  try {
    const row = (await f.prefix()).entries[0]!
    expect(inspectContextLogEntry(scope, row)).toHaveProperty('event')
    expect(inspectContextLogEntry(scope, { ...row, dedupeKey: 'context:other' })).toEqual({
      invalid: true,
    })
    expect(
      inspectContextLogEntry(scope, {
        ...row,
        payload: { ...(row.payload as object), codec: 'runtime-context/2' },
      }),
    ).toEqual({ invalid: true })
    const get = vi.fn(() => scope.tenant)
    const hostile = { ...scope }
    Object.defineProperty(hostile, 'tenant', { enumerable: true, get })
    expect(inspectContextLogEntry(hostile, row)).toEqual({ invalid: true })
    expect(get).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

test.each(['held', 'not_in_composition', 'absent'] as const)(
  'observed distinguishes no_such_entry from %s tool adoption',
  async holding => {
    const f = await historyFixture()
    try {
      const value = await complete(f)
      let prefix = await f.prefix()
      if (holding !== 'held')
        prefix = changed(
          prefix,
          row => payload(row).value?.kind === 'attempt_adopted',
          row => {
            const shell = {
              value: payload(row).value as unknown as Extract<
                DriverValue,
                { kind: 'attempt_adopted' }
              >,
            }
            return {
              ...row,
              payload: replaceFixtureValue(row, {
                ...shell.value,
                ...(holding === 'absent'
                  ? { tools: [], report: { ...shell.value.report, effectivePermissions: {} } }
                  : {
                      report: {
                        ...shell.value.report,
                        effectivePermissions: { echo: 'not_in_composition' },
                      },
                    }),
              }).payload,
            }
          },
        )
      const disposition = changed(
        prefix,
        row => payload(row).value?.kind === 'actions_completed',
        row => ({
          ...row,
          payload: replaceFixtureValue(row, {
            ...value,
            completion: {
              ...value.completion,
              items: value.completion.items.map(item => ({
                ...item,
                decision: {
                  kind: 'notExecutable',
                  reason: 'no_such_entry',
                  conclusion: item.decision.conclusion,
                },
              })),
            },
          }).payload,
        }),
      )
      expect(inspect(disposition)).toMatchObject({
        kind: holding === 'absent' ? 'known' : 'unavailable',
      })
      if (holding === 'not_in_composition') expect(inspect(prefix)).toEqual({ kind: 'unavailable' })
    } finally {
      await f.close()
    }
  },
)

test('preserves an actual earlier extension veto while the official chain is missing', async () => {
  const f = await historyFixture()
  try {
    const key = await f.conclusion(f.calls[0], 'guard', { kind: 'veto', reason: 'Guard declined' })
    const reason = {
      kind: 'extension_veto',
      by: 'guard',
      conclusion: key,
      explanation: 'Guard declined',
    }
    await f.append([
      f.driver({
        kind: 'actions_completed',
        origin,
        adoption: f.adoption,
        chain: [officialPiece('guard')],
        completion: {
          key: dk(['actions', origin.assistantMessage]),
          gate: { kind: 'missing', reason: 'chain' },
          items: [
            {
              callId: 'call',
              effectiveCall: f.calls[0],
              anchor: 'action-call',
              conclusions: [key],
              decision: { kind: 'denied', reason, conclusion: key },
            },
          ],
        },
      }),
    ])
    expect(inspect(await f.prefix())).toMatchObject({
      kind: 'known',
      facts: { batch: { completion: { items: [{ decision: { reason } }] } } },
    })
  } finally {
    await f.close()
  }
})

test('model settlement reads the identical Run projection at its supplied tail and rejects an invalidated binding', async () => {
  const f = await historyFixture()
  try {
    const read = createToolDriverRunReader('owner-one'),
      first = await f.modelPrefix()
    expect(read(first, 'run', 1)).toMatchObject({ known: { latestAttempt: 1, terminal: 'open' } })
    await f.attempt(2)
    expect(read(first, 'run', 1)).toMatchObject({ known: { latestAttempt: 1, terminal: 'open' } })
    expect(read(await f.modelPrefix(), 'run', 1)).toMatchObject({
      known: { latestAttempt: 2, terminal: 'open' },
    })
    expect(read(await f.modelPrefix(), 'run', 3)).toEqual({ unavailable: true })
    f.revoke()
    expect(read(first, 'run', 1)).toEqual({ unavailable: true })
  } finally {
    await f.close()
  }
})

test('a model attempt requires model-visible context and does not adopt tool-only environment defaults', async () => {
  const f = await historyFixture(undefined, undefined, undefined, undefined, [], {
    required: [
      {
        key: 'shell.initial',
        source: 'tool-defaults',
        config: null,
        consumers: ['tool'],
        required: true,
        recovery: 'persisted',
      },
    ],
    initial: [
      { key: 'shell.initial', revision: 'initial', observedAt: at, value: { cwd: '/workspace' } },
    ],
    fixed: [],
  })
  try {
    expect(readToolDriverHistory(await f.prefix())).not.toHaveProperty('unavailable')
    const history = readToolDriverHistory(await f.prefix())
    if ('unavailable' in history) throw new Error('Valid model attempt unavailable')
    expect(history.runs.get('run')?.latest?.value.context).toEqual([])
  } finally {
    await f.close()
  }
})

test('rejects tool-only context even when the model has adopted all required model values', async () => {
  const modelValue = { key: 'instructions', revision: 'initial', observedAt: at, value: 'model' }
  const toolValue = {
    key: 'shell.initial',
    revision: 'initial',
    observedAt: at,
    value: { cwd: '/private' },
  }
  const f = await historyFixture(undefined, undefined, undefined, undefined, [], {
    required: [
      {
        key: modelValue.key,
        source: 'model-source',
        config: null,
        consumers: ['model'],
        required: true,
        recovery: 'persisted',
      },
      {
        key: toolValue.key,
        source: 'tool-source',
        config: null,
        consumers: ['tool'],
        required: true,
        recovery: 'persisted',
      },
    ],
    initial: [modelValue, toolValue],
    fixed: [],
  })
  try {
    const prefix = await f.prefix()
    expect(readToolDriverHistory(prefix)).not.toHaveProperty('unavailable')
    const leaked = changed(
      prefix,
      row => payload(row).value.kind === 'attempt_adopted',
      row => replaceFixtureValue(row, { ...payload(row).value, context: [modelValue, toolValue] }),
    )
    expect(readToolDriverHistory(leaked)).toHaveProperty('unavailable')
  } finally {
    await f.close()
  }
})
