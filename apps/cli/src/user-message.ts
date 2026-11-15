import { createHash } from 'node:crypto'
import type { BodyOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'

type UserMessage = BodyOf<SessionProtocol['operations']['send-input']>['message']

type Node = UserMessage['entries'][number]['value']

const string = (value: string): Node => ({ kind: 'string', value })
const boolean = (value: boolean): Node => ({ kind: 'boolean', value })
const object = (entries: readonly (readonly [string, Node])[]): UserMessage => ({
  kind: 'object',
  entries: entries.map(([key, value]) => ({ key, value })),
})

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
