// The stdio half of the A-layer fixture: a scripted peer in a child process on real pipes, the
// process handle double of a landing, and the records the peer reports back on stderr.
import { fileURLToPath } from 'node:url'
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
import { spawnHandle } from '../process.ts'

const PEER = fileURLToPath(new URL('./stdio-peer.mjs', import.meta.url))
const RECORD = '@omne '

/** A peer that closes its stdin, says it is ready, and stays alive until it is stopped. */
const CLOSED_STDIN = [
  "require('node:fs').closeSync(0)",
  `process.stderr.write(${JSON.stringify(`${RECORD}{"kind":"ready"}\n`)})`,
  'setInterval(() => undefined, 1 << 30)',
].join(';')

function isList(replies: Replies): replies is readonly PeerReply[] {
  return Array.isArray(replies)
}

function listOf(replies: Replies | undefined): readonly PeerReply[] {
  if (replies === undefined) return []
  return isList(replies) ? replies : [replies]
}

/**
 * Whether the script's first exchange is `unsent`, and whether a later `unsent` makes the script
 * unrealizable. On stdio a request fails before it leaves when the process does not read its
 * stdin any more; the peer that realizes it closed its stdin before the transport opened, and
 * stays alive, so the write itself fails (X02) and the line is not ended by an exit first. So
 * `unsent` is realizable only as the first exchange of the connection, in protocol order:
 * `server/discover`, then `initialize`, then the rest.
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
  handle: ProcessHandle
  log: PeerReceived[]
  ready: Promise<void>
  exited: Promise<void>
}>

function spawnPeer(args: readonly string[]): Spawned {
  const log: PeerReceived[] = []
  let markReady = (): void => undefined
  const ready = new Promise<void>(resolve => {
    markReady = resolve
  })
  const spawned = spawnHandle(args, {
    onStderrLine: line => {
      if (!line.startsWith(RECORD)) return false
      const entry: unknown = JSON.parse(line.slice(RECORD.length))
      if (typeof entry !== 'object' || entry === null || !('kind' in entry)) return true
      if (entry.kind === 'ready') markReady()
      else log.push(entry as PeerReceived)
      return true
    },
  })
  return { handle: spawned.handle, log, ready, exited: spawned.exited }
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
      ? spawnPeer(['-e', CLOSED_STDIN])
      : spawnPeer([PEER, JSON.stringify(script), JSON.stringify(versions)])
  await spawned.ready
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
