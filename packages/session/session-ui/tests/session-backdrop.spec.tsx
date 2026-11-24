// @vitest-environment happy-dom
import { act, cleanup } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { BackdropDrawing } from '../src/parts.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { mountModule } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

afterEach(cleanup)

const layer = () => document.querySelector('.omne-session-backdrop')

it('with nothing drawn the page has no backdrop layer at all', async () => {
  await mountModule(createFakeClient().client, TENANT)
  expect(document.querySelector('.omne-session-page')).not.toBeNull()
  expect(layer()).toBeNull()
})

it('a drawing put on the backdrop lies in a layer under the page that is not read out, is told whether no session is open, and goes when withdrawn', async () => {
  const mounted = await mountModule(createFakeClient().client, TENANT)
  const seen: BackdropDrawing[] = []
  const withdraw = mounted.shell.putRender<BackdropDrawing>('session.backdrop', given => {
    seen.push(given.props)
    return <div {...given.part} data-drawn="sea" />
  })
  act(() => mounted.rerender(TENANT))
  expect(layer()?.getAttribute('aria-hidden')).toBe('true')
  expect(layer()?.parentElement?.classList.contains('omne-session-page')).toBe(true)
  expect(layer()?.querySelector('[data-drawn="sea"]')?.getAttribute('data-omne-part')).toBe(
    'session.backdrop',
  )
  expect(seen.at(-1)).toEqual({ empty: true })
  act(() => {
    withdraw()
    mounted.rerender(TENANT)
  })
  expect(layer()).toBeNull()
})
