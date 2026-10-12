import { createRequire } from 'node:module'
import {
  GovernanceClientConfigurationError,
  type PublicHealthOptions,
} from '@omne-harness-lite/governance-center-entry-https-json'
import type { GovernanceOutcome } from '@omne-harness-lite/governance-center-entry-https-json'
import { sendRequest } from './transport.ts'

const require = createRequire(new URL('../package.json', import.meta.url))
function fixedSchemas() {
  return require('./generated/ordinary.cjs') as Record<
    'Envelope' | 'Exchange',
    (value: unknown) => boolean
  >
}
const VERSION_MISMATCH = Buffer.from('"version-mismatch"')

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type Reading =
  { readonly kind: 'value'; readonly value: unknown } | { readonly kind: 'invalid' | 'limit' }

/** Native JSON syntax parsing plus bounded token inspection for duplicate keys.
 * The token walk does not interpret values or implement a second JSON grammar.
 */
function readReplyJson(body: Buffer): Reading {
  let text: string
  let value: unknown
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body)
    value = JSON.parse(text)
  } catch {
    return { kind: 'invalid' }
  }
  const stack: ({ readonly keys: Set<string>; expectingKey: boolean } | undefined)[] = []
  for (const match of text.matchAll(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\],:]/g)) {
    const token = match[0]
    if (token === '{' || token === '[') {
      if (stack.length === 64) return { kind: 'limit' }
      stack.push(token === '{' ? { keys: new Set(), expectingKey: true } : undefined)
    } else if (token === '}' || token === ']') stack.pop()
    else {
      const frame = stack.at(-1)
      if (frame === undefined) continue
      if (token === ',') frame.expectingKey = true
      else if (token.startsWith('"') && frame.expectingKey) {
        const key: string = JSON.parse(token)
        if (frame.keys.has(key)) return { kind: 'invalid' }
        if (frame.keys.size === 1024) return { kind: 'limit' }
        frame.keys.add(key)
        frame.expectingKey = false
      }
    }
  }
  return { kind: 'value', value }
}

/** D045: validates one EC2 exchange. Callers own center binding, secrets,
 * local persistence and presentation; this function never retries or logs.
 */
export async function exchangeGovernance(
  options: PublicHealthOptions,
  input: unknown,
): Promise<GovernanceOutcome> {
  let body: Buffer
  let envelope: unknown
  try {
    const encoded = JSON.stringify(input)
    if (encoded === undefined) throw new TypeError('missing envelope')
    body = Buffer.from(encoded)
    envelope = JSON.parse(encoded)
  } catch {
    throw new GovernanceClientConfigurationError('governance envelope cannot be encoded')
  }
  if (
    !record(envelope) ||
    envelope['protocolVersion'] !== '3' ||
    !fixedSchemas().Envelope(envelope)
  ) {
    throw new GovernanceClientConfigurationError('governance envelope does not conform to EC2')
  }
  const operation = envelope['operation']
  const payload = envelope['payload']
  const response = await sendRequest(options, body)
  if (response.kind === 'unavailable') return response
  const { sendAttempted } = response
  if (response.body.equals(VERSION_MISMATCH))
    return { kind: 'entry-answer', answer: 'version-mismatch', sendAttempted }
  if (response.status !== 200)
    return { kind: 'unavailable', reason: 'response-invalid', sendAttempted }
  const read = readReplyJson(response.body)
  if (read.kind !== 'value')
    return {
      kind: 'unavailable',
      reason: read.kind === 'limit' ? 'response-limit' : 'response-invalid',
      sendAttempted,
    }
  const reply = read.value
  if (!fixedSchemas().Exchange({ operation, reply }))
    return { kind: 'unavailable', reason: 'response-invalid', sendAttempted }
  if (reply === 'login-state-rejected' || reply === 'invalid-input' || reply === 'unavailable')
    return { kind: 'entry-answer', answer: reply, sendAttempted }
  if (!record(reply)) return { kind: 'unavailable', reason: 'response-invalid', sendAttempted }
  if ('result' in reply) {
    // EC2 OG34 has two request-dependent branches sharing one route identifier.
    if (
      operation === 'capability.organization-governance/v2#S-34' &&
      record(payload) &&
      Array.isArray(payload['organizations'])
    ) {
      const one = payload['organizations'].length === 1
      if (one ? !Array.isArray(reply['result']) : typeof reply['result'] !== 'boolean')
        return { kind: 'unavailable', reason: 'response-invalid', sendAttempted }
    }
    return { kind: 'reply', reply: { result: reply['result'] }, sendAttempted }
  }
  if (typeof reply['failure'] === 'string')
    return { kind: 'reply', reply: { failure: reply['failure'] }, sendAttempted }
  return { kind: 'unavailable', reason: 'response-invalid', sendAttempted }
}
