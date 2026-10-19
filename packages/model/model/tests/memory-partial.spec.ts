import { expect, it } from 'vitest'
import { createMemoryModelCommands } from '@omne-harness/model/testing'
import {
  decodeDispatchId,
  type GrowingContentKind,
  type ResultPart,
  type Termination,
  type TransportFact,
} from '@omne-harness/model-contract'
import { judgePart } from '@omne-harness/message'
import type { MemoryModelLimits } from '@omne-harness/model/testing'
import { digest } from '../src/testing/value.ts'
import { fixture, instance, op, proof, unbox, owner } from './memory-fixture.ts'

function bytes(value: unknown): number {
  const text = JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
          ),
        )
      : entry,
  )
  return Buffer.byteLength(text, 'utf8')
}
function textBlock(id: string, text: string) {
  const block = judgePart({ kind: 'text', id, visibility: { toHuman: true, toModel: true }, text })
  if ('rejected' in block || block.ok.kind !== 'text') throw new Error('text fixture')
  return block.ok
}
async function running(
  limits: Partial<MemoryModelLimits> = {},
  capacityBytes = '100000',
  consumerOwner = 'consumer',
) {
  const f = fixture()
  const options = {
    ...f.options,
    owners: [{ ...owner, consumerOwner }],
    limits: { ...f.options.limits, ...limits },
  }
  const memory = createMemoryModelCommands(options)
  const admit = {
    ...f.admit,
    consumer: { ...f.admit.consumer, owner: consumerOwner },
    capacity: { ...f.admit.capacity, bytes: capacityBytes },
  }
  const { commands } = memory
  unbox(await commands.admit(admit))
  const execution = unbox(
    await commands.claim({
      ...admit,
      operation: op('claim'),
      instance: instance(),
      continuity: proof(admit.call),
    }),
  )
  let sequence = 0
  const write = async () => ({
    ...execution,
    operation: op(`partial-${++sequence}`),
    expected: unbox(await commands.loadRecovery(admit)).state.revision,
  })
  const dispatch = unbox(decodeDispatchId('mdisp_partial'))
  unbox(
    await commands.prepareDispatch({
      ...(await write()),
      dispatch,
      supplier: admit.request.suppliers[0],
      policyDecision: null,
    }),
  )
  const preserve = async (facts: readonly TransportFact[]) => {
    const window = `window-${sequence}`
    unbox(await commands.openReceiveWindow({ ...(await write()), dispatch, window }))
    f.completeWindows.add(`${admit.call}/${window}/${digest(facts)}`)
    const input = { ...(await write()), dispatch, window, facts }
    return { input, result: await commands.preserve(input) }
  }
  const settle = async (termination: Termination) =>
    unbox(await commands.settle({ ...(await write()), termination }))
  const read = async (termination: Termination) => {
    const settlement = await settle(termination)
    const input = { ...admit, operation: op('read'), result: settlement.version }
    const started = unbox(await commands.acquireRead(input))
    if (started.kind !== 'started' || started.value.kind !== 'reading')
      throw new Error('read fixture')
    return { settlement, input, started, page: started.value.page }
  }
  return { ...f, ...memory, admit, options, execution, dispatch, write, preserve, settle, read }
}
const failure: Termination = {
  kind: 'failed',
  fault: { cause: 'upstream-protocol', diagnostic: 'broken', upstreamStatus: null },
}

