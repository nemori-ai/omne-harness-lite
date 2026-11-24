// @vitest-environment happy-dom
import './fixtures/dom.ts'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { EMPTY_CONTENT, mergeHistory } from '../src/model/content.ts'
import { conversationItems } from '../src/model/conversation.ts'
import { ItemView } from '../src/view/parts.tsx'
import { messageEntry } from './fixtures/frames.ts'

afterEach(cleanup)

const visibility = { toHuman: true, toModel: true }
const origin = { name: 'skill:review', layer: 'tenant', version: '3', digest: 'd' }

it('a named text is drawn folded under its name, and the person opens it to read the body; their own words stay as they are', () => {
  const said = messageEntry('1', '1', 'user', [
    { kind: 'text', id: 'a', visibility, text: '帮我用 /review 看一下' },
    { kind: 'text', id: 'b', visibility, text: '先读改动，再说哪里不对。', origin },
  ])
  const items = conversationItems(mergeHistory(EMPTY_CONTENT, [said]), false)
  render(
    <>
      {items.map(item => (
        <ItemView key={item.key} item={item} />
      ))}
    </>,
  )
  expect(screen.getByText('帮我用 /review 看一下')).toBeTruthy()
  const fold = screen.getByRole('button', { name: /引用了 skill:review/u })
  expect(fold.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(fold)
  expect(fold.getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByText('先读改动，再说哪里不对。')).toBeTruthy()
})
