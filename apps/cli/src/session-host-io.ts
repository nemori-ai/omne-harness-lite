import type { IncomingMessage } from 'node:http'
import { join } from 'node:path'
import { resolveStateHome } from './state-layout.ts'

export class SessionProtocolFailure extends Error {
  constructor(
    readonly reason:
      | 'invalidRequest'
      | 'requestTooLarge'
      | 'incompleteRequest'
      | 'unavailable'
      | 'responseTooLarge',
    readonly status: number,
  ) {
    super(`session host protocol: ${reason}`)
  }
}
export function sessionHostAddress(home: string): {
  readonly home: string
  readonly directory: string
  readonly socketPath: string
} {
  const checked = resolveStateHome({ explicitHome: home, osHome: home })
  const directory = join(checked, 'run')
  return { home: checked, directory, socketPath: join(directory, 'session-host.sock') }
}
export function positivePolicy(policy: object, required: readonly string[]): void {
  if (
    Object.keys(policy).length !== required.length ||
    !required.every(key => Object.hasOwn(policy, key))
  )
    throw new TypeError('incomplete session transport policy')
  for (const value of Object.values(policy))
    if (!Number.isSafeInteger(value) || value < 1)
      throw new TypeError('invalid session transport policy')
}
/** Node owns framing. This function only bounds and strictly decodes its complete byte stream. */
export async function readSessionBody(input: IncomingMessage, limit: number): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  try {
    for await (const chunk of input) {
      if (!Buffer.isBuffer(chunk)) throw new TypeError('unexpected session transport chunk')
      size += chunk.length
      if (size > limit) throw new SessionProtocolFailure('requestTooLarge', 413)
      chunks.push(chunk)
    }
  } catch (error) {
    if (error instanceof SessionProtocolFailure) throw error
    if (input.aborted) throw new SessionProtocolFailure('incompleteRequest', 400)
    throw error
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size))
  } catch (error) {
    if (error instanceof TypeError) throw new SessionProtocolFailure('invalidRequest', 400)
    throw error
  }
}
