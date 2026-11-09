/** @module-tag slow */
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import type { CommandOutcome, ProcessHandle } from '@omne-harness/execution-environment-contract'
import { commandFixture } from './fixture.ts'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function workspace(): Promise<string> {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'omne-winexec-disposition-')))
  directories.push(path)
  return path
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function started(f: ReturnType<typeof commandFixture>, args: string[]) {
  const result = await f.manager.facility.start({ ...f.request, args })
  if (result.kind !== 'done') throw new Error(`start answered ${result.kind}`)
  return result.value
}

/** Reads a pid the command wrote to a file once it exists. */
async function pidIn(path: string): Promise<number> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const text = await readFile(path, 'utf8').catch(() => '')
    if (/^\d+$/u.test(text)) return Number(text)
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(`no pid in ${path}`)
}

const outcome = (handle: ProcessHandle): Promise<CommandOutcome> => handle.result

it('reports residue none and stops the Job, anchor included, when the main process leaves nothing', async context => {
  if (process.platform !== 'win32') return context.skip()
  const f = commandFixture(await workspace())
  const stops: string[] = []
  f.observeStops(async (_, status) => {
    stops.push(status)
    return 'recorded'
  })
  try {
    const handle = await started(f, ['-e', 'process.exitCode = 3'])
    expect(await outcome(handle)).toMatchObject({
      kind: 'completed',
      exit: { kind: 'code', code: 3 },
      residue: { kind: 'none' },
    })
    await expect.poll(() => stops).toContain('confirmed')
    await expect.poll(() => f.manager.unconfirmed()).toHaveLength(0)
  } finally {
    await f.manager.stopAll()
  }
}, 30_000)

it('stops what the main process left and says why, without waiting for the stop to be confirmed', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await workspace()
  const pidFile = join(root, 'child.pid')
  // A Node child dies with its parent unless detached: libuv puts children in its own Job.
  for (const [policy, reason] of [
    ['retain', 'uncontained'],
    ['stop', 'policy'],
  ] as const) {
    const f = commandFixture(root, { residuePolicy: policy })
    try {
      const handle = await started(f, [
        '-e',
        `const c=require('child_process').spawn(process.execPath,['-e','require("fs").writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)',process.argv[1]],{stdio:'ignore',detached:true});c.unref();setTimeout(()=>{},300)`,
        pidFile,
      ])
      const child = await pidIn(pidFile)
      expect(await outcome(handle)).toMatchObject({
        kind: 'completed',
        exit: { kind: 'code', code: 0 },
        residue: { kind: 'stopping', reason },
      })
      await expect.poll(() => alive(child), { timeout: 10_000 }).toBe(false)
      await expect.poll(() => f.manager.unconfirmed()).toHaveLength(0)
    } finally {
      await f.manager.stopAll()
      await rm(pidFile, { force: true })
    }
  }
}, 60_000)

it('stops a running command by Job name when its bridge dies', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await workspace()
  const pidFile = join(root, 'main.pid')
  const f = commandFixture(root)
  try {
    const handle = await started(f, [
      '-e',
      'require("fs").writeFileSync(process.argv[1],process.pid+" "+process.ppid);setInterval(()=>{},1000)',
      pidFile,
    ])
    let text = ''
    for (let attempt = 0; attempt < 200 && !/^\d+ \d+$/u.test(text); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 25))
      text = await readFile(pidFile, 'utf8').catch(() => '')
    }
    const [main, bridge] = text.split(' ').map(Number)
    if (main === undefined || bridge === undefined) throw new Error('no pids')
    process.kill(bridge)
    expect(await outcome(handle)).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
    await expect.poll(() => alive(main), { timeout: 10_000 }).toBe(false)
    await expect.poll(() => f.manager.unconfirmed()).toHaveLength(0)
  } finally {
    await f.manager.stopAll()
  }
}, 30_000)

it('ends a command it stopped forcibly as failed with an unknown effect, not as an ordinary exit', async context => {
  if (process.platform !== 'win32') return context.skip()
  const f = commandFixture(await workspace())
  try {
    const handle = await started(f, ['-e', 'setInterval(()=>{},1000)'])
    expect(await handle.stop('forced')).toBe('confirmed')
    expect(await outcome(handle)).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
  } finally {
    await f.manager.stopAll()
  }
}, 30_000)
