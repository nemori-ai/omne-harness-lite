// @module-tag slow
// Starts actual OS processes against one private SQLite catalog.
import { fork, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { openCliCatalog } from '../src/catalog-open.ts'
import type { CatalogSnapshot } from '../src/catalog.ts'

const children: ChildProcess[] = []
const roots: string[] = []
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode !== null || child.signalCode !== null) continue
    const exit = new Promise(resolve => child.once('exit', resolve))
    child.kill('SIGKILL')
    await exit
  }
  for (const root of roots.splice(0)) await rm(root, { force: true, recursive: true })
})
interface Message {
  kind: string
  snapshot?: CatalogSnapshot
  outcome?: string
}
function child(home: string) {
  const process = fork(
    fileURLToPath(new URL('./catalog-process-worker.ts', import.meta.url)),
    [home],
    { execArgv: ['--experimental-transform-types'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
  )
  children.push(process)
  let error = ''
  process.stderr!.on('data', chunk => {
    error += String(chunk)
  })
  const queued: Message[] = []
  const waits: {
    kind: string
    resolve: (message: Message) => void
    reject: (error: Error) => void
  }[] = []
  process.on('message', (message: Message) => {
    const at = waits.findIndex(wait => wait.kind === message.kind)
    if (at < 0) queued.push(message)
    else waits.splice(at, 1)[0]!.resolve(message)
  })
  const exited = new Promise<number | null>(resolve =>
    process.once('exit', code => {
      for (const wait of waits.splice(0))
        wait.reject(new Error(`catalog worker exited ${code}: ${error}`))
      resolve(code)
    }),
  )
  return {
    process,
    exited,
    next: (kind: string): Promise<Message> => {
      const at = queued.findIndex(message => message.kind === kind)
      if (at >= 0) return Promise.resolve(queued.splice(at, 1)[0]!)
      if (process.exitCode !== null || process.signalCode !== null)
        return Promise.reject(new Error(`catalog worker exited: ${error}`))
      return new Promise((resolve, reject) => waits.push({ kind, resolve, reject }))
    },
  }
}
it('coordinates first initialization and conflicting aliases across real processes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'omne-catalog-process-'))
  roots.push(root)
  const home = join(root, '.omne')
  const a = child(home),
    b = child(home)
  const ready = await Promise.all([a.next('ready'), b.next('ready')])
  expect(ready[0]?.snapshot).toEqual(ready[1]?.snapshot)
  const profile = {
    name: 'shared alias',
    center: { centerId: 'a'.repeat(32), endpoint: 'https://a.invalid/', trust: { mode: 'ca' } },
  }
  a.process.send({ kind: 'register', profile })
  b.process.send({
    kind: 'register',
    profile: { ...profile, center: { ...profile.center, centerId: 'b'.repeat(32) } },
  })
  expect(
    (await Promise.all([a.next('result'), b.next('result')]))
      .map(message => message.outcome)
      .sort(),
  ).toEqual(['conflict', 'saved'])
  a.process.send({ kind: 'close' })
  b.process.send({ kind: 'close' })
  expect(await Promise.all([a.exited, b.exited])).toEqual([0, 0])
  const reopened = await openCliCatalog(home, {
    maxCenters: 8,
    maxCreations: 8,
    maxRecordBytes: 64 * 1024,
  })
  try {
    expect(await reopened.catalog.listCenters()).toHaveLength(1)
  } finally {
    await reopened.close()
  }
}, 15_000)
