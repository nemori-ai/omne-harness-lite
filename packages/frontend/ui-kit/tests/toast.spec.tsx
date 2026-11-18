// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { ToastItem, ToastStack } from '../src/index.ts'

beforeAll(() => {
  Object.assign(Element.prototype, {
    animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
  })
})

afterEach(cleanup)

it('ToastStack is a named region that holds its toasts in order, and draws nothing when empty', () => {
  const empty = render(<ToastStack label="提示">{[]}</ToastStack>)
  expect(empty.container.innerHTML).toBe('')
  cleanup()
  render(
    <ToastStack label="提示">
      <ToastItem tone="info" title="一" onDismiss={() => undefined} />
      <ToastItem tone="info" title="二" onDismiss={() => undefined} />
    </ToastStack>,
  )
  const region = screen.getByRole('region', { name: '提示' })
  expect([...region.querySelectorAll('[data-toast]')].map(toast => toast.textContent)).toEqual([
    expect.stringContaining('一'),
    expect.stringContaining('二'),
  ])
})

it('ToastItem shows its title and body; attention asks for attention, info stays polite', () => {
  render(
    <>
      <ToastItem
        tone="attention"
        title="审批在等你"
        body="部署到生产"
        onDismiss={() => undefined}
      />
      <ToastItem tone="info" title="已同步" onDismiss={() => undefined} />
    </>,
  )
  const loud = screen.getByRole('alert')
  expect(loud.closest('[data-toast]')?.getAttribute('data-toast')).toBe('attention')
  expect(loud.textContent).toContain('审批在等你')
  expect(loud.textContent).toContain('部署到生产')
  const quiet = screen.getByRole('status')
  expect(quiet.closest('[data-toast]')?.getAttribute('data-toast')).toBe('info')
})

it('ToastItem runs its action and its dismissal', () => {
  const onClick = vi.fn()
  const onDismiss = vi.fn()
  render(
    <ToastItem
      tone="info"
      title="新通知"
      action={{ label: '去看看', onClick }}
      onDismiss={onDismiss}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '去看看' }))
  expect(onClick).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '关闭' }))
  expect(onDismiss).toHaveBeenCalledTimes(1)
})
