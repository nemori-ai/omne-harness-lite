/** @module-tag slow */
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { commandFixture } from './fixture.ts'

it('stops one complete Job tree while another Job keeps writing', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-winexec-isolation-')))
  const { manager, request, plans, observeStops } = commandFixture(root)
  const markerA = join(root, 'a')
  const markerB = join(root, 'b')
  const script = (path: string) =>
    `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(`setInterval(()=>require('fs').appendFileSync(${JSON.stringify(path)},'x'),10)`)}],{stdio:'ignore',windowsHide:true,detached:true});setInterval(()=>{},1000)`
  try {
    const a = await manager.facility.start({ ...request, args: ['-e', script(markerA)] })
    const b = await manager.facility.start({ ...request, args: ['-e', script(markerB)] })
    expect(a.kind).toBe('done')
    expect(b.kind).toBe('done')
    if (a.kind !== 'done' || b.kind !== 'done') return
    await expect
      .poll(async () => (await readFile(markerA).catch(() => Buffer.alloc(0))).length, {
        timeout: 5000,
      })
      .toBeGreaterThan(0)
    await expect
      .poll(async () => (await readFile(markerB).catch(() => Buffer.alloc(0))).length, {
        timeout: 5000,
      })
      .toBeGreaterThan(0)
    let changedBeforeLedgerRecording = false
    observeStops(async (key, status) => {
      if (key === plans[0]?.key && status === 'confirmed') {
        const before = (await readFile(markerA)).length
        const progress = (await readFile(markerB)).length
        await expect
          .poll(async () => (await readFile(markerB)).length)
          .toBeGreaterThan(progress + 4)
        changedBeforeLedgerRecording = (await readFile(markerA)).length !== before
      }
      return 'recorded'
    })
    expect(await a.value.stop('forced')).toBe('confirmed')
    expect(changedBeforeLedgerRecording).toBe(false)
    const stopped = (await readFile(markerA)).length
    const running = (await readFile(markerB)).length
    await expect.poll(async () => (await readFile(markerB)).length).toBeGreaterThan(running)
    expect((await readFile(markerA)).length).toBe(stopped)
    expect(await b.value.stop('forced')).toBe('confirmed')
  } finally {
    await manager.stopAll()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)

it('retains stop responsibility when the ledger cannot record the native confirmation', async context => {
  if (process.platform !== 'win32') return context.skip()
  const fixture = commandFixture(process.cwd())
  fixture.recordStops(false)
  try {
    const result = await fixture.manager.facility.start({
      ...fixture.request,
      args: ['-e', 'setInterval(()=>{},1000)'],
    })
    expect(result.kind).toBe('done')
    if (result.kind !== 'done') return
    expect(await result.value.stop('graceful')).toBe('unconfirmed')
    expect(fixture.manager.unconfirmed()).toHaveLength(1)
    expect(await result.value.stop('forced')).toBe('confirmed')
    expect(fixture.manager.unconfirmed()).toEqual(fixture.plans)
    fixture.recordStops(true)
    expect(await result.value.stop('forced')).toBe('confirmed')
    expect(fixture.manager.unconfirmed()).toEqual([])
  } finally {
    fixture.recordStops(true)
    await fixture.manager.stopAll()
  }
}, 30_000)

it('bounds queued bytes, counts discarded bytes and allows only one reader', async context => {
  if (process.platform !== 'win32') return context.skip()
  const { manager, request } = commandFixture(process.cwd(), {
    maxBufferedBytes: 8,
    maxChunkBytes: 4,
  })
  try {
    const result = await manager.facility.start({
      ...request,
      args: ['-e', 'process.stdout.write("0123456789abcdefghijklmnopqrstuv")'],
    })
    expect(result.kind).toBe('done')
    if (result.kind !== 'done') return
    const outcome = await result.value.result
    expect(outcome.output).toEqual({
      mode: 'separate',
      stdout: { observedBytes: 32, discardedBytes: 24 },
      stderr: { observedBytes: 0, discardedBytes: 0 },
    })
    const chunks = []
    for await (const chunk of result.value.output) chunks.push(chunk)
    expect(chunks.map(chunk => chunk.observedOffset)).toEqual([0, 4])
    expect(Buffer.concat(chunks.map(chunk => Buffer.from(chunk.data))).toString()).toBe('01234567')
    await expect(result.value.output[Symbol.asyncIterator]().next()).rejects.toThrow('one reader')
  } finally {
    await manager.stopAll()
  }
}, 30_000)

it('reports an unavailable executable without retaining an empty Job', async context => {
  if (process.platform !== 'win32') return context.skip()
  const { manager, request } = commandFixture(process.cwd())
  try {
    expect(
      await manager.facility.start({
        ...request,
        executable: join(process.cwd(), 'missing-windows-executable.exe'),
      }),
    ).toMatchObject({ kind: 'rejected', reason: 'unavailable' })
    expect(manager.unconfirmed()).toEqual([])
  } finally {
    await manager.stopAll()
  }
}, 30_000)
