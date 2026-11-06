import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { createCordisLogBridge } from '../src/cordis.ts'
import type { TelemetryRecord } from '../src/index.ts'
import { fieldOf, harness, isBootstrap, manualClock, nextTurn } from './support.ts'

type Bridged = {
  ctx: Context
  bridge: ReturnType<typeof createCordisLogBridge>
  direct: TelemetryRecord[]
}

function bridged(
  input: {
    bootstrapCapacity?: number
    write?: (record: TelemetryRecord) => void
    clock?: { now(): Date }
    maxTextLength?: number
  } = {},
): Bridged {
  const direct: TelemetryRecord[] = []
  const bridge = createCordisLogBridge({
    bootstrapCapacity: input.bootstrapCapacity ?? 8,
    write:
      input.write ??
      (record => {
        direct.push(record)
      }),
    clock: input.clock ?? manualClock(),
    maxTextLength: input.maxTextLength ?? 12,
  })
  const ctx = new Context()
  ctx.logger.exporter(bridge.exporter)
  return { ctx, bridge, direct }
}

const LOG_SHAPE = {
  kind: 'telemetry',
  signal: 'log',
  time: '2026-11-05T00:00:00.000Z',
  owner: 'cordis',
  name: 'omne.cordis.log',
  version: 1,
  scope: { kind: 'system' },
} as const

describe('the Cordis log bridge: bootstrap', () => {
  it('writes WARN and above directly, drops DEBUG, and keeps a bounded buffer', () => {
    const { ctx, bridge, direct } = bridged({ bootstrapCapacity: 2 })
    const logger = ctx.logger('row:server-entry')

    logger.error('first %s', 'failure')
    logger.info('second')
    logger.warn('third')
    logger.debug('fourth')

    expect(direct).toEqual([
      {
        ...LOG_SHAPE,
        level: 'error',
        component: 'row:server-entry',
        fields: { text: 'first failur' },
      },
      { ...LOG_SHAPE, level: 'info', component: 'row:server-entry', fields: { text: 'second' } },
      { ...LOG_SHAPE, level: 'warn', component: 'row:server-entry', fields: { text: 'third' } },
    ])
    expect(bridge.counts()).toEqual({
      bootstrapOverflow: 1,
      afterClose: 0,
      formatFailures: 0,
      writeFailures: 0,
    })
  })

  it('writes a fixed text for a message that does not format, and counts it', () => {
    const { ctx, bridge, direct } = bridged()
    const hostile = {
      toString() {
        throw new Error('no')
      },
    }

    ctx.logger('app').warn('%s', hostile)

    expect(fieldOf(direct[0], 'text')).toBe('<the log message did not format>')
    expect(bridge.counts().formatFailures).toBe(1)
  })

  it('does not throw into the logging caller when the write fails, and still buffers the message', async () => {
    const { ctx, bridge } = bridged({
      write: () => {
        throw new Error('stdout closed')
      },
    })
    const { runtime, written } = harness()

    expect(() => ctx.logger('app').error('lost')).not.toThrow()
    expect(bridge.counts().writeFailures).toBe(1)
    bridge.attach(runtime, { replayBootstrap: true })
    await nextTurn()
    expect(written.map(record => fieldOf(record, 'text'))).toEqual(['lost'])
  })
})

describe('the Cordis log bridge: ready', () => {
  it('hands messages to the runtime once attached, and does not write them directly', async () => {
    const { ctx, bridge, direct } = bridged()
    const { runtime, written } = harness()
    bridge.attach(runtime, { replayBootstrap: false })

    ctx.logger('app').warn('ready')
    ctx.logger('app').debug('hidden')
    await nextTurn()

    expect(direct).toEqual([])
    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({
      signal: 'log',
      level: 'warn',
      component: 'app',
      fields: { text: 'ready' },
      generation: 'g1',
    })
    expect((await runtime.close(1000)).admitted).toBe(1)
  })

  it('replays the bootstrap buffer marked bootstrap when asked', async () => {
    const { ctx, bridge, direct } = bridged()
    const { runtime, written } = harness()
    ctx.logger('app').warn('early one')
    ctx.logger('app').error('early two')

    bridge.attach(runtime, { replayBootstrap: true })
    await nextTurn()

    expect(direct).toHaveLength(2)
    expect(written.map(record => [fieldOf(record, 'text'), isBootstrap(record)])).toEqual([
      ['early one', true],
      ['early two', true],
    ])
  })

  it('does not replay when the runtime writes to the same outlet', async () => {
    const { ctx, bridge } = bridged()
    const { runtime, written } = harness()
    ctx.logger('app').warn('early')

    bridge.attach(runtime, { replayBootstrap: false })
    await nextTurn()

    expect(written).toEqual([])
  })
})

describe('the Cordis log bridge: after close', () => {
  it('writes directly again after detach and counts each message', async () => {
    const { ctx, bridge, direct } = bridged()
    const { runtime, written } = harness()
    bridge.attach(runtime, { replayBootstrap: false })
    await runtime.close(1000)

    bridge.detach()
    ctx.logger('app').warn('late')
    ctx.logger('app').debug('late debug')

    expect(written).toEqual([])
    expect(direct).toEqual([
      { ...LOG_SHAPE, level: 'warn', component: 'app', fields: { text: 'late' } },
    ])
    expect(bridge.counts().afterClose).toBe(1)
  })
})

describe('the Cordis log bridge: options and unreadable messages', () => {
  it.each([[-1], [1.5], [Number.NaN]])('refuses a bootstrapCapacity of %s', capacity => {
    expect(() =>
      createCordisLogBridge({
        bootstrapCapacity: capacity,
        write: () => {},
        clock: manualClock(),
        maxTextLength: 12,
      }),
    ).toThrow('bootstrapCapacity must be a non-negative integer')
  })

  it.each([[0], [1.5]])('refuses a maxTextLength of %s', length => {
    expect(() =>
      createCordisLogBridge({
        bootstrapCapacity: 8,
        write: () => {},
        clock: manualClock(),
        maxTextLength: length,
      }),
    ).toThrow('maxTextLength must be a positive integer')
  })

  it('takes a bootstrap capacity of 0 and a text length of 1', () => {
    const { ctx, bridge, direct } = bridged({ bootstrapCapacity: 0, maxTextLength: 1 })
    ctx.logger('app').warn('first')
    expect(direct.map(record => fieldOf(record, 'text'))).toEqual(['f'])
    expect(bridge.counts().bootstrapOverflow).toBe(1)
  })

  it('counts a message it cannot read at all, and the logging caller goes on', () => {
    const { ctx, bridge, direct } = bridged({
      clock: {
        now() {
          throw new Error('no clock')
        },
      },
    })
    expect(() => ctx.logger('app').warn('lost')).not.toThrow()
    expect(direct).toEqual([])
    expect(bridge.counts()).toMatchObject({ writeFailures: 1, formatFailures: 0 })
  })
})
