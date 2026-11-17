// @vitest-environment happy-dom
import './fixtures/dom.ts'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { EMPTY_CONTENT, mergeHistory } from '../src/model/content.ts'
import { conversationItems, type Part } from '../src/model/conversation.ts'
import { ItemView } from '../src/view/parts.tsx'
import { messageEntry } from './fixtures/frames.ts'
import { TOOL_CALL_ENTRY } from './fixtures/tool-call-entry.ts'

afterEach(cleanup)

const visibility = { toHuman: true, toModel: true }

function toolCall(entries = [TOOL_CALL_ENTRY]): Extract<Part, { kind: 'tool-call' }> {
  const items = conversationItems(mergeHistory(EMPTY_CONTENT, entries), false)
  const part = items
    .flatMap(item => ('parts' in item ? item.parts : []))
    .find(found => found.kind === 'tool-call')
  if (part?.kind !== 'tool-call') throw new Error('no tool call')
  return part
}

it('服务端写出的参数是内部的树：界面模型把它转成普通的值', () => {
  expect(toolCall().arguments).toEqual({
    path: 'notes/todo.md',
    limit: 20,
    range: { from: 1, tags: ['a', true, null] },
  })
})

it('参数不是那棵树：原样当普通的值', () => {
  const entry = messageEntry('1', '1', 'assistant', [
    { kind: 'tool_call', id: 't', visibility, callId: 'c', name: 'X', arguments: { kind: 'odd' } },
  ])
  expect(toolCall([entry]).arguments).toEqual({ kind: 'odd' })
})

it('提问的调用画成普通的工具卡：不能作答，没有选项按钮，不建议点停止；这一轮结束而没有结果写「没有结果」', () => {
  const ask = messageEntry('1', '1', 'assistant', [
    {
      kind: 'tool_call',
      id: 't',
      visibility,
      callId: 'q1',
      name: 'Ask',
      arguments: { command: 'ask', params: { questions: [{ title: '选哪个？', options: [] }] } },
    },
  ])
  const items = conversationItems(mergeHistory(EMPTY_CONTENT, [ask]), false)
  const message = items.find(item => item.kind === 'message')
  if (message === undefined) throw new Error('no message')
  render(<ItemView item={message} />)
  expect(screen.getByRole('button', { name: /工具 Ask/ })).toBeTruthy()
  expect(screen.getByText('没有结果')).toBeTruthy()
  expect(screen.queryByRole('region', { name: '问题卡' })).toBeNull()
  expect(screen.queryByRole('radio')).toBeNull()
  expect(document.body.textContent).not.toContain('停止')
})

it('工具卡显示参数名与值，嵌套的值缩进一层，看不到内部的树', () => {
  const items = conversationItems(mergeHistory(EMPTY_CONTENT, [TOOL_CALL_ENTRY]), false)
  const message = items.find(item => item.kind === 'message')
  if (message === undefined) throw new Error('no message')
  render(<ItemView item={message} />)
  fireEvent.click(screen.getByRole('button', { name: /工具/ }))
  const list = screen.getByRole('list', { name: '参数' })
  const rows = [...list.children].map(row => row.textContent)
  expect(rows[0]).toBe('pathnotes/todo.md')
  expect(rows[1]).toBe('limit20')
  const nested = screen.getByRole('list', { name: 'range' })
  expect(nested.closest('[aria-label="参数"]')).toBe(list)
  expect(nested.parentElement?.closest('ul')).toBe(list)
  expect([...nested.children].map(row => row.textContent)).toEqual(['from1', 'tags0a1true2null'])
  expect(list.textContent).not.toContain('entries')
  expect(list.textContent).not.toContain('lexeme')
})
