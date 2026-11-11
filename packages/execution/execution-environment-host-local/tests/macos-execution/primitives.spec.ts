/** @module-tag slow */
// Slow: the platform refinements the macOS backend relies on, on the real kernel with the real
// session reader: Π2 reads every member of a session (job-control groups and nohup included, the
// process that called setsid excluded), Π3 stops a session that keeps forking and confirms it
// empty, the leader identity tells a reused pid, and Πt carries the sentinels through a real PTY.
// The tests run only on macOS with `OMNE_HOST_MACOS=1`; elsewhere they are skipped, and a skip is
// not a pass. Every process a test starts is stopped by pid at its end.
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { sessionReader } from '../../src/macos-execution/compile.ts'
import {
  readBootId,
  readIdentity,
  readMembers,
  stopRecordedDomain,
  stopSessions,
} from '../../src/macos-execution/session.ts'

const enabled = process.platform === 'darwin' && process.env['OMNE_HOST_MACOS'] === '1'
const started: number[] = []
let reader = ''
let directory = ''

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const pidsIn = async (name: string) =>
  (await readFile(join(directory, name), 'utf8')).trim().split(/\s+/u).map(Number)

/** Starts `/bin/sh -c script` as the leader of a new session, as the gate is started. */
function session(script: string): number {
  const child = spawn('/bin/sh', ['-c', script], {
    detached: true,
    stdio: 'ignore',
    cwd: directory,
  })
  child.unref()
  if (child.pid === undefined) throw new Error('no pid')
  started.push(child.pid)
  return child.pid
}

async function until(check: () => Promise<boolean>, ms = 5_000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(20)) if (await check()) return
  throw new Error('condition not met in time')
}

beforeAll(async () => {
  if (!enabled) return
  const compiled = await sessionReader()
  if (compiled.kind !== 'ready') throw new Error(`session reader missing: ${compiled.missing}`)
  reader = compiled.path
  directory = await realpath(await mkdtemp(join(tmpdir(), 'omne-macos-primitives-')))
})

afterEach(async () => {
  if (!enabled) return
  for (const pid of started.splice(0)) {
    await stopSessions({ reader, sessions: [pid], boundMs: 5_000 })
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* Already gone. */
    }
  }
  for (const pid of await pidsIn('escaped').catch(() => [])) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* Already gone. */
    }
  }
  await rm(directory, { recursive: true, force: true })
  directory = await realpath(await mkdtemp(join(tmpdir(), 'omne-macos-primitives-')))
})

describe('Π2: session members', () => {
  it('reads every member, job-control groups and nohup included, and not the setsid escape', async ctx => {
    if (!enabled) return ctx.skip()
    const leader = session(`
      /bin/sleep 300 & echo $! >> plain
      nohup /bin/sleep 301 >/dev/null 2>&1 & echo $! >> plain
      /bin/sh -c 'set -m; /bin/sleep 302 & echo $! >> plain; wait' & echo $! >> plain
      /usr/bin/perl -MPOSIX -e 'exit if fork; POSIX::setsid(); open(my $f, ">>", "escaped"); print $f "$$\\n"; close $f; exec "/bin/sleep", "303"' &
      sleep 0.3; echo done > ready; wait`)
    await until(
      async () => (await readFile(join(directory, 'ready'), 'utf8').catch(() => '')) !== '',
    )
    const expected = (await pidsIn('plain')).sort((a, b) => a - b)
    expect(expected).toHaveLength(4)
    const members = await readMembers({
      reader,
      sessions: [leader],
      except: leader,
      boundMs: 5_000,
    })
    expect(members?.map(member => member.pid).sort((a, b) => a - b)).toEqual(
      expect.arrayContaining(expected),
    )
    // The job-control group differs from the leader's group: reading the leader's group would miss it.
    expect(new Set(members?.map(member => member.pgid)).size).toBeGreaterThan(1)
    // The setsid escape is in another session: it is not a member, and it is still alive.
    const [escaped] = await pidsIn('escaped')
    expect(escaped !== undefined && alive(escaped)).toBe(true)
    expect(members?.map(member => member.pid)).not.toContain(escaped)
    expect((members ?? []).every(member => member.sid === leader)).toBe(true)
    // Each member that exits leaves the reading.
    for (const pid of expected) process.kill(pid, 'SIGKILL')
    await until(async () => {
      const left = await readMembers({ reader, sessions: [leader], except: leader, boundMs: 5_000 })
      return left !== undefined && left.every(member => !expected.includes(member.pid))
    })
  })
})

