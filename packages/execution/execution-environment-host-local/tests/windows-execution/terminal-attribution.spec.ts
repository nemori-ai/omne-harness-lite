// The manager's attribution of PTY bytes by segment sentinels, driven by a stand-in broker that
// answers the start protocol and lets each case deliver data and control frames in its own order.
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { CommandOutcome, ProcessHandle } from '@omne-harness/execution-environment-contract'
import { sentinel } from '../../src/terminal-sentinels.ts'
import type { TerminalFrame } from '../../src/windows-execution/terminal-bridge.ts'
import { createWindowsHostTerminals } from '../../src/windows-execution/terminal.ts'
import { outputOf, terminalFixture } from './terminal-fixture.ts'

type Broker = { emit(frame: TerminalFrame): void; close(): void; sent: unknown[] }
const brokers: Broker[] = []

vi.mock('../../src/windows-execution/compile.ts', () => ({
  windowsTerminalExecutable: async () => 'stand-in.exe',
  windowsBridgeExecutable: async () => 'stand-in.exe',
}))
vi.mock('../../src/windows-execution/terminal-bridge.ts', async original => ({
  ...(await original<typeof import('../../src/windows-execution/terminal-bridge.ts')>()),
  startTerminalBridge(input: { onFrame(frame: TerminalFrame): void; onClosed(): void }) {
    let resolveClosed: () => void = () => undefined
    const closed = new Promise<void>(resolve => {
      resolveClosed = resolve
    })
    let ended = false
    const broker: Broker = {
      sent: [],
      emit: frame => input.onFrame(frame),
      close() {
        if (ended) return
        ended = true
        resolveClosed()
        input.onClosed()
      },
    }
    brokers.push(broker)
    queueMicrotask(() => broker.emit({ t: 'ready' }))
    return {
      closed,
      send(message: unknown) {
        broker.sent.push(message)
        if (message === 'go') queueMicrotask(() => broker.emit({ t: 'opened', cwd: 'C:\\work' }))
        else if (message === 'stop')
          queueMicrotask(() => broker.emit({ t: 'stopped', status: 'confirmed' }))
        else if (typeof message === 'object' && message !== null && 'id' in message)
          queueMicrotask(() => broker.emit({ t: 'started', id: String(message.id) }))
        return true
      },
      disconnect: () => queueMicrotask(() => broker.close()),
    }
  },
}))

