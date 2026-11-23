// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { scheduleProtocol, type ScheduleProtocol } from '@omne-harness/schedule-protocol'
import type { KeyRender, RenderPointSink } from '@omne-harness/shell-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import type { JSX } from 'react'
import { createScheduleUiModule } from '../src/cordis.ts'
import { readActivation } from '../src/model/activation.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { startShell } from './fixtures/reference-shell.ts'

const OPERATIONS = Object.keys(scheduleProtocol.operations)
const KIND = 'schedule.activation@1'

beforeAll(stubAnimation)
afterEach(cleanup)

async function contributed() {
  const given: { key: string; render: KeyRender<string> }[] = []
  const releaseDetail: RenderPointSink<string> = {
    name: 'human-intervention.release-detail',
    put: (_shell, key, render) => {
      given.push({ key, render })
      return () => undefined
    },
  }
  const { root } = await startShell()
  await serveProtocol(
    root,
    scheduleProtocol,
    createFakeClient<ClientOf<ScheduleProtocol>>(OPERATIONS).client,
  )
  await root.plugin(createScheduleUiModule({ releaseDetail }))
  return given
}

const drawn = (put: KeyRender<string>, subject: string) =>
  put({ scope: undefined, subject, generic: () => null }) as JSX.Element

const draw = (put: KeyRender<string>, value: unknown) =>
  render(<>{drawn(put, JSON.stringify(value))}</>)

it('A1 hands the release card a drawing under the activation kind, when the assembly gives the point', async () => {
  const given = await contributed()
  expect(given.map(entry => entry.key)).toEqual([KIND])
})

it('A2 draws what is done, to which schedule, and the next three times', async () => {
  const [entry] = await contributed()
  const view = draw(entry!.render, {
    action: 'create',
    name: '交月报',
    next: { kind: 'times', times: ['2026-11-30 17:00', '2026-12-31 17:00', '2027-01-29 17:00'] },
  })
  expect(view.container.textContent).toContain('新建并生效')
  expect(view.container.textContent).toContain('交月报')
  expect(view.getByLabelText('接下来三次').children).toHaveLength(3)
})

it('A2b puts the activation part on what it draws', async () => {
  const [entry] = await contributed()
  const view = draw(entry!.render, { action: 'create', name: '交月报', next: { kind: 'none' } })
  const on = view.container.querySelectorAll('[data-omne-part="schedule.activation"]')
  expect(on).toHaveLength(1)
  expect(on[0]?.classList.contains('schedule-activation')).toBe(true)
})

it.each([
  [{ kind: 'none' }, '这一动作之后不再执行。'],
  [{ kind: 'unavailable' }, '接下来几次取不到。'],
])('A3 says so when there are no next times to show: %j', async (next, text) => {
  const [entry] = await contributed()
  const view = draw(entry!.render, { action: 'pause', name: '交月报', next })
  expect(view.container.textContent).toContain('暂停')
  expect(view.container.textContent).toContain(text)
})

it.each([
  'not json',
  JSON.stringify([]),
  JSON.stringify({ action: 'delete', name: 'x', next: { kind: 'none' } }),
  JSON.stringify({ action: 'create', name: '', next: { kind: 'none' } }),
  JSON.stringify({ action: 'create', name: 'x', next: { kind: 'times', times: [] } }),
  JSON.stringify({ action: 'create', name: 'x', next: { kind: 'times', times: [1] } }),
  JSON.stringify({ action: 'create', name: 'x', next: { kind: 'soon' } }),
  JSON.stringify({ action: 'create', name: 'x', next: { kind: 'soon', times: ['a'] } }),
  JSON.stringify({ action: 'create', name: 'x', next: { kind: 'times', times: ['a', 1] } }),
  JSON.stringify({ action: 'create', name: 'x', next: null }),
  JSON.stringify({ action: 'create', name: 'x' }),
  'null',
])('A4 reads nothing it does not recognise, so the card draws the rows instead: %s', text => {
  expect(readActivation(text)).toBeUndefined()
})

it('A5 throws on a value it cannot read, which the card answers with its rows', async () => {
  const [entry] = await contributed()
  expect(() => render(<>{drawn(entry!.render, '{}')}</>)).toThrow('not a schedule activation')
})
