// The stdio half of the A-layer fixture: a scripted peer in a child process on real pipes, the
// process handle double of a landing, and the records the peer reports back on stderr.
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { Readable, Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import type { StopScope } from '@omne-harness/mcp-contract'
import type { ProcessHandle, TransportMaterial } from '@omne-harness/mcp-contract/provider'
import {
  NotApplicable,
  type PeerNeeds,
  type PeerReceived,
  type PeerReply,
  type PeerScript,
  type Replies,
} from '@omne-harness/mcp-contract/testing'
import { generationOf } from '@omne-harness/mcp-contract/testing'
import { track } from './children.ts'

const PEER = fileURLToPath(new URL('./stdio-peer.mjs', import.meta.url))
const RECORD = '@omne '

function isList(replies: Replies): replies is readonly PeerReply[] {
  return Array.isArray(replies)
}

function listOf(replies: Replies | undefined): readonly PeerReply[] {
  if (replies === undefined) return []
  return isList(replies) ? replies : [replies]
}

/**
 * Whether the script's first exchange is `unsent`, and whether a later `unsent` makes the script
 * unrealizable. On stdio the only way a request fails before it leaves is a process that exited
 * before the transport opened; so `unsent` is realizable only as the first exchange of the
 * connection, in protocol order: `server/discover`, then `initialize`, then the rest.
 */
function unsentPlan(script: PeerScript): 'reachable' | 'unreachable' {
  const ordered: readonly (Replies | undefined)[] = [
    script.discover,
    script.initialize,
    ...Object.values(script.listing ?? {}),
    ...Object.values(script.calls ?? {}),
    ...Object.values(script.tasks ?? {}).flatMap(task => [task.get, task.update, task.cancel]),
  ]
  const scripted = ordered.filter(replies => replies !== undefined)
  const [head] = scripted
  if (listOf(head)[0]?.kind === 'unsent') return 'unreachable'
  const all = scripted.flatMap(listOf)
  if (all.some(reply => reply.kind === 'unsent'))
    throw new NotApplicable('a stdio process that fails a later request before it leaves')
  return 'reachable'
}

type Spawned = Readonly<{
  child: ChildProcess
  handle: ProcessHandle
  log: PeerReceived[]
  ready: Promise<void>
  exited: Promise<void>
}>

function spawnPeer(args: readonly string[]): Spawned {
  const child = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'pipe'] })
  track(child)
  const log: PeerReceived[] = []
  let stderrController: ReadableStreamDefaultController<string> | undefined
  const stderr = new ReadableStream<string>({
    start(controller) {
      stderrController = controller
    },
  })
  let markReady = (): void => undefined
  const ready = new Promise<void>(resolve => {
    markReady = resolve
  })
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  if (child.stderr !== null) {
    const lines = createInterface({ input: child.stderr })
    lines.on('line', line => {
      if (!line.startsWith(RECORD)) {
        try {
          stderrController?.enqueue(`${line}\n`)
        } catch {
          // The handle's stderr was cancelled: the line reads and discards it.
        }
        return
      }
      const entry: unknown = JSON.parse(line.slice(RECORD.length))
      if (typeof entry !== 'object' || entry === null || !('kind' in entry)) return
      if (entry.kind === 'ready') markReady()
      else log.push(entry as PeerReceived)
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
  return { child, handle, log, ready, exited }
}

export type StdioPeer = Readonly<{
  material: TransportMaterial
  received(): Promise<readonly PeerReceived[]>
  close(): Promise<void>
}>

/** Spawns the scripted peer for one case. The transport factory is the caller's. */
export async function stdioPeer(
  script: PeerScript,
  needs: PeerNeeds,
  versions: readonly string[],
): Promise<StdioPeer> {
  const plan = unsentPlan(script)
  const spawned =
    plan === 'unreachable'
      ? spawnPeer(['-e', ''])
      : spawnPeer([PEER, JSON.stringify(script), JSON.stringify(versions)])
  if (plan === 'unreachable') await spawned.exited
  else await spawned.ready
  const material: TransportMaterial = {
    kind: 'stdio',
    process: spawned.handle,
    generation: generationOf(1),
    instructionsByteLimit: needs.instructionsByteLimit ?? 4096,
  }
  return {
    material,
    async received() {
      // The peer records on stderr after it read the pipe: wait until the records stop coming.
      let seen = spawned.log.length
      for (;;) {
        await new Promise(resolve => setTimeout(resolve, 12))
        if (spawned.log.length === seen) break
        seen = spawned.log.length
      }
      return [...spawned.log]
    },
    async close() {
      await spawned.handle.stop()
    },
  }
}