describe('Π3: stop and confirm', () => {
  it('stops a session that keeps forking and confirms it empty; every pid is gone', async ctx => {
    if (!enabled) return ctx.skip()
    const leader = session(`
      /bin/sh -c 'set -m; i=0; while [ $i -lt 1500 ]; do /bin/sleep 31 & i=$((i+1)); done; wait' &
      i=0; while [ $i -lt 1500 ]; do /bin/sleep 32 & echo $! >> forked; i=$((i+1)); done; wait`)
    await until(
      async () =>
        ((await readMembers({ reader, sessions: [leader], boundMs: 5_000 })) ?? []).length > 200,
    )
    expect(await stopSessions({ reader, sessions: [leader], boundMs: 10_000 })).toBe('confirmed')
    expect(await readMembers({ reader, sessions: [leader], boundMs: 5_000 })).toEqual([])
    const forked = await pidsIn('forked')
    expect(forked.length).toBeGreaterThan(0)
    expect(forked.filter(alive)).toEqual([])
    expect(alive(leader)).toBe(false)
  })

  it('leaves the excepted pid and stops the rest', async ctx => {
    if (!enabled) return ctx.skip()
    const leader = session('/bin/sleep 300 & /bin/sleep 301 & exec /bin/sleep 302')
    await until(
      async () =>
        ((await readMembers({ reader, sessions: [leader], except: leader, boundMs: 5_000 })) ?? [])
          .length === 2,
    )
    expect(await stopSessions({ reader, sessions: [leader], except: leader, boundMs: 5_000 })).toBe(
      'confirmed',
    )
    expect(alive(leader)).toBe(true)
    expect(
      await readMembers({ reader, sessions: [leader], except: leader, boundMs: 5_000 }),
    ).toEqual([])
  })
})

describe('domain identity', () => {
  it('reads the leader identity, tells a reused pid, and stops only the domain own sessions', async ctx => {
    if (!enabled) return ctx.skip()
    const bootId = await readBootId()
    expect(bootId).toMatch(/^[0-9A-F-]{36}$/u)
    expect(await readBootId()).toBe(bootId)
    const leader = session('/bin/sleep 300 & wait')
    const identity = await readIdentity({ reader, pid: leader, boundMs: 5_000 })
    if (identity?.kind !== 'alive') throw new Error('leader not alive')
    expect(identity.sid).toBe(leader)
    // A record with another start time names another process under the same pid: not stopped.
    const foreign = { bootId: bootId ?? '', sessions: [{ sid: leader, start: '1.000001' }] }
    expect(await stopRecordedDomain({ reader, coordinate: foreign, bootId, boundMs: 5_000 })).toBe(
      'confirmed',
    )
    expect(alive(leader)).toBe(true)
    const own = { bootId: bootId ?? '', sessions: [{ sid: leader, start: identity.start }] }
    expect(await stopRecordedDomain({ reader, coordinate: own, bootId, boundMs: 5_000 })).toBe(
      'confirmed',
    )
    expect(alive(leader)).toBe(false)
    expect(await readIdentity({ reader, pid: leader, boundMs: 5_000 })).toEqual({ kind: 'gone' })
  })
})

describe('Πt: sentinels through a real PTY', () => {
  it('carries 1000 interleaved sentinels in order with CR, LF, UTF-8 and control bytes', async ctx => {
    if (!enabled) return ctx.skip()
    const require = createRequire(import.meta.url)
    const pty: typeof import('node-pty') = require('node-pty')
    const count = 1000
    const script = `i=0; while [ $i -lt ${count} ]; do printf 'x\\r\\n\\303\\251\\001\\033[1m\\033]7770;omne-b;n%05d\\007mid\\t\\033]7770;omne-e;n%05d\\007\\n' $i $i; i=$((i+1)); done`
    const terminal = pty.spawn('/bin/bash', ['--noprofile', '--norc', '-c', script], {
      cols: 80,
      rows: 24,
      env: { PATH: '/usr/bin:/bin' },
      encoding: null,
    } as never)
    const chunks: Buffer[] = []
    terminal.onData(data => chunks.push(Buffer.from(data as unknown as Uint8Array)))
    await new Promise<void>(resolve => terminal.onExit(() => resolve()))
    await sleep(100)
    const text = Buffer.concat(chunks).toString('latin1')
    const marks: string[] = []
    const opener = '\u001b]7770;omne-'
    for (let at = text.indexOf(opener); at !== -1; at = text.indexOf(opener, at + 1)) {
      const end = text.indexOf('\u0007', at)
      const [mark, nonce] = text.slice(at + opener.length, end).split(';n')
      marks.push(`${mark}${Number(nonce)}`)
    }
    expect(marks).toEqual(
      Array.from({ length: 2 * count }, (_, i) => `${i % 2 === 0 ? 'b' : 'e'}${i >> 1}`),
    )
    expect(text).toContain('\xc3\xa9\x01\x1b[1m')
    expect(text).toContain('x\r\r\n')
  })
})
