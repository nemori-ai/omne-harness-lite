// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { definePoint } from '@omne-harness/shell-contract'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  createUsageUiModule,
  USAGE_IN_SESSION,
  USAGE_PAGE,
  USAGE_STATUS,
  usagePresentation,
  usageWidget,
} from '../src/cordis.tsx'
import { stubDom, TENANT } from './fixtures/dom.ts'
import { fakeUsage, KNOWN_OCCUPANCY, type Answer, type Call } from './fixtures/fake-usage.ts'
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

/** The status item of a session drawn over a usage client whose occupancy answer is `occupancy`. */
async function statusWith(occupancy: () => Answer | Promise<never>) {
  const { root, shell } = await startShell()
  shell.tenant = TENANT
  const answer = (call: Call) =>
    call.operation === 'read-context-occupancy' ? (occupancy() as Answer) : undefined
  root.reflect.provide(SERVICE, fakeUsage(answer).client)
  await root.plugin(createUsageUiModule({ sessionSide, sessionStatus }))
  render(<>{anchored(shell, 'session.status')[0]?.render({ scope: TENANT, subject: SESSION })}</>)
  await settle()
  return document.querySelector<HTMLElement>('.usage-panel[data-position="status"]')
}

const known = (percent: string, compactAtPercent: string | null): Answer => ({
  outcome: 'succeeded',
  body: { ...KNOWN_OCCUPANCY, percent, compactAtPercent },
})

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
    expect(document.querySelector('.usage-percent [aria-hidden="true"]')?.textContent).toBe('0.75%')
    expect(
      document.querySelector('.usage-panel[data-position="status"] .usage-panel-bar'),
    ).toBeNull()
    expect(fake.calls.at(-1)).toMatchObject({
      operation: 'read-context-occupancy',
      body: { session: SESSION },
    })
  })

  it('draws the summary and the two token cards across the session tab', async () => {
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
    expect(
      document.querySelector(
        '.usage-panel[data-position="session"] .usage-card[data-widget="usage.summary"]',
      )?.textContent,
    ).toContain('0.0123 USD')
  })

  it('writes the summary in a session’s side as a table of facts, name at the left and value at the right, and keeps the row of figures on the page', async () => {
    const { shell } = await mounted()
    render(<>{anchored(shell, 'session.side')[0]?.render({ scope: TENANT, subject: SESSION })}</>)
    await settle()
    const side = document.querySelector('.usage-panel[data-position="session"]')
    const facts = side?.querySelector('.usage-card[data-widget="usage.summary"] dl.fact-list')
    expect(facts?.getAttribute('aria-label')).toBe('概览')
    expect([...(facts?.querySelectorAll('dt') ?? [])].map(term => term.textContent)).toEqual([
      '费用',
      'Token（输入与输出）',
      '模型请求',
      '缓存命中率',
      '首字延迟（中位）',
    ])
    expect([...(facts?.querySelectorAll('dd') ?? [])].map(value => value.textContent)).toEqual([
      '0.0123 USD1 笔未知',
      '3,600',
      '3',
      '25%',
      '310 毫秒',
    ])
    expect(side?.querySelector('.omne-stat')).toBeNull()
    cleanup()
    render(<>{shell.items('pages')[0]?.render({ scope: TENANT })}</>)
    await settle()
    expect(
      document.querySelectorAll('.usage-panel[data-position="tenant"] .omne-stat'),
    ).toHaveLength(5)
    expect(document.querySelector('.usage-panel[data-position="tenant"] .fact-list')).toBeNull()
  })

  it('in the status, a known occupancy is one quiet number; what it is, as of when, is in its hint', async () => {
    const status = await statusWith(() => ({ outcome: 'succeeded', body: KNOWN_OCCUPANCY }))
    const figure = status?.querySelector<HTMLElement>('.usage-percent')
    const said = figure?.getAttribute('title') ?? ''
    expect(said).toMatch(
      /^上下文 0\.75%，截至上一次请求（\d{2}\/\d{2} \d{2}:\d{2} · openai\/gpt-5\.6-sol）$/u,
    )
    expect(figure?.querySelector('[aria-hidden="true"]')?.textContent).toBe('0.75%')
    expect(screen.getByText(said).className).toBe('sr-only')
    expect(status?.textContent).toBe(`0.75%${said}`)
    expect(figure?.dataset['tone']).toBeUndefined()
    expect(status?.querySelector('[role="meter"], svg')).toBeNull()
  })

  it.each([
    ['past the compaction mark', '80.5', '80', 'caution'],
    ['past 100% with no mark', '120', null, 'caution'],
    ['at the compaction mark', '80', '80', undefined],
    ['at 100% with no mark', '100', null, undefined],
  ])('the number is amber %s, else muted', async (_case, percent, mark, tone) => {
    const status = await statusWith(() => known(percent, mark))
    expect(status?.querySelector<HTMLElement>('.usage-percent')?.dataset['tone']).toBe(tone)
  })

  it.each([
    ['there is no request yet', () => ({ outcome: 'succeeded', body: { kind: 'none-yet' } })],
    [
      'the usage is unknown',
      () => ({ outcome: 'succeeded', body: { kind: 'unknown', reason: 'usage-unknown' } }),
    ],
    [
      'the window is unknown',
      () => ({ outcome: 'succeeded', body: { kind: 'unknown', reason: 'window-unknown' } }),
    ],
    ['the read is refused', () => ({ outcome: 'denied' })],
    ['the read is still on its way', () => new Promise<never>(() => {})],
  ])('draws nothing in the status when %s', async (_case, occupancy) => {
    const status = await statusWith(occupancy as () => Answer | Promise<never>)
    expect(status).not.toBeNull()
    expect(status?.textContent).toBe('')
    expect(status?.querySelector('.usage-percent, [role="meter"], svg, [role="status"]')).toBeNull()
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
    expect(
      anchored(shell, 'session.status')[0]?.render({ scope: undefined, subject: SESSION }),
    ).toBeNull()
  })

  it('keeps its places and points under names that do not change', () => {
    expect([USAGE_PAGE, USAGE_IN_SESSION, USAGE_STATUS]).toEqual([
      'usage',
      'usage',
      'usage.occupancy',
    ])
    expect([usageWidget.name, usagePresentation.name]).toEqual([
      'usage.widget',
      'usage.presentation',
    ])
  })

  it('says it is reading until the answer comes', async () => {
    const { root, shell } = await startShell()
    shell.tenant = TENANT
    root.reflect.provide(SERVICE, fakeUsage(() => new Promise<never>(() => {}) as never).client)
    await root.plugin(createUsageUiModule({ sessionSide, sessionStatus }))
    render(<>{shell.items('pages')[0]?.render({ scope: TENANT })}</>)
    await settle()
    expect(document.querySelector('.usage-card[data-widget="usage.summary"]')?.textContent).toBe(
      '概览正在读取……',
    )
  })

  it('reads the occupancy of the session the status item is given now', async () => {
    const { shell, fake } = await mounted()
    const item = anchored(shell, 'session.status')[0]
    const view = render(<>{item?.render({ scope: TENANT, subject: SESSION })}</>)
    await settle()
    view.rerender(<>{item?.render({ scope: TENANT, subject: 'b'.repeat(64) })}</>)
    await settle()
    expect(
      fake.calls
        .filter(call => call.operation === 'read-context-occupancy')
        .map(call => call.body['session']),
    ).toEqual([SESSION, 'b'.repeat(64)])
  })
})