const roots: string[] = []
const managers: ReturnType<typeof createWindowsHostTerminals>[] = []
afterEach(async () => {
  await Promise.all(managers.splice(0).map(manager => manager.stopAll()))
  brokers.length = 0
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

/** A terminal on the stand-in broker, and the frames that deliver one invocation's bytes. */
async function terminal(betweenSegmentBytes?: number) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-attribution-')))
  roots.push(root)
  await writeFile(join(root, 'conpty.dll'), '')
  await writeFile(join(root, 'OpenConsole.exe'), '')
  const f = terminalFixture(root, betweenSegmentBytes === undefined ? {} : { betweenSegmentBytes })
  const manager = createWindowsHostTerminals({ ...f.input, conpty: join(root, 'conpty.dll') })
  managers.push(manager)
  const created = await manager.facility.create(f.request)
  if (created.kind !== 'done') throw new Error(`create: ${JSON.stringify(created)}`)
  const broker = brokers.at(-1)
  if (broker === undefined) throw new Error('no broker')
  const information = async () => {
    const listed = await manager.facility.list(f.call)
    if (listed.kind !== 'done') throw new Error('list')
    return listed.value[0]
  }
  const execute = async () => {
    const handle = await manager.facility.execute({
      ...f.call,
      terminal: created.value.terminal,
      script: 'x',
    })
    if (handle.kind !== 'done') throw new Error(`execute: ${JSON.stringify(handle)}`)
    const message = broker.sent.at(-1)
    if (typeof message !== 'object' || message === null || !('nonce' in message))
      throw new Error('no execute message')
    const { id, nonce } = message as { id: string; nonce: string }
    let settled: CommandOutcome | undefined
    void handle.value.result.then(result => {
      settled = result
    })
    return {
      handle: handle.value,
      id,
      nonce,
      data: (...parts: (string | Uint8Array)[]) =>
        broker.emit({
          t: 'data',
          b: Buffer.concat(parts.map(part => Buffer.from(part))).toString('base64'),
        }),
      finished: (code = 0, more: Partial<{ ended: boolean }> = {}) =>
        broker.emit({
          t: 'finished',
          v: 3,
          id,
          cwd: 'C:\\work',
          restored: true,
          ended: more.ended ?? false,
          completed: true,
          elapsedMs: 1,
          code,
        }),
      settled: () => settled,
    }
  }
  return { manager, broker, execute, information }
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const text = async (handle: ProcessHandle) => (await outputOf(handle)).bytes.toString('utf8')

it('gives bytes before the begin sentinel to the result as between and answers after both the finished frame and the end sentinel', async context => {
  if (process.platform !== 'win32') return context.skip()
  const t = await terminal()
  t.broker.emit({ t: 'data', b: Buffer.from('start-up').toString('base64') })
  const leg = await t.execute()
  const begin = Buffer.from(sentinel('begin', leg.nonce))
  // The begin sentinel is cut across two reads; the byte before it is still between segments.
  leg.data('idle ', begin.subarray(0, 5))
  leg.data(begin.subarray(5), 'own bytes ')
  leg.finished(3)
  await tick()
  expect(leg.settled()).toBeUndefined()
  expect((await t.information())?.state).toBe('running')
  leg.data('late own bytes', sentinel('end', leg.nonce), 'after')
  expect(await leg.handle.result).toMatchObject({
    kind: 'completed',
    exit: { kind: 'code', code: 3 },
    output: {
      mode: 'terminal',
      terminal: { observedBytes: 24, discardedBytes: 0 },
      between: {
        data: new Uint8Array(Buffer.from('start-upidle ')),
        count: { observedBytes: 13, discardedBytes: 0 },
      },
    },
  })
  expect(await text(leg.handle)).toBe('own bytes late own bytes')
  expect((await t.information())?.state).toBe('idle')
  const next = await t.execute()
  next.data(sentinel('begin', next.nonce), sentinel('end', next.nonce))
  next.finished()
  expect(await next.handle.result).toMatchObject({
    output: { between: { data: new Uint8Array(Buffer.from('after')) } },
  })
})

it('answers on the finished frame when the end sentinel came first', async context => {
  if (process.platform !== 'win32') return context.skip()
  const t = await terminal()
  const leg = await t.execute()
  leg.data(sentinel('begin', leg.nonce), 'body', sentinel('end', leg.nonce))
  await tick()
  expect(leg.settled()).toBeUndefined()
  leg.finished()
  expect(await leg.handle.result).toMatchObject({ kind: 'completed' })
  expect(await text(leg.handle)).toBe('body')
})

it('keeps at most betweenSegmentBytes between segments and counts the rest as discarded', async context => {
  if (process.platform !== 'win32') return context.skip()
  const t = await terminal(4)
  t.broker.emit({ t: 'data', b: Buffer.from('abcdefgh').toString('base64') })
  const leg = await t.execute()
  leg.data('ij', sentinel('begin', leg.nonce), sentinel('end', leg.nonce))
  leg.finished()
  expect(await leg.handle.result).toMatchObject({
    output: {
      between: {
        data: new Uint8Array(Buffer.from('abcd')),
        count: { observedBytes: 10, discardedBytes: 6 },
      },
    },
  })
})

it('treats a sentinel with another nonce as the bytes of the segment', async context => {
  if (process.platform !== 'win32') return context.skip()
  const t = await terminal()
  const leg = await t.execute()
  const forged = sentinel('end', '0'.repeat(32))
  leg.data(sentinel('begin', leg.nonce), forged, sentinel('end', leg.nonce))
  leg.finished()
  expect(await leg.handle.result).toMatchObject({ kind: 'completed' })
  expect((await outputOf(leg.handle)).bytes).toEqual(Buffer.from(forged))
})

it('still completes an ending invocation whose end sentinel arrives after the shell control ended', async context => {
  if (process.platform !== 'win32') return context.skip()
  const t = await terminal()
  const leg = await t.execute()
  leg.data(sentinel('begin', leg.nonce), 'bye')
  leg.finished(7, { ended: true })
  t.broker.emit({ t: 'controlLost' })
  t.broker.emit({ t: 'stopped', status: 'confirmed' })
  await tick()
  expect(leg.settled()).toBeUndefined()
  leg.data(sentinel('end', leg.nonce))
  expect(await leg.handle.result).toMatchObject({
    kind: 'completed',
    exit: { kind: 'code', code: 7 },
  })
  expect((await t.information())?.state).toBe('invalid')
})

it('fails an invocation whose end sentinel never came before the broker output ended', async context => {
  if (process.platform !== 'win32') return context.skip()
  const t = await terminal()
  const leg = await t.execute()
  leg.data(sentinel('begin', leg.nonce), 'partial')
  leg.finished(0, { ended: true })
  t.broker.emit({ t: 'controlLost' })
  await tick()
  expect(leg.settled()).toBeUndefined()
  t.broker.close()
  expect(await leg.handle.result).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
  expect(await text(leg.handle)).toBe('partial')
})

it('fails the invocation and invalidates the terminal when the sentinels come in an impossible order', async context => {
  if (process.platform !== 'win32') return context.skip()
  for (const order of ['end first', 'begin twice', 'begin after end'] as const) {
    const t = await terminal()
    const leg = await t.execute()
    const begin = sentinel('begin', leg.nonce)
    const end = sentinel('end', leg.nonce)
    if (order === 'end first') leg.data(end)
    else if (order === 'begin twice') leg.data(begin, 'x', begin)
    else leg.data(begin, end, begin)
    expect({ order, result: await leg.handle.result }).toMatchObject({
      order,
      result: { kind: 'failed', reason: 'effectUnknown' },
    })
    expect((await t.information())?.state).toBe('invalid')
  }
})
