import { request as httpRequest } from 'node:http'
import { lstat } from 'node:fs/promises'
import {
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { checkStateDirectory, StateLayoutFailure } from './state-layout.ts'
import { parseSessionHostRequest, type SessionHostRequest } from './session-host-protocol.ts'
import {
  positivePolicy,
  readSessionBody,
  sessionHostAddress,
  SessionProtocolFailure,
} from './session-host-io.ts'
import { ioCode } from './state-layout-files.ts'
import { object } from '@omne-harness-lite/session-log'

export interface SessionHostWaitPolicy {
  readonly maxResponseBytes: number
  readonly timeoutMs: number
}
export type SessionHostReply =
  | { readonly kind: 'reply'; readonly result: JsonValue }
  | {
      readonly kind: 'unconfirmed'
      readonly request: SessionHostRequest
      readonly reason: 'transportUnavailable' | 'invalidReply' | 'hostRejected'
    }

/** One request only. Interrupting this wait neither cancels server work nor generates another operation identity. */
export async function sendSessionHostRequest(options: {
  readonly home: string
  readonly request: SessionHostRequest
  readonly policy: SessionHostWaitPolicy
  readonly signal?: AbortSignal
}): Promise<SessionHostReply> {
  positivePolicy(options.policy, ['maxResponseBytes', 'timeoutMs'])
  const packet = parseSessionHostRequest(options.request)
  if (!packet) throw new TypeError('invalid session client request')
  const address = sessionHostAddress(options.home)
  try {
    await checkStateDirectory(address.home, address.directory)
    await checkSocket(address.socketPath)
  } catch (error) {
    if (error instanceof StateLayoutFailure || unavailableIo(error))
      return unconfirmed(packet, 'transportUnavailable')
    throw error
  }
  const deadline = AbortSignal.timeout(options.policy.timeoutMs)
  const signal = options.signal ? AbortSignal.any([deadline, options.signal]) : deadline
  try {
    return await exchange(address.socketPath, packet, options.policy.maxResponseBytes, signal)
  } catch (error) {
    if (signal.aborted || unavailableIo(error)) return unconfirmed(packet, 'transportUnavailable')
    throw error
  }
}
function unconfirmed(
  request: SessionHostRequest,
  reason: Extract<SessionHostReply, { kind: 'unconfirmed' }>['reason'],
): SessionHostReply {
  return Object.freeze({ kind: 'unconfirmed', request, reason })
}
async function checkSocket(path: string) {
  const stat = await lstat(path)
  if (!stat.isSocket() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600)
    throw new StateLayoutFailure('unsafe-path')
}
function unavailableIo(error: unknown): boolean {
  return [
    'ENOENT',
    'ECONNRESET',
    'ECONNREFUSED',
    'EPIPE',
    'ETIMEDOUT',
    'EACCES',
    'ERR_STREAM_PREMATURE_CLOSE',
    'ABORT_ERR',
  ].includes(ioCode(error) ?? '')
}
function exchange(
  socketPath: string,
  packet: SessionHostRequest,
  limit: number,
  signal: AbortSignal,
): Promise<SessionHostReply> {
  const body = Buffer.from(writeJsonLossless(packet))
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        socketPath,
        path: '/session',
        method: 'POST',
        agent: false,
        signal,
        headers: { 'content-type': 'application/json', 'content-length': body.length },
      },
      response => {
        void readReply(response, packet, limit).then(resolve, reject)
      },
    )
    request.once('error', reject)
    request.end(body)
  })
}
async function readReply(
  response: Parameters<typeof readSessionBody>[0],
  packet: SessionHostRequest,
  limit: number,
): Promise<SessionHostReply> {
  if (response.statusCode !== 200) {
    response.destroy()
    return unconfirmed(packet, 'hostRejected')
  }
  let text: string
  try {
    text = await readSessionBody(response, limit)
  } catch (error) {
    if (error instanceof SessionProtocolFailure) return unconfirmed(packet, 'invalidReply')
    throw error
  }
  if (response.headers['content-type'] !== 'application/json')
    return unconfirmed(packet, 'invalidReply')
  const parsed = readJsonStrict(text)
  if ('failed' in parsed || !object(parsed.ok)) return unconfirmed(packet, 'invalidReply')
  if (
    Object.keys(parsed.ok).length !== 2 ||
    parsed.ok.format !== 'omne-session-host/1' ||
    !Object.hasOwn(parsed.ok, 'result')
  )
    return unconfirmed(packet, 'invalidReply')
  return Object.freeze({ kind: 'reply', result: parsed.ok.result! })
}
