// @vitest-environment happy-dom
import { Context } from '@deepseek-ai/cordis'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { notificationProtocol } from '@omne-harness/notification-protocol'
import { partsOn } from '@omne-harness/shell-contract'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import {
  INBOX_SECTIONS,
  NOTIFICATION_ENTRY,
  inboxSections,
  notificationEntry,
  notificationUiModule,
} from '../src/cordis.ts'
import { entry, page } from './fixtures/entries.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { startShell } from './fixtures/reference-shell.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

beforeAll(stubAnimation)
afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}
const later = () => new Promise(resolve => setTimeout(resolve, 0))
const pageIds = (root: Context) =>
  (root.shell as unknown as { items(slot: 'pages'): { id: string }[] })
    .items('pages')
    .map(item => item.id)

async function loaded() {
  const { root, shell } = await startShell()
  const fake = createFakeClient()
  const served = await serveProtocol(root, notificationProtocol, fake.client)
  await root.plugin(notificationUiModule)
  return { root, shell, fake, served }
}

it('with the protocol client on the tree it puts one page with a count, and nothing else', async () => {
  const { shell } = await loaded()
  const [placed] = shell.items('pages')
  expect(placed).toMatchObject({ id: 'notifications', title: '通知', order: 11 })
  expect(placed?.badge).toBeTypeOf('function')
  expect(shell.items('pages')).toHaveLength(1)
  expect(shell.items('sidebar')).toEqual([])
  expect(shell.items('gate')).toEqual([])
  expect(shell.items('attached')).toEqual([])
})

it('without the protocol client it keeps its page and puts nothing else', async () => {
  const { root, shell } = await startShell()
  await root.plugin(notificationUiModule)
  expect(pageIds(root)).toEqual(['notifications'])
  expect(shell.items('sidebar')).toEqual([])
  expect(shell.items('gate')).toEqual([])
  expect(shell.items('attached')).toEqual([])
})

it('declares its seven parts, whether or not the protocol is served', async () => {
  const { root, shell } = await startShell()
  await root.plugin(notificationUiModule)
  const read = partsOn(shell.registry())
  expect(read.kind === 'read' && read.conflicts).toEqual([])
  expect(read.kind === 'read' && read.parts.map(part => [part.name, part.within])).toEqual([
    ['notification.page', 'shell.workspace.page'],
    ['notification.page.filter', 'notification.page'],
    ['notification.page.group', 'notification.page'],
    ['notification.row', 'notification.page.group'],
    ['notification.row.actions', 'notification.row'],
    ['notification.row.detail', 'notification.row'],
    ['notification.row.title', 'notification.row'],
  ])
})

it('the module is adopted at notification/v2 while it is served, and the page stays when it goes', async () => {
  const { root, shell, fake, served } = await loaded()
  expect(shell.adoption('notification-ui')).toMatchObject({
    kind: 'adopted',
    bindings: { notification: { key: 'notification/v2' } },
  })
  await served.dispose()
  await later()
  expect(pageIds(root)).toEqual(['notifications'])
  expect(shell.adoption('notification-ui')).toMatchObject({ kind: 'unavailable' })
  await serveProtocol(root, notificationProtocol, fake.client)
  await later()
  expect(pageIds(root)).toEqual(['notifications'])
  expect(shell.adoption('notification-ui')).toMatchObject({ kind: 'adopted' })
})

it('the page uses the tenant of the shell; without one it draws nothing and asks nothing', async () => {
  const { shell, fake } = await loaded()
  const item = shell.items('pages')[0]!
  const blank = render(
    <>
      {item.render({ scope: undefined })}
      {item.badge?.({ scope: undefined })}
    </>,
  )
  await settle()
  expect(blank.container.textContent).toBe('')
  expect(fake.observations).toHaveLength(0)
  cleanup()
  render(<>{item.render({ scope: TENANT })}</>)
  await settle()
  expect(fake.observations).toHaveLength(1)
})

it('the page and the count read the same inbox: one observation, one list', async () => {
  const { shell, fake } = await loaded()
  const item = shell.items('pages')[0]!
  const view = render(
    <>
      <span data-testid="badge">{item.badge?.({ scope: TENANT })}</span>
      {item.render({ scope: TENANT })}
    </>,
  )
  await settle()
  await act(async () => fake.observations[0]!.frame())
  ;(await fake.next('list-inbox')).answer(page([entry('e1', 1)]))
  await settle()
  expect(view.getByTestId('badge').textContent).toBe('1')
  expect(view.getByRole('region', { name: '未了结' })).toBeTruthy()
  expect(fake.observations).toHaveLength(1)
  expect(fake.calls.filter(call => call.operation === 'list-inbox')).toHaveLength(1)
})

it('unloading stops the observation', async () => {
  const { shell, fake, served } = await loaded()
  render(<>{shell.items('pages')[0]!.render({ scope: TENANT })}</>)
  await settle()
  await served.dispose()
  await later()
  expect(fake.observations[0]!.signal.aborted).toBe(true)
})

