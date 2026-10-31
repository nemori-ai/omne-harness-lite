import { describe, expect, it } from 'vitest'
import { decodeToolInstanceId, decodeToolWaitId } from '@omne-harness/tool-contract/provider'
import type { ProcessBlock, ToolTerminal } from '@omne-harness/tool-contract'
import type {
  FactBatch,
  ToolExecutionFact,
  ToolLiveExecution,
} from '@omne-harness/tool-contract/provider'
import { createToolLedger, type FactBatchRecord } from '@omne-harness/tool'
import { createMemoryToolClock } from '@omne-harness/tool-contract/testing'
import { admitCall, startHarness } from './start-values.ts'
import {
  adoption,
  callId,
  configurationOf,
  evidence,
  guards,
  ok,
  principalA,
  principalB,
  operationId,
  tenantA,
  tenantB,
  text,
  type Block,
  testSettlementPorts,
} from './runtime-values.ts'

async function running(options: Parameters<typeof startHarness>[0] = {}) {
  const harness = startHarness(options)
  await admitCall(harness, 'facts')
  await harness.drive('facts')
  const access = { principal: principalA, tenant: tenantA, call: callId('facts') }
  const recovery = ok(await harness.commands.loadRecovery(access))
  if (recovery.start === null) throw new Error('the fixture did not start')
  const batch: FactBatch<Block> = {
    start: recovery.start,
    source: evidence('facts-source'),
    batch: 'first',
    after: null,
    cursor: 'opaque/end',
    events: [{ event: 'event-1', fact: { kind: 'process', blocks: [processBlock()] } }],
  }
  return {
    harness,
    access,
    batch,
    receive: (value = batch) =>
      harness.commands.receiveFacts({ ...access, start: batch.start, batch: value }),
  }
}

const textBlock = (value: string) => text('out', value)

function processBlock(text = 'hello', sequence = '0'): ProcessBlock {
  return {
    index: 'output',
    mode: 'append',
    state: 'open',
    sequence,
    trim: null,
    content: { ...textBlock(text), visibility: { toHuman: true, toModel: false } },
  }
}

describe('fact custody', () => {
  it('saves a batch with its progress and ACK responsibility in one call commit', async () => {
    const { harness, access, batch, receive } = await running()
    const before = harness.memory.commits
    const receipt = ok(await receive())
    expect(receipt).toMatchObject({
      start: batch.start.operation,
      batch: batch.batch,
      cursor: batch.cursor,
    })
    expect(harness.memory.commits).toBe(before + 1)
    const recovery = ok(await harness.commands.loadRecovery(access))
    expect(recovery.streams).toEqual([
      {
        start: batch.start,
        source: batch.source,
        cursor: batch.cursor,
        pendingAcknowledgements: [receipt],
      },
    ])
    expect(recovery.tasks.filter(task => task.kind === 'fact-ack')).toHaveLength(1)
    expect(ok(await receive())).toEqual(receipt)
    expect(harness.memory.commits).toBe(before + 1)
  })
})

