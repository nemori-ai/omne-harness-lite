// Counts the messages this process posts to its worker threads, by phase: storage commits by
// participant, reads by the module of their handler, and the queries a caller sends before a
// commit. A count is taken at `Worker.prototype.postMessage`, so no product code changes; the
// SQLite provider runs every storage operation in a worker, so one message is one round trip.
// Each commit also adds the bytes of its `execution-record` commands: the own bytes of the session
// log, as `docs/engineering/perf-baseline.md` defines them (the JSON text of the command in UTF-8).
// From the scripts of issue #1196 (`m-attr.ts`), made a module with phases.
import { Worker } from 'node:worker_threads'

export const JOURNAL_PARTICIPANT = 'execution-record'

export type PhaseCounts = {
  /** `commit:<participants joined by +>`, `read:<handler module>`, `query`, or another kind. */
  messages: Record<string, number>
  /** Commits by each participant that has a command in them; one commit counts once per participant. */
  commitsByParticipant: Record<string, number>
  commits: number
  reads: number
  queries: number
  /** The JSON bytes of every `execution-record` command committed in the phase. */
  journalOwnBytes: number
  /** The same bytes by the `kind` of the command, when it has one. */
  journalOwnBytesByKind: Record<string, number>
}

const empty = (): PhaseCounts => ({
  messages: {},
  commitsByParticipant: {},
  commits: 0,
  reads: 0,
  queries: 0,
  journalOwnBytes: 0,
  journalOwnBytesByKind: {},
})

function find(value: unknown, key: string, depth = 0): unknown {
  if (typeof value !== 'object' || value === null || depth > 4) return undefined
  const own: unknown = Reflect.get(value, key)
  if (own !== undefined) return own
  for (const inner of Object.values(value)) {
    const found = find(inner, key, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}

function kindOf(value: unknown): string {
  if (typeof value !== 'object' || value === null) return typeof value
  const kind: unknown = Reflect.get(value, 'kind')
  if (typeof kind === 'string') return kind
  for (const key of ['body', 'message', 'payload', 'request']) {
    const inner: unknown = Reflect.get(value, key)
    if (typeof inner === 'object' && inner !== null) return kindOf(inner)
  }
  return 'other'
}

function jsonBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8')
  } catch {
    return 0
  }
}

/** Installs the count once per process; `phase` sets the phase that later messages count in. */
export function installWorkerCount() {
  const phases = new Map<number, PhaseCounts>()
  let phase = 0
  const at = (): PhaseCounts => {
    const known = phases.get(phase)
    if (known !== undefined) return known
    const fresh = empty()
    phases.set(phase, fresh)
    return fresh
  }
  const post = Worker.prototype.postMessage
  Worker.prototype.postMessage = function (this: Worker, message: unknown, ...rest: never[]) {
    const counts = at()
    let kind = kindOf(message)
    if (kind === 'read') {
      counts.reads += 1
      const handler = find(message, 'handler')
      const url =
        typeof handler === 'object' && handler !== null
          ? String(Reflect.get(handler, 'moduleUrl'))
          : String(handler)
      kind = `read:${String(
        url
          .split('/packages/')
          .pop()
          ?.split('/apps/')
          .pop()
          ?.replace(/\/(dist|src)\//u, ':')
          .slice(0, 70),
      )}`
    } else if (kind === 'commit') {
      counts.commits += 1
      const commands = find(message, 'commands')
      const list: unknown[] = Array.isArray(commands) ? commands : []
      const participants = new Set<string>()
      for (const command of list) {
        const participant = String(Reflect.get(command as object, 'participant'))
        participants.add(participant.split('.')[0] ?? participant)
        if (participant === JOURNAL_PARTICIPANT) {
          const bytes = jsonBytes(command)
          counts.journalOwnBytes += bytes
          const commandKind = String(find(command, 'kind') ?? 'unknown')
          counts.journalOwnBytesByKind[commandKind] =
            (counts.journalOwnBytesByKind[commandKind] ?? 0) + bytes
        }
      }
      for (const participant of participants)
        counts.commitsByParticipant[participant] =
          (counts.commitsByParticipant[participant] ?? 0) + 1
      kind = `commit:${[...participants].sort().join('+') || '?'}`
    } else if (kind === 'query') counts.queries += 1
    counts.messages[kind] = (counts.messages[kind] ?? 0) + 1
    return post.call(this, message, ...rest)
  } as typeof post
  return {
    setPhase(value: number) {
      phase = value
    },
    phase(value: number): PhaseCounts {
      return phases.get(value) ?? empty()
    },
    uninstall() {
      Worker.prototype.postMessage = post
    },
  }
}