for (const content of [
  'text',
  'thinking',
  'voice',
  'tool-arguments',
] satisfies GrowingContentKind[]) {
  for (const ending of ['failed', 'interrupted', 'limit'] as const) {
    it(`delivers actual ${content} partial and ordered trims after ${ending}`, async () => {
      const f = await running()
      const control = op('cancel')
      if (ending === 'interrupted')
        unbox(await f.commands.control({ ...f.admit, operation: control }))
      const value = content === 'tool-arguments' ? '{"unfinished":' : `${content}原值\ud800`
      const facts: TransportFact[] = [
        { kind: 'block-open', index: '0', content, mode: 'append' },
        { kind: 'block-delta', index: '0', delta: value },
        { kind: 'trim', index: '0', removed: '2', reason: 'actual-first' },
        { kind: 'trim', index: '0', removed: '1.5', reason: 'actual-second' },
        {
          kind: 'ended',
          termination:
            ending === 'failed'
              ? failure
              : ending === 'limit'
                ? { kind: 'completed', reason: 'limit' }
                : { kind: 'interrupted', stop: 'confirmed' },
        },
      ]
      const saved = await f.preserve(facts)
      unbox(saved.result)
      expect(await f.commands.preserve(saved.input)).toEqual(saved.result)
      const termination: Termination =
        ending === 'failed'
          ? failure
          : ending === 'limit'
            ? { kind: 'completed', reason: 'limit' }
            : { kind: 'interrupted', control }
      const read = await f.read(termination)
      expect(read.page.parts).toEqual([
        {
          kind: 'partial',
          content,
          value,
          trims: [
            { removed: '2', reason: 'actual-first' },
            { removed: '1.5', reason: 'actual-second' },
          ],
        },
      ])
      expect(read.page.settlement.termination).toEqual(termination)
      expect(bytes(read.page)).toBeLessThanOrEqual(Number(f.admit.capacity.bytes))
    })
  }
}
it('keeps sealed and partial positions interleaved, with trims, stable pages and original readers after ACK', async () => {
  const f = await running({ resultPageParts: 2, resultPageTargetBytes: 1024 })
  const block = textBlock('sealed', 'finished')
  unbox(
    (
      await f.preserve([
        { kind: 'block-open', index: '0', content: 'text', mode: 'replace' },
        { kind: 'block-replace', index: '0', value: 'prior' },
        { kind: 'block-replace', index: '0', value: '' },
        { kind: 'block-open', index: '1', content: 'text', mode: 'append' },
        { kind: 'block-delta', index: '1', delta: 'finished' },
        { kind: 'trim', index: '1', removed: '3', reason: 'before-seal' },
        { kind: 'block-seal', index: '1', block },
        { kind: 'block-open', index: '2', content: 'voice', mode: 'replace' },
        { kind: 'trim', index: '2', removed: '4', reason: 'empty-but-trimmed' },
        { kind: 'block-open', index: '3', content: 'text', mode: 'append' },
        { kind: 'block-delta', index: '3', delta: '' },
        { kind: 'ended', termination: { kind: 'completed', reason: 'limit' } },
      ])
    ).result,
  )
  const read = await f.read({ kind: 'completed', reason: 'limit' })
  expect(read.page.parts).toEqual([
    { kind: 'partial', content: 'text', value: '', trims: [] },
    { kind: 'sealed', block, trims: [{ removed: '3', reason: 'before-seal' }] },
  ])
  expect(
    await f.commands.nextRead({ ...f.admit, read: read.started.read, after: '1' }),
  ).toMatchObject({ failure: { field: 'after' } })
  expect(
    await f.commands.nextRead({ ...f.admit, read: read.started.read, after: '0' }),
  ).toMatchObject({ failure: { field: 'after' } })
  unbox(
    await f.commands.handoff({
      ...f.admit,
      operation: op('ack'),
      result: read.settlement.version,
      evidence: {
        kind: 'processed',
        completion: proof(`${f.admit.call}/${read.settlement.version}`, 'consumer'),
      },
    }),
  )
  expect(
    unbox(await f.commands.acquireRead({ ...read.input, operation: op('read-new') })).kind,
  ).toBe('acknowledged')
  const input = { ...f.admit, read: read.started.read, after: '2' }
  const next = unbox(await f.commands.nextRead(input))
  expect(unbox(await f.commands.nextRead(input))).toEqual(next)
  expect(next.kind === 'reading' && next.page.parts).toEqual([
    {
      kind: 'partial',
      content: 'voice',
      value: '',
      trims: [{ removed: '4', reason: 'empty-but-trimmed' }],
    },
  ])
  expect(unbox(await f.commands.acquireRead(read.input))).toEqual(read.started)
  f.denied.add('content')
  expect(await f.commands.nextRead(input)).toMatchObject({ failure: { kind: 'denied' } })
})
for (const target of [1, 2, 1024]) {
  for (const content of [
    'text',
    'thinking',
    'voice',
    'tool-arguments',
  ] satisfies GrowingContentKind[]) {
    it(`returns one whole 4KiB ${content} partial above target ${target}, then the next item`, async () => {
      const f = await running({ resultPageParts: 10, resultPageTargetBytes: target })
      const value = '界'.repeat(1400) + '\ud800'
      unbox(
        (
          await f.preserve([
            { kind: 'block-open', index: '0', content, mode: 'append' },
            { kind: 'block-delta', index: '0', delta: value },
            { kind: 'trim', index: '0', removed: '1', reason: 'r'.repeat(1500) },
            { kind: 'block-open', index: '1', content: 'text', mode: 'append' },
            { kind: 'block-delta', index: '1', delta: 'last' },
            { kind: 'ended', termination: failure },
          ])
        ).result,
      )
      const read = await f.read(failure)
      expect(read.page.parts).toEqual([
        { kind: 'partial', content, value, trims: [{ removed: '1', reason: 'r'.repeat(1500) }] },
      ])
      expect(bytes(read.page.parts)).toBeGreaterThan(target)
      expect(bytes(read.page)).toBeLessThanOrEqual(Number(f.admit.capacity.bytes))
      const next = unbox(
        await f.commands.nextRead({ ...f.admit, read: read.started.read, after: '1' }),
      )
      expect(next.kind === 'reading' && next.page.parts).toEqual([
        { kind: 'partial', content: 'text', value: 'last', trims: [] },
      ])
    })
  }
}
it('uses the exact canonical parts-array target and freezes page parameters against caller mutation', async () => {
  const expected: ResultPart[] = ['多字节\ud800', 'second'].map(value => ({
    kind: 'partial',
    content: 'text',
    value,
    trims: [],
  }))
  const target = bytes(expected)
  for (const bound of [target - 1, target]) {
    const f = await running({ resultPageParts: 10, resultPageTargetBytes: bound })
    unbox(
      (
        await f.preserve(
          expected
            .flatMap((part, index): TransportFact[] =>
              part.kind === 'partial'
                ? [
                    {
                      kind: 'block-open',
                      index: String(index),
                      content: part.content,
                      mode: 'append',
                    },
                    { kind: 'block-delta', index: String(index), delta: part.value },
                  ]
                : [],
            )
            .concat([{ kind: 'ended', termination: failure }]),
        )
      ).result,
    )
    Object.assign(f.options.limits, { resultPageTargetBytes: 1, resultPageParts: 1 })
    const read = await f.read(failure)
    expect(read.page.parts).toEqual(bound === target ? expected : expected.slice(0, 1))
    Object.assign(read.page.parts[0] ?? {}, { value: 'tampered' })
    const again = unbox(await f.commands.acquireRead(read.input))
    expect(
      again.kind === 'started' && again.value.kind === 'reading' && again.value.page.parts,
    ).toEqual(bound === target ? expected : expected.slice(0, 1))
  }
})
it('rejects a trimmed executable tool seal and a completed terminal atomically, then returns the legal partial prefix', async () => {
  const f = await running()
  unbox(
    (
      await f.preserve([
        { kind: 'block-open', index: '0', content: 'tool-arguments', mode: 'append' },
        { kind: 'block-delta', index: '0', delta: '{}' },
        { kind: 'trim', index: '0', removed: '1', reason: 'truncated' },
      ])
    ).result,
  )
  const tool = judgePart({
    kind: 'tool_call',
    id: 't',
    visibility: { toHuman: true, toModel: true },
    callId: 'c',
    name: 'demo',
    arguments: { kind: 'object', entries: [] },
  })
  if ('rejected' in tool || tool.ok.kind !== 'tool_call') throw new Error('tool fixture')
  const bad = await f.preserve([
    { kind: 'block-seal', index: '0', block: tool.ok },
    { kind: 'ended', termination: { kind: 'completed', reason: 'tool-suggestions' } },
  ])
  expect(bad.result).toMatchObject({ failure: { field: 'block' } })
  expect(
    await f.commands.preserve({
      ...bad.input,
      facts: [{ kind: 'ended', termination: { kind: 'completed', reason: 'stop' } }],
    }),
  ).toMatchObject({ failure: { field: 'termination' } })
  unbox(
    await f.commands.preserve({
      ...bad.input,
      facts: [{ kind: 'ended', termination: { kind: 'completed', reason: 'limit' } }],
    }),
  )
  expect((await f.read({ kind: 'completed', reason: 'limit' })).page.parts).toEqual([
    {
      kind: 'partial',
      content: 'tool-arguments',
      value: '{}',
      trims: [{ removed: '1', reason: 'truncated' }],
    },
  ])
})
it('refuses oversized terminal input before publication and preserves its legal prefix for a bounded long terminal', async () => {
  const f = await running()
  unbox(
    (
      await f.preserve([
        { kind: 'block-open', index: '0', content: 'text', mode: 'append' },
        { kind: 'block-delta', index: '0', delta: 'kept' },
      ])
    ).result,
  )
  const bad = await f.preserve([
    {
      kind: 'ended',
      termination: {
        kind: 'failed',
        fault: { cause: 'upstream-protocol', diagnostic: 'x'.repeat(4096), upstreamStatus: null },
      },
    },
  ])
  expect(bad.result).toMatchObject({
    failure: { field: 'termination', reason: 'encoded-byte-limit' },
  })
  const good: Termination = {
    kind: 'failed',
    fault: { cause: 'upstream-protocol', diagnostic: 'x'.repeat(3000), upstreamStatus: null },
  }
  unbox(await f.commands.preserve({ ...bad.input, facts: [{ kind: 'ended', termination: good }] }))
  const read = await f.read(good)
  expect(read.page.settlement.termination).toEqual(good)
  expect(read.page.parts).toEqual([{ kind: 'partial', content: 'text', value: 'kept', trims: [] }])
  expect(bytes(read.page)).toBeLessThanOrEqual(Number(f.admit.capacity.bytes))
})
it('rejects new projection or trim material atomically within the declared finite reservation', async () => {
  const f = await running({}, '36000')
  unbox(
    (
      await f.preserve([
        { kind: 'block-open', index: '0', content: 'text', mode: 'append' },
        { kind: 'block-delta', index: '0', delta: 'kept' },
      ])
    ).result,
  )
  const bad = await f.preserve([
    { kind: 'block-delta', index: '0', delta: 'x'.repeat(5000) },
    { kind: 'trim', index: '0', removed: '1', reason: 'r'.repeat(1000) },
  ])
  expect(bad.result).toMatchObject({ failure: { kind: 'capacity' } })
  unbox(
    await f.commands.preserve({ ...bad.input, facts: [{ kind: 'ended', termination: failure }] }),
  )
  expect((await f.read(failure)).page.parts).toEqual([
    { kind: 'partial', content: 'text', value: 'kept', trims: [] },
  ])
})
it('consumes reserved settlement and first-read metadata at the exact accepted capacity boundary', async () => {
  const termination: Termination = {
    kind: 'failed',
    fault: {
      cause: 'upstream-protocol',
      diagnostic: 'diagnostic'.repeat(300),
      upstreamStatus: null,
    },
  }
  const facts: TransportFact[] = [
    { kind: 'block-open', index: '0', content: 'text', mode: 'append' },
    { kind: 'block-delta', index: '0', delta: 'prefix'.repeat(100) },
    { kind: 'ended', termination },
  ]
  let lower = 25000
  let upper = 80000
  while (lower < upper) {
    const capacity = Math.floor((lower + upper) / 2)
    try {
      const f = await running({}, String(capacity))
      const result = (await f.preserve(facts)).result
      if ('ok' in result) upper = capacity
      else {
        expect(result.failure.kind).toBe('capacity')
        lower = capacity + 1
      }
    } catch (error) {
      expect(String(error)).toContain('"kind":"capacity"')
      lower = capacity + 1
    }
  }
  const refused = await running({}, String(lower - 1))
  expect((await refused.preserve(facts)).result).toMatchObject({ failure: { kind: 'capacity' } })
  const f = await running({}, String(lower))
  unbox((await f.preserve(facts)).result)
  const read = await f.read(termination)
  expect(read.page.parts).toEqual([
    { kind: 'partial', content: 'text', value: 'prefix'.repeat(100), trims: [] },
  ])
  expect(read.page.settlement.termination).toEqual(termination)
  expect(bytes(read.page)).toBeLessThanOrEqual(lower)
})
for (const trimmed of [false, true]) {
  it(`does not let a pure empty failed dispatch poison a complete retry, preserving trim=${trimmed}`, async () => {
    const f = await running()
    const retryFailure = {
      kind: 'failed',
      fault: { cause: 'upstream-unavailable', diagnostic: 'retryable', upstreamStatus: '503' },
    } as const
    const facts: TransportFact[] = [
      { kind: 'block-open', index: '0', content: 'text', mode: 'append' },
      { kind: 'block-delta', index: '0', delta: '' },
      ...(trimmed
        ? [
            {
              kind: 'trim',
              index: '0',
              removed: '1',
              reason: 'empty-warning',
            } satisfies TransportFact,
          ]
        : []),
      { kind: 'ended', termination: retryFailure },
    ]
    unbox((await f.preserve(facts)).result)
    const position = unbox(
      await f.commands.prepareRetry({ ...(await f.write()), dispatch: f.dispatch }),
    )
    unbox(
      await f.commands.decideRetry({
        ...(await f.write()),
        position,
        decision: {
          kind: 'retry',
          supplier: f.admit.request.suppliers[0],
          notBefore: '2026-10-19T00:00:00Z',
          basis: f.admit.request.retryPolicy,
        },
        source: proof(position.operation, 'retry'),
      }),
    )
    const dispatch = unbox(decodeDispatchId('mdisp_second'))
    unbox(
      await f.commands.prepareDispatch({
        ...(await f.write()),
        dispatch,
        supplier: f.admit.request.suppliers[0],
        policyDecision: proof(position.operation, 'retry'),
      }),
    )
    unbox(await f.commands.openReceiveWindow({ ...(await f.write()), dispatch, window: 'second' }))
    const block = textBlock('done', 'success')
    unbox(
      await f.commands.preserve({
        ...(await f.write()),
        dispatch,
        window: 'second',
        facts: [
          { kind: 'block-open', index: '0', content: 'text', mode: 'append' },
          { kind: 'block-delta', index: '0', delta: 'success' },
          { kind: 'block-seal', index: '0', block },
          { kind: 'ended', termination: { kind: 'completed', reason: 'stop' } },
        ],
      }),
    )
    const read = await f.read({ kind: 'completed', reason: 'stop' })
    const parts = [...read.page.parts]
    if (read.page.next !== null) {
      const next = unbox(
        await f.commands.nextRead({ ...f.admit, read: read.started.read, after: read.page.next }),
      )
      if (next.kind !== 'reading') throw new Error('second retry page')
      parts.push(...next.page.parts)
    }
    expect(parts).toEqual([
      ...(trimmed
        ? [
            {
              kind: 'partial',
              content: 'text',
              value: '',
              trims: [{ removed: '1', reason: 'empty-warning' }],
            },
          ]
        : []),
      { kind: 'sealed', block, trims: [] },
    ])
  })
}
for (const terminalPath of ['preserve', 'late'] as const) {
  it(`reserves the full control, ${terminalPath} terminal, read, ACK and cleanup lifecycle at a critical prefix`, async () => {
    const facts: TransportFact[] = [
      { kind: 'block-open', index: '0', content: 'text', mode: 'append' },
      { kind: 'block-delta', index: '0', delta: 'x'.repeat(1024) },
    ]
    let lower = 30000
    let upper = 90000
    while (lower < upper) {
      const capacity = Math.floor((lower + upper) / 2)
      const f = await running({}, String(capacity))
      const result = (await f.preserve(facts)).result
      if ('ok' in result) upper = capacity
      else {
        expect(result.failure.kind).toBe('capacity')
        lower = capacity + 1
      }
    }
    const f = await running({}, String(lower))
    unbox((await f.preserve(facts)).result)
    const control = op('controlled')
    unbox(await f.commands.control({ ...f.admit, operation: control }))
    const termination: Termination = { kind: 'interrupted', control }
    if (terminalPath === 'preserve')
      unbox(
        (
          await f.preserve([
            { kind: 'ended', termination: { kind: 'interrupted', stop: 'confirmed' } },
          ])
        ).result,
      )
    else
      unbox(
        await f.commands.recordLateFact({
          ...f.admit,
          operation: op('late-terminal'),
          dispatch: f.dispatch,
          source: proof(`${f.admit.call}/${f.dispatch}`, 'supplier'),
          fact: { kind: 'terminal', event: 'terminal', actual: termination },
        }),
      )
    const read = await f.read(termination)
    expect(read.page.parts).toEqual([
      { kind: 'partial', content: 'text', value: 'x'.repeat(1024), trims: [] },
    ])
    unbox(await f.commands.endRead({ ...f.admit, read: read.started.read }))
    const ack = unbox(
      await f.commands.handoff({
        ...f.admit,
        operation: op('ack'),
        result: read.settlement.version,
        evidence: {
          kind: 'processed',
          completion: proof(`${f.admit.call}/${read.settlement.version}`, 'consumer'),
        },
      }),
    )
    expect(ack.custody.kind).toBe('acknowledged')
    expect(
      unbox(await f.commands.advanceCleanup({ ...f.execution, operation: op('cleanup') })),
    ).toMatchObject({ cleanup: 'released' })
  })
}
it('rejects an owner that cannot fit bounded handoff evidence at configuration admission', () => {
  const f = fixture()
  expect(() =>
    createMemoryModelCommands({
      ...f.options,
      owners: [{ ...owner, consumerOwner: 'x'.repeat(513) }],
    }),
  ).toThrow('512 UTF-8 bytes')
})
it('admits a maximal owner with a bounded genuine ACK and refuses oversized evidence without changing custody', async () => {
  const consumerOwner = 'x'.repeat(512)
  const f = await running({}, '100000', consumerOwner)
  unbox(
    (
      await f.preserve([
        { kind: 'block-open', index: '0', content: 'text', mode: 'append' },
        { kind: 'block-delta', index: '0', delta: 'kept' },
        { kind: 'ended', termination: { kind: 'completed', reason: 'limit' } },
      ])
    ).result,
  )
  const read = await f.read({ kind: 'completed', reason: 'limit' })
  const completion = proof(`${f.admit.call}/${read.settlement.version}`, consumerOwner)
  expect(
    await f.commands.handoff({
      ...f.admit,
      operation: op('bad-proof'),
      result: read.settlement.version,
      evidence: { kind: 'processed', completion: { ...completion, revision: 'x'.repeat(4096) } },
    }),
  ).toMatchObject({ failure: { field: 'evidence', reason: 'encoded-byte-limit' } })
  expect(unbox(await f.commands.loadRecovery(f.admit)).state.custody.kind).toBe('producer')
  unbox(
    await f.commands.handoff({
      ...f.admit,
      operation: op('good-proof'),
      result: read.settlement.version,
      evidence: { kind: 'processed', completion },
    }),
  )
  unbox(await f.commands.endRead({ ...f.admit, read: read.started.read }))
  expect(
    unbox(await f.commands.advanceCleanup({ ...f.execution, operation: op('release') })),
  ).toMatchObject({ cleanup: 'released' })
})
it('requires the new finite positive memory page targets and rejects old-only configuration', () => {
  const f = fixture()
  for (const field of ['resultPageParts', 'resultPageTargetBytes'])
    for (const value of [0, -1, 0.5, NaN, Infinity])
      expect(() =>
        Reflect.apply(createMemoryModelCommands, undefined, [
          { ...f.options, limits: { ...f.options.limits, [field]: value } },
        ]),
      ).toThrow(RangeError)
  const { resultPageParts: _parts, resultPageTargetBytes: _bytes, ...limits } = f.options.limits
  expect(() =>
    Reflect.apply(createMemoryModelCommands, undefined, [
      { ...f.options, limits: { ...limits, resultPageBlocks: 1, resultPageBytes: 1024 } },
    ]),
  ).toThrow(RangeError)
})
it('returns an empty result with the actual failed termination after only empty states', async () => {
  const f = await running({ resultPageTargetBytes: 1 })
  const termination: Termination = {
    kind: 'failed',
    fault: { cause: 'input-rejected', diagnostic: 'rejected', upstreamStatus: '400' },
  }
  unbox(
    (
      await f.preserve([
        { kind: 'block-open', index: '0', content: 'text', mode: 'append' },
        { kind: 'block-delta', index: '0', delta: '' },
        { kind: 'ended', termination },
      ])
    ).result,
  )
  const read = await f.read(termination)
  expect(read.page).toEqual({ parts: [], next: null, settlement: read.settlement })
  expect(read.page.settlement.termination).toEqual(termination)
})