function next(
  batch: FactBatch<Block>,
  events: FactBatch<Block>['events'],
  name = 'second',
): FactBatch<Block> {
  return { ...batch, batch: name, after: batch.cursor, cursor: `opaque/${name}`, events }
}
async function records(harness: Awaited<ReturnType<typeof running>>['harness']) {
  const read = await harness.memory.read({ kind: 'call', tenant: tenantA, call: callId('facts') })
  if (read.kind !== 'complete') throw new Error('unreadable fixture')
  return read.records
}
function finalFact(): Extract<ToolExecutionFact<Block>, { kind: 'final' }> {
  return {
    kind: 'final',
    raw: {
      codec: adoption('codec'),
      custody: evidence('raw-custody'),
      content: {
        storage: 'memory',
        key: 'original',
        mediaType: 'application/json',
        bytes: '123',
        digest: 'sha256:raw',
      },
    },
    result: {
      content: [text('answer', 'done')],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
    terminal: { kind: 'completed' },
    effect: { kind: 'occurred', evidence: evidence('effect') },
  }
}

describe('batch identities and continuity', () => {
  it('recognises an old batch after further progress without moving the cursor or writing', async () => {
    const { harness, access, batch, receive } = await running()
    const receipt = ok(await receive())
    ok(
      await receive(
        next(batch, [
          {
            event: 'event-2',
            fact: { kind: 'process', blocks: [processBlock('hello world', '7')] },
          },
        ]),
      ),
    )
    const count = harness.memory.commits
    expect(ok(await receive())).toEqual(receipt)
    expect(harness.memory.commits).toBe(count)
    expect(ok(await harness.commands.loadRecovery(access)).streams[0]?.cursor).toBe('opaque/second')
  })
  it('does not resurrect a confirmed batch when its original receipt is retransmitted', async () => {
    const { harness, access, receive } = await running()
    const receipt = ok(await receive())
    const domain = { kind: 'call', tenant: tenantA, call: access.call } as const
    const stored = await harness.memory.read(domain)
    if (stored.kind !== 'complete') throw new Error('fixture')
    const batch = stored.records.find(record => record.kind === 'fact-batch')
    const ack = stored.records.find(
      record => record.kind === 'task' && record.task.kind === 'fact-ack',
    )
    if (batch?.kind !== 'fact-batch' || ack?.kind !== 'task') throw new Error('fixture')
    // B owns the confirmation command. Stage its documented committed record to test A recall.
    const confirmed: FactBatchRecord = {
      ...batch.batch,
      acknowledgement: { kind: 'confirmed', sourceReceipt: evidence('ack') },
    }
    await harness.memory.commit({
      domain,
      expected: stored.revision,
      revision: stored.revision,
      writes: [
        { kind: 'put', record: { kind: 'fact-batch', batch: confirmed } },
        { kind: 'delete', key: `task:fact-ack:${ack.task.operation}` },
      ],
    })
    const count = harness.memory.commits
    expect(ok(await receive())).toEqual(receipt)
    expect(harness.memory.commits).toBe(count)
    const recovery = ok(await harness.commands.loadRecovery(access))
    expect(recovery.streams[0]?.pendingAcknowledgements).toEqual([])
    expect(recovery.tasks.some(task => task.kind === 'fact-ack')).toBe(false)
  })
  it('deduplicates same events across batches and inside a multi-event batch', async () => {
    const { harness, batch, receive } = await running()
    ok(await receive())
    const event = {
      event: 'event-2',
      fact: { kind: 'process', blocks: [processBlock('hello world', '21')] },
    } as const
    ok(await receive(next(batch, [...batch.events, event, event])))
    const saved = await records(harness)
    expect(saved.filter(record => record.kind === 'fact-event')).toHaveLength(2)
    expect(saved.filter(record => record.kind === 'fact-batch')).toHaveLength(2)
    expect(
      saved.filter(record => record.kind === 'task' && record.task.kind === 'fact-ack'),
    ).toHaveLength(2)
  })
  it.each(['batch', 'event', 'source', 'start'] as const)(
    'rejects changed %s identity without overwriting custody',
    async field => {
      const { harness, batch, receive } = await running()
      ok(await receive())
      const before = await records(harness)
      const changed: FactBatch<Block> =
        field === 'source'
          ? { ...batch, source: { ...batch.source, record: 'changed', revision: '2' } }
          : field === 'start'
            ? {
                ...batch,
                start: {
                  ...batch.start,
                  execution: { ...batch.start.execution, generation: 'different' },
                },
              }
            : field === 'batch'
              ? { ...batch, cursor: 'another' }
              : next(batch, [
                  { event: 'event-1', fact: { kind: 'process', blocks: [processBlock('forged')] } },
                ])
      expect(await receive(changed)).toMatchObject({ failure: { kind: 'invalid' } })
      expect(await records(harness)).toEqual(before)
    },
  )
  it.each(['gap', 'old-boundary', 'cycle'] as const)(
    'rejects a %s without interpreting cursor text',
    async variant => {
      const { harness, batch, receive } = await running()
      ok(await receive())
      const second = next(batch, [])
      ok(await receive(second))
      const bad = {
        ...next(second, [], 'third'),
        after:
          variant === 'gap'
            ? 'arbitrary'
            : variant === 'old-boundary'
              ? batch.cursor
              : second.cursor,
        cursor: variant === 'cycle' ? batch.cursor : 'third',
      }
      const count = harness.memory.commits
      expect(await receive(bad)).toMatchObject({ failure: { kind: 'invalid-cursor' } })
      expect(harness.memory.commits).toBe(count)
    },
  )
  it.each(['wait', 'continued', 'account', 'program-scheduling'] as const)(
    'rejects an entire batch containing unsupported %s',
    async kind => {
      const { harness, access, batch } = await running()
      const count = harness.memory.commits
      const unsupported = {
        ...batch,
        events: [
          ...batch.events,
          { event: 'unsupported', fact: { kind } },
          { event: 'last', fact: finalFact() },
        ],
      }
      // Exercise the untyped producer boundary for variants that A deliberately cannot consume.
      const answer = await Reflect.apply(harness.commands.receiveFacts, null, [
        { ...access, start: batch.start, batch: unsupported },
      ])
      expect(answer).toMatchObject({ failure: { kind: 'unsupported' } })
      expect(harness.memory.commits).toBe(count)
      expect((await records(harness)).some(record => record.kind.startsWith('fact-'))).toBe(false)
    },
  )
})

describe('atomic custody and recovery', () => {
  it.each(['unknown-applied', 'unknown-dropped', 'unknown-delayed', 'throw-applied'] as const)(
    'recovers the original batch after %s',
    async fault => {
      const { harness, access, receive } = await running()
      harness.memory.injectCommit(fault)
      const unknown = await receive()
      expect(unknown).toEqual({
        failure: {
          kind: 'unavailable',
          dependency: 'ledger-store',
          diagnostic: 'fact custody outcome is unknown; resubmit the original batch',
        },
      })
      if (fault === 'unknown-delayed')
        expect(harness.memory.landDelayed()).toEqual([{ kind: 'committed' }])
      const receipt = ok(await receive())
      expect(ok(await receive())).toEqual(receipt)
      const saved = await records(harness)
      expect(saved.filter(record => record.kind === 'fact-event')).toHaveLength(1)
      expect(saved.filter(record => record.kind === 'fact-batch')).toHaveLength(1)
      expect(
        ok(await harness.commands.loadRecovery(access)).streams[0]?.pendingAcknowledgements,
      ).toEqual([receipt])
    },
  )
  it('retries revision conflicts and keeps a delayed obsolete candidate from splitting custody', async () => {
    const { harness, receive } = await running()
    harness.memory.injectCommit('unknown-delayed')
    expect(await receive()).toHaveProperty('failure')
    harness.memory.injectCommit('conflict')
    const receipt = ok(await receive())
    expect(harness.memory.landDelayed()).toEqual([{ kind: 'conflict' }])
    expect(ok(await receive())).toEqual(receipt)
  })
  it('rebuilds and reads complete final after the source drops its batch on receipt', async () => {
    let source: ToolLiveExecution<Block> | null = null
    let released = false
    const fixture = await running({
      bindingPort: base => ({
        ...base,
        start: async (input, environment) => {
          const started = await base.start(input, environment)
          if ('failure' in started) return started
          const original = started.ok
          const wrapped: ToolLiveExecution<Block> = {
            ...original,
            facts: async function* (input) {
              if (released) return
              yield* original.facts(input)
            },
            acknowledge: async receipt => {
              const answer = await original.acknowledge(receipt)
              if ('ok' in answer) released = true
              return answer
            },
          }
          source = wrapped
          return { ok: wrapped }
        },
      }),
    })
    const { harness, access } = fixture
    const fact = finalFact()
    const readSource = (): ToolLiveExecution<Block> | null => source
    const live = readSource()
    if (live === null || fixture.batch.start.kind !== 'start') throw new Error('no source')
    await harness.binding.controls.finish(fixture.batch.start, fact)
    const controller = new AbortController()
    const iterator = live.facts({ after: null, signal: controller.signal })[Symbol.asyncIterator]()
    const delivered = await iterator.next()
    if (delivered.done) throw new Error('no final batch')
    const batch = delivered.value
    const receive = (value = batch) =>
      harness.commands.receiveFacts({ ...access, start: batch.start, batch: value })
    const receipt = ok(await receive())
    ok(await live.acknowledge(receipt))
    if (batch.start.kind !== 'start') throw new Error('no original start')
    expect(harness.binding.controls.pendingAcknowledgements(batch.start)).toBe(0)
    expect(
      await live.facts({ after: null, signal: controller.signal })[Symbol.asyncIterator]().next(),
    ).toEqual({ done: true, value: undefined })
    controller.abort()
    await iterator.return?.()
    const rebuilt = createToolLedger(
      harness.memory,
      guards(),
      createMemoryToolClock(),
      configurationOf({}),
      testSettlementPorts(),
    )
    const recovery = ok(await rebuilt.commands.loadRecovery(access))
    const tasks = recovery.tasks.filter(task => task.kind === 'settle')
    expect(tasks).toHaveLength(1)
    const task = tasks[0]
    if (task?.kind !== 'settle') throw new Error('no settle task')
    const saved = ok(await rebuilt.facts.read({ ...access, basis: task.basis }))
    expect(saved).toEqual({
      start: batch.start,
      source: batch.source,
      event: batch.events[0]?.event,
      fact,
      evidence: task.basis,
    })
    Object.assign(saved.source, { record: 'caller-mutation' })
    expect(ok(await rebuilt.facts.read({ ...access, basis: task.basis })).source).toEqual(
      batch.source,
    )
    expect(recovery.state.phase).toBe('running')
    expect(recovery.state.queue.kind).toBe('held')
    expect(recovery.result).toBeNull()
    expect(
      (await records(harness)).some(
        record => record.kind === 'queue-release' || record.kind === 'result',
      ),
    ).toBe(false)
    expect(
      await rebuilt.facts.read({ ...access, basis: { ...task.basis, digest: 'forged' } }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'basis' } })
    expect(
      await rebuilt.facts.read({
        ...access,
        principal: principalB,
        tenant: tenantA,
        basis: task.basis,
      }),
    ).toMatchObject({ failure: { kind: 'denied' } })
    expect(
      await rebuilt.facts.read({ ...access, tenant: tenantB, basis: task.basis }),
    ).toMatchObject({ failure: { kind: 'denied' } })
    ok(await receive(next(batch, [{ event: 'final-again', fact }])))
    expect(
      (await records(harness)).filter(
        record => record.kind === 'task' && record.task.kind === 'settle',
      ),
    ).toHaveLength(1)
    expect(
      await receive(
        next(
          { ...batch, cursor: 'opaque/second' },
          [
            {
              event: 'different-final',
              fact: { ...fact, terminal: { kind: 'failed', cause: 'executor', diagnostic: 'bad' } },
            },
          ],
          'third',
        ),
      ),
    ).toMatchObject({ failure: { kind: 'invalid' } })
  })
})

