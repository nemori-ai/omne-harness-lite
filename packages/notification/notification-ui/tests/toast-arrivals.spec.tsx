// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import { notificationProtocol } from '@omne-harness/notification-protocol'
import { keyOf } from '../src/model/inbox-machine.ts'
import { notificationUiModule, PAGE_ID } from '../src/cordis.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { entry, page } from './fixtures/entries.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { startShell } from './fixtures/reference-shell.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const SERVICE = protocolServiceName({
  name: notificationProtocol.name,
  major: notificationProtocol.major,
})

const scrolled = vi.fn()
beforeAll(() => {
  stubAnimation()
  Object.assign(Element.prototype, { scrollIntoView: scrolled })
})
afterEach(cleanup)

const later = () => new Promise(resolve => setTimeout(resolve, 0))
const strong = (event: string, sequence: number) => entry(event, sequence, { level: 'strong' })

async function signedIn() {
  const { root, shell } = await startShell()
  shell.setTenant(TENANT)
  const fake = createFakeClient()
  root.reflect.provide(SERVICE, fake.client)
  const module = root.plugin(notificationUiModule)
  await module
  await later()
  const inbox = async (entries: Parameters<typeof page>[0]) => {
    fake.observations.at(-1)!.frame()
    ;(await fake.next('list-inbox')).answer(page(entries))
    await later()
  }
  const toasts = () => shell.toastStore.shown().map(shown => shown.toast)
  return { root, shell, fake, module, inbox, toasts }
}

it('toasts a strong notification that arrives after the window opened, with a way to it', async () => {
  const t = await signedIn()
  expect(t.fake.observations).toHaveLength(1)
  await t.inbox([strong('old', 1)])
  expect(t.toasts()).toEqual([])
  const arrived = strong('new', 2)
  await t.inbox([strong('old', 1), arrived, entry('quiet', 3)])
  expect(t.toasts()).toEqual([
    {
      id: keyOf(arrived),
      tone: 'attention',
      title: arrived.title,
      action: { label: '去看看', page: PAGE_ID, subject: keyOf(arrived) },
    },
  ])
  await t.inbox([strong('old', 1), arrived, entry('quiet', 3)])
  expect(t.toasts()).toHaveLength(1)
})

it('toasting changes nothing about the notification: no mark and no read is sent', async () => {
  const t = await signedIn()
  await t.inbox([])
  await t.inbox([strong('new', 1)])
  expect(t.toasts()).toHaveLength(1)
  expect(new Set(t.fake.calls.map(call => call.operation))).toEqual(new Set(['list-inbox']))
})

it('takes its toasts down and stops watching when it unloads', async () => {
  const t = await signedIn()
  await t.inbox([])
  await t.inbox([strong('new', 1)])
  await t.module.dispose()
  expect(t.toasts()).toEqual([])
  expect(t.fake.observations[0]!.signal.aborted).toBe(true)
})

it('watches nothing without a tenant, and lets go of the tenant on sign-out', async () => {
  const { root, shell } = await startShell()
  const fake = createFakeClient()
  root.reflect.provide(SERVICE, fake.client)
  await root.plugin(notificationUiModule)
  await later()
  expect(fake.observations).toHaveLength(0)
  shell.setTenant(TENANT)
  await later()
  expect(fake.observations).toHaveLength(1)
  shell.setTenant(undefined)
  await later()
  expect(fake.observations[0]!.signal.aborted).toBe(true)
  shell.setTenant('not a tenant')
  await later()
  expect(fake.observations).toHaveLength(1)
})

it('the page brought up on one notification scrolls to it and marks it, and opens nothing', async () => {
  const t = await signedIn()
  const target = strong('new', 2)
  const item = t.shell.items('pages')[0]!
  const view = render(<>{item.render({ scope: TENANT, subject: keyOf(target) })}</>)
  await act(async () => t.inbox([entry('other', 1), target]))
  const focused = view.container.querySelectorAll('[data-focused]')
  expect([...focused].map(row => row.textContent)).toEqual([expect.stringContaining(target.title)])
  expect(scrolled).toHaveBeenCalled()
  expect(t.fake.calls.some(call => call.operation !== 'list-inbox')).toBe(false)
})
