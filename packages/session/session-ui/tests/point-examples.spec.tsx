import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { exampleOf, putExample, startShell } from '@omne-harness/shell-contract/testing'
import { sessionBlockRender, sessionToolCall } from '../src/points.ts'

async function declared(point: typeof sessionToolCall | typeof sessionBlockRender) {
  const started = await startShell()
  point.declare(started.shell)
  await putExample(started.shell, point.contract, { React })
  return started.shell
}

describe('the examples of the points the session draws by key', () => {
  it('a card for one tool draws the name and the state of the call', async () => {
    const shell = await declared(sessionToolCall)
    const { key } = exampleOf(sessionToolCall.contract).member
    const subject = {
      session: 's_1',
      call: 'c_1',
      name: key,
      arguments: { query: 'omne' },
      state: 'completed' as const,
      result: '三条结果',
    }
    const drawn = sessionToolCall.draw(shell, key, subject, () => 'generic')
    expect(renderToStaticMarkup(<>{drawn}</>)).toBe(`<div>${key}: completed</div>`)
    expect(sessionToolCall.contract.gives).toContain('the subject (one call of the tool: session;')
  })

  it('a drawing for one kind of block draws around the generic drawing', async () => {
    const shell = await declared(sessionBlockRender)
    const { key } = exampleOf(sessionBlockRender.contract).member
    const subject = { session: 's_1', message: 'm_1', block: 'b_1', content: { kind: key } }
    const drawn = sessionBlockRender.draw(shell, key, subject, () => <img alt="" />)
    expect(renderToStaticMarkup(<>{drawn}</>)).toBe(
      '<figure><img alt=""/><figcaption>b_1</figcaption></figure>',
    )
  })
})
