// A child process as a `ProcessHandle`: the double of a landing for the tests. The stdio pipes
// are handed over as web streams; standard error goes line by line to a hook first (a scripted
// peer reports what it received that way) and otherwise to the handle's stderr stream.
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { Readable, Writable } from 'node:stream'
import type { StopScope } from '@omne-harness/mcp-contract'
import type { ProcessHandle } from '@omne-harness/mcp-contract/provider'
import { track } from './scripted/children.ts'

export type Spawned = Readonly<{
  child: ChildProcess
  handle: ProcessHandle
  exited: Promise<void>
}>

export type SpawnOptions = Readonly<{
  /** Sees each line of standard error first; true when the line was consumed. */
  onStderrLine?: (line: string) => boolean
  env?: Readonly<{ [name: string]: string }>
}>

export function spawnHandle(args: readonly string[], options: SpawnOptions = {}): Spawned {
  const child = spawn(process.execPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    ...(options.env === undefined ? {} : { env: { ...process.env, ...options.env } }),
  })
  track(child)
  let stderrController: ReadableStreamDefaultController<string> | undefined
  const stderr = new ReadableStream<string>({
    start(controller) {
      stderrController = controller
    },
  })
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  if (child.stderr !== null) {
    const lines = createInterface({ input: child.stderr })
    lines.on('line', line => {
      if (options.onStderrLine?.(line) === true) return
      try {
        stderrController?.enqueue(`${line}\n`)
      } catch {
        // The handle's stderr was cancelled: the line reads and discards it.
      }
    })
  }
  void exited.then(() => {
    try {
      stderrController?.close()
    } catch {
      // Already closed or cancelled.
    }
  })
  if (child.stdin === null || child.stdout === null) throw new Error('the child has no pipes')
  const stdin: WritableStream<Uint8Array> = Writable.toWeb(child.stdin)
  const stdout: ReadableStream<Uint8Array> = Readable.toWeb(child.stdout)
  const handle: ProcessHandle = {
    stdin,
    stdout,
    stderr,
    exited,
    async stop(): Promise<StopScope> {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      await exited
      return 'root-only'
    },
  }
  return { child, handle, exited }
}
