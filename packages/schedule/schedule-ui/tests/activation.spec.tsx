// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { scheduleProtocol, type ScheduleProtocol } from '@omne-harness/schedule-protocol'
import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import type { KeyedPointSink, PointItem } from '@omne-harness/shell-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { JSX } from 'react'
import { ACTIVATION_DETAIL_ID, createScheduleUiModule } from '../src/cordis.ts'
import { readActivation } from '../src/model/activation.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { startShell } from './fixtures/reference-shell.ts'

const SERVICE = protocolServiceName({ name: scheduleProtocol.name, major: scheduleProtocol.major })
const OPERATIONS = Object.keys(scheduleProtocol.operations)
const KIND = 'schedule.activation@1'

beforeAll(stubAnimation)
afterEach(cleanup)

async function contributed() {
  const given: { key: string; item: PointItem<string> }[] = []
  const releaseDetail: KeyedPointSink<string> = {
    name: 'human-intervention.release-detail',
    contribute: (_shell, key, item) => void given.push({ key, item }),
  }
  const { root } = await startShell()
  root.reflect.provide(SERVICE, createFakeClient<ClientOf<ScheduleProtocol>>(OPERATIONS).client)
  await root.plugin(createScheduleUiModule({ releaseDetail }))
  return given
}

const draw = (item: PointItem<string>, value: unknown) =>
  render(<>{item.render({ scope: undefined, subject: JSON.stringify(value) }) as JSX.Element}</>)

it('A1 hands the release card a drawing under the activation kind, when the assembly gives the point', async () => {
  const given = await contributed()
  expect(given.map(entry => [entry.key, entry.item.id])).toEqual([[KIND, ACTIVATION_DETAIL_ID]])
})

it('A2 draws what is done, to which schedule, and the next three times', async () => {
  const [entry] = await contributed()
  const view = draw(entry!.item, {
    action: 'create',
    name: '交月报',
    next: { kind: 'times', times: ['2026-11-30 17:00', '2026-12-31 17:00', '2027-01-29 17:00'] },
  })
  expect(view.container.textContent).toContain('新建并生效')
  expect(view.container.textContent).toContain('交月报')
  expect(view.getByLabelText('接下来三次').children).toHaveLength(3)
})

it.each([
  [{ kind: 'none' }, '这一动作之后不再执行。'],
  [{ kind: 'unavailable' }, '接下来几次取不到。'],
])('A3 says so when there are no next times to show: %j', async (next, text) => {
  const [entry] = await contributed()
  const view = draw(entry!.item, { action: 'pause', name: '交月报', next })
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
  JSON.stringify({ action: 'create', name: 'x' }),
])('A4 reads nothing it does not recognise, so the card draws the rows instead: %s', text => {
  expect(readActivation(text)).toBeUndefined()
})

it('A5 throws on a value it cannot read, which the card answers with its rows', async () => {
  const [entry] = await contributed()
  expect(() =>
    render(<>{entry!.item.render({ scope: undefined, subject: '{}' }) as JSX.Element}</>),
  ).toThrow('not a schedule activation')
})
