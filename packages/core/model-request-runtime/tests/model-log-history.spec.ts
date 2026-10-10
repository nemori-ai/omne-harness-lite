import { afterEach, expect, it, vi } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { checkSourceToken, type LogEntry } from '@omne-harness-lite/session-log'
import * as entryCodec from '../src/log-codec-entry.ts'
import * as envelopes from '../src/log-envelope.ts'
import * as logShell from '@omne-harness-lite/session-log'
import {
  captureModelLogHistory,
  createModelLogReadInspector,
  type ModelLogHistory,
} from '../src/index.ts'
import {
  durable,
  session,
  tenant,
  located,
  prepare,
  replaceModelValue,
} from './log-codec-fixture.ts'

afterEach(() => vi.restoreAllMocks())
function source(tail: number) {
  const checked = checkSourceToken({ tenant, session, tail, journalGeneration: 'fixed-journal' })
  if ('failure' in checked) throw new Error('source fixture')
  return checked.ok
}
function append(previous: ModelLogHistory | null, entries: readonly LogEntry[]): ModelLogHistory {
  const tail = (previous?.length ?? 0) + entries.length
  const captured = captureModelLogHistory(previous, { entries, source: source(tail), tail })
  if ('failure' in captured) throw new Error('history fixture')
  return captured.history
}
function oracle(entries: readonly LogEntry[]) {
  return createModelLogReadInspector({ session, tenant, prefix: { entries, tail: entries.length } })
}
function answer(result: ReturnType<typeof oracle>) {
  return 'ok' in result ? result.ok.entries : result
}
function user(index: number): LogEntry {
  return located(
    prepare(
      'message',
      {
        id: `user-${index}`,
        type: 'user',
        createdAt: '2026-10-10T00:00:00Z',
        blocks: [
          {
            id: `block-${index}`,
            kind: 'text',
            text: `你好 ${index} "\\\n 🧭`,
            visibility: { toHuman: true, toModel: true },
          },
        ],
      },
      { kind: 'message' },
    ),
    index,
  )
}
function checkPartitions(entries: readonly LogEntry[]) {
  for (let mask = 0; mask < 2 ** (entries.length - 1); mask++) {
    let history = append(null, [])
    let start = 0
    const old: { history: ModelLogHistory; answer: ReturnType<typeof answer> }[] = []
    for (let end = 1; end <= entries.length; end++) {
      if (end !== entries.length && (mask & (1 << (end - 1))) === 0) continue
      history = append(history, entries.slice(start, end))
      const actual = answer(history.inspect())
      expect(actual).toEqual(answer(oracle(entries.slice(0, end))))
      expect(history.retainedBytes).toBe(
        Buffer.byteLength(
          writeJsonLossless({ entries: history.entries, tail: history.tail }),
          'utf8',
        ),
      )
      old.push({ history, answer: actual })
      const same = append(history, [])
      expect(answer(same.inspect())).toEqual(actual)
      for (const earlier of old) expect(answer(earlier.history.inspect())).toEqual(earlier.answer)
      start = end
    }
  }
}
it('matches raw capture and association results for every short partition and preserves old cuts', () => {
  const entries = durable().prefix.entries
  checkPartitions(entries)
  checkPartitions([...entries, { ...entries[3]!, position: 5 }])
  const { dedupeKey: _dedupe, ...unknown } = entries[3]!
  checkPartitions([
    ...entries,
    {
      ...unknown,
      position: 5,
      payload: { kind: 'fact', owner: 'model-request-runtime', version: 'unknown', value: {} },
    },
  ])
})
it('handles response before the assistant without changing raw purpose rules', () => {
  const entries = durable().prefix.entries
  checkPartitions([
    entries[0]!,
    entries[1]!,
    { ...entries[3]!, position: 3 },
    { ...entries[2]!, position: 4 },
  ])
})
it('keeps compaction forward references invalid after the referenced message arrives', () => {
  const original = user(1)
  const { dedupeKey: _dedupe, ...shell } = original
  const compaction = {
    ...shell,
    readKeys: [],
    payload: replaceModelValue(original.payload, {
      id: 'compact',
      type: 'compaction',
      createdAt: '2026-10-10T00:00:00Z',
      blocks: [],
      silenced: [{ messageId: 'user-2', blockId: 'block-2' }],
    }),
  }
  checkPartitions([compaction, user(2)])
  const earlier = user(1)
  const valid = {
    ...compaction,
    position: 2,
    payload: replaceModelValue(compaction.payload, {
      id: 'compact',
      type: 'compaction',
      createdAt: '2026-10-10T00:00:00Z',
      blocks: [],
      silenced: [{ messageId: 'user-1', blockId: 'block-1' }],
    }),
  }
  expect(append(null, [earlier, valid]).inspect()).toHaveProperty('ok')
  checkPartitions([earlier, valid])
})
it('matches raw settlement queries without enumerating unrelated entries', () => {
  const fixture = durable()
  const entries = [
    ...fixture.prefix.entries,
    ...Array.from({ length: 60 }, (_, index) => user(index + 5)),
  ]
  const history = append(null, entries)
  const indexed = history.inspect()
  const raw = oracle(entries)
  if (!('ok' in indexed) || !('ok' in raw)) throw new Error('inspector fixture')
  for (const current of [
    null,
    { messageId: 'winner-message', disposition: 'persisted' as const },
    { messageId: 'user-5', disposition: 'persisted' as const },
  ]) {
    const input = {
      target: { call: 'call', dispatch: 1, response: 'response' },
      anchors: fixture.anchors,
      current,
    }
    expect(indexed.ok.inspectSettlementMembers(input)).toEqual(
      raw.ok.inspectSettlementMembers(input),
    )
  }
  expect(indexed.ok.select({ kind: 'dispatchResponse', id: 'response' })).toHaveLength(1)
})
it('matches a seeded long history and uses only newly captured cells on ordinary append', () => {
  let history = append(null, [])
  const entries: LogEntry[] = []
  let seed = 71
  for (let batch = 0; batch < 24; batch++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const count = 1 + (seed % 5)
    const suffix = Array.from({ length: count }, (_, index) => user(entries.length + index + 1))
    const prior = history
    const capture = vi.spyOn(entryCodec, 'captureWrapper')
    capture.mockClear()
    const association = vi.spyOn(entryCodec, 'inspectCapturedEntry')
    const deepShell = vi.spyOn(logShell, 'checkAppendInput')
    history = append(history, suffix)
    const inspected = history.inspect()
    expect(capture).toHaveBeenCalledTimes(count)
    expect(association).toHaveBeenCalledTimes(count)
    expect(deepShell).toHaveBeenCalledTimes(count)
    association.mockRestore()
    deepShell.mockRestore()
    if (prior.length) expect(history.entryAt(0)).toBe(prior.entryAt(0))
    entries.push(...suffix)
    expect(answer(inspected)).toEqual(answer(oracle(entries)))
    expect(history.retainedBytes).toBe(
      Buffer.byteLength(
        writeJsonLossless({ entries: history.entries, tail: history.tail }),
        'utf8',
      ),
    )
    capture.mockRestore()
  }
})
it('reserves independent lazy indexes for cold cuts and shares warm checkpoints', () => {
  const cold = append(null, [user(1), user(2)])
  const coldNext = append(cold, [user(3)])
  cold.inspect()
  cold.sessionFacts({})
  const warmNext = append(cold, [user(3)])
  expect(coldNext.indexReferences - warmNext.indexReferences).toBe(2 * 16)
  expect(answer(coldNext.inspect())).toEqual(answer(warmNext.inspect()))
  expect(coldNext.sessionFacts({})).toEqual(warmNext.sessionFacts({}))
})
it('keeps exact tail spelling and UTF-8 byte accounting', () => {
  const result = captureModelLogHistory(null, {
    entries: [user(1)],
    tail: new LosslessNumber('1.00'),
    source: source(1),
  })
  expect(result).toHaveProperty('history')
  if ('failure' in result) throw new Error('capture')
  expect(result.history.retainedBytes).toBe(
    Buffer.byteLength(
      writeJsonLossless({ entries: result.history.entries, tail: new LosslessNumber('1.00') }),
      'utf8',
    ),
  )
})
it('does not memoize unexpected interpretation exceptions or expose a partial index', () => {
  const history = append(null, [user(1), user(2)])
  const capture = vi.spyOn(entryCodec, 'captureWrapper')
  const defect = new Error('capture defect')
  capture.mockImplementationOnce(() => {
    throw defect
  })
  expect(() => history.inspect()).toThrow(defect)
  capture.mockRestore()
  expect(answer(history.inspect())).toEqual(answer(oracle(history.entries)))
})
it('rejects forged owners, gaps, changed generations and unknown envelope keys', () => {
  const history = append(null, [user(1)])
  expect(
    captureModelLogHistory(new Proxy(history, {}), { entries: [], source: source(1) }),
  ).toEqual({ failure: 'invalidPrefix' })
  expect(captureModelLogHistory(history, { entries: [user(3)], source: source(2) })).toEqual({
    failure: 'invalidPrefix',
  })
  expect(
    captureModelLogHistory(history, {
      entries: [],
      source: { ...source(1), journalGeneration: 'new' },
    }),
  ).toEqual({ failure: 'invalidPrefix' })
  expect(captureModelLogHistory(null, { entries: [], source: source(0), extra: 1 })).toEqual({
    failure: 'invalidPrefix',
  })
})

