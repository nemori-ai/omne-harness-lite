// A scripted MCP peer on real stdio, for the transport conformance suite. It reads one JSON-RPC
// message per line on stdin, answers as the `PeerScript` (argv[2]) says, and reports what it
// received on stderr as lines that start with `@omne `. It picks replies as the contract's
// in-memory scripted peer does: in order per method, the last one repeating.
import { writeSync } from 'node:fs'
import { createInterface } from 'node:readline'

const script = JSON.parse(process.argv[2] ?? '{}')
const versions = JSON.parse(process.argv[3] ?? '["2026-07-28"]')
const consumed = new Map()
let peerRequestCount = 0

function record(entry) {
  writeSync(2, `@omne ${JSON.stringify(entry)}\n`)
}

function write(message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
}

function pick(key, replies, fallback) {
  const list = replies === undefined ? undefined : Array.isArray(replies) ? replies : [replies]
  if (list === undefined || list.length === 0) return fallback
  const index = consumed.get(key) ?? 0
  consumed.set(key, index + 1)
  return list[Math.min(index, list.length - 1)] ?? fallback
}

const error = (code, message) => ({ kind: 'error', error: { code, message } })

function reply(method, params) {
  const text = key => (typeof params[key] === 'string' ? params[key] : '')
  const task = script.tasks?.[text('taskId')]
  switch (method) {
    case 'server/discover':
      return pick(method, script.discover, {
        kind: 'result',
        result: { supportedVersions: versions, capabilities: { tools: {} } },
      })
    case 'initialize':
      return pick(method, script.initialize, error(-32601, 'Method not found'))
    case 'tools/list':
      return pick(
        `${method}:${text('cursor')}`,
        script.listing?.[text('cursor')],
        error(-32602, 'Unknown cursor'),
      )
    case 'tools/call':
      return pick(
        `${method}:${text('name')}`,
        script.calls?.[text('name')],
        error(-32602, 'Unknown tool'),
      )
    case 'tasks/get':
      return pick(`${method}:${text('taskId')}`, task?.get, error(-32602, 'Task not found'))
    case 'tasks/update':
    case 'tasks/cancel': {
      if (task === undefined) return error(-32602, 'Task not found')
      const scripted = method === 'tasks/update' ? task.update : task.cancel
      return pick(`${method}:${text('taskId')}`, scripted, { kind: 'result', result: {} })
    }
    default:
      return error(-32601, 'Method not found')
  }
}

function sendPeerRequests(at) {
  for (const request of script.peerRequests ?? []) {
    if ((request.at ?? 'initialized') !== at) continue
    peerRequestCount += 1
    write({
      id: `p${peerRequestCount}`,
      method: request.method,
      ...(request.params === undefined ? {} : { params: request.params }),
    })
  }
}

/** Does what the reply says on the wire. `id` is undefined for a notification of the client. */
function realize(chosen, id, token) {
  if (chosen === undefined) return
  switch (chosen.kind) {
    case 'result':
      for (const notification of chosen.notifications ?? []) {
        const written =
          notification.params !== null &&
          typeof notification.params === 'object' &&
          !Array.isArray(notification.params)
            ? notification.params
            : {}
        const params =
          written.progressToken === undefined && token !== undefined
            ? { ...written, progressToken: token }
            : written
        write({ method: notification.method, params })
      }
      if (id !== undefined) write({ id, result: chosen.result })
      return
    case 'error':
      if (id !== undefined) write({ id, error: chosen.error })
      return
    case 'stream-breaks':
      // The read end of the client goes away; this process stays alive on its open stdin.
      process.stdout.end()
      return
    case 'process-exits':
      process.exit(0)
    // eslint-disable-next-line no-fallthrough
    default:
      // silent, unsent (not realizable here), http (not on stdio): nothing on the wire.
      return
  }
}

const lines = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY })
lines.on('line', line => {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  if (message === null || typeof message !== 'object') return
  if (message.method === undefined) {
    record({
      kind: 'response',
      id: String(message.id),
      ...(message.result === undefined ? {} : { result: message.result }),
      ...(message.error === undefined ? {} : { error: message.error }),
    })
    return
  }
  if (message.id === undefined) {
    record({
      kind: 'notification',
      method: message.method,
      ...(message.params === undefined ? {} : { params: message.params }),
    })
    const chosen =
      script.notifications === undefined
        ? undefined
        : pick(`notification:${message.method}`, script.notifications, { kind: 'silent' })
    realize(chosen, undefined, undefined)
    if (message.method === 'notifications/initialized') sendPeerRequests('initialized')
    return
  }
  record({
    kind: 'request',
    id: message.id,
    method: message.method,
    ...(message.params === undefined ? {} : { params: message.params }),
  })
  if (message.method === 'initialize') sendPeerRequests('initialize')
  const token = message.params?._meta?.progressToken
  realize(reply(message.method, message.params ?? {}), message.id, token)
})
lines.on('close', () => {
  // The client closed stdin: a stdio server exits then. Keep the process alive only when the
  // script asked for a broken stream, so that the exit window is observable.
  setTimeout(() => process.exit(0), 50)
})
record({ kind: 'ready' })
