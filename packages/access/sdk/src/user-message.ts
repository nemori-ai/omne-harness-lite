import { createHash } from 'node:crypto'
import type { SessionRequestBodies } from '@omne-harness/public-contract'

/** The `message` of a `send-input` body: a json-text tree that the message package decodes. */
export type UserMessage = SessionRequestBodies['send-input']['message']

type Node = UserMessage['entries'][number]['value']

const string = (value: string): Node => ({ kind: 'string', value })
const boolean = (value: boolean): Node => ({ kind: 'boolean', value })
const object = (entries: readonly (readonly [string, Node])[]): UserMessage => ({
  kind: 'object',
  entries: entries.map(([key, value]) => ({ key, value })),
})

/**
 * A user message with one text block, visible to the human and the model. The message and block
 * identities come from the input identity, so a retry that keeps the input identity and the text
 * sends the same content and meets the same acceptance.
 */
export function userTextMessage(text: string, inputId: string): UserMessage {
  const digest = createHash('sha256').update(inputId, 'utf8').digest('base64url')
  return object([
    ['id', string(`msg_${digest}`)],
    ['role', string('user')],
    [
      'blocks',
      {
        kind: 'array',
        items: [
          object([
            ['kind', string('text')],
            ['id', string(`blk_${digest}`)],
            [
              'visibility',
              object([
                ['toHuman', boolean(true)],
                ['toModel', boolean(true)],
              ]),
            ],
            ['text', string(text)],
          ]),
        ],
      },
    ],
  ])
}
