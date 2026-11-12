// The settle step's contract tests (RFC-0015 §5 判断次序第 10 到 14 步). Names in Chinese are those
// of RFC-0015 §15「精化对照」.
import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import { createAccessRegistry } from '../src/registry/registry.ts'
import { settleCall, type SettledAnswer } from '../src/settle/settle.ts'
import { manualClock } from './support/manual-clock.ts'
import { NOTES, notesProtocol, type NotesProtocol } from './support/test-contribution.ts'

const limits = {
  maxBytes: 4096,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 16,
  maxStringLength: 256,
  maxNumberLength: 16,
}
const EMPTY: JsonValue = { kind: 'object', entries: [] }

type Handlers = AccessContribution<NotesProtocol>['operations']

/** Mounts a contribution with the given handlers and enters `name`; records the steps in order. */
function setup(name: 'read-note' | 'save-note', handlers: Partial<Handlers> = {}) {
  const registry = createAccessRegistry()
  const steps: string[] = []
  let handlerStarted = false
  const contribution: AccessContribution<NotesProtocol> = {
    protocol: notesProtocol(),
    operations: {
      'read-note':
        handlers['read-note'] ??
        (async () => {
          handlerStarted = true
          return { outcome: 'not-found', body: {} }
        }),
      'save-note':
        handlers['save-note'] ??
        (async () => {
          handlerStarted = true
          return { outcome: 'succeeded', body: {} }
        }),
    },
    observations: { 'watch-note': async () => ({ outcome: 'basis-unavailable' }) },
  }
  const takeDown = registry.mount(contribution)
  const entered = registry.enter(NOTES, name)
  if (entered === undefined) throw new Error('not mounted')
  const tracked = {
    ...entered,
    leave: () => {
      steps.push('leave')
      entered.leave()
    },
  }
  const clock = manualClock()
  const body = name === 'read-note' ? { noteId: 'n-1' } : { noteId: 'n-1', title: 'Plan' }
  const settle = (graceMs = 1000, reportAccess?: () => void): Promise<SettledAnswer> =>
    settleCall({
      entered: tracked,
      principal: undefined,
      messageId: 'm-1',
      body,
      limits,
      config: { graceMs },
      clock,
      respond: answer => {
        steps.push(`respond ${answer.outcome}`)
      },
      ...(reportAccess === undefined ? {} : { reportAccess }),
    })
  return { takeDown, settle, steps, clock, started: () => handlerStarted }
}

describe('settle', () => {
  it('处理函数还没开始就收到中止，答 basis-unavailable', async () => {
    const call = setup('save-note')
    void call.takeDown()
    expect(await call.settle()).toEqual({ outcome: 'basis-unavailable', body: EMPTY })
    expect(call.started()).toBe(false)
    expect(call.steps).toEqual(['respond basis-unavailable', 'leave'])
  })
})

describe('a handler that fails after the take-down', () => {
  it('提交类操作的处理函数开始之后撤下并失败，答 unknown', async () => {
    let takeDown!: () => Promise<void>
    const call = setup('save-note', {
      'save-note': async call => {
        void takeDown()
        if (call.signal.aborted) throw new Error('aborted after the write began')
        return { outcome: 'succeeded', body: {} }
      },
    })
    takeDown = call.takeDown
    expect(await call.settle()).toEqual({ outcome: 'unknown', body: EMPTY })
    expect(call.steps).toEqual(['respond unknown', 'leave'])
  })

  it('answers basis-unavailable for a read operation that fails after the take-down', async () => {
    let takeDown!: () => Promise<void>
    const call = setup('read-note', {
      'read-note': async call => {
        void takeDown()
        if (call.signal.aborted) throw new Error('aborted')
        return { outcome: 'not-found', body: {} }
      },
    })
    takeDown = call.takeDown
    expect(await call.settle()).toEqual({ outcome: 'basis-unavailable', body: EMPTY })
  })
})

