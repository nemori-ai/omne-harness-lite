import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

function workspaceRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir)
    if (parent === dir) throw new Error('no pnpm-workspace.yaml above the tests')
    dir = parent
  }
  return dir
}

const script = join(workspaceRoot(), 'packages/access/server-entry/tests/fixtures/entry-peer.ts')

export type Peer = {
  readonly port: number
  readonly origin: string
  readonly events: unknown[]
  readonly saw: (event: unknown) => Promise<void>
  readonly stop: () => Promise<void>
  readonly kill: () => Promise<void>
}

export async function startPeer(): Promise<Peer> {
  const child: ChildProcess = spawn(process.execPath, ['--conditions=source', script], {
    stdio: ['pipe', 'pipe', 'inherit'],
  })
  const events: unknown[] = []
  const waiters: { event: string; done: () => void }[] = []
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  const port = await new Promise<number>((resolve, reject) => {
    let buffer = ''
    child.once('exit', () => reject(new Error('the peer exited before it listened')))
    child.stdout!.setEncoding('utf8').on('data', (chunk: string) => {
      buffer += chunk
      for (let end = buffer.indexOf('\n'); end !== -1; end = buffer.indexOf('\n')) {
        const value = JSON.parse(buffer.slice(0, end)) as Record<string, unknown>
        buffer = buffer.slice(end + 1)
        if (typeof value['port'] === 'number') {
          resolve(value['port'])
          continue
        }
        events.push(value)
        const text = JSON.stringify(value)
        for (const waiter of waiters.filter(w => w.event === text)) {
          waiters.splice(waiters.indexOf(waiter), 1)
          waiter.done()
        }
      }
    })
  })
  return {
    port,
    origin: `http://127.0.0.1:${port}`,
    events,
    saw: event => {
      const text = JSON.stringify(event)
      if (events.some(seen => JSON.stringify(seen) === text)) return Promise.resolve()
      return new Promise(done => waiters.push({ event: text, done }))
    },
    stop: async () => {
      child.stdin!.end()
      await exited
    },
    kill: async () => {
      child.kill('SIGKILL')
      await exited
    },
  }
}
