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

/** What a message carries besides its words: the kind of a medium and the reference to its bytes. */
export type UserAttachment = Readonly<{
  kind: 'image' | 'voice' | 'file'
  ref: Readonly<Record<'storage' | 'key' | 'mediaType' | 'bytes' | 'digest', string>>
}>

const visibility = {
  kind: 'object',
  entries: [entry('toHuman', flag(true)), entry('toModel', flag(true))],
} as const

function referring(id: string, { kind, ref }: UserAttachment) {
  const fields = (['storage', 'key', 'mediaType', 'bytes', 'digest'] as const).map(name =>
    entry(name, string(ref[name])),
  )
  return {
    kind: 'object',
    entries: [
      entry('kind', string(kind)),
      entry('id', string(id)),
      entry('visibility', visibility),
      entry('ref', { kind: 'object', entries: fields } as const),
      entry('transcript', { kind: 'null' } as const),
    ],
  } as const
}

/** The words first, when there are any or nothing else is; then each attachment, in the order given. */
export async function userMessage(
  input: Readonly<{ inputId: string; text: string; attachments: readonly UserAttachment[] }>,
): Promise<UserMessage> {
  const { text, attachments } = input
  const digest = await inputDigest(input.inputId)
  const words = {
    kind: 'object',
    entries: [
      entry('kind', string('text')),
      entry('id', string(`blk_${digest}`)),
      entry('visibility', visibility),
      entry('text', string(text)),
    ],
  } as const
  const referred = attachments.map((each, at) => referring(`blk_${digest}_${String(at + 1)}`, each))
  const items = text !== '' || referred.length === 0 ? [words, ...referred] : referred
  return {
    kind: 'object',
    entries: [
      entry('id', string(`msg_${digest}`)),
      entry('role', string('user')),
      entry('blocks', { kind: 'array', items } as const),
    ],
  }
}

export function userTextMessage(text: string, inputId: string): Promise<UserMessage> {
  return userMessage({ inputId, text, attachments: [] })
}
