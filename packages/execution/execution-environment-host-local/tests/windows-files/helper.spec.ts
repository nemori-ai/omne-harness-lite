// The transport of the files helper against a stand-in process (`fake-helper.ts`) that writes the
// frames a test asks for. Each case names the FilesHelper property it holds
// (`verification/models/README.md#fileshelper`). The stand-in logs every request that reaches it,
// so "never written" is counted, not inferred from timing.
import type { ChildProcess } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createFilesHelper } from '../../src/windows-files/helper.ts'
import type { RunInput } from '../../src/windows-files/protocol.ts'

const kills = vi.hoisted(() => ({
  /** When set, `kill()` of a spawned child only reports; the test kills it with `now`. */
  defer: false,
  requested: Promise.withResolvers<void>(),
  now: (): void => undefined,
}))

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    spawn(...args: Parameters<typeof actual.spawn>): ChildProcess {
      const child = actual.spawn(...args)
      if (!kills.defer) return child
      const kill = child.kill.bind(child)
      child.kill = () => {
        kills.now = () => void kill()
        kills.requested.resolve()
        return true
      }
      return child
    },
  }
})

const fake = fileURLToPath(new URL('./fake-helper.ts', import.meta.url))
let directory: string
let log: string

beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'omne-files-helper-')))
  log = join(directory, 'log')
})

afterEach(async () => {
  kills.now()
  kills.defer = false
  kills.requested = Promise.withResolvers<void>()
  kills.now = () => undefined
  await rm(directory, { recursive: true, force: true })
})

/** A helper whose processes are stand-ins; `starts` are the start modes of successive launches. */
function helper(
  options: Readonly<{
    inFlightLimit?: number
    startBoundMs?: number
    starts?: readonly string[]
  }> = {},
): ReturnType<typeof createFilesHelper> {
  const starts = [...(options.starts ?? [])]
  return createFilesHelper({
    launch: async () => {
      const start = starts.shift() ?? 'ready'
      if (start === 'compileFails') throw new Error('injected compile failure')
      return { command: process.execPath, args: [fake, log, start] }
    },
    ...(options.inFlightLimit === undefined ? {} : { inFlightLimit: options.inFlightLimit }),
    ...(options.startBoundMs === undefined ? {} : { startBoundMs: options.startBoundMs }),
  })
}

/** A request the stand-in acts on by `named`; `path` carries its argument. */
function input(named: string, path = '-'): RunInput {
  return {
    root: 'C:\\',
    expectedRoot: '',
    segments: [],
    named,
    operation: 'stat',
    offset: 0,
    limit: 0,
    pattern: '',
    content: false,
    recursive: false,
    entryBudget: 0,
    byteBudget: 0,
    fileBytes: 0,
    path,
    rooted: false,
    directory: false,
    follow: false,
  }
}

const lines = async (): Promise<string[]> => {
  try {
    return (await readFile(log, 'utf8')).split('\n').filter(line => line !== '')
  } catch {
    return []
  }
}

/** Waits until `count` requests named `named` reached a stand-in. */
async function reached(named: string, count = 1): Promise<void> {
  await vi.waitFor(
    async () => {
      const found = (await lines()).filter(line => line.split(' ')[2] === named)
      if (found.length < count) throw new Error(`${named} not reached`)
    },
    { timeout: 10_000, interval: 10 },
  )
}

async function pids(): Promise<number[]> {
  return (await lines()).filter(line => line.startsWith('pid ')).map(line => Number(line.slice(4)))
}

const done = { info: { token: '1:1' } }

it('P2: answers unknown for a written request when the process is killed, and keeps a queued one for the next process', async () => {
  const files = helper({ inFlightLimit: 1 })
  const written = files.request(input('hold'))
  await reached('hold')
  const queued = files.request(input('answer'))
  const [first] = await pids()
  process.kill(first ?? 0)
  expect(await written).toBe('unknown')
  expect(await queued).toMatchObject(done)
  // The queued request was written once, to the second process only.
  const log = await lines()
  expect(log.filter(line => line.startsWith('pid '))).toHaveLength(2)
  expect(log.findIndex(line => line.includes(' answer '))).toBeGreaterThan(
    log.lastIndexOf(`pid ${(await pids())[1]}`),
  )
}, 30_000)

it('P1: a reply that never got its line end is no frame, so the request answers unknown', async () => {
  const files = helper()
  expect(await files.request(input('emitExit', '{"v":1,"id":#self,"ok":#ok}'))).toBe('unknown')
  // A torn line invalidates the process; the request is unknown, not answered from the fragment.
  expect(await files.request(input('emit', '{"v":1,"id":#self,"ok":{"info"\n'))).toBe('unknown')
  expect(await files.request(input('answer'))).toMatchObject(done)
}, 30_000)

it('P5: answers once, and drops a duplicate frame together with every frame read after it', async () => {
  const files = helper({ inFlightLimit: 4 })
  const first = files.request(input('hold'))
  await reached('hold')
  const second = files.request(input('hold'))
  await reached('hold', 2)
  const frame = (held: string) => `{"v":1,"id":${held},"ok":#ok}\n`
  const trigger = files.request(input('emit', frame('#0') + frame('#0') + frame('#1')))
  expect(await first).toMatchObject(done)
  // The duplicate invalidated the process: the frame for the second request came too late.
  expect(await second).toBe('unknown')
  expect(await trigger).toBe('unknown')
  expect(await files.request(input('answer'))).toMatchObject(done)
  expect(await pids()).toHaveLength(2)
}, 30_000)

it('P6: a request past its bound kills the process, and answers unknown only once the process closed', async () => {
  kills.defer = true
  const files = helper()
  const late = files.request(input('hold'), 100)
  await kills.requested.promise
  const settledEarly = await Promise.race([
    late,
    new Promise(resolve => setTimeout(resolve, 200, 'pending')),
  ])
  expect(settledEarly).toBe('pending')
  kills.now()
  expect(await late).toBe('unknown')
}, 30_000)

it('answers the waiting requests unavailable when the helper cannot start, and starts again for the next', async () => {
  const files = helper({ starts: ['compileFails', 'exit', 'silent'], startBoundMs: 1_000 })
  for (let attempt = 0; attempt < 3; attempt++)
    expect(await files.request(input('answer'))).toBe('unavailable')
  expect(await files.request(input('answer'))).toMatchObject(done)
  // Nothing was written to a process that never became ready.
  expect((await lines()).filter(line => line.startsWith('request '))).toHaveLength(1)
}, 30_000)
