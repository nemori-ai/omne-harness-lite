// A child process of any program as a `ProcessHandle`, for the targets that are not Node
// programs (the Python reference server). `fixtures/process.ts` starts Node programs only; this
// file has the same handle shape and registers the child with the same registry.
import { spawn } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
import type { StopScope } from '@omne-harness/mcp-contract'
import type { ProcessHandle } from '@omne-harness/mcp-contract/provider'
import { track } from '../fixtures/scripted/children.ts'

export function spawnCommand(command: string, args: readonly string[]): ProcessHandle {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] })
  track(child)
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  if (child.stdin === null || child.stdout === null || child.stderr === null)
    throw new Error('the child has no pipes')
  // The server logs to standard error; the e2e journey reads none of it, and an unread pipe
  // would fill and block the child.
  child.stderr.resume()
  const stdin: WritableStream<Uint8Array> = Writable.toWeb(child.stdin)
  const stdout: ReadableStream<Uint8Array> = Readable.toWeb(child.stdout)
  const stderr = new ReadableStream<string>({
    start(controller) {
      void exited.then(() => {
        try {
          controller.close()
        } catch {
          // The reader cancelled the stream first.
        }
      })
    },
  })
  return {
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
}