describe('process current state with immutable history', () => {
  it('keeps historical text through append, trim and closure and recalls old equal sequences', async () => {
    const { harness, batch, receive } = await running()
    ok(await receive())
    const closed = {
      ...processBlock('hello world', '1000000000000000000000'),
      state: 'closed',
      trim: { removed: '2', reason: 'display-budget' },
    } as const
    const second = next(batch, [{ event: 'closed', fact: { kind: 'process', blocks: [closed] } }])
    ok(await receive(second))
    ok(
      await receive(
        next(
          second,
          [{ event: 'historical', fact: { kind: 'process', blocks: [processBlock()] } }],
          'third',
        ),
      ),
    )
    const saved = await records(harness)
    const current = saved.find(record => record.kind === 'process')
    expect(current).toMatchObject({ kind: 'process', process: { block: closed } })
    const originals = saved.filter(record => record.kind === 'fact-event')
    expect(originals).toHaveLength(3)
    expect(originals[0]).toMatchObject({ fact: { fact: { blocks: [processBlock()] } } })
    expect(
      await receive(
        next(
          { ...second, cursor: 'opaque/third' },
          [
            {
              event: 'too-late',
              fact: {
                kind: 'process',
                blocks: [processBlock('hello world!', '1000000000000000000001')],
              },
            },
          ],
          'fourth',
        ),
      ),
    ).toMatchObject({ failure: { kind: 'invalid', reason: 'closed-block' } })
  })
  it.each(['same-sequence', 'mode', 'prefix', 'identity', 'visibility', 'older'] as const)(
    'rejects a %s violation without saving any other event in the batch',
    async fault => {
      const fixture = await running()
      const { harness, receive } = fixture
      let batch = fixture.batch
      ok(await receive())
      let block = processBlock('hello world', '2')
      if (fault === 'same-sequence') block = processBlock('changed', '0')
      if (fault === 'mode') block = { ...block, mode: 'replace' }
      if (fault === 'prefix') block = processBlock('unrelated', '2')
      if (fault === 'identity') block = { ...block, content: text('different', 'hello world') }
      if (fault === 'visibility')
        block = {
          ...block,
          content: { ...text('out', 'hello world'), visibility: { toHuman: true, toModel: true } },
        }
      if (fault === 'older') {
        const second = next(batch, [
          {
            event: 'advanced',
            fact: { kind: 'process', blocks: [processBlock('hello world', '9')] },
          },
        ])
        ok(await receive(second))
        batch = second
      }
      const before = await records(harness)
      const response = await receive(
        next(
          batch,
          [
            {
              event: 'otherwise-valid',
              fact: { kind: 'process', blocks: [{ ...processBlock(), index: 'another' }] },
            },
            { event: 'bad', fact: { kind: 'process', blocks: [block] } },
          ],
          'rejected',
        ),
      )
      expect(response).toMatchObject({ failure: { kind: 'invalid' } })
      expect(await records(harness)).toEqual(before)
    },
  )
  it('replaces a complete block at the same index and refuses non-text append', async () => {
    const { harness, batch, receive } = await running()
    const file: ProcessBlock = {
      ...processBlock(),
      mode: 'replace',
      content: {
        kind: 'file',
        id: text('file', '').id,
        visibility: { toHuman: true, toModel: false },
        storage: 'memory',
        key: 'a',
        mediaType: 'text/plain',
      },
    }
    ok(
      await receive({
        ...batch,
        events: [{ event: 'replace-1', fact: { kind: 'process', blocks: [file] } }],
      }),
    )
    const replacement = { ...file, sequence: '4', content: text('replacement', 'new value') }
    const second = next(batch, [
      { event: 'replace-2', fact: { kind: 'process', blocks: [replacement] } },
    ])
    ok(await receive(second))
    expect((await records(harness)).filter(record => record.kind === 'process')).toMatchObject([
      { process: { block: replacement } },
    ])
    expect(
      await receive(
        next(
          second,
          [
            {
              event: 'media',
              fact: { kind: 'process', blocks: [{ ...file, index: 'media', mode: 'append' }] },
            },
          ],
          'third',
        ),
      ),
    ).toMatchObject({ failure: { kind: 'unsupported' } })
  })
})

