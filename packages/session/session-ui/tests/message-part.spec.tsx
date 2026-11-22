// @vitest-environment happy-dom
import './fixtures/dom.ts'
import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it } from 'vitest'
import { EMPTY_CONTENT, mergeHistory } from '../src/model/content.ts'
import { conversationItems } from '../src/model/conversation.ts'
import type { MessageDrawing } from '../src/parts.ts'
import { PartDrawContext } from '../src/view/part-draw.ts'
import { ItemView } from '../src/view/parts.tsx'
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
  expect(seen.map(([part, given]) => [part, given.role, given.live])).toEqual([
    ['session.transcript.user-message', 'user', false],
    ['session.transcript.agent-message', 'assistant', false],
  ])
  expect(document.querySelectorAll('article.omne-message')).toHaveLength(1)
  expect(document.querySelector('[data-drawn="mine"]')?.textContent).toContain('好的')
})
