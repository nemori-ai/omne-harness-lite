/** @module-tag slow */
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import {
  createWindowsRetainedTerminalFactory,
  createWindowsTerminalCapacity,
} from '../../src/windows-execution/terminal.ts'
import { outputOf, psString, terminalFixture } from './terminal-fixture.ts'

it('delivers a late in-process writer through a later observed window without treating an empty script as a drain barrier', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-window-')))
  const f = terminalFixture(root, { maxBufferedBytes: 128, maxChunkBytes: 32 })
  const backend = createWindowsRetainedTerminalFactory(f.input)({
    request: f.request,
    ledger: f.input.ledger,
    scope: f.input.scope,
    closed: () => false,
  })
  if (backend === undefined) throw new Error('terminal reservation')
  context.onTestFinished(async () => {
    await backend.stop()
  })
  const release = join(root, 'release')
  const written = join(root, 'written')
  const marker = 'LATE-WRITER-TAIL'.repeat(128)
  const code = `using System;using System.IO;using System.Threading;public static class LateOutput { public static void Start(string release,string written,string text) { Thread thread=new Thread(delegate() { while(!File.Exists(release))Thread.Sleep(10);Console.Write(text);File.WriteAllText(written,"yes"); }); thread.IsBackground=true;thread.Start(); } }`
  try {
    expect((await backend.start()).kind).toBe('done')
    const request = { ...f.call, terminal: backend.terminal }
    const first = await backend.execute({
      ...request,
      script: `Add-Type -TypeDefinition ${psString(code)}; [LateOutput]::Start(${psString(release)},${psString(written)},${psString(marker)})`,
    })
    expect(first.kind).toBe('done')
    if (first.kind !== 'done') return
    const firstResult = await first.value.result
    expect(firstResult).toMatchObject({ kind: 'completed', exit: { kind: 'unknown' } })
    const firstOutput = await outputOf(first.value)
    expect(firstOutput.bytes.toString()).not.toContain('LATE-WRITER-TAIL')
    const observedBefore = backend.observation().observedBytes
    await writeFile(release, '')
    await expect.poll(async () => readFile(written, 'utf8'), { timeout: 10_000 }).toBe('yes')
    await expect
      .poll(() => backend.observation().observedBytes, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(observedBefore + marker.length)
    const second = await backend.execute({ ...request, requestId: randomUUID(), script: '' })
    expect(second.kind).toBe('done')
    if (second.kind !== 'done') return
    const secondOutput = await outputOf(second.value)
    expect(secondOutput.bytes.toString()).toContain('LATE-WRITER-TAIL')
    const secondResult = await second.value.result
    expect(secondResult).toMatchObject({ kind: 'completed', exit: { kind: 'unknown' } })
    expect(secondOutput.bytes.length).toBeLessThanOrEqual(128)
    if (secondResult.output.mode !== 'terminal') throw new Error('terminal summary')
    expect(secondResult.output.terminal.discardedBytes).toBe(
      secondResult.output.terminal.observedBytes - secondOutput.bytes.length,
    )
    expect(secondResult.output.terminal.discardedBytes).toBeGreaterThan(0)
    expect(await first.value.result).toEqual(firstResult)
    expect(backend.information().state).toBe('idle')
    const finalRelease = join(root, 'final-release')
    const finalWritten = join(root, 'final-written')
    const last = await backend.execute({
      ...request,
      requestId: randomUUID(),
      script: `[LateOutput]::Start(${psString(finalRelease)},${psString(finalWritten)},${psString(marker)})`,
    })
    expect(last.kind).toBe('done')
    if (last.kind !== 'done') return
    await last.value.result
    await outputOf(last.value)
    const beforeClose = backend.observation().observedBytes
    await writeFile(finalRelease, '')
    await expect.poll(async () => readFile(finalWritten, 'utf8'), { timeout: 10_000 }).toBe('yes')
    await expect
      .poll(() => backend.observation().observedBytes, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(beforeClose + marker.length)
    expect(await backend.stop()).toBe('confirmed')
    const closure = backend.closure()
    expect(closure?.releasedUndeliveredBytes).toBeGreaterThan(0)
    expect(closure?.releasedUndeliveredBytes).toBeLessThanOrEqual(128)
    expect(closure?.discardedBytes).toBeGreaterThan(0)
  } finally {
    await backend.stop()
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)

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