describe('fixed producer boundary and current access', () => {
  it.each([
    { label: 'array', cause: ['arguments'] },
    { label: 'nested array', cause: [['arguments']] },
  ])(
    'rejects a failed terminal with an $label cause before saving any event',
    async ({ cause }) => {
      const { harness, access, batch } = await running()
      const before = await records(harness)
      const commits = harness.memory.commits
      const malformed = {
        ...batch,
        events: [
          ...batch.events,
          {
            event: 'final',
            fact: {
              ...finalFact(),
              terminal: { kind: 'failed', cause, diagnostic: 'bad arguments' },
            },
          },
        ],
      }
      expect(
        await Reflect.apply(harness.commands.receiveFacts, null, [
          { ...access, start: batch.start, batch: malformed },
        ]),
      ).toMatchObject({ failure: { kind: 'invalid' } })
      expect(harness.memory.commits).toBe(commits)
      expect(await records(harness)).toEqual(before)
      const recovery = ok(await harness.commands.loadRecovery(access))
      expect(recovery.streams).toEqual([])
      expect(recovery.tasks.some(task => task.kind === 'fact-ack')).toBe(false)
    },
  )
  it.each(['arguments', 'environment', 'executor', 'runtime-lost', 'result'] as const)(
    'preserves the valid failed terminal cause %s as a string',
    async cause => {
      const { harness, access, batch, receive } = await running()
      const terminal = { kind: 'failed', cause, diagnostic: 'failed' } as const
      ok(
        await receive({
          ...batch,
          events: [{ event: 'final', fact: { ...finalFact(), terminal } }],
        }),
      )
      const recovery = ok(await harness.commands.loadRecovery(access))
      const settle = recovery.tasks.find(task => task.kind === 'settle')
      if (settle?.kind !== 'settle') throw new Error('missing saved final')
      expect(ok(await harness.ledger.facts.read({ ...access, basis: settle.basis })).fact).toEqual({
        ...finalFact(),
        terminal,
      })
    },
  )
  it('saves the input fixed before an access guard can mutate it', async () => {
    const { harness, access, batch } = await running()
    const mutable = structuredClone(batch)
    const original = structuredClone(batch)
    const base = guards()
    const ledger = createToolLedger(
      harness.memory,
      {
        ...base,
        access: {
          qualify: async input => {
            Object.assign(mutable, { events: [] })
            Object.assign(mutable.source, { record: 'changed' })
            Object.assign(mutable.start.execution, { generation: 'changed' })
            await Promise.resolve()
            return base.access.qualify(input)
          },
        },
      },
      createMemoryToolClock(),
      configurationOf({}),
      testSettlementPorts(),
    )
    ok(await ledger.commands.receiveFacts({ ...access, start: mutable.start, batch: mutable }))
    const recovery = ok(await ledger.commands.loadRecovery(access))
    expect(recovery.streams[0]).toMatchObject({ start: original.start, source: original.source })
    expect((await records(harness)).filter(record => record.kind === 'fact-event')).toHaveLength(1)
  })
  it.each(['accessor', 'cycle', 'extra', 'invalid-result', 'hidden-process'] as const)(
    'rejects %s data without evaluating accessors or committing',
    async fault => {
      const { harness, access, batch } = await running()
      const mutable = structuredClone(batch)
      let called = false
      if (fault === 'accessor')
        Object.defineProperty(mutable.source, 'record', {
          get() {
            called = true
            throw new Error('secret')
          },
        })
      if (fault === 'cycle') Object.assign(mutable, { events: [mutable] })
      if (fault === 'extra') Object.assign(mutable, { extra: true })
      if (fault === 'invalid-result')
        Object.assign(mutable, {
          events: [{ event: 'final', fact: { ...finalFact(), result: { bad: true } } }],
        })
      if (fault === 'hidden-process')
        Object.assign(mutable, {
          events: [
            {
              event: 'hidden',
              fact: {
                kind: 'process',
                blocks: [
                  {
                    ...processBlock(),
                    content: {
                      ...text('out', 'hello'),
                      visibility: { toHuman: false, toModel: true },
                    },
                  },
                ],
              },
            },
          ],
        })
      const count = harness.memory.commits
      expect(
        await harness.commands.receiveFacts({ ...access, start: batch.start, batch: mutable }),
      ).toMatchObject({ failure: { kind: 'invalid' } })
      expect(called).toBe(false)
      expect(harness.memory.commits).toBe(count)
    },
  )
  it('denies another tenant before reading or writing and sanitizes throwing access providers', async () => {
    const { harness, access, batch } = await running()
    const reads = harness.memory.reads
    expect(
      await harness.commands.receiveFacts({
        ...access,
        tenant: tenantB,
        start: batch.start,
        batch,
      }),
    ).toMatchObject({ failure: { kind: 'denied' } })
    expect(harness.memory.reads).toBe(reads)
    const ledger = createToolLedger(
      harness.memory,
      {
        ...guards(),
        access: {
          qualify: async () => {
            throw new Error('secret-token')
          },
        },
      },
      createMemoryToolClock(),
      configurationOf({}),
      testSettlementPorts(),
    )
    expect(await ledger.commands.receiveFacts({ ...access, start: batch.start, batch })).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'access-guard',
        diagnostic: 'access-guard threw an exception; its message is not reported',
      },
    })
  })
  it('keeps event identities isolated by real original invocation and accepts after the coordinator changes', async () => {
    const { harness, access, batch, receive } = await running()
    const domain = { kind: 'call', tenant: tenantA, call: access.call } as const
    const stored = await harness.memory.read(domain)
    if (stored.kind !== 'complete') throw new Error('fixture')
    const call = stored.records.find(record => record.kind === 'call')
    if (call?.kind !== 'call' || call.call.execution === null) throw new Error('fixture')
    // Existing claim is not delivered. Model only its changed coordinator execution binding.
    await harness.memory.commit({
      domain,
      expected: stored.revision,
      revision: stored.revision,
      writes: [
        {
          kind: 'put',
          record: {
            kind: 'call',
            call: {
              ...call.call,
              execution: { ...call.call.execution, generation: 'new-coordinator' },
            },
          },
        },
      ],
    })
    ok(await receive())
    await admitCall(harness, 'other', {
      limits: { concurrency: 2, foregroundMs: null, backgroundAfterMs: null },
    })
    await harness.drive('other')
    const otherAccess = { ...access, call: callId('other') }
    const otherStart = ok(await harness.commands.loadRecovery(otherAccess)).start
    if (otherStart === null) throw new Error('fixture')
    ok(
      await harness.commands.receiveFacts({
        ...otherAccess,
        start: otherStart,
        batch: { ...batch, start: otherStart },
      }),
    )
    expect((await records(harness)).filter(record => record.kind === 'fact-event')).toHaveLength(1)
  })
})

