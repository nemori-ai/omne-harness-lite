import { fork, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { config, fixtures, logged, other, read } from './support.ts'

interface Message {
  kind: string
  storeId?: string
  revision?: number
  outcome?: string
}
describe('real process coordination', () => {
  const f = fixtures()
  const processes: ChildProcess[] = []
  afterEach(async () => {
    await Promise.all(
      processes.splice(0).map(async p => {
        if (p.exitCode !== null || p.signalCode !== null) return
        const exit = new Promise<void>(resolve => p.once('exit', () => resolve()))
        p.kill('SIGKILL')
        await exit
      }),
    )
  })

  function child(directory: string) {
    const p = fork(fileURLToPath(new URL('./process-worker.ts', import.meta.url)), [directory], {
      execArgv: ['--experimental-transform-types'],
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    })
    processes.push(p)
    const queue: Message[] = []
    let stderr = ''
    p.stderr!.on('data', chunk => {
      stderr += String(chunk)
    })
    const waiters: { kind: string; resolve: (m: Message) => void; reject: (e: Error) => void }[] =
      []
    p.on('message', (message: Message) => {
      const i = waiters.findIndex(w => w.kind === message.kind)
      if (i === -1) queue.push(message)
      else waiters.splice(i, 1)[0]!.resolve(message)
    })
    p.on('exit', code => {
      for (const w of waiters.splice(0)) w.reject(new Error(`child exited ${code}: ${stderr}`))
    })
    return {
      p,
      next(kind: string): Promise<Message> {
        const i = queue.findIndex(m => m.kind === kind)
        if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]!)
        return new Promise((resolve, reject) => {
          waiters.push({ kind, resolve, reject })
        })
      },
    }
  }

  it('initializes exactly one persistent identity under competing first opens', async () => {
    const directory = await f.directory()
    const children = Array.from({ length: 4 }, () => child(directory))
    const observations = await Promise.all(children.map(c => c.next('ready')))
    expect(new Set(observations.map(o => o.storeId)).size).toBe(1)
    expect(observations.map(o => o.revision)).toEqual([0, 0, 0, 0])
    for (const c of children) c.p.send({ kind: 'close' })
  }, 15000)

  it('allows only one of two writes based on the same original snapshot', async () => {
    const directory = await f.directory()
    const a = child(directory),
      b = child(directory)
    await Promise.all([a.next('ready'), b.next('ready')])
    a.p.send({ kind: 'replace', value: logged, operationId: 'process-a' })
    b.p.send({ kind: 'replace', value: other, operationId: 'process-b' })
    const outcomes = await Promise.all([a.next('result'), b.next('result')])
    expect(outcomes.map(o => o.outcome).sort()).toEqual(['conflict', 'installed'])
    const s = await f.open(directory),
      snapshot = await read(s)
    expect(snapshot.revision).toBe(1)
    expect(snapshot.value).toEqual(outcomes[0]?.outcome === 'installed' ? logged : other)
  }, 15000)

  it('protects the newer process login from a delayed logout in another process', async () => {
    const directory = await f.directory(),
      s = await f.open(directory)
    await s.compareAndReplace((await read(s)).token, logged, 'first')
    const exiting = child(directory)
    await exiting.next('ready')
    await s.compareAndReplace((await read(s)).token, other, 'second')
    exiting.p.send({ kind: 'replace', value: config, operationId: 'old-logout' })
    expect((await exiting.next('result')).outcome).toBe('conflict')
    expect((await read(s)).value).toEqual(other)
  }, 15000)

  it('releases a killed writer lock and rolls back its uncommitted whole-record update', async () => {
    const directory = await f.directory(),
      s = await f.open(directory)
    await s.compareAndReplace((await read(s)).token, logged, 'durable')
    const worker = child(directory)
    await worker.next('ready')
    worker.p.send({ kind: 'hold' })
    await worker.next('holding')
    const exited = new Promise<void>(resolve => worker.p.once('exit', () => resolve()))
    worker.p.kill('SIGKILL')
    await exited
    expect(await read(s)).toMatchObject({ revision: 1, operationId: 'durable', value: logged })
    expect((await s.compareAndReplace((await read(s)).token, other, 'after-kill')).kind).toBe(
      'installed',
    )
  }, 15000)
})
