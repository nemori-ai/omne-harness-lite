// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DotPager, type PagerDot } from '../src/index.ts'

const thrown: unknown[] = []
const keep = (event: ErrorEvent) => thrown.push(event.error)

beforeEach(() => {
  thrown.length = 0
  window.addEventListener('error', keep)
})

afterEach(() => {
  window.removeEventListener('error', keep)
  cleanup()
  expect(thrown).toEqual([])
})

const DOTS: readonly PagerDot[] = [
  { key: 'a', label: '第 1 题：答好了，还没提交', mark: 'filled', controls: 'panel-a' },
  { key: 'b', label: '第 2 题：还没答', mark: 'waiting', controls: 'panel-b' },
  { key: 'c', label: '第 3 题：没有记上', mark: 'failed', controls: 'panel-c' },
  { key: 'd', label: '第 4 题：已关闭', mark: 'quiet', controls: 'panel-d' },
]

function Pager({
  start = 'b',
  onChange = () => undefined,
}: {
  readonly start?: string
  readonly onChange?: (key: string) => void
}) {
  const [current, setCurrent] = useState(start)
  return (
    <DotPager
      label="这张纸上的题"
      dots={DOTS}
      current={current}
      onCurrentChange={key => {
        setCurrent(key)
        onChange(key)
      }}
      previousLabel="上一题"
      nextLabel="下一题"
    />
  )
}

const dots = () => screen.getAllByRole('tab')

it('is one tab list: a dot for each item in order, named by its label, its mark as data, the current one selected and the one tab stop', () => {
  render(<Pager />)
  screen.getByRole('tablist', { name: '这张纸上的题' })
  expect(dots().map(dot => dot.getAttribute('aria-label'))).toEqual(DOTS.map(dot => dot.label))
  expect(dots().map(dot => dot.dataset['mark'])).toEqual(['filled', 'waiting', 'failed', 'quiet'])
  expect(dots().map(dot => dot.getAttribute('aria-selected'))).toEqual([
    'false',
    'true',
    'false',
    'false',
  ])
  expect(dots().map(dot => dot.tabIndex)).toEqual([-1, 0, -1, -1])
  expect(dots().map(dot => dot.dataset['state'])).toEqual([
    'inactive',
    'active',
    'inactive',
    'inactive',
  ])
  expect(dots().map(dot => dot.getAttribute('aria-controls'))).toEqual([
    'panel-a',
    'panel-b',
    'panel-c',
    'panel-d',
  ])
})

it('goes to the item whose dot is pressed', () => {
  const onChange = vi.fn()
  render(<Pager onChange={onChange} />)
  fireEvent.click(screen.getByRole('tab', { name: '第 4 题：已关闭' }))
  expect(onChange).toHaveBeenLastCalledWith('d')
  expect(screen.getByRole('tab', { name: '第 4 题：已关闭' }).getAttribute('aria-selected')).toBe(
    'true',
  )
})

it('moves with the arrow keys, Home and End while a dot has focus, and takes the focus along', () => {
  render(<Pager />)
  const second = screen.getByRole('tab', { name: '第 2 题：还没答' })
  second.focus()
  expect(fireEvent.keyDown(second, { key: 'Tab' })).toBe(true)
  expect(fireEvent.keyDown(second, { key: 'a' })).toBe(true)
  expect(document.activeElement).toBe(second)
  expect(fireEvent.keyDown(second, { key: 'ArrowRight' })).toBe(false)
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: '第 3 题：没有记上' }))
  expect(document.activeElement?.getAttribute('aria-selected')).toBe('true')
  fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' })
  expect(document.activeElement).toBe(second)
  expect(second.getAttribute('aria-selected')).toBe('true')
  fireEvent.keyDown(document.activeElement as Element, { key: 'End' })
  expect(document.activeElement?.getAttribute('aria-label')).toBe('第 4 题：已关闭')
  fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' })
  expect(document.activeElement?.getAttribute('aria-label')).toBe('第 4 题：已关闭')
  fireEvent.keyDown(document.activeElement as Element, { key: 'Home' })
  expect(document.activeElement?.getAttribute('aria-label')).toBe('第 1 题：答好了，还没提交')
  fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' })
  expect(document.activeElement?.getAttribute('aria-label')).toBe('第 1 题：答好了，还没提交')
  expect(document.activeElement?.getAttribute('aria-selected')).toBe('true')
})

it('steps with the two arrow buttons; at an end its button says it cannot go and keeps the focus', () => {
  const onChange = vi.fn()
  render(<Pager start="c" onChange={onChange} />)
  const next = screen.getByRole('button', { name: '下一题' })
  const previous = screen.getByRole('button', { name: '上一题' })
  fireEvent.click(next)
  expect(onChange).toHaveBeenLastCalledWith('d')
  expect(next.getAttribute('aria-disabled')).toBe('true')
  next.focus()
  fireEvent.click(next)
  expect(onChange).toHaveBeenCalledTimes(1)
  expect(document.activeElement).toBe(next)
  fireEvent.click(previous)
  fireEvent.click(previous)
  fireEvent.click(previous)
  expect(onChange).toHaveBeenLastCalledWith('a')
  expect(previous.getAttribute('aria-disabled')).toBe('true')
  expect(next.getAttribute('aria-disabled')).toBe(null)
})