it('keeps local model selection at fixed cuts and only interprets the appended suffix', () => {
  const decode = vi.spyOn(envelopes, 'readModelLogEnvelope')
  const selection = (routeName: string, position: number) =>
    located(
      prepare(
        'record',
        { kind: 'model_selection_changed', routeName, at: '2026-10-10T00:00:00Z' },
        { kind: 'record' },
      ),
      position,
    )
  const before = append(null, [selection('teaching/first', 1)])
  expect(before.modelSelection()).toEqual({ selected: 'teaching/first' })
  decode.mockClear()
  const after = append(before, [user(2), selection('teaching/second', 3)])
  decode.mockClear()
  expect(after.modelSelection()).toEqual({ selected: 'teaching/second' })
  expect(decode.mock.calls.map(args => args[0])).not.toContainEqual(before.entryAt(0)!.payload)
  const suffixCalls = decode.mock.calls.length
  expect(suffixCalls).toBeGreaterThan(0)
  expect(before.modelSelection()).toEqual({ selected: 'teaching/first' })
  expect(decode).toHaveBeenCalledTimes(suffixCalls)
})

it('keeps model selection independent from message associations and rejects fenced selection records', () => {
  const selected = located(
    prepare(
      'record',
      { kind: 'model_selection_changed', routeName: 'teaching/model', at: '2026-10-10T00:00:00Z' },
      { kind: 'record' },
    ),
    1,
  )
  const assistant = { ...durable().prefix.entries[2]!, position: 2 }
  const valid = append(null, [selected, assistant])
  expect(valid.inspect()).not.toHaveProperty('ok')
  expect(valid.modelSelection()).toEqual({ selected: 'teaching/model' })
  const fenced = append(valid, [{ ...selected, position: 3, run: 'run', attempt: 1 }])
  expect(fenced.modelSelection()).toEqual({ unavailable: true })
  expect(valid.modelSelection()).toEqual({ selected: 'teaching/model' })
})

it('matches raw semantic Call selection while preserving the content read-key range', () => {
  const entries = durable().prefix.entries
  const history = append(null, entries)
  const indexed = history.inspect()
  const raw = oracle(entries)
  if (!('ok' in indexed) || !('ok' in raw)) throw new Error('valid Call fixture')
  expect(indexed.ok.select({ kind: 'call', call: 'call' })).toEqual(
    raw.ok.select({ kind: 'call', call: 'call' }),
  )
  expect(history.select({ kind: 'call', call: 'call' })).toContainEqual(entries[2])
})
