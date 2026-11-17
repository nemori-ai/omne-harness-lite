// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { calendarProtocol, type CalendarProtocol } from '@omne-harness/calendar-protocol'
import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { calendarUiModule } from '../src/cordis.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { startShell } from './fixtures/reference-shell.ts'

const SERVICE = protocolServiceName({ name: calendarProtocol.name, major: calendarProtocol.major })
const OPERATIONS = Object.keys(calendarProtocol.operations)
const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

beforeAll(stubAnimation)
afterEach(cleanup)

it('M1 the calendar client present: one calendar page, before the assets page', async () => {
  const { root, shell } = await startShell()
  root.reflect.provide(SERVICE, createFakeClient<ClientOf<CalendarProtocol>>(OPERATIONS).client)
  await root.plugin(calendarUiModule)
  expect(shell.items('pages')).toMatchObject([{ id: 'calendar', title: '日历', order: 13 }])
  expect(shell.items('sidebar')).toEqual([])
})

it('M2 the client withdrawn: the page goes with the module; back again: placed again', async () => {
  const { root, shell } = await startShell()
  const client = createFakeClient<ClientOf<CalendarProtocol>>(OPERATIONS).client
  const unprovide = root.reflect.provide(SERVICE, client)
  await root.plugin(calendarUiModule)
  unprovide()
  await tick()
  expect(shell.items('pages')).toEqual([])
  root.reflect.provide(SERVICE, client)
  await tick()
  expect(shell.items('pages').map(page => page.id)).toEqual(['calendar'])
})

it('M3 no tenant yet: nothing is drawn and nothing is read', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient<ClientOf<CalendarProtocol>>(OPERATIONS)
  root.reflect.provide(SERVICE, fake.client)
  await root.plugin(calendarUiModule)
  const view = render(<>{shell.items('pages')[0]!.render({ scope: undefined })}</>)
  expect(view.container.textContent).toBe('')
  expect(fake.calls).toEqual([])
})

it('M4 a tenant: the page reads the environment and the calendars of that tenant', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient<ClientOf<CalendarProtocol>>(OPERATIONS)
  root.reflect.provide(SERVICE, fake.client)
  await root.plugin(calendarUiModule)
  render(<>{shell.items('pages')[0]!.render({ scope: TENANT })}</>)
  const environment = await fake.next('read-environment')
  const calendars = await fake.next('list-calendars')
  expect(environment.body).toEqual({ tenant: readTenantText(TENANT) })
  expect(calendars.body).toEqual(environment.body)
})
