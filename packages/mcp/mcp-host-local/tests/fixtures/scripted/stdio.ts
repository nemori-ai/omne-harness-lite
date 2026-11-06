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
import { settledWithin } from '../settle.ts'

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
  /** Settles once every record the peer wrote for the lines sent so far is in `log`. */
  recorded(): Promise<void>
}>

function spawnPeer(args: readonly string[], env?: Readonly<{ [name: string]: string }>): Spawned {
  const log: PeerReceived[] = []
  const synced = new Map<number, () => void>()
  let syncs = 0
  let markReady = (): void => undefined
  const ready = new Promise<void>(resolve => {
    markReady = resolve
  })
  const { child, handle } = spawnHandle(args, {
    ...(env === undefined ? {} : { env }),
    onStderrLine: line => {
      if (!line.startsWith(RECORD)) return false
      const entry: unknown = JSON.parse(line.slice(RECORD.length))
      if (typeof entry !== 'object' || entry === null || !('kind' in entry)) return true
      if (entry.kind === 'ready') markReady()
      else if (entry.kind === 'synced') {
        if ('n' in entry && typeof entry.n === 'number') {
          synced.get(entry.n)?.()
          synced.delete(entry.n)
        }
      } else log.push(entry as PeerReceived)
      return true
    },
  })
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()))
  async function recorded(): Promise<void> {
    const stdin = child.stdin
    // The sync line goes into the pipe directly. The caller's lines go through the web stream of
    // `handle.stdin` first, and that stream holds back every line after one the pipe could not take
    // at once, until 'drain'. So the sync line waits until the stream has handed over every line.
    // A write the caller started without waiting for it (a notification, `cancelRequest`) reaches
    // the stream within this turn of the event loop. The stream hands over its queue in the turn
    // where the pipe takes more. So after a turn, the queue is empty unless the pipe waits for 'drain'.
    for (;;) {
      await new Promise(resolve => setImmediate(resolve))
      // A peer that exited, or whose stdin is closed, reads no more lines: its last records are in
      // once its pipes close.
      if (child.exitCode !== null || child.signalCode !== null || stdin === null || !stdin.writable)
        return closed
      if (!stdin.writableNeedDrain) break
      await Promise.race([new Promise(resolve => stdin.once('drain', resolve)), closed])
    }
    syncs += 1
    const n = syncs
    const confirmed = new Promise<void>(resolve => synced.set(n, resolve))
    stdin.write(`${JSON.stringify({ '@omne': 'sync', n })}\n`)
    return Promise.race([confirmed, closed])
  }
  return { handle, log, ready, recorded }
}

export type StdioPeer = Readonly<{
  material: TransportMaterial
  received(): Promise<readonly PeerReceived[]>
  close(): Promise<void>
}>

export type StdioPeerOptions = Readonly<{
  /** The peer writes each record this many milliseconds late, as a peer under load may. */
  recordDelayMs?: number
  /** How long `received()` waits for the peer to confirm its records before it fails. */
  confirmWithinMs?: number
}>

/** Far above a loaded machine's scheduling noise; a peer that does not confirm by then is stuck. */
const CONFIRM_WITHIN_MS = 10_000

/** Spawns the scripted peer for one case. The transport factory is the caller's. */
export async function stdioPeer(
  script: PeerScript,
  needs: PeerNeeds,
  versions: readonly string[],
  options: StdioPeerOptions = {},
): Promise<StdioPeer> {
  const plan = unsentPlan(script)
  // Always set, so that a value in the environment of the test run does not reach the peer.
  const env = { OMNE_PEER_RECORD_DELAY_MS: String(options.recordDelayMs ?? 0) }
  const spawned =
    plan === 'unreachable'
      ? spawnPeer(['-e', CLOSED_STDIN])
      : spawnPeer([PEER, JSON.stringify(script), JSON.stringify(versions)], env)
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
      // A peer with no script records nothing, and its stdin is closed: there is nothing to wait for.
      if (plan === 'unreachable') return [...spawned.log]
      const within = options.confirmWithinMs ?? CONFIRM_WITHIN_MS
      if ((await settledWithin(spawned.recorded(), within)) === 'pending')
        throw new Error(`the stdio peer did not confirm its records within ${within} ms`)
      return [...spawned.log]
    },
    async close() {
      await spawned.handle.stop()
    },
  }
}
