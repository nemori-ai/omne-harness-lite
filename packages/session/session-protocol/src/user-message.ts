import type { Codec } from '@omne-harness/public-contract'
import type { SessionProtocol } from './session-protocol.ts'

type SendInputBody =
  SessionProtocol['operations']['send-input']['body'] extends Codec<infer Body> ? Body : never

export type UserMessage = SendInputBody['message']

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

async function inputDigest(inputId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(inputId))
  return base64url(new Uint8Array(digest))
}

const string = (value: string) => ({ kind: 'string', value }) as const
const flag = (value: boolean) => ({ kind: 'boolean', value }) as const
const entry = <const V>(key: string, value: V) => ({ key, value }) as const

export async function userMessageId(inputId: string): Promise<string> {
  return `msg_${await inputDigest(inputId)}`
}

export async function userTextMessage(text: string, inputId: string): Promise<UserMessage> {
  const digest = await inputDigest(inputId)
  const visibility = {
    kind: 'object',
    entries: [entry('toHuman', flag(true)), entry('toModel', flag(true))],
  } as const
  const block = {
    kind: 'object',
    entries: [
      entry('kind', string('text')),
      entry('id', string(`blk_${digest}`)),
      entry('visibility', visibility),
      entry('text', string(text)),
    ],
  } as const
  return {
    kind: 'object',
    entries: [
      entry('id', string(`msg_${digest}`)),
      entry('role', string('user')),
      entry('blocks', { kind: 'array', items: [block] } as const),
    ],
  }
}
