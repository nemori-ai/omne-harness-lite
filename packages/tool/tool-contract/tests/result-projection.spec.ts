import { describe, expect, it } from 'vitest'
import type { BlockId, ReferenceContentBlock } from '@omne-harness/content-block'
import { projectToolResult } from '@omne-harness/tool-contract'
import { reference, result, text } from './tool-values.ts'

const ids = (...values: string[]) => values as BlockId[]

function image(id: string): ReferenceContentBlock {
  return {
    kind: 'image',
    id: id as BlockId,
    visibility: { toHuman: true, toModel: true },
    ref: reference('media', 'chart.png'),
    transcript: null,
  }
}

describe('projectToolResult', () => {
  it('projectToolResult: keeps model-visible content in order, then one address block per attachment', () => {
    const value = result(
      [text('a', 'Found two files.'), text('h', 'for people only', false), image('c')],
      [reference('workspace', 'logs/run.txt'), reference('workspace', 'out/a b.csv')],
    )
    expect(projectToolResult(value, ids('x1', 'x2'))).toEqual({
      ok: [
        text('a', 'Found two files.'),
        image('c'),
        text('x1', '附件地址（按需读取）：{"storage":"workspace","key":"logs/run.txt"}'),
        text('x2', '附件地址（按需读取）：{"storage":"workspace","key":"out/a b.csv"}'),
      ],
    })
  })

  it('projectToolResult: rejects attachment identities whose count does not match', () => {
    const value = result([text('a', 'ok')], [reference('s', 'one'), reference('s', 'two')])
    expect(projectToolResult(value, ids('x1'))).toEqual({
      failure: { field: 'attachmentBlockIds', reason: 'count' },
    })
    expect(projectToolResult(result([text('a', 'ok')]), ids('x1'))).toEqual({
      failure: { field: 'attachmentBlockIds', reason: 'count' },
    })
  })

  it('projectToolResult: rejects a repeated attachment identity', () => {
    const value = result([text('a', 'ok')], [reference('s', 'one'), reference('s', 'two')])
    expect(projectToolResult(value, ids('x1', 'x1'))).toEqual({
      failure: { field: 'attachmentBlockIds[1]', reason: 'duplicate' },
    })
  })

  it('projectToolResult: rejects an attachment identity that collides with a content block', () => {
    const value = result([text('a', 'ok'), text('h', 'hidden', false)], [reference('s', 'one')])
    expect(projectToolResult(value, ids('h'))).toEqual({
      failure: { field: 'attachmentBlockIds[0]', reason: 'collision' },
    })
  })

  it('projectToolResult: rejects a block that the model message cannot carry', () => {
    const thinking = {
      kind: 'thinking',
      id: 't',
      visibility: { toHuman: true, toModel: true },
      text: 'hm',
    }
    const value = { ...result([]), content: [thinking] }
    expect(projectToolResult(value as never, ids())).toEqual({
      failure: { field: 'content[0]', reason: 'thinking' },
    })
  })

  it('projectToolResult: does not change the result that it projects', () => {
    const value = result([image('c')], [reference('media', 'chart.png')])
    const frozen = Object.freeze({ ...value, content: Object.freeze([...value.content]) })
    const projected = projectToolResult(frozen, ids('x1'))
    if (!('ok' in projected)) throw new Error(projected.failure.field)
    expect(projected.ok[0]).toEqual(image('c'))
    expect(Object.isFrozen(projected.ok)).toBe(true)
  })
})
