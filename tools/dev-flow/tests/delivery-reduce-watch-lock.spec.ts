// @module-tag slow
import { fork, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import {
  existsSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { lockWatchJournal } from '../src/delivery/reduce-watch-journal.ts'

const children: ChildProcess[] = [],
  roots: string[] = []
afterEach(async () => {
  await Promise.all(
    children.splice(0).map(async child => {
      if (child.exitCode !== null || child.signalCode !== null) return
      const exited = once(child, 'exit')
      child.kill('SIGKILL')
      await exited
    }),
  )
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function setup() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'watch-lock-')))
  roots.push(root)
  const entry = join(root, 'holder.mjs'),
    path = join(root, 'journal.json')
  writeFileSync(
    entry,
    `
import { lockWatchJournal } from ${JSON.stringify(new URL('../src/delivery/reduce-watch-journal.ts', import.meta.url).href)}
try {
 const unlock = lockWatchJournal(process.argv[2], true)
 process.send({ status: 'locked' })
 process.on('message', () => { unlock(); process.exit(0) })
} catch (error) {
 process.send({ status: 'refused', message: error.message })
 process.exit(0)
}
`,
  )
  return { entry, path }
}
async function holder(entry: string, path: string) {
  const child = fork(entry, [path], { execArgv: [], silent: true })
  children.push(child)
  const messages: unknown[] = await once(child, 'message', { signal: AbortSignal.timeout(3_000) })
  return { child, message: messages[0] }
}

it('prevents a second process from recovering a live owner lock', async () => {
  const { entry, path } = setup(),
    unlock = lockWatchJournal(path)
  const bytes = readFileSync(`${path}.lock`, 'utf8')
  try {
    const contender = await holder(entry, path)
    expect(contender.message).toEqual({
      status: 'refused',
      message: 'watch-already-running-or-lock-needs-recovery',
    })
    expect(readFileSync(`${path}.lock`, 'utf8')).toBe(bytes)
  } finally {
    unlock()
  }
  expect(existsSync(`${path}.lock`)).toBe(false)
})

it('releases the OS mutex on process death and serializes concurrent recovery', async () => {
  const { entry, path } = setup(),
    first = await holder(entry, path)
  expect(first.message).toEqual({ status: 'locked' })
  const exited = once(first.child, 'exit')
  first.child.kill('SIGKILL')
  await exited
  expect(() => lockWatchJournal(path)).toThrow('watch-already-running-or-lock-needs-recovery')
  const unlock = lockWatchJournal(path, true)
  try {
    const contender = await holder(entry, path)
    expect(contender.message).toMatchObject({ status: 'refused' })
  } finally {
    unlock()
  }
  unlock()
  const successor = await holder(entry, path)
  expect(successor.message).toEqual({ status: 'locked' })
  const finished = once(successor.child, 'exit')
  successor.child.send('release')
  await finished
  expect(existsSync(`${path}.lock`)).toBe(false)
})

it('does not unlink a marker whose ownership changed', () => {
  const { path } = setup(),
    unlock = lockWatchJournal(path)
  writeFileSync(`${path}.lock`, 'another owner')
  expect(unlock).toThrow('watch-lock-ownership-lost')
  expect(readFileSync(`${path}.lock`, 'utf8')).toBe('another owner')
})

it('rejects leaf symlink and hardlink journal aliases before acquiring a different mutex', () => {
  const { path } = setup()
  writeFileSync(path, '{}')
  const alias = `${path}.alias`
  symlinkSync(path, alias)
  expect(() => lockWatchJournal(alias)).toThrow('watch-journal-regular-single-link-file-required')
  rmSync(alias)
  linkSync(path, alias)
  expect(() => lockWatchJournal(alias)).toThrow('watch-journal-regular-single-link-file-required')
  expect(() => lockWatchJournal(path)).toThrow('watch-journal-regular-single-link-file-required')
})
