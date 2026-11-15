import type { BodyOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import { toTree } from './plain.ts'

export type UserMessage = BodyOf<SessionProtocol['operations']['send-input']>['message']

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export async function inputDigest(inputId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(inputId))
  return base64url(new Uint8Array(digest))
}

export async function userMessageId(inputId: string): Promise<string> {
  return `msg_${await inputDigest(inputId)}`
}

export async function userTextMessage(text: string, inputId: string): Promise<UserMessage> {
  const digest = await inputDigest(inputId)
  return toTree({
    id: `msg_${digest}`,
    role: 'user',
    blocks: [
      {
        kind: 'text',
        id: `blk_${digest}`,
        visibility: { toHuman: true, toModel: true },
        text,
      },
    ],
  }) as UserMessage
}
