// @vitest-environment happy-dom
import './fixtures/dom.ts'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { EMPTY_CONTENT, mergeHistory, type Live, type WireEntry } from '../src/model/content.ts'
import { conversationItems, type Item, type Part } from '../src/model/conversation.ts'
import { ItemView } from '../src/view/parts.tsx'
import {
  messageEntry,
  plainEntry,
  toolCallBlock,
  toolResultEntry,
  userEntry,
} from './fixtures/frames.ts'
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

function itemsOf(entries: readonly WireEntry[], runActive = false): readonly Item[] {
  return conversationItems(mergeHistory(EMPTY_CONTENT, entries), runActive)
}

function first(items: readonly Item[], kind: Item['kind']): Item {
  const item = items.find(found => found.kind === kind)
  if (item === undefined) throw new Error(`no ${kind}`)
  return item
}

function liveOf(content: string, value: string): Live {
  return {
    cursor: '1',
    revision: '1',
    phase: 'output',
    anchor: '0',
    blocks: [{ kind: 'growing', index: '0', mode: 'append', content, value }],
  }
}

/** The one line a process part draws: the fold's button. */
const line = (name: RegExp) => screen.getByRole('button', { name })
const word = (button: HTMLElement) => button.querySelector('[data-state-word], .omne-process-word')

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

it('工具调用是一行过程行：图标、等宽的工具名、状态词；收着，不在气泡里，不是卡', () => {
  render(<ItemView item={first(itemsOf([TOOL_CALL_ENTRY], true), 'message')} />)
  const button = line(/Read/)
  expect(button.getAttribute('aria-expanded')).toBe('false')
  expect(button.querySelectorAll('svg').length).toBe(2)
  expect(button.querySelector('code.omne-process-name')?.textContent).toBe('Read')
  expect(word(button)?.getAttribute('data-state-word')).toBe('working')
  expect(word(button)?.textContent).toBe('处理中')
  const bubble = document.querySelector('.omne-message-body')
  expect(bubble?.textContent).toBe('我去读一下。')
  expect(bubble?.contains(button)).toBe(false)
  expect(document.querySelector('.omne-card, [data-slot="status-pill"]')).toBeNull()
})

it('状态词：有结果是「已完成」；这一轮结束而没有结果写「没有结果」，中性，不是共用件的词', () => {
  const call = messageEntry('1', '1', 'assistant', [toolCallBlock('c1', 'Shell', { script: 'ls' })])
  const done = itemsOf([call, toolResultEntry('2', '2', 'c1', 'a.txt\nb.txt')])
  const view = render(<ItemView item={first(done, 'message')} />)
  expect(word(line(/Shell/))?.getAttribute('data-state-word')).toBe('completed')
  expect(word(line(/Shell/))?.textContent).toBe('已完成')
  view.unmount()
  render(<ItemView item={first(itemsOf([call]), 'message')} />)
  const none = word(line(/Shell/))
  expect(none?.textContent).toBe('没有结果')
  expect(none?.hasAttribute('data-state-word')).toBe(false)
  expect(none?.getAttribute('data-tone')).toBeNull()
})

it('展开：参数是事实表，名与值；嵌套的值写成一行摘要，空对象不写，看不到内部的树', () => {
  const call = messageEntry('1', '1', 'assistant', [
    toolCallBlock('c1', 'Read', {
      path: 'notes/todo.md',
      limit: 20,
      range: { from: 1, tags: ['a', true, null], extra: {} },
      options: {},
    }),
  ])
  render(<ItemView item={first(itemsOf([call]), 'message')} />)
  fireEvent.click(line(/Read/))
  expect(line(/Read/).getAttribute('aria-expanded')).toBe('true')
  const facts = screen.getByLabelText('参数')
  expect(facts.tagName).toBe('DL')
  const rows = [...facts.querySelectorAll('dt')].map(term => [
    term.textContent,
    term.nextElementSibling?.textContent,
  ])
  expect(rows).toEqual([
    ['path', 'notes/todo.md'],
    ['limit', '20'],
    ['range', '{"from":1,"tags":["a",true,null]}'],
  ])
  const nested = facts.querySelector('[data-nested]')
  expect(nested?.getAttribute('title')).toBe('{"from":1,"tags":["a",true,null]}')
  expect(facts.querySelector('ul, dl dl')).toBeNull()
  expect(facts.textContent).not.toContain('entries')
  expect(facts.textContent).not.toContain('lexeme')
})

it('展开：结果在代码面里；没有裸的 pre', () => {
  const call = messageEntry('1', '1', 'assistant', [toolCallBlock('c1', 'Shell', { script: 'ls' })])
  render(
    <ItemView
      item={first(itemsOf([call, toolResultEntry('2', '2', 'c1', 'a.txt\nb.txt')]), 'message')}
    />,
  )
  fireEvent.click(line(/Shell/))
  const surfaces = [...document.querySelectorAll('.code-surface')]
  expect(surfaces.map(surface => surface.querySelector('.code-surface-name')?.textContent)).toEqual(
    ['结果'],
  )
  expect(surfaces[0]?.querySelector('pre')?.textContent).toBe('a.txt\nb.txt')
  expect([...document.querySelectorAll('pre')].every(pre => pre.closest('.code-surface'))).toBe(
    true,
  )
})

