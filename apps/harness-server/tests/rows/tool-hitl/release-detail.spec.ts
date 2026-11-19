// @module-tag slow
import { describe, expect, it } from 'vitest'
import type { PoolItem } from '@omne-harness/human-intervention'
import { onReleaseTreeRuns, pollUntil, toolCallsThenText } from '../../support/release-tree.ts'

const SEND_INPUT = 'start: tell me the build passed'
const send = toolCallsThenText(() => [
  {
    id: 'call_send',
    tool: 'Notifications',
    arguments: JSON.stringify({
      command: 'send',
      intent: 'tell the owner the build passed',
      params: { id: 'build-1', title: '构建好了', body: '主干的构建通过了' },
    }),
  },
])

const releaseOf = (items: readonly PoolItem[]) =>
  items.find(item => item.card.question.kind === 'release')

describe('the detail on a release card, on the release tree', () => {
  it(
    'shows what a send would post, and reads the same detail after the server starts again',
    { timeout: 300_000 },
    async () => {
      let session = ''
      let first: PoolItem | undefined
      await onReleaseTreeRuns({ script: send, permission: 'auto_permission' }, [
        async world => {
          session = await world.startSession(SEND_INPUT)
          const cards = await pollUntil(
            'the release card of the send call',
            () => world.cards({ sessionRef: session }),
            value => releaseOf(value) !== undefined,
          )
          first = releaseOf(cards)
          const question = first?.card.question
          if (question?.kind !== 'release') throw new Error('no release card')
          expect(question.target).toMatchObject({ tool: 'Notifications', command: 'send' })
          expect(question.gateTitle).toBe('发送')
          expect(question.detail).toEqual({
            state: 'given',
            rows: [
              { label: '收件人', value: '你' },
              { label: '标题', value: '构建好了' },
              { label: '正文', value: '主干的构建通过了' },
            ],
          })
        },
        async world => {
          const again = releaseOf(await world.cards({ sessionRef: session }))
          expect(again?.card.ref).toEqual(first?.card.ref)
          expect(again?.card.question).toEqual(first?.card.question)
        },
      ])
    },
  )
})
