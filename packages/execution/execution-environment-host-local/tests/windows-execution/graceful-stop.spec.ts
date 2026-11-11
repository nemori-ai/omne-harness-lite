/** @module-tag slow */
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { commandFixture } from './fixture.ts'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function directory() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-winexec-graceful-')))
  directories.push(root)
  return root
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

it('lets a console program finish on CTRL_BREAK, then confirms the stop of its Job', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await directory()
  const marker = join(root, 'finished')
  const f = commandFixture(root, { graceMs: 5_000 })
  try {
    const command = await f.manager.facility.start({
      ...f.request,
      args: [
        '-e',
        [
          'const fs=require("fs")',
          'process.on("SIGBREAK",()=>{fs.writeFileSync(process.argv[1],"break");process.exit(3)})',
          'setInterval(()=>{},1000)',
          'fs.writeFileSync(process.argv[1],"up")',
        ].join(';'),
        marker,
      ],
    })
    if (command.kind !== 'done') throw new Error(`start answered ${command.kind}`)
    await expect
      .poll(() => readFile(marker, 'utf8').catch(() => ''), { timeout: 10_000 })
      .toBe('up')
    expect(await command.value.stop('graceful')).toBe('confirmed')
    expect(await readFile(marker, 'utf8')).toBe('break')
    // The main process ended by itself, so its code is known; the Job is stopped, not retained.
    expect(await command.value.result).toMatchObject({
      kind: 'completed',
      exit: { kind: 'code', code: 3 },
    })
    expect(f.manager.unconfirmed()).toEqual([])
  } finally {
    await f.manager.stopAll()
  }
}, 30_000)

it('answers unconfirmed at once for a main process without a console, and leaves it running', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await directory()
  const script = join(root, 'wait.js')
  const pidFile = join(root, 'pid')
  // wscript.exe is a GUI program: it has no console, so no console event reaches it.
  await writeFile(
    script,
    [
      'var shell=new ActiveXObject("WScript.Shell");',
      'var fso=new ActiveXObject("Scripting.FileSystemObject");',
      `var file=fso.CreateTextFile(${JSON.stringify(pidFile)},true);`,
      'file.Write("up");file.Close();',
      'WScript.Sleep(60000);',
    ].join('\n'),
  )
  const f = commandFixture(root, { graceMs: 5_000 })
  try {
    const command = await f.manager.facility.start({
      ...f.request,
      executable: join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'wscript.exe'),
      args: ['//nologo', script],
    })
    if (command.kind !== 'done') throw new Error(`start answered ${command.kind}`)
    await expect
      .poll(() => readFile(pidFile, 'utf8').catch(() => ''), { timeout: 10_000 })
      .toBe('up')
    const began = performance.now()
    expect(await command.value.stop('graceful')).toBe('unconfirmed')
    expect(performance.now() - began).toBeLessThan(2_000)
    expect(await command.value.stop('forced')).toBe('confirmed')
  } finally {
    await f.manager.stopAll()
  }
}, 30_000)

it('answers unconfirmed when the console program ignores CTRL_BREAK past graceMs, without escalating', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await directory()
  const pidFile = join(root, 'pid')
  const f = commandFixture(root, { graceMs: 500 })
  try {
    const command = await f.manager.facility.start({
      ...f.request,
      args: [
        '-e',
        'process.on("SIGBREAK",()=>{});require("fs").writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)',
        pidFile,
      ],
    })
    if (command.kind !== 'done') throw new Error(`start answered ${command.kind}`)
    await expect
      .poll(() => readFile(pidFile, 'utf8').catch(() => ''), { timeout: 10_000 })
      .toMatch(/^\d+$/u)
    const main = Number(await readFile(pidFile, 'utf8'))
    expect(await command.value.stop('graceful')).toBe('unconfirmed')
    expect(alive(main)).toBe(true)
    expect(await command.value.stop('forced')).toBe('confirmed')
    expect(alive(main)).toBe(false)
  } finally {
    await f.manager.stopAll()
  }
}, 30_000)
