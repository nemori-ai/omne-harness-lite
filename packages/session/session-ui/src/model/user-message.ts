// The `message` of a `send-input` body, built in the page. Same value as `userTextMessage` of
// `packages/access/sdk/src/user-message.ts`, which uses `node:crypto` and so cannot run here: the
// message and block identities derive from the SHA-256 of the input identity, as base64url. A
// retry or a confirmation that keeps the input identity and the text sends the same content.
import type { BodyOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import { toTree } from './plain.ts'

export type UserMessage = BodyOf<SessionProtocol['operations']['send-input']>['message']

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

/** The digest both identities derive from. */
export async function inputDigest(inputId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(inputId))
  return base64url(new Uint8Array(digest))
}

/** The id of the message `userTextMessage` builds for this input: `msg_` and the digest. */
export async function userMessageId(inputId: string): Promise<string> {
  return `msg_${await inputDigest(inputId)}`
}

/** A user message with one text block, visible to the person and the model. */
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