describe('concurrent custody', () => {
  it('converges competing copies of the same original batch to one receipt and write set', async () => {
    const { harness, receive } = await running()
    const [left, right] = await Promise.all([receive(), receive()])
    expect(ok(left)).toEqual(ok(right))
    expect((await records(harness)).filter(record => record.kind === 'fact-event')).toHaveLength(1)
    expect((await records(harness)).filter(record => record.kind === 'fact-batch')).toHaveLength(1)
  })
  it('keeps the original stream after competing branches attempt the same predecessor', async () => {
    const { harness, access, batch, receive } = await running()
    ok(await receive())
    const answers = await Promise.all([
      receive(next(batch, [], 'left')),
      receive(next(batch, [], 'right')),
    ])
    expect(answers.filter(answer => 'ok' in answer)).toHaveLength(1)
    expect(answers.filter(answer => 'failure' in answer)).toEqual([
      { failure: { kind: 'invalid-cursor', reason: 'non-contiguous-fact-batch' } },
    ])
    expect(
      ok(await harness.commands.loadRecovery(access)).streams[0]?.pendingAcknowledgements,
    ).toHaveLength(2)
  })
})

describe('closed fact shapes and complete original identities', () => {
  const terminals = [
    { kind: 'unavailable', reason: 'environment unavailable' },
    { kind: 'no-response', wait: ok(decodeToolWaitId('original-wait')), reason: 'no answer' },
    { kind: 'interrupted', cause: { kind: 'foreground-limit' } },
    {
      kind: 'interrupted',
      cause: { kind: 'control', operation: operationId('original-control'), withdrawn: false },
    },
    { kind: 'interrupted', cause: { kind: 'resume-rejected', exclusion: evidence('excluded') } },
  ] satisfies readonly ToolTerminal[]

  it.each(terminals)('preserves legal terminal $kind with its complete cause', async terminal => {
    const { harness, access, batch, receive } = await running()
    const fact = { ...finalFact(), terminal }
    ok(await receive({ ...batch, events: [{ event: 'final', fact }] }))
    const saved = ok(await harness.commands.loadRecovery(access))
    const settle = saved.tasks.find(task => task.kind === 'settle')
    if (settle?.kind !== 'settle') throw new Error('missing saved terminal')
    expect(ok(await harness.ledger.facts.read({ ...access, basis: settle.basis })).fact).toEqual(
      fact,
    )
    expect(saved.streams[0]?.pendingAcknowledgements).toHaveLength(1)
  })

  it.each([
    { kind: 'failed', cause: 'arguments' },
    { kind: 'failed', cause: 'arguments', diagnostic: 'failed', extra: true },
    { kind: 'failed', cause: 'invented', diagnostic: 'failed' },
    { kind: 'failed', cause: 'arguments', diagnostic: 7 },
    { kind: 'failed', cause: { kind: 'arguments' }, diagnostic: 'failed' },
    { kind: 'unavailable' },
    { kind: 'unavailable', reason: '' },
    { kind: 'unavailable', reason: 'failed', extra: true },
    { kind: 'no-response', wait: '', reason: 'failed' },
    { kind: 'no-response', wait: 'wait' },
    { kind: 'no-response', wait: 'wait', reason: '' },
    { kind: 'no-response', wait: 'wait', reason: 'failed', extra: true },
    { kind: 'interrupted', cause: { kind: 'foreground-limit' }, extra: true },
    { kind: 'interrupted', cause: { kind: 'foreground-limit', extra: true } },
    { kind: 'interrupted', cause: { kind: 'invented' } },
    { kind: 'interrupted', cause: { kind: 'control', operation: '', withdrawn: false } },
    { kind: 'interrupted', cause: { kind: 'control', operation: 'control', withdrawn: 'false' } },
    { kind: 'interrupted', cause: { kind: 'control', operation: 'control' } },
    {
      kind: 'interrupted',
      cause: { kind: 'resume-rejected', exclusion: { ...evidence('excluded'), record: '' } },
    },
    { kind: 'interrupted', cause: { kind: 'resume-rejected' } },
  ])('rejects malformed terminal %# atomically', async terminal => {
    const f = await running()
    await rejectsWholeBatch(f, {
      ...f.batch,
      events: [...f.batch.events, { event: 'bad-final', fact: { ...finalFact(), terminal } }],
    })
    ok(await f.receive())
  })

  it.each([
    'start-extra',
    'execution-extra',
    'operation',
    'executor',
    'instance',
    'generation',
  ] as const)('rejects malformed original start %s before custody', async field => {
    const f = await running()
    const start = structuredClone(f.batch.start)
    if (field === 'start-extra') Object.assign(start, { extra: true })
    if (field === 'execution-extra') Object.assign(start.execution, { extra: true })
    if (field === 'operation') Object.assign(start, { operation: '' })
    if (field === 'executor') Object.assign(start.executor, { revision: '' })
    if (field === 'instance') Object.assign(start.execution, { instance: '' })
    if (field === 'generation') Object.assign(start.execution, { generation: '' })
    await rejectsWholeBatch(f, { ...f.batch, start }, start)
    ok(await f.receive())
  })

  it.each(['executor', 'instance', 'generation'] as const)(
    'rejects a first batch whose internally consistent %s differs from the call start',
    async field => {
      const f = await running()
      const original = f.batch.start
      const start = {
        ...original,
        ...(field === 'executor' ? { executor: { ...original.executor, revision: 'other' } } : {}),
        execution: {
          ...original.execution,
          ...(field === 'generation' ? { generation: 'other' } : {}),
          ...(field === 'instance'
            ? { instance: ok(decodeToolInstanceId('another-instance')) }
            : {}),
        },
      }
      await rejectsWholeBatch(f, { ...f.batch, start }, start)
      ok(await f.receive())
    },
  )

  it.each(['record', 'revision', 'digest'] as const)(
    'rejects changed source %s on a fresh continuous batch',
    async field => {
      const f = await running()
      ok(await f.receive())
      const batch = next(f.batch, [
        { event: 'new', fact: { kind: 'process', blocks: [processBlock('hello world', '2')] } },
      ])
      await rejectsWholeBatch(f, { ...batch, source: { ...batch.source, [field]: 'changed' } })
      ok(await f.receive(batch))
    },
  )
})