describe('grace', () => {
  /** A handler that ignores the abort and returns only when the test says so. */
  function ignoring() {
    let release!: () => void
    const released = new Promise<void>(resolve => {
      release = resolve
    })
    const handler = async () => {
      await released
      return { outcome: 'succeeded' as const, body: {} }
    }
    return { handler, release }
  }
  const flush = () => new Promise<void>(resolve => setImmediate(resolve))

  it('处理函数不理会中止，过了宽限调用仍得到答复，撤下完成', async () => {
    const stuck = ignoring()
    const call = setup('save-note', { 'save-note': stuck.handler })
    let answered: SettledAnswer | undefined
    void call.settle(500).then(answer => {
      answered = answer
    })
    let done = false
    void call.takeDown().then(() => {
      done = true
    })
    call.clock.advance(499)
    await flush()
    expect(answered).toBeUndefined()
    expect(done).toBe(false)
    call.clock.advance(1)
    // No await on the answer itself: without the grace it would never come.
    await flush()
    expect(answered).toEqual({ outcome: 'unknown', body: EMPTY })
    expect(done).toBe(true)
    expect(call.steps).toEqual(['respond unknown', 'leave'])
    stuck.release()
    await flush()
    expect(call.steps).toEqual(['respond unknown', 'leave'])
  })

  it('waits as long as the configuration says', async () => {
    const stuck = ignoring()
    const call = setup('read-note', {
      'read-note': async () => {
        await stuck.handler()
        return { outcome: 'not-found', body: {} }
      },
    })
    let answered: SettledAnswer | undefined
    void call.settle(2000).then(answer => {
      answered = answer
    })
    void call.takeDown()
    call.clock.advance(1999)
    await flush()
    expect(answered).toBeUndefined()
    call.clock.advance(1)
    await flush()
    expect(answered).toEqual({ outcome: 'basis-unavailable', body: EMPTY })
    stuck.release()
  })

  it('writes the answer of a handler that returns within the grace', async () => {
    const stuck = ignoring()
    const call = setup('save-note', { 'save-note': stuck.handler })
    const settled = call.settle(500)
    void call.takeDown()
    call.clock.advance(100)
    stuck.release()
    expect(await settled).toEqual({ outcome: 'succeeded', body: EMPTY })
    expect(call.clock.pending()).toBe(0)
  })
})

