// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { ChoiceList, ChoiceRow } from '../src/index.ts'

beforeAll(() => {
  Object.assign(Element.prototype, {
    scrollIntoView: () => undefined,
    animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
  })
})

afterEach(cleanup)

function Rows({
  onChange = () => undefined,
  disabled = false,
}: {
  readonly onChange?: (value: string) => void
  readonly disabled?: boolean
}) {
  const [value, setValue] = useState<string | undefined>(undefined)
  return (
    <ChoiceList
      label="作答"
      value={value}
      disabled={disabled}
      onValueChange={next => {
        setValue(next)
        onChange(next)
      }}
    >
      <ChoiceRow value="main" label="主干" description="从主干发布。" />
      <ChoiceRow value="next" label="下一版" disabled />
      <ChoiceRow value="words" label="用自己的话回答">
        <textarea aria-label="你的话" data-control="field" />
      </ChoiceRow>
      <ChoiceRow value="skip" label="不回答这一题" />
    </ChoiceList>
  )
}

const row = (name: string) => screen.getByRole('radio', { name })

it('is one radio group: no row is chosen or focused at first, and the first row it can take is the one tab stop', () => {
  render(<Rows />)
  const group = screen.getByRole('radiogroup', { name: '作答' })
  const rows = screen.getAllByRole('radio')
  expect(rows.map(each => each.getAttribute('aria-checked'))).toEqual([
    'false',
    'false',
    'false',
    'false',
  ])
  expect(group.contains(document.activeElement)).toBe(false)
  expect(rows.map(each => each.tabIndex)).toEqual([0, -1, -1, -1])
})

it('names a row by its label and describes it by its sentence', () => {
  render(<Rows />)
  const main = row('主干')
  expect(main.getAttribute('aria-describedby')).not.toBeNull()
  expect(document.getElementById(main.getAttribute('aria-describedby')!)?.textContent).toBe(
    '从主干发布。',
  )
})

it('chooses the row that is pressed anywhere on it, and makes it the tab stop', () => {
  const onChange = vi.fn()
  render(<Rows onChange={onChange} />)
  fireEvent.click(screen.getByText('从主干发布。'))
  expect(onChange).toHaveBeenLastCalledWith('main')
  expect(row('主干').getAttribute('aria-checked')).toBe('true')
  expect(row('主干').dataset['selected']).toBe('true')
  fireEvent.click(row('不回答这一题'))
  expect(onChange).toHaveBeenLastCalledWith('skip')
  expect(row('主干').getAttribute('aria-checked')).toBe('false')
  expect(screen.getAllByRole('radio').map(each => each.tabIndex)).toEqual([-1, -1, -1, 0])
})

it('moves among the rows it can take with the arrow keys, around the ends, without choosing', () => {
  const onChange = vi.fn()
  render(<Rows onChange={onChange} />)
  row('主干').focus()
  fireEvent.keyDown(row('主干'), { key: 'ArrowDown' })
  expect(document.activeElement).toBe(row('用自己的话回答'))
  fireEvent.keyDown(row('用自己的话回答'), { key: 'ArrowRight' })
  expect(document.activeElement).toBe(row('不回答这一题'))
  fireEvent.keyDown(row('不回答这一题'), { key: 'ArrowDown' })
  expect(document.activeElement).toBe(row('主干'))
  fireEvent.keyDown(row('主干'), { key: 'ArrowUp' })
  expect(document.activeElement).toBe(row('不回答这一题'))
  fireEvent.keyDown(row('不回答这一题'), { key: 'Home' })
  expect(document.activeElement).toBe(row('主干'))
  fireEvent.keyDown(row('主干'), { key: 'End' })
  expect(document.activeElement).toBe(row('不回答这一题'))
  expect(onChange).not.toHaveBeenCalled()
})

it('chooses the focused row with Enter or Space', () => {
  const onChange = vi.fn()
  render(<Rows onChange={onChange} />)
  fireEvent.keyDown(row('用自己的话回答'), { key: 'Enter' })
  expect(onChange).toHaveBeenLastCalledWith('words')
  fireEvent.keyDown(row('主干'), { key: ' ' })
  expect(onChange).toHaveBeenLastCalledWith('main')
  expect(row('主干').getAttribute('aria-checked')).toBe('true')
})

it('does not take a row that is disabled, nor any row of a disabled list', () => {
  const onChange = vi.fn()
  const view = render(<Rows onChange={onChange} />)
  expect((row('下一版') as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(row('下一版'))
  fireEvent.keyDown(row('下一版'), { key: 'Enter' })
  expect(onChange).not.toHaveBeenCalled()
  view.unmount()
  render(<Rows onChange={onChange} disabled />)
  expect(screen.getAllByRole('radio').every(each => (each as HTMLButtonElement).disabled)).toBe(
    true,
  )
  fireEvent.keyDown(row('主干'), { key: 'Enter' })
  expect(onChange).not.toHaveBeenCalled()
})

it('opens what a row holds below it only while that row is chosen, and leaves its keys alone', () => {
  render(<Rows />)
  const held = () =>
    screen.getByLabelText('你的话', { selector: 'textarea' }).closest('[data-expand]')
  expect(held()?.getAttribute('data-open')).toBe('false')
  fireEvent.click(row('用自己的话回答'))
  expect(held()?.getAttribute('data-open')).toBe('true')
  const words = screen.getByLabelText('你的话', { selector: 'textarea' })
  words.focus()
  fireEvent.keyDown(words, { key: 'ArrowDown' })
  fireEvent.keyDown(words, { key: ' ' })
  expect(document.activeElement).toBe(words)
  expect(row('用自己的话回答').getAttribute('aria-checked')).toBe('true')
  fireEvent.click(row('主干'))
  expect(held()?.getAttribute('data-open')).toBe('false')
})

it('leaves the mark column empty on a row that is not chosen; the chosen row has the ink check on the selected block', () => {
  render(<Rows />)
  const markOf = (name: string) => row(name).querySelector('.omne-choice-mark')!
  const drawn = () =>
    screen
      .getAllByRole('radio')
      .map(each => each.querySelector('.omne-choice-mark')?.innerHTML ?? null)
  expect(drawn()).toEqual(['', '', '', ''])
  const selected = () =>
    document.querySelector<HTMLElement>('[data-glide-highlight="selected"]')?.dataset['shown']
  expect(selected()).toBe('false')
  fireEvent.click(row('主干'))
  expect(markOf('主干').querySelector('svg')?.dataset['icon']).toBe('done')
  expect(markOf('主干').children).toHaveLength(1)
  expect(drawn().slice(1)).toEqual(['', '', ''])
  expect(selected()).toBe('true')
  fireEvent.click(row('不回答这一题'))
  expect(markOf('主干').innerHTML).toBe('')
  expect(markOf('不回答这一题').querySelector('svg')?.dataset['icon']).toBe('done')
})
