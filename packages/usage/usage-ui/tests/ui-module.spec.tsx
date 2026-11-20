// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { definePoint } from '@omne-harness/shell-contract'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createUsageUiModule, USAGE_IN_SESSION, USAGE_PAGE, USAGE_STATUS } from '../src/cordis.tsx'
import { stubDom, TENANT } from './fixtures/dom.ts'
import { fakeUsage } from './fixtures/fake-usage.ts'
import { startShell, type ReferenceShell } from './fixtures/reference-shell.tsx'

beforeAll(stubDom)
afterEach(cleanup)

const SERVICE = 'protocol:usage/v1'
const session = {
  encode: (value: { session: string }) => value.session,
  decode: (text: string) => ({ session: text }),
}
const sessionSide = definePoint({ name: 'session.side', subject: session })
const sessionStatus = definePoint({ name: 'session.status', subject: session })
const SESSION = 'a'.repeat(64)

const settle = () =>
  act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 20))
  })

async function mounted() {
  const { root, shell } = await startShell()
  shell.tenant = TENANT
  const fake = fakeUsage()
  const withdraw = root.reflect.provide(SERVICE, fake.client)
  await root.plugin(createUsageUiModule({ sessionSide, sessionStatus }))
  return { root, shell, fake, withdraw }
}

const anchored = (shell: ReferenceShell, anchor: string) =>
  shell.items('attached').filter(item => item.anchor === anchor)

describe('the usage interface module in its three places (C27)', () => {
  it('injects the usage protocol client by the name of usage/v1', () => {
    expect(createUsageUiModule().inject).toEqual(['shell', SERVICE])
  })

  it('puts the usage page, a session side tab and a session status item', async () => {
    const { shell } = await mounted()
    expect(shell.items('pages').map(page => [page.id, page.title, page.icon])).toEqual([
      [USAGE_PAGE, '用量', 'overview'],
    ])
    expect(anchored(shell, 'session.side').map(item => [item.id, item.label])).toEqual([
      [USAGE_IN_SESSION, '用量'],
    ])
    expect(anchored(shell, 'session.status').map(item => item.id)).toEqual([USAGE_STATUS])
  })

  it('draws the tenant panel on the page and the occupancy in the status of a session', async () => {
    const { shell, fake } = await mounted()
    render(<>{shell.items('pages')[0]?.render({ scope: TENANT })}</>)
    await settle()
    expect(screen.getByRole('heading', { name: '用量' })).not.toBeNull()
    expect(document.querySelector('.usage-panel[data-position="tenant"]')).not.toBeNull()
    expect(document.querySelectorAll('svg.recharts-surface').length).toBeGreaterThan(0)
    expect(
      fake.calls.some(call => (call.body['scope'] as { kind: string }).kind === 'tenant'),
    ).toBe(true)
    cleanup()
    render(<>{anchored(shell, 'session.status')[0]?.render({ scope: TENANT, subject: SESSION })}</>)
    await settle()
    expect(screen.getByRole('meter', { name: '上下文' }).getAttribute('aria-valuenow')).toBe('0.75')
    expect(
      document.querySelector('.usage-panel[data-position="status"] .usage-panel-bar'),
    ).toBeNull()
    expect(fake.calls.at(-1)).toMatchObject({
      operation: 'read-context-occupancy',
      body: { session: SESSION },
    })
  })

  it('draws the summary and the two token cards across the session tab, and the occupancy with its moment and mark', async () => {
    const { shell } = await mounted()
    render(<>{anchored(shell, 'session.side')[0]?.render({ scope: TENANT, subject: SESSION })}</>)
    await settle()
    expect(
      [
        ...document.querySelectorAll<HTMLElement>(
          '.usage-panel[data-position="session"] .usage-card',
        ),
      ].map(card => [card.dataset['widget'], card.dataset['width']]),
    ).toEqual([
      ['usage.summary', '3'],
      ['usage.tokens', '3'],
      ['usage.by-model', '3'],
    ])
    cleanup()
    render(<>{anchored(shell, 'session.status')[0]?.render({ scope: TENANT, subject: SESSION })}</>)
    await settle()
    expect(document.querySelector('.omne-meter-mark')?.getAttribute('x')).toBe('79.5')
    expect(document.querySelector('.omne-meter-caption')?.textContent).toMatch(
      /^截至上一次请求（\d{2}\/\d{2} \d{2}:\d{2} · openai\/gpt-5\.6-sol）$/u,
    )
  })

  it('says why the occupancy is unknown', async () => {
    const { root, shell } = await startShell()
    shell.tenant = TENANT
    root.reflect.provide(
      SERVICE,
      fakeUsage(() => ({
        outcome: 'succeeded',
        body: { kind: 'unknown', reason: 'window-unknown' },
      })).client,
    )
    await root.plugin(createUsageUiModule({ sessionSide, sessionStatus }))
    render(<>{anchored(shell, 'session.status')[0]?.render({ scope: TENANT, subject: SESSION })}</>)
    await settle()
    expect(
      document.querySelector('.omne-meter[data-state="unknown"] .omne-meter-caption')?.textContent,
    ).toBe('这个型号的窗口未知')
  })

  it('does not load without the usage protocol, unloads when it is withdrawn and loads again when it is back', async () => {
    const { root, shell } = await startShell()
    await root.plugin(createUsageUiModule({ sessionSide, sessionStatus }))
    expect(shell.items('pages')).toEqual([])
    const fake = fakeUsage()
    const withdraw = root.reflect.provide(SERVICE, fake.client)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(shell.items('pages').map(page => page.id)).toEqual([USAGE_PAGE])
    withdraw()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(shell.items('pages')).toEqual([])
    expect(shell.items('attached')).toEqual([])
    root.reflect.provide(SERVICE, fake.client)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(shell.items('pages').map(page => page.id)).toEqual([USAGE_PAGE])
  })

  it('draws nothing in a place without a tenant', async () => {
    const { shell } = await mounted()
    expect(shell.items('pages')[0]?.render({ scope: undefined })).toBeNull()
    expect(
      anchored(shell, 'session.side')[0]?.render({ scope: undefined, subject: SESSION }),
    ).toBeNull()
  })
})
