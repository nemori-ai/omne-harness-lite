import { judgeMessage, originHeader } from '@omne-harness/message'
import { project } from '@omne-harness/request-context-contract'
import { expect, it } from 'vitest'
import { epoch, row, rowWith, text } from './fixtures.js'

it('a named text goes into the model request behind its fixed line, and the stored message keeps it as it was', () => {
  const origin = { name: 'skill:review', layer: 'tenant', version: '3', digest: 'sha-1' }
  const named = { ...text('先读改动。', 'body'), origin }
  const msg = judgeMessage({
    role: 'user',
    id: row().message.id,
    blocks: [text('帮我用 /review 看一下', 'said'), named],
  })
  if ('rejected' in msg) throw new Error(msg.rejected)
  const sent = project([rowWith(0, msg.ok)], epoch).messages[0]?.message
  expect(sent?.blocks).toEqual([
    text('帮我用 /review 看一下', 'said'),
    { ...text(`${originHeader(origin)}先读改动。`, 'body') },
  ])
  expect(msg.ok.blocks[1]).toEqual(named)
})