it('参数还没生成完：代码面里是原文，旁边一个中性的「还在生成」', () => {
  const items = conversationItems(
    { ...EMPTY_CONTENT, live: liveOf('tool-arguments', '{"pa') },
    true,
  )
  render(<ItemView item={first(items, 'message')} />)
  const button = line(/名字还没生成/)
  expect(word(button)?.getAttribute('data-state-word')).toBe('working')
  fireEvent.click(button)
  expect(document.querySelector('.code-surface pre')?.textContent).toBe('{"pa')
  const note = document.querySelector('.omne-process-note')
  expect(note?.textContent).toBe('还在生成')
  expect(note?.getAttribute('data-tone')).toBeNull()
})

it('提问的调用画法相同：一行过程行，不能作答，没有选项按钮，不建议点停止', () => {
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
  render(<ItemView item={first(itemsOf([ask]), 'message')} />)
  expect(line(/Ask/).querySelector('code.omne-process-name')?.textContent).toBe('Ask')
  expect(word(line(/Ask/))?.textContent).toBe('没有结果')
  expect(screen.queryByRole('region', { name: '问题卡' })).toBeNull()
  expect(screen.queryByRole('radio')).toBeNull()
  expect(screen.getAllByRole('button').length).toBe(1)
  expect(document.body.textContent).not.toContain('停止')
})

it('推理是一行过程行：图标、「推理」、状态词；展开是弱墨的阅读字；只有还在写的那一段是「思考中」', () => {
  const thought = messageEntry('1', '1', 'assistant', [
    { kind: 'thinking', id: 'k', visibility, text: '先看看文件。' },
    { kind: 'text', id: 'b', visibility, text: '看好了。' },
  ])
  const view = render(<ItemView item={first(itemsOf([thought]), 'message')} />)
  const button = line(/推理/)
  expect(button.querySelectorAll('svg').length).toBe(2)
  expect(word(button)?.getAttribute('data-state-word')).toBe('completed')
  expect(button.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(button)
  const reading = document.querySelector('.omne-process-reading')
  expect(reading?.textContent).toContain('先看看文件。')
  expect(reading?.closest('.omne-message-body')).toBeNull()
  view.unmount()
  const live = conversationItems({ ...EMPTY_CONTENT, live: liveOf('thinking', '想') }, true)
  render(<ItemView item={first(live, 'message')} />)
  expect(word(line(/推理/))?.getAttribute('data-state-word')).toBe('thinking')
})

const noteEntry = (entryId: string, kind: string, text: string): WireEntry =>
  plainEntry(entryId, entryId, kind, {
    kind,
    message: {
      id: `m${entryId}`,
      role: 'system',
      blocks: [{ kind: 'text', id: 'b', visibility, text }],
    },
  })

it('系统提醒展开后是几行弱墨的「名：值」，不出给模型的原文；嵌套的值写一行摘要', () => {
  const reminder = [
    'Runtime context: the current values. They hold from here until a later runtime context reminder changes them.',
    '<block key="session.model" revision="3">',
    '"gpt-6"',
    '</block>',
    '<block key="workspace.root" revision="1">',
    '{"files":3,"path":"/w"}',
    '<previous>{"files":2,"path":"/w"}</previous>',
    '</block>',
  ].join('\n')
  const items = itemsOf([
    noteEntry('1', 'message.system_reminder', reminder),
    noteEntry('2', 'message.tool_internal', '{"limit":20,"range":{"from":1}}'),
  ])
  const notes = items.filter(item => item.kind === 'note')
  render(
    <>
      {notes.map(item => (
        <ItemView key={item.key} item={item} />
      ))}
    </>,
  )
  const unfold = (name: RegExp) => {
    const button = line(name)
    fireEvent.click(button)
    return document.getElementById(button.getAttribute('aria-controls') ?? '')!
  }
  const rows = (region: HTMLElement) =>
    [...region.querySelectorAll('.omne-process-fact')].map(row => row.textContent)
  const told = unfold(/系统提醒/)
  expect(told.textContent).not.toMatch(/<block|<previous|Runtime context|"gpt-6"/)
  expect(rows(told)).toEqual(['session.model：gpt-6', 'workspace.root：{"files":3,"path":"/w"}'])
  expect(told.querySelector('[data-nested]')?.getAttribute('title')).toBe('{"files":3,"path":"/w"}')
  const internal = unfold(/内部工具消息/)
  expect(internal.textContent).not.toContain('{"limit":20')
  expect(rows(internal)).toEqual(['limit：20', 'range：{"from":1}'])
})

it('系统提醒与内部工具消息：最轻的过程行，缺省收着，没有图标也没有状态词', () => {
  const items = itemsOf([
    userEntry('1', '1', '在吗', 'msg_a'),
    plainEntry('2', '2', 'message.system_reminder', {
      kind: 'message.system_reminder',
      message: {
        id: 'm2',
        role: 'system',
        blocks: [{ kind: 'text', id: 'b', visibility, text: '提醒的正文' }],
      },
    }),
  ])
  render(<ItemView item={first(items, 'note')} />)
  const button = line(/系统提醒/)
  expect(button.getAttribute('aria-expanded')).toBe('false')
  expect(button.querySelectorAll('svg').length).toBe(1)
  expect(word(button)).toBeNull()
  expect(button.closest('.omne-process')?.getAttribute('data-weight')).toBe('light')
  const region = document.getElementById(button.getAttribute('aria-controls') ?? '')
  expect(region?.querySelector('[data-expand-content]')?.getAttribute('aria-hidden')).toBe('true')
  expect(within(region!).getByText('提醒的正文', { exact: false })).toBeTruthy()
})
