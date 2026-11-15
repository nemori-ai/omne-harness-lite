import { Worker } from 'node:worker_threads'

export const JOURNAL_PARTICIPANT = 'execution-record'

export type PhaseCounts = {
  messages: Record<string, number>
  commitsByParticipant: Record<string, number>
  commits: number
  reads: number
  queries: number
  queriesByOperation: Record<string, number>
  journalOwnBytes: number
  journalOwnBytesByKind: Record<string, number>
}

const empty = (): PhaseCounts => ({
  messages: {},
  commitsByParticipant: {},
  commits: 0,
  reads: 0,
  queries: 0,
  queriesByOperation: {},
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

function operationPrefix(key: string): string {
  const direct = /^([a-z]+_)/u.exec(key)?.[1]
  if (direct !== undefined) return direct
  try {
    const parts: unknown = JSON.parse(key.replace(/#\d+$/u, ''))
    if (Array.isArray(parts))
      for (const part of parts) {
        const found = typeof part === 'string' ? /^([a-z]+_)/u.exec(part)?.[1] : undefined
        if (found !== undefined) return found
      }
  } catch {}
  return 'other'
}

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
    } else if (kind === 'query') {
      counts.queries += 1
      const prefix = operationPrefix(String(find(message, 'operationKey') ?? ''))
      counts.queriesByOperation[prefix] = (counts.queriesByOperation[prefix] ?? 0) + 1
    }
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
