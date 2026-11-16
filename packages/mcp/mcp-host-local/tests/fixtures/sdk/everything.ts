import { spawn, type ChildProcess } from 'node:child_process'
import { connect } from 'node:net'
import { fileURLToPath } from 'node:url'
import { isConnectionTarget, type ConnectionTarget } from '@omne-harness/mcp-contract'
import type { ProcessHandle } from '@omne-harness/mcp-contract/provider'
import { spawnHandle } from '../process.ts'
import { track } from '../scripted/children.ts'

const BIN = fileURLToPath(
  new URL(
    '../../../node_modules/@modelcontextprotocol/server-everything/dist/index.js',
    import.meta.url,
  ),
)

export function everythingStdio(): Readonly<{ handle: ProcessHandle; close(): Promise<void> }> {
  const spawned = spawnHandle([BIN, 'stdio'])
  return {
    handle: spawned.handle,
    async close() {
      await spawned.handle.stop()
    },
  }
}

async function freePort(): Promise<number> {
  for (;;) {
    const port = 20_000 + Math.floor(Math.random() * 40_000)
    if (!(await reachable(port))) return port
  }
}

function reachable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = connect({ host: '127.0.0.1', port })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

export type EverythingServer = Readonly<{
  target: ConnectionTarget
  port: number
  close(): Promise<void>
}>

export async function everythingHttp(mode: 'sse' | 'streamableHttp'): Promise<EverythingServer> {
  const port = await freePort()
  const child: ChildProcess = spawn(process.execPath, [BIN, mode], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true,
  })
  track(child, () => {
    if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
  })
  child.stderr?.on('data', () => undefined)
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  for (let round = 0; round < 200; round += 1) {
    if (await reachable(port)) break
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  if (!(await reachable(port)))
    throw new Error(`server-everything ${mode} did not listen on ${port}`)
  const text = `http://127.0.0.1:${port}/${mode === 'sse' ? 'sse' : 'mcp'}`
  if (!isConnectionTarget(text)) throw new Error(`not a connection target: ${text}`)
  return {
    target: text,
    port,
    async close() {
      if (child.exitCode === null && child.signalCode === null && child.pid !== undefined)
        process.kill(-child.pid, 'SIGKILL')
      await exited
    },
  }
}
