// The page builds the `send-input` message with WebCrypto; the SDK builds it with `node:crypto`.
// Both must give the same tree for the same input, field by field.
import { userTextMessage as sdkUserTextMessage } from '@omne-harness/sdk'
import { expect, it } from 'vitest'
import { userMessageId, userTextMessage } from '../src/model/user-message.ts'

it('U1 同样的 (text, inputId) 得到与 sdk 的 userTextMessage 相同的值树', async () => {
  for (const [text, inputId] of [
    ['你好', '0b9f3c1e-2d0a-4a43-9a43-0e0c7c8f0a11'],
    ['-- multi\nline --', 'input-9'],
  ] as const) {
    expect(await userTextMessage(text, inputId)).toEqual(sdkUserTextMessage(text, inputId))
  }
})

it('U2 消息编号与值树里的 id 相同', async () => {
  const tree = await userTextMessage('x', 'input-1')
  const id = tree.entries.find(entry => entry.key === 'id')?.value
  expect(id).toEqual({ kind: 'string', value: await userMessageId('input-1') })
})
