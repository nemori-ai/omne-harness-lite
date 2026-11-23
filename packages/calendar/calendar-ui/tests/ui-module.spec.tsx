// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { calendarProtocol, type CalendarProtocol } from '@omne-harness/calendar-protocol'
import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import { partsOn } from '@omne-harness/shell-contract'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import { calendarUiModule } from '../src/cordis.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { startShell } from './fixtures/reference-shell.ts'

const OPERATIONS = Object.keys(calendarProtocol.operations)
const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

beforeAll(stubAnimation)
afterEach(cleanup)

it('M1 the calendar client present: one calendar page, before the assets page', async () => {
  const { root, shell } = await startShell()
  await serveProtocol(
    root,
    calendarProtocol,
    createFakeClient<ClientOf<CalendarProtocol>>(OPERATIONS).client,
  )
  await root.plugin(calendarUiModule)
  expect(shell.items('pages')).toMatchObject([{ id: 'calendar', title: '日历', order: 13 }])
  expect(shell.items('sidebar')).toEqual([])
  expect(shell.adoption('calendar-ui')).toMatchObject({
    kind: 'adopted',
    bindings: { calendar: { key: 'calendar/v1' } },
  })
})

it('M2 the client withdrawn: the page stays; back again: it is pinned again', async () => {
  const { root, shell } = await startShell()
  const client = createFakeClient<ClientOf<CalendarProtocol>>(OPERATIONS).client
  const served = await serveProtocol(root, calendarProtocol, client)
  await root.plugin(calendarUiModule)
  await served.dispose()
  await tick()
  expect(shell.adoption('calendar-ui')).toMatchObject({ kind: 'unavailable' })
  expect(shell.items('pages').map(page => page.id)).toEqual(['calendar'])
  await serveProtocol(root, calendarProtocol, client)
  await tick()
  expect(shell.adoption('calendar-ui')).toMatchObject({ kind: 'adopted' })
  expect(shell.items('pages').map(page => page.id)).toEqual(['calendar'])
})

it('M3 no tenant yet: nothing is drawn and nothing is read', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient<ClientOf<CalendarProtocol>>(OPERATIONS)
  await serveProtocol(root, calendarProtocol, fake.client)
  await root.plugin(calendarUiModule)
  const view = render(<>{shell.items('pages')[0]!.render({ scope: undefined })}</>)
  expect(view.container.textContent).toBe('')
  expect(fake.calls).toEqual([])
})

it('M4 a tenant: the page reads the environment and the calendars of that tenant', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient<ClientOf<CalendarProtocol>>(OPERATIONS)
  await serveProtocol(root, calendarProtocol, fake.client)
  await root.plugin(calendarUiModule)
  render(<>{shell.items('pages')[0]!.render({ scope: TENANT })}</>)
  const environment = await fake.next('read-environment')
  const calendars = await fake.next('list-calendars')
  expect(environment.body).toEqual({ tenant: readTenantText(TENANT) })
  expect(calendars.body).toEqual(environment.body)
})

it('M4 declares its six parts, whether or not the protocol is served', async () => {
  const { root, shell } = await startShell()
  await root.plugin(calendarUiModule)
  const read = partsOn(shell.registry())
  expect(read.kind === 'read' && read.conflicts).toEqual([])
  expect(read.kind === 'read' && read.parts.map(part => [part.name, part.within])).toEqual([
    ['calendar.environment', 'calendar.page'],
    ['calendar.lookup', 'calendar.page'],
    ['calendar.lookup.ask', 'calendar.lookup'],
    ['calendar.page', 'shell.workspace.page'],
    ['calendar.shipped', 'calendar.page'],
    ['calendar.shipped.item', 'calendar.shipped'],
  ])
})
