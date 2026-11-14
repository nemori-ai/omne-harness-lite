// The exclusive lock of one `serve` run on its state directory (`src/state-lock.ts`), and the
// proof a run gives from it. The lock is an operating-system lock, so the other holder here is a
// real second process.
import { spawn } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  STATE_LOCK_FILE,
  acquireStateLock,
  lostContactBy,
  type StateLock,
} from '../src/state-lock.ts'

const roots: string[] = []
const locks: StateLock[] = []
function stateRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-state-lock-')))
  roots.push(root)
  return root
}
/** Takes the lock and remembers it, so that the test releases it whatever happens. */
function take(root: string, now?: () => string): StateLock {
  const taken = acquireStateLock(root, now)
  if (taken.kind !== 'held') throw new Error('the lock is in use')
  locks.push(taken.lock)
  return taken.lock
}
afterEach(() => {
  for (const lock of locks.splice(0)) lock.release()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** A second process that takes the same lock the same way and keeps it until it is killed. */
async function otherProcess(root: string) {
  const script = `
    const { DatabaseSync } = require('node:sqlite')
    const database = new DatabaseSync(${JSON.stringify(join(root, STATE_LOCK_FILE))}, { timeout: 0 })
    database.exec('PRAGMA locking_mode = EXCLUSIVE')
    database.exec('CREATE TABLE IF NOT EXISTS holder (since TEXT NOT NULL)')
    database.exec('DELETE FROM holder')
    process.stdout.write('held')
    setInterval(() => {}, 1000)
  `
  const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'inherit'] })
  await new Promise<void>((resolve, reject) => {
    child.stdout.once('data', () => resolve())
    child.once('exit', code => reject(new Error(`the holder exited with ${code}`)))
  })
  const ended = new Promise<void>(resolve => child.once('exit', () => resolve()))
  return { kill: (signal: NodeJS.Signals) => (child.kill(signal), ended) }
}

describe('the state lock', () => {
  it('is held until it is released, and names its holding by the instant it was taken', () => {
    const root = stateRoot()
    const lock = take(root, () => '2026-11-13T00:00:00.000Z')
    expect(lock.since).toBe('2026-11-13T00:00:00.000Z')
    expect(lock.held()).toBe(true)
    // A second holder is refused, in this process too.
    expect(acquireStateLock(root)).toEqual({ kind: 'in-use' })
    lock.release()
    lock.release()
    expect(lock.held()).toBe(false)
    expect(take(root).held()).toBe(true)
  })

  it('locks one directory: another directory is free', () => {
    take(stateRoot())
    expect(take(stateRoot()).held()).toBe(true)
  })

  it('refuses at once while another process holds the directory', async () => {
    const root = stateRoot()
    const other = await otherProcess(root)
    try {
      expect(acquireStateLock(root)).toEqual({ kind: 'in-use' })
    } finally {
      await other.kill('SIGTERM')
    }
  })

  it('is free again when the holder was killed: the system released it, and no stale file refuses', async () => {
    const root = stateRoot()
    const other = await otherProcess(root)
    await other.kill('SIGKILL')
    expect(take(root).held()).toBe(true)
  })

  it('throws for a directory that cannot hold the lock file', () => {
    expect(() => acquireStateLock(join(stateRoot(), 'missing'))).toThrow()
  })
})

describe('the proof that an instance of an earlier process has no runtime', () => {
  const instance = 'agent-instance-of-an-earlier-process'

  it('is absent before the run took its lock: nothing is judged lost', () => {
    expect(lostContactBy(() => undefined)(instance)).toBeNull()
  })

  it('names the holding of the lock and the instance while the run holds the lock, and ends with the lock', () => {
    const lock = take(stateRoot(), () => '2026-11-13T00:00:00.000Z')
    const proof = lostContactBy(() => lock)
    expect(proof(instance)).toEqual({
      owner: '@omne-harness/harness-server',
      record: 'state-lock',
      revision: '2026-11-13T00:00:00.000Z',
      digest: `instance:${instance}`,
    })
    lock.release()
    expect(proof(instance)).toBeNull()
  })
})
