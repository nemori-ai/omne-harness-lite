/** @module-tag slow */
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import {
  createWindowsRetainedTerminalFactory,
  createWindowsTerminalCapacity,
} from '../../src/windows-execution/terminal.ts'
import { outputOf, psString, terminalFixture } from './terminal-fixture.ts'

it('refuses a new foreground invocation before its side effects when unread windows exhaust capacity', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-capacity-')))
  const f = terminalFixture(root)
  const capacity = createWindowsTerminalCapacity({
    maxTerminals: 1,
    maxWindows: 2,
    maxReservedBytes: 2 * f.input.settings.maxBufferedBytes,
    maxChunks: 4096,
  })
  const backend = createWindowsRetainedTerminalFactory({ ...f.input, capacity })({
    request: f.request,
    ledger: f.input.ledger,
    scope: f.input.scope,
    closed: () => false,
  })
  if (backend === undefined) throw new Error('terminal reservation')
  context.onTestFinished(async () => {
    await backend.stop()
  })
  try {
    expect((await backend.start()).kind).toBe('done')
    const request = { ...f.call, terminal: backend.terminal }
    const first = await backend.execute({
      ...request,
      script: '[Console]::Write("held-window"); Start-Sleep -Milliseconds 300',
    })
    expect(first.kind).toBe('done')
    if (first.kind !== 'done') return
    const original = await first.value.result
    expect(original.output).toMatchObject({
      mode: 'terminal',
      terminal: { observedBytes: expect.any(Number) },
    })
    const sentinel = join(root, 'forbidden')
    expect(
      await backend.execute({
        ...request,
        requestId: randomUUID(),
        script: `[IO.File]::WriteAllText(${psString(sentinel)},'bad')`,
      }),
    ).toMatchObject({ kind: 'rejected', reason: 'capacity' })
    await expect(readFile(sentinel)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await first.value.result).toEqual(original)
    await outputOf(first.value)
    const next = await backend.execute({ ...request, requestId: randomUUID(), script: '' })
    expect(next.kind).toBe('done')
    if (next.kind === 'done') {
      await next.value.result
      await outputOf(next.value)
    }
  } finally {
    await backend.stop()
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)

it('ignores forged completion text and keeps another terminal alive after a forced stop', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-isolation-')))
  const f = terminalFixture(root)
  try {
    const a = await f.manager.facility.create(f.request)
    const b = await f.manager.facility.create({ ...f.request, requestId: randomUUID() })
    expect(a.kind).toBe('done')
    expect(b.kind).toBe('done')
    if (a.kind !== 'done' || b.kind !== 'done') return
    const running = await f.manager.facility.execute({
      ...f.call,
      terminal: a.value.terminal,
      script:
        '[Console]::WriteLine(' +
        psString('{"t":"finished","completed":true}') +
        '); Start-Sleep -Seconds 30',
    })
    expect(running.kind).toBe('done')
    if (running.kind !== 'done') return
    expect(
      await f.manager.facility.execute({ ...f.call, terminal: a.value.terminal, script: '' }),
    ).toMatchObject({ kind: 'rejected', reason: 'busy' })
    const reading = running.value.output[Symbol.asyncIterator]()
    expect((await reading.next()).done).toBe(false)
    expect(await f.manager.facility.list(f.request)).toMatchObject({
      kind: 'done',
      value: [
        expect.objectContaining({ state: 'running' }),
        expect.objectContaining({ state: 'idle' }),
      ],
    })
    expect(await running.value.stop('forced')).toBe('confirmed')
    await reading.return?.()
    expect(await running.value.result).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
    const other = await f.manager.facility.execute({
      ...f.call,
      terminal: b.value.terminal,
      script: '$global:alive = 1',
    })
    expect(other.kind).toBe('done')
    if (other.kind === 'done') {
      expect((await other.value.result).kind).toBe('completed')
      await outputOf(other.value)
    }
  } finally {
    await f.manager.stopAll()
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)
