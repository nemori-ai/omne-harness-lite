// @vitest-environment happy-dom
import './fixtures/dom.ts'
import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it } from 'vitest'
import { EMPTY_CONTENT, mergeHistory } from '../src/model/content.ts'
import { conversationItems } from '../src/model/conversation.ts'
import type { BubbleDrawing, MessageDrawing } from '../src/parts.ts'
import { PartDrawContext } from '../src/view/part-draw.ts'
import { Bubble, ItemView } from '../src/view/parts.tsx'
import { messageEntry, userEntry } from './fixtures/frames.ts'

afterEach(cleanup)

const visibility = { toHuman: true, toModel: true }
const reply = messageEntry('2', '2', 'assistant', [
  { kind: 'text', id: 't', visibility, text: '好的' },
])
const items = conversationItems(
  mergeHistory(EMPTY_CONTENT, [userEntry('1', '1', '你好'), reply]),
  false,
)

it('with no shell to draw through, a message is drawn as it shipped, carrying the name of its part', () => {
  render(
    <>
      {items.map(item => (
        <ItemView key={item.key} item={item} />
      ))}
    </>,
  )
  const named = Array.from(document.querySelectorAll('article.omne-message')).map(element =>
    element.getAttribute('data-omne-part'),
  )
  expect(named).toEqual(['session.transcript.user-message', 'session.transcript.agent-message'])
})

it('a message is drawn through the shell: by its part, with who spoke, whether it is live and its content, and its own drawing to fall back on', () => {
  const seen: [string, MessageDrawing][] = []
  const drawer = {
    drawn(part: string, builtIn: () => ReactNode, props: unknown): ReactNode {
      const given = props as MessageDrawing
      seen.push([part, given])
      return part.endsWith('agent-message') ? (
        <section data-drawn="mine">{given.content}</section>
      ) : (
        builtIn()
      )
    },
  }
  render(
    <PartDrawContext.Provider value={drawer}>
      {items.map(item => (
        <ItemView key={item.key} item={item} />
      ))}
    </PartDrawContext.Provider>,
  )
  expect(
    seen
      .filter(([part]) => part.endsWith('-message'))
      .map(([part, given]) => [part, given.role, given.live]),
  ).toEqual([
    ['session.transcript.user-message', 'user', false],
    ['session.transcript.agent-message', 'assistant', false],
  ])
  expect(document.querySelectorAll('article.omne-message')).toHaveLength(1)
  expect(document.querySelector('[data-drawn="mine"]')?.textContent).toContain('好的')
})

it('with no shell to draw through, each run of words is a bubble that carries its part and whose words they are', () => {
  render(
    <>
      {items.map(item => (
        <ItemView key={item.key} item={item} />
      ))}
    </>,
  )
  const bubbles = Array.from(document.querySelectorAll('.omne-message-body')).map(element => [
    element.getAttribute('data-omne-part'),
    element.getAttribute('data-role'),
    element.textContent,
  ])
  expect(bubbles).toEqual([
    ['session.transcript.bubble', 'user', '你好'],
    ['session.transcript.bubble', 'assistant', '好的'],
  ])
})

it('a bubble is drawn through the shell by its part, with whose words, whether live and the words, and its own drawing to fall back on', () => {
  const seen: BubbleDrawing[] = []
  const drawer = {
    drawn(part: string, builtIn: () => ReactNode, props: unknown): ReactNode {
      if (part !== 'session.transcript.bubble') return builtIn()
      const given = props as BubbleDrawing
      seen.push(given)
      return given.role === 'assistant' ? (
        <section data-drawn="bubble">{given.content}</section>
      ) : (
        <div data-wrapped="">{builtIn()}</div>
      )
    },
  }
  render(
    <PartDrawContext.Provider value={drawer}>
      {items.map(item => (
        <ItemView key={item.key} item={item} />
      ))}
      <Bubble role="user" live>
        还在写
      </Bubble>
    </PartDrawContext.Provider>,
  )
  expect(seen.map(given => [given.role, given.live])).toEqual([
    ['user', false],
    ['assistant', false],
    ['user', true],
  ])
  expect(document.querySelector('[data-drawn="bubble"]')?.textContent).toBe('好的')
  expect(
    Array.from(document.querySelectorAll('[data-wrapped] > .omne-message-body')).map(element => [
      element.getAttribute('data-role'),
      element.textContent,
    ]),
  ).toEqual([
    ['user', '你好'],
    ['user', '还在写'],
  ])
})
