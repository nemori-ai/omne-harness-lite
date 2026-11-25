// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { conversationTarget, createSessionUiModule } from '../src/cordis.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import { assistantEntry, listed, listPage, page, plainEntry, userEntry } from './fixtures/frames.ts'
import { startShell, type TestShell } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

let scrolled: { entry: string; block: string | undefined }[] = []
beforeEach(() => {
  scrolled = []
  Element.prototype.scrollIntoView = function scrollIntoView(
    this: Element,
    options?: boolean | ScrollIntoViewOptions,
  ) {
    const block = typeof options === 'object' ? options.block : undefined
    scrolled.push({ entry: this.getAttribute('data-entry') ?? '', block })
  }
})
afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function conversationPage(): Promise<{
  fake: FakeClient
  shell: TestShell
  show: (subject: string | undefined) => void
}> {
  const fake = createFakeClient()
  const { root, shell } = await startShell()
  await serveProtocol(root, sessionProtocol, fake.client)
  await root.plugin(createSessionUiModule())
  shell.tenant = TENANT
  const item = shell.items('pages').find(page => page.id === 'conversation')
  if (item === undefined) throw new Error('the conversation page is not there')
  const list = shell.items('sidebar').find(entry => entry.id === 'session-list')
  if (list === undefined) throw new Error('the session list is not there')
  const tree = (subject: string | undefined) => (
    <div>
      {list.render({ scope: TENANT })}
      {item.render(subject === undefined ? { scope: TENANT } : { scope: TENANT, subject })}
    </div>
  )
  const view = render(tree(undefined))
  return { fake, shell, show: subject => view.rerender(tree(subject)) }
}

const RUNS = [
  plainEntry('1', '1', 'run.started', { run: 'run_1' }),
  userEntry('2', '2', '第一问'),
  assistantEntry('3', '3', '第一答'),
  plainEntry('4', '4', 'run.terminal', { terminal: { run: 'run_1', outcome: 'completed' } }),
  plainEntry('5', '5', 'run.started', { run: 'run_2' }),
  userEntry('6', '6', '第二问'),
  assistantEntry('7', '7', '第二答'),
  plainEntry('8', '8', 'run.terminal', { terminal: { run: 'run_2', outcome: 'completed' } }),
]

const found = () =>
  [...document.querySelectorAll('[data-found="true"]')].map(node => node.getAttribute('data-entry'))

describe('the conversation page given a subject', () => {
  it('opens the session the subject names', async () => {
    const { fake, show } = await conversationPage()
    show(conversationTarget('ses_named').subject)
    await settle()
    const read = await fake.next('read-history')
    expect(read.body).toMatchObject({ session: 'ses_named', cursor: null })
  })

  it('with a run, stands at the first row of that run once its history is read', async () => {
    const { fake, show } = await conversationPage()
    show(conversationTarget('ses_named', 'run_2').subject)
    await settle()
    ;(await fake.next('read-history')).answer({ outcome: 'succeeded', body: page(RUNS, '8') })
    await settle()
    expect(scrolled).toEqual([{ entry: '6', block: 'start' }])
    expect(found()).toEqual(['6'])
  })

  it('with a run that is not among the entries read, stays at the end and says nothing', async () => {
    const { fake, show } = await conversationPage()
    show(conversationTarget('ses_named', 'run_old').subject)
    await settle()
    ;(await fake.next('read-history')).answer({ outcome: 'succeeded', body: page(RUNS, '8') })
    await settle()
    expect(scrolled).toEqual([])
    expect(found()).toEqual([])
    expect(document.body.textContent).toContain('第二答')
  })

  it('takes a subject it cannot read as no subject: nothing opens and nothing throws', async () => {
    const { fake, show } = await conversationPage()
    for (const subject of ['ses_plain', '{"session":1}', '{"session":"s","run":""}', '[]', 'null'])
      show(subject)
    await settle()
    expect(fake.calls.map(call => call.operation)).not.toContain('read-history')
  })

  it('takes a subject once, and again after the person went elsewhere and the same jump comes', async () => {
    const { fake, show } = await conversationPage()
    const subject = conversationTarget('ses_named').subject
    const reads = () => fake.calls.filter(call => call.operation === 'read-history').length
    ;(await fake.next('list-sessions')).answer(
      listPage([listed('ses_named', '点名的'), listed('ses_other', '另一个')]),
    )
    show(subject)
    await settle()
    show(subject)
    await settle()
    expect(reads()).toBe(1)
    // The list opens another session and navigates with no subject, as the shell's list does.
    fireEvent.click(screen.getByRole('button', { name: '另一个' }))
    show(undefined)
    await settle()
    expect(reads()).toBe(2)
    show(subject)
    await settle()
    expect(reads()).toBe(3)
    expect(fake.calls.at(-1)?.body).toMatchObject({ session: 'ses_named' })
  })
})
