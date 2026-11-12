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
  /** The same bytes by the part of the command that holds them (see `attribute`). */
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

/**
 * The JSON bytes of a command split by what holds them: an element of an array that has a string
 * `kind` counts under `<path>[<kind>]`; any other value under its path, down to four levels. The
 * parts add up to the bytes of the command less the punctuation between them.
 */
function attribute(value: unknown, path = '', depth = 0, into: Record<string, number> = {}) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const kind: unknown =
        typeof item === 'object' && item !== null ? Reflect.get(item, 'kind') : undefined
      if (typeof kind === 'string') {
        const key = `${path}[${kind}]`
        into[key] = (into[key] ?? 0) + jsonBytes(item)
      } else attribute(item, `${path}[]`, depth + 1, into)
    }
    return into
  }
  if (typeof value === 'object' && value !== null && depth < 4) {
    for (const [key, inner] of Object.entries(value))
      attribute(inner, path === '' ? key : `${path}.${key}`, depth + 1, into)
    return into
  }
  into[path] = (into[path] ?? 0) + jsonBytes(value)
  return into
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
          counts.journalOwnBytes += jsonBytes(command)
          for (const [part, bytes] of Object.entries(attribute(command)))
            counts.journalOwnBytesByKind[part] = (counts.journalOwnBytesByKind[part] ?? 0) + bytes
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