describe('answers by the contract', () => {
  it('writes an answer of the result set with its codec', async () => {
    const call = setup('read-note', {
      'read-note': async (_call, body) => ({
        outcome: 'succeeded',
        body: { noteId: body.noteId, title: 'Plan' },
      }),
    })
    expect(await call.settle()).toEqual({
      outcome: 'succeeded',
      body: {
        kind: 'object',
        entries: [
          { key: 'noteId', value: { kind: 'string', value: 'n-1' } },
          { key: 'title', value: { kind: 'string', value: 'Plan' } },
        ],
      },
    })
    expect(call.steps).toEqual(['respond succeeded', 'leave'])
  })

  it('writes a fixed outcome the handler answers with an empty body', async () => {
    const call = setup('read-note', { 'read-note': async () => ({ outcome: 'denied' }) })
    expect(await call.settle()).toEqual({ outcome: 'denied', body: EMPTY })
  })

  it('stops listening for the abort once the call is answered', async () => {
    const call = setup('read-note')
    await call.settle()
    void call.takeDown()
    expect(call.clock.pending()).toBe(0)
  })

  it('treats an outcome outside the result set as a failure', async () => {
    const save = setup('save-note', {
      'save-note': async () => ({ outcome: 'not-found' }) as never,
    })
    expect(await save.settle()).toEqual({ outcome: 'unknown', body: EMPTY })
    const read = setup('read-note', { 'read-note': async () => 'not an answer' as never })
    expect(await read.settle()).toEqual({ outcome: 'basis-unavailable', body: EMPTY })
  })

  it('treats a body its codec cannot write as a failure', async () => {
    const call = setup('read-note', {
      'read-note': async () => ({ outcome: 'succeeded', body: { noteId: '', title: 'Plan' } }),
    })
    expect(await call.settle()).toEqual({ outcome: 'basis-unavailable', body: EMPTY })
  })

  it('answers a handler that throws without an abort by the effect rule', async () => {
    const save = setup('save-note', {
      'save-note': async () => {
        throw new Error('storage failed')
      },
    })
    expect(await save.settle()).toEqual({ outcome: 'unknown', body: EMPTY })
    const read = setup('read-note', {
      'read-note': () => {
        throw new Error('thrown before the promise')
      },
    })
    expect(await read.settle()).toEqual({ outcome: 'basis-unavailable', body: EMPTY })
  })

  it('leaves even when writing the answer fails', async () => {
    const call = setup('read-note')
    const steps: string[] = []
    const registry = createAccessRegistry()
    const takeDown = registry.mount({
      protocol: notesProtocol(),
      operations: {
        'read-note': async () => ({ outcome: 'not-found', body: {} }),
        'save-note': async () => ({ outcome: 'succeeded', body: {} }),
      },
      observations: { 'watch-note': async () => ({ outcome: 'basis-unavailable' }) },
    })
    const entered = registry.enter(NOTES, 'read-note')
    if (entered === undefined) throw new Error('not mounted')
    const settled = settleCall({
      entered,
      principal: undefined,
      messageId: 'm-1',
      body: { noteId: 'n-1' },
      limits,
      config: { graceMs: 1000 },
      clock: call.clock,
      respond: () => {
        steps.push('respond')
        throw new Error('connection closed')
      },
    })
    await expect(settled).rejects.toThrow('connection closed')
    await expect(takeDown()).resolves.toBeUndefined()
    expect(steps).toEqual(['respond'])
  })

  it('refuses an observation, which the hub settles', async () => {
    const registry = createAccessRegistry()
    registry.mount({
      protocol: notesProtocol(),
      operations: {
        'read-note': async () => ({ outcome: 'not-found', body: {} }),
        'save-note': async () => ({ outcome: 'succeeded', body: {} }),
      },
      observations: { 'watch-note': async () => ({ outcome: 'basis-unavailable' }) },
    })
    const entered = registry.enter(NOTES, 'watch-note')
    if (entered === undefined) throw new Error('not mounted')
    await expect(
      settleCall({
        entered,
        principal: undefined,
        messageId: 'm-1',
        body: {},
        limits,
        config: { graceMs: 1000 },
        clock: manualClock(),
        respond: () => undefined,
      }),
    ).rejects.toThrow(new TypeError('settleCall settles operations only'))
  })
})

describe('business access', () => {
  it('reports a succeeded answer of an operation marked countsAsAccess, after leave', async () => {
    const call = setup('save-note')
    await call.settle(1000, () => {
      call.steps.push('report')
    })
    expect(call.steps).toEqual(['respond succeeded', 'leave', 'report'])
  })

  it('does not report an operation without the mark, or an answer that is not succeeded', async () => {
    const reports: string[] = []
    const read = setup('read-note', {
      'read-note': async () => ({ outcome: 'succeeded', body: { noteId: 'n-1', title: 'Plan' } }),
    })
    await read.settle(1000, () => reports.push('read'))
    const save = setup('save-note', {
      'save-note': async () => ({ outcome: 'conflict', body: {} }),
    })
    await save.settle(1000, () => reports.push('save'))
    expect(reports).toEqual([])
  })
})

describe('systemClock', () => {
  it('runs after the delay and can be cancelled', async () => {
    const { systemClock } = await import('../src/settle/settle.ts')
    const runs: string[] = []
    const cancel = systemClock.schedule(0, () => runs.push('cancelled'))
    cancel()
    await new Promise<void>(resolve => systemClock.schedule(0, () => resolve()))
    expect(runs).toEqual([])
  })
})
