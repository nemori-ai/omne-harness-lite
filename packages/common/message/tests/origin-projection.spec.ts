import { judgeMessage, originHeader, projectMessage, type Message } from '@omne-harness/message'
import { describe, expect, it } from 'vitest'

const visibility = { toHuman: true, toModel: true }
const origin = { name: 'skill:review', layer: 'tenant', version: '3', digest: 'sha-1' }
const said = { kind: 'text', id: 'b1', visibility, text: '帮我用 /review 看一下' }
const body = { kind: 'text', id: 'b2', visibility, text: '# 评审\n\n先读改动。', origin }

function message(...blocks: unknown[]): Message {
  const judged = judgeMessage({ id: 'msg_abcdefghijklmnopqrstuv', role: 'user', blocks })
  if (!('ok' in judged)) throw new Error(JSON.stringify(judged))
  return judged.ok
}

describe('a named text on its way to the model', () => {
  it('is kept as it was stored, origin and all', () => {
    expect(message(said, body).blocks).toEqual([said, body])
  })

  it('reaches the model as a plain text block behind one fixed line, and the person sees it as stored', () => {
    const toModel = projectMessage(message(said, body), 'toModel')
    expect(toModel?.message.blocks).toEqual([
      said,
      { kind: 'text', id: 'b2', visibility, text: `${originHeader(origin)}# 评审\n\n先读改动。` },
    ])
    expect(originHeader(origin)).toBe(
      "[skill:review (layer tenant, version 3), named by the person. Its text follows; these are not the person's own words.]\n\n",
    )
    expect(projectMessage(message(said, body), 'toHuman')?.message.blocks).toEqual([said, body])
  })

  it('leaves a message without a named text exactly as before', () => {
    const plain = message(said)
    expect(projectMessage(plain, 'toModel')?.message).toEqual(plain)
  })
})
