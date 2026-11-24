// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComposerDrawing, HeaderDrawing, ListItemDrawing } from '../src/parts.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import { listed, listPage, page } from './fixtures/frames.ts'
import { mountModule } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const SESSION = 'ses_main'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function opened(fake: FakeClient) {
  const mounted = await mountModule(fake.client, TENANT)
  ;(await fake.next('list-sessions')).answer(listPage([listed(SESSION, '会话')]))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '会话' }))
  await settle()
  ;(await fake.next('read-history')).answer({ outcome: 'succeeded', body: page([], '0') })
  await settle()
  return mounted
}

const part = (name: string) => document.querySelector(`[data-omne-part="${name}"]`)

it('with nothing put, the composer, the header and a row of the list are drawn as they shipped', async () => {
  await opened(createFakeClient())
  expect(part('session.composer')?.tagName).toBe('FORM')
  expect(part('session.header')?.tagName).toBe('HEADER')
  expect(part('session.list.item')?.tagName).toBe('BUTTON')
  expect(document.querySelector('[data-drawn]')).toBeNull()
})

it('a drawing put on the composer is told whether a turn runs and whether nothing is written, and wraps the one that shipped', async () => {
  const mounted = await opened(createFakeClient())
  const seen: ComposerDrawing[] = []
  const withdraw = mounted.shell.putRender<ComposerDrawing>('session.composer', given => {
    seen.push(given.props)
    return (
      <div {...given.part} data-drawn="composer">
        {given.builtIn()}
      </div>
    )
  })
  act(() => mounted.rerender(TENANT))
  expect(seen.at(-1)).toEqual({ running: false, empty: true })
  const wrap = document.querySelector('[data-drawn="composer"]')
  expect(wrap?.querySelector('form.omne-composer')).not.toBeNull()
  fireEvent.change(screen.getByRole('textbox', { name: '输入消息' }), {
    target: { value: '你好' },
  })
  expect(seen.at(-1)).toEqual({ running: false, empty: false })
  expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: '输入消息' }).value).toBe('你好')
  act(() => {
    withdraw()
    mounted.rerender(TENANT)
  })
  expect(document.querySelector('[data-drawn="composer"]')).toBeNull()
  expect(part('session.composer')?.tagName).toBe('FORM')
})

it('a drawing put on the header is told the title, and one put on a row of the list its title and whether it is the open one', async () => {
  const mounted = await opened(createFakeClient())
  const headers: HeaderDrawing[] = []
  const rows: ListItemDrawing[] = []
  mounted.shell.putRender<HeaderDrawing>('session.header', given => {
    headers.push(given.props)
    return (
      <div {...given.part} data-drawn="header">
        {given.builtIn()}
      </div>
    )
  })
  mounted.shell.putRender<ListItemDrawing>('session.list.item', given => {
    rows.push(given.props)
    return (
      <span {...given.part} data-drawn="row">
        {given.builtIn()}
      </span>
    )
  })
  act(() => mounted.rerender(TENANT))
  await settle()
  expect(headers.at(-1)).toEqual({ title: '会话' })
  expect(document.querySelector('[data-drawn="header"] header.omne-session-bar')).not.toBeNull()
  expect(rows.at(-1)).toEqual({ title: '会话', selected: true })
  expect(document.querySelector('[data-drawn="row"] button.omne-session-item')).not.toBeNull()
})
