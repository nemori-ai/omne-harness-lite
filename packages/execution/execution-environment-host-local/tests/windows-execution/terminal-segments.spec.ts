/** @module-tag slow */
// Slow: every case runs a real Windows PowerShell 5.1 Runspace in node-pty's bundled ConPTY.
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { CommandOutcome, TerminalRef } from '@omne-harness/execution-environment-contract'
import { outputOf, psString, terminalFixture, visible } from './terminal-fixture.ts'

const system = process.env['SystemRoot'] ?? 'C:\\Windows'
/** A writer thread in the shell process: it writes its text once the release file exists. */
const lateWriter = `using System;using System.IO;using System.Threading;public static class LateOutput { public static void Start(string release,string written,string text) { Thread thread=new Thread(delegate() { while(!File.Exists(release))Thread.Sleep(10);Console.Write(text);File.WriteAllText(written,"yes"); }); thread.IsBackground=true;thread.Start(); } }`
/** Text without the line ends ConPTY renders, so a wrapped line reads as one. */
const text = (bytes: Uint8Array) => visible(bytes).replace(/[\r\n]/gu, '')

async function session(root: string, options: Parameters<typeof terminalFixture>[1] = {}) {
  const f = terminalFixture(root, options)
  const created = await f.manager.facility.create({
    ...f.request,
    env: { ...f.request.env, PATH: join(system, 'System32'), PATHEXT: '.COM;.EXE' },
    geometry: { columns: 200, rows: 50 },
  })
  if (created.kind !== 'done') throw new Error(`create: ${JSON.stringify(created)}`)
  const terminal: TerminalRef = created.value.terminal
  const run = async (script: string) => {
    const handle = await f.manager.facility.execute({
      ...f.call,
      requestId: randomUUID(),
      terminal,
      script,
    })
    if (handle.kind !== 'done') throw new Error(`execute: ${JSON.stringify(handle)}`)
    const [result, output] = await Promise.all([handle.value.result, outputOf(handle.value)])
    return { result, output: output.bytes }
  }
  return { f, run }
}

function between(result: CommandOutcome) {
  if (result.kind !== 'completed' || result.output.mode !== 'terminal')
    throw new Error(`completed terminal result: ${JSON.stringify(result)}`)
  if (result.output.between === undefined) throw new Error('no between-segment bytes')
  return result.output.between
}

/** Starts a writer in the shell, lets it write after the invocation ended, and waits for it. */
async function writeBetween(
  root: string,
  run: Awaited<ReturnType<typeof session>>['run'],
  marker: string,
) {
  const release = join(root, `release-${randomUUID()}`)
  const written = join(root, `written-${randomUUID()}`)
  const first = await run(
    `Add-Type -TypeDefinition ${psString(lateWriter)}; [LateOutput]::Start(${psString(release)},${psString(written)},${psString(marker)}); Write-Output 'OMNE-FIRST'`,
  )
  await writeFile(release, '')
  await expect.poll(async () => readFile(written, 'utf8'), { timeout: 10_000 }).toBe('yes')
  return first
}

it('gives bytes written between two invocations to the next result, apart from both outputs', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-between-')))
  const { f, run } = await session(root)
  try {
    const marker = 'OMNE-BETWEEN-BYTES'
    const first = await writeBetween(root, run, marker)
    expect(first.result).toMatchObject({ kind: 'completed', exit: { kind: 'code', code: 0 } })
    expect(text(first.output)).toContain('OMNE-FIRST')
    expect(text(first.output)).not.toContain(marker)
    const second = await run("Write-Output 'OMNE-SECOND'")
    expect(text(second.output)).toContain('OMNE-SECOND')
    expect(text(second.output)).not.toContain(marker)
    const kept = between(second.result)
    expect(text(kept.data)).toContain(marker)
    expect(text(kept.data)).not.toContain('OMNE-SECOND')
    expect(kept.count).toEqual({ observedBytes: kept.data.length, discardedBytes: 0 })
    const third = await run("Write-Output 'OMNE-THIRD'")
    expect(text(between(third.result).data)).not.toContain(marker)
  } finally {
    await f.manager.stopAll()
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
}, 60_000)

it('keeps at most betweenSegmentBytes of the bytes between invocations and only counts the rest', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-between-bound-')))
  const bound = 64
  const { f, run } = await session(root, { betweenSegmentBytes: bound })
  try {
    const marker = Array.from({ length: 60 }, (_, i) => `OMNE-OVER-${String(i).padStart(3, '0')}`)
    await writeBetween(root, run, marker.join(' '))
    const second = await run("Write-Output 'OMNE-SECOND'")
    expect(text(second.output)).not.toContain('OMNE-OVER')
    const kept = between(second.result)
    expect(kept.data.length).toBe(bound)
    expect(kept.count.observedBytes).toBeGreaterThanOrEqual(marker.join(' ').length)
    expect(kept.count.discardedBytes).toBe(kept.count.observedBytes - bound)
  } finally {
    await f.manager.stopAll()
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
}, 60_000)

it('gives each of 30 invocations exactly its own two lines and nothing between them', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-terminal-order-')))
  const { f, run } = await session(root)
  try {
    // ConPTY's own start-up sequences come before the first segment; they are not under test.
    await run('')
    const misplaced: unknown[] = []
    for (let i = 0; i < 30; i++) {
      const { result, output } = await run(
        `Write-Output ('L${i}:' + ('x' * ${i * 37})); cmd /c echo N${i}:`,
      )
      expect(result).toMatchObject({ kind: 'completed', exit: { kind: 'code', code: 0 } })
      const expected = `L${i}:${'x'.repeat(i * 37)}N${i}:`
      const kept = between(result)
      if (text(output) !== expected || kept.data.length !== 0)
        misplaced.push({ i, output: text(output), between: visible(kept.data) })
    }
    expect(misplaced).toEqual([])
  } finally {
    await f.manager.stopAll()
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
}, 120_000)
