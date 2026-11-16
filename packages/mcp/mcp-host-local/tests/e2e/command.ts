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
  child.stderr.resume()
  const stdin: WritableStream<Uint8Array> = Writable.toWeb(child.stdin)
  const stdout: ReadableStream<Uint8Array> = Readable.toWeb(child.stdout)
  const stderr = new ReadableStream<string>({
    start(controller) {
      void exited.then(() => {
        try {
          controller.close()
        } catch {}
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
