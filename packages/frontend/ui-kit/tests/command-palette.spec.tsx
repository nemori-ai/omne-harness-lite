// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { CommandPalette, type PaletteItem } from '../src/index.ts'

beforeAll(() => {
  Object.assign(Element.prototype, {
    scrollIntoView: () => undefined,
    animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
  })
})

afterEach(cleanup)

const ITEMS: readonly PaletteItem[] = [
  { id: 'a.stop', title: '停止这一轮', group: '这一轮', hint: '⌘.' },
  { id: 'a.retry', title: '重试', group: '这一轮', unavailable: '没有可以重试的一轮' },
  { id: 'b.model', title: '换模型', group: '系统命令', hint: '/model', words: '/model' },
]

function Harness({ picked }: { readonly picked: string[] }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <span>{open ? 'open' : 'shut'}</span>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        label="命令面板"
        placeholder="找一条命令"
        items={ITEMS}
        empty="没有对得上的命令"
        onPick={id => picked.push(id)}
      />
    </>
  )
}

const search = () => screen.getByRole('combobox', { name: '找一条命令' })
const titles = () => screen.queryAllByRole('option').map(row => row.firstChild?.textContent)

it('lists every item by its group with its key or its slash form, and filters by title, name and slash form', () => {
  render(<Harness picked={[]} />)
  expect(titles()).toEqual(['停止这一轮', '重试', '换模型'])
  expect(screen.getByText('⌘.').tagName).toBe('KBD')
  fireEvent.change(search(), { target: { value: 'model' } })
  expect(titles()).toEqual(['换模型'])
  fireEvent.change(search(), { target: { value: '停止' } })
  expect(titles()).toEqual(['停止这一轮'])
  fireEvent.change(search(), { target: { value: 'zzz' } })
  expect(titles()).toEqual([])
  expect(screen.getByText('没有对得上的命令')).toBeTruthy()
})

it('moves with the arrows, picks with Enter and shuts; an item that cannot run is grey with its reason and is not picked', () => {
  const picked: string[] = []
  render(<Harness picked={picked} />)
  const retry = screen.getAllByRole('option')[1]!
  expect(retry.getAttribute('aria-disabled')).toBe('true')
  expect(retry.textContent).toContain('没有可以重试的一轮')
  fireEvent.keyDown(search(), { key: 'ArrowDown' })
  expect(screen.getAllByRole('option')[1]!.getAttribute('aria-selected')).toBe('true')
  fireEvent.keyDown(search(), { key: 'Enter' })
  expect(picked).toEqual([])
  expect(screen.getByText('open')).toBeTruthy()
  fireEvent.keyDown(search(), { key: 'ArrowUp' })
  fireEvent.keyDown(search(), { key: 'ArrowUp' })
  expect(screen.getAllByRole('option')[2]!.getAttribute('aria-selected')).toBe('true')
  fireEvent.keyDown(search(), { key: 'Enter' })
  expect(picked).toEqual(['b.model'])
  expect(screen.getByText('shut')).toBeTruthy()
})

it('a click picks too, and composing text is left to the input method', () => {
  const picked: string[] = []
  render(<Harness picked={picked} />)
  fireEvent.keyDown(search(), { key: 'Enter', isComposing: true })
  expect(picked).toEqual([])
  act(() => void fireEvent.mouseDown(screen.getAllByRole('option')[0]!))
  expect(picked).toEqual(['a.stop'])
})
