// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { scheduleProtocol, type ScheduleProtocol } from '@omne-harness/schedule-protocol'
import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { createScheduleUiModule } from '../src/cordis.ts'

const scheduleUiModule = createScheduleUiModule()
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { startShell } from './fixtures/reference-shell.ts'

const SERVICE = protocolServiceName({ name: scheduleProtocol.name, major: scheduleProtocol.major })
const OPERATIONS = Object.keys(scheduleProtocol.operations)
const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

beforeAll(stubAnimation)
afterEach(cleanup)

it('M1 the schedule client present: one schedule page, before the calendar and assets pages', async () => {
  const { root, shell } = await startShell()
  root.reflect.provide(SERVICE, createFakeClient<ClientOf<ScheduleProtocol>>(OPERATIONS).client)
  await root.plugin(scheduleUiModule)
  expect(shell.items('pages')).toMatchObject([
    { id: 'schedules', title: '日程', order: 12, icon: 'time' },
  ])
  expect(shell.items('sidebar')).toEqual([])
})

it('M2 the client withdrawn: the page goes with the module; back again: placed again', async () => {
  const { root, shell } = await startShell()
  const client = createFakeClient<ClientOf<ScheduleProtocol>>(OPERATIONS).client
  const unprovide = root.reflect.provide(SERVICE, client)
  await root.plugin(scheduleUiModule)
  unprovide()
  await tick()
  expect(shell.items('pages')).toEqual([])
  root.reflect.provide(SERVICE, client)
  await tick()
  expect(shell.items('pages').map(page => page.id)).toEqual(['schedules'])
})

it('M3 no tenant yet: nothing is drawn and nothing is read', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient<ClientOf<ScheduleProtocol>>(OPERATIONS)
  root.reflect.provide(SERVICE, fake.client)
  await root.plugin(scheduleUiModule)
  const view = render(<>{shell.items('pages')[0]!.render({ scope: undefined })}</>)
  expect(view.container.textContent).toBe('')
  expect(fake.calls).toEqual([])
})

it('M4 a tenant: the page lists the current schedules of that tenant, one page at a time', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient<ClientOf<ScheduleProtocol>>(OPERATIONS)
  root.reflect.provide(SERVICE, fake.client)
  await root.plugin(scheduleUiModule)
  render(<>{shell.items('pages')[0]!.render({ scope: TENANT })}</>)
  const list = await fake.next('list-schedules')
  expect(list.body).toEqual({
    tenant: readTenantText(TENANT),
    control: null,
    terminal: false,
    cursor: null,
    limit: 50,
  })
})