async function rejectsWholeBatch(
  f: Awaited<ReturnType<typeof running>>,
  batch: unknown,
  start: unknown = f.batch.start,
) {
  const before = await records(f.harness)
  const recovery = ok(await f.harness.commands.loadRecovery(f.access))
  const commits = f.harness.memory.commits
  expect(
    await Reflect.apply(f.harness.commands.receiveFacts, null, [{ ...f.access, start, batch }]),
  ).toMatchObject({ failure: { kind: 'invalid' } })
  expect(f.harness.memory.commits).toBe(commits)
  expect(await records(f.harness)).toEqual(before)
  expect(ok(await f.harness.commands.loadRecovery(f.access))).toEqual(recovery)
}

describe('process validation and within-batch progression', () => {
  it.each([
    { mode: 'invented' },
    { state: 'invented' },
    { trim: { removed: '-1', reason: 'display' } },
    { trim: { removed: '1', reason: '' } },
    { trim: { removed: '1', reason: 'display', extra: true } },
    { trim: { removed: '1' } },
  ])('rejects malformed process fields %# without saving its valid sibling', async fields => {
    const f = await running()
    await rejectsWholeBatch(f, {
      ...f.batch,
      events: [
        ...f.batch.events,
        {
          event: 'bad',
          fact: { kind: 'process', blocks: [{ ...processBlock(), index: 'malformed', ...fields }] },
        },
      ],
    })
    ok(await f.receive())
  })

  it('appends thinking content and keeps the original and current complete values', async () => {
    const f = await running()
    const initial: ProcessBlock = {
      ...processBlock('thought'),
      content: { ...text('out', 'thought'), kind: 'thinking' },
    }
    const extended: ProcessBlock = {
      ...initial,
      sequence: '7',
      content: { ...text('out', 'thought continues'), kind: 'thinking' },
    }
    ok(
      await f.receive({
        ...f.batch,
        events: [{ event: 'thinking', fact: { kind: 'process', blocks: [initial] } }],
      }),
    )
    ok(
      await f.receive(
        next(f.batch, [{ event: 'thinking-next', fact: { kind: 'process', blocks: [extended] } }]),
      ),
    )
    const saved = await records(f.harness)
    expect(saved.filter(record => record.kind === 'process')).toMatchObject([
      { process: { block: extended } },
    ])
    for (const [event, block] of [
      ['thinking', initial],
      ['thinking-next', extended],
    ] as const) {
      const original = saved.find(
        record => record.kind === 'fact-event' && record.fact.event === event,
      )
      if (original?.kind !== 'fact-event') throw new Error('missing historical thinking')
      expect(
        ok(await f.harness.ledger.facts.read({ ...f.access, basis: original.fact.evidence })).fact,
      ).toEqual({ kind: 'process', blocks: [block] })
    }
  })

  it.each(['kind', 'id'] as const)(
    'rejects append content %s changes with valid visibility and prefix',
    async field => {
      const f = await running()
      ok(await f.receive())
      const block = processBlock('hello world', '1')
      const changed: ProcessBlock = {
        ...block,
        content:
          field === 'kind'
            ? {
                ...text('out', 'hello world'),
                kind: 'thinking',
                visibility: block.content.visibility,
              }
            : { ...text('another-id', 'hello world'), visibility: block.content.visibility },
      }
      await rejectsWholeBatch(
        f,
        next(f.batch, [{ event: 'changed', fact: { kind: 'process', blocks: [changed] } }]),
      )
      ok(
        await f.receive(
          next(f.batch, [{ event: 'valid', fact: { kind: 'process', blocks: [block] } }]),
        ),
      )
    },
  )

  it('advances multiple blocks inside one event and recalls its earlier sequence without rolling current back', async () => {
    const f = await running()
    const initial = processBlock()
    const extended = processBlock('hello world', '5')
    const events = [
      { event: 'multi', fact: { kind: 'process', blocks: [initial, extended, initial] } },
    ] satisfies FactBatch<Block>['events']
    ok(await f.receive({ ...f.batch, events }))
    const saved = await records(f.harness)
    expect(saved.filter(record => record.kind === 'process')).toMatchObject([
      { process: { block: extended } },
    ])
    const original = saved.find(record => record.kind === 'fact-event')
    if (original?.kind !== 'fact-event') throw new Error('missing multi-block fact')
    expect(
      ok(await f.harness.ledger.facts.read({ ...f.access, basis: original.fact.evidence })).fact,
    ).toEqual(events[0]?.fact)
  })

  it.each(['sequence-conflict', 'prefix', 'event-conflict'] as const)(
    'rejects %s within a fresh multi-block batch atomically',
    async fault => {
      const f = await running()
      const initial = processBlock()
      const invalid =
        fault === 'prefix' ? processBlock('unrelated', '1') : processBlock('changed', '0')
      const events =
        fault === 'event-conflict'
          ? [
              { event: 'same', fact: { kind: 'process', blocks: [initial] } },
              {
                event: 'same',
                fact: { kind: 'process', blocks: [{ ...initial, index: 'another' }] },
              },
            ]
          : [{ event: 'blocks', fact: { kind: 'process', blocks: [initial, invalid] } }]
      await rejectsWholeBatch(f, { ...f.batch, events })
      ok(await f.receive())
    },
  )
})