it('another domain puts a section into the panel through the point, and takes it out again', async () => {
  const { root, shell } = await loaded()
  shell.tenant = TENANT
  expect(inboxSections.name).toBe(INBOX_SECTIONS)
  expect(INBOX_SECTIONS).toBe('notification.inbox-sections')
  const seenBy: unknown[] = []
  const other = root.plugin({
    name: 'other-domain-ui',
    inject: ['shell'],
    apply(ctx: Context) {
      inboxSections.contribute(ctx.shell as never, {
        id: 'standing',
        order: 5,
        label: '持续事项',
        render: props => {
          seenBy.push(props)
          return <p>有一件事还开着</p>
        },
      })
      inboxSections.contribute(ctx.shell as never, {
        id: 'bare',
        order: 1,
        render: () => <p>没有标题的一栏</p>,
      })
    },
  })
  await other
  const draw = () => render(<>{shell.items('pages')[0]!.render({ scope: TENANT })}</>)
  const first = draw()
  await settle()
  const extra = first.container.querySelector('.notification-extra')!
  expect([...extra.querySelectorAll('section')].map(section => section.textContent)).toEqual([
    '没有标题的一栏',
    '持续事项有一件事还开着',
  ])
  expect(first.getByRole('heading', { name: '持续事项' })).toBeTruthy()
  expect(
    [...extra.querySelectorAll('section')].map(section => section.querySelectorAll('h3').length),
  ).toEqual([0, 1])
  expect(seenBy[0]).toEqual({ scope: TENANT, subject: { recipient: 'person' } })
  cleanup()
  await other.dispose()
  const second = draw()
  await settle()
  expect(second.container.querySelector('.notification-extra')).toBeNull()
  expect(second.queryByText('有一件事还开着')).toBeNull()
})

it('a section put under the anchor with a subject the point does not read is not drawn', async () => {
  const { root, shell } = await loaded()
  shell.tenant = TENANT
  expect(shell.arranged(INBOX_SECTIONS, 'agent', entries => entries.length)).toBe(0)
  await root.plugin({
    name: 'other-domain-ui',
    inject: ['shell'],
    apply(ctx: Context) {
      inboxSections.contribute(ctx.shell as never, { id: 's', order: 1, render: () => <p>一栏</p> })
    },
  })
  const drawn = render(<>{shell.attached(INBOX_SECTIONS, 'agent')}</>)
  expect(drawn.container.innerHTML).toBe('')
  const right = render(<>{shell.attached(INBOX_SECTIONS, 'person')}</>)
  expect(right.container.textContent).toBe('一栏')
})

async function inbox(put: (shell: Awaited<ReturnType<typeof loaded>>['shell']) => void) {
  const { shell, fake } = await loaded()
  put(shell)
  shell.tenant = TENANT
  const [placed] = shell.items('pages')
  const view = render(<>{placed!.render({ scope: TENANT })}</>)
  await settle()
  await act(async () => fake.observations[0]!.frame())
  ;(await fake.next('list-inbox')).answer(
    page([entry('a', 1), entry('b', 2, { source: 'calendar.events', title: '明天开会' })]),
  )
  await settle()
  return view
}
const rowsOf = (view: Awaited<ReturnType<typeof inbox>>) =>
  [...view.container.querySelectorAll('li.notification-row')].map(row => row.textContent)

it('the point of a row is notification.entry, one drawing to the name of a source', () => {
  expect(NOTIFICATION_ENTRY).toBe('notification.entry')
  expect(notificationEntry.name).toBe(NOTIFICATION_ENTRY)
  expect(notificationEntry.contract).toMatchObject({
    arity: 'keyed-one',
    key: 'the name of the source',
  })
})

it('a source that put a drawing draws its own rows, given the notification; the rows of other sources stay as they were', async () => {
  const seen: unknown[] = []
  const plain = rowsOf(await inbox(() => {}))
  cleanup()
  const view = await inbox(
    shell =>
      void notificationEntry.put(shell, 'calendar.events', ({ scope, subject }) => {
        seen.push([scope, subject.source, subject.event, subject.title])
        return <p data-testid="meeting">会议：{subject.title}</p>
      }),
  )
  const rows = rowsOf(view)
  const own = (row: string | null): boolean => row?.includes('明天开会') === true
  expect(rows.filter(own)).toEqual(['会议：明天开会'])
  expect(rows.filter(row => !own(row))).toEqual(plain.filter(row => !own(row)))
  expect(plain.filter(own)).toHaveLength(1)
  expect(seen.at(-1)).toEqual([TENANT, 'calendar.events', 'b', '明天开会'])
})

it('a drawing can stand around the row the page draws itself, and one that throws falls back to it', async () => {
  const plain = rowsOf(await inbox(() => {}))
  cleanup()
  const framed = await inbox(shell => {
    notificationEntry.put(shell, 'calendar.events', ({ generic }) => (
      <div data-testid="framed">{generic()}</div>
    ))
    notificationEntry.put(shell, 'demo.things', () => {
      throw new Error('this row is broken')
    })
  })
  expect(rowsOf(framed)).toEqual(plain)
  expect(framed.getByTestId('framed').querySelector('.notification-title')).not.toBeNull()
})
