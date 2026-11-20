// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { createFakeClient } from './fixtures/fake-client.ts'
import { listed, listPage, page } from './fixtures/frames.ts'
import { mountModule } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const LONG = `ses_${'0123456789abcdef'.repeat(4)}`

type SeatProps = ComponentProps<typeof import('@omne-harness/ui-kit').FigureSeat>
const seats = vi.hoisted(() => [] as SeatProps[])

vi.mock('@omne-harness/ui-kit', async importOriginal => {
  const kit = await importOriginal<typeof import('@omne-harness/ui-kit')>()
  return {
    ...kit,
    FigureSeat: (props: SeatProps) => {
      seats.push(props)
      return kit.FigureSeat(props)
    },
  }
})

afterEach(() => {
  cleanup()
  seats.length = 0
})

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

function heading(): HTMLElement {
  const banner = screen.getByRole('region', { name: '对话' }).querySelector('header')
  if (banner === null) throw new Error('no page header')
  return banner
}

it('页头：主标题是列表里的名字，会话标识缩短放在副位置，可以复制整串', async () => {
  const fake = createFakeClient()
  await mountModule(fake.client, TENANT)
  ;(await fake.next('list-sessions')).answer(listPage([listed(LONG, 'say hello')]))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: /say hello/ }))
  await settle()
  ;(await fake.next('read-history')).answer({ outcome: 'succeeded', body: page([], '1') })
  await settle()
  const banner = heading()
  expect(within(banner).getByRole('heading').textContent).toBe('say hello')
  expect(banner.textContent).not.toContain(LONG)
  const id = within(banner).getByTitle(LONG)
  expect(id.textContent).toBe(`${LONG.slice(0, 12)}…`)
  expect(within(banner).getByRole('button', { name: '复制会话标识' })).toBeTruthy()
})

it('页头：会话还不在列表里时，主标题是「新会话」', async () => {
  const fake = createFakeClient()
  await mountModule(fake.client, TENANT)
  ;(await fake.next('list-sessions')).answer(listPage([]))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
  ;(await fake.next('create-session')).answer({
    outcome: 'succeeded',
    body: { session: LONG, recovered: false },
  })
  await settle()
  expect(within(heading()).getByRole('heading').textContent).toBe('新会话')
})

it('对话头：页头里放形的座位，名字 header、优先级 2，在标题旁；还没有租户、还没有会话时也在', async () => {
  const fake = createFakeClient()
  const { rerender } = await mountModule(fake.client, undefined)
  const seat = () => heading().querySelector('[data-figure-seat]')
  expect(seat()?.getAttribute('data-figure-seat')).toBe('header')
  rerender(TENANT)
  ;(await fake.next('list-sessions')).answer(listPage([]))
  await settle()
  expect(within(heading()).getByRole('heading').textContent).toBe('还没有会话')
  expect(seat()?.getAttribute('data-figure-seat')).toBe('header')
  expect(seats.length).toBeGreaterThan(0)
  expect(seats.every(props => props.name === 'header' && props.priority === 2)).toBe(true)
  expect(seat()?.closest('.omne-session-figure')?.textContent).toBe('Agent')
  expect(seat()?.closest('.omne-session-heading')).toBeNull()
})
