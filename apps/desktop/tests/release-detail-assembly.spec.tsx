// @vitest-environment happy-dom
import { Context } from '@deepseek-ai/cordis'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import {
  humanInterventionProtocol,
  type HumanInterventionCardItem,
} from '@omne-harness/human-intervention-protocol'
import { scheduleProtocol } from '@omne-harness/schedule-protocol'
import type { ShellLogin } from '@omne-harness/shell-contract'
import { serveProtocol } from '@omne-harness/shell-contract/testing'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { assembly } from '../src/page/assembly.tsx'
import { DesktopShell, shellPlugin } from '../src/page/shell/service.ts'
import { createShellState } from '../src/page/shell/state.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const MODULES = new Set(['human-intervention-ui', 'schedule-ui'])

beforeAll(() => {
  const still = () => ({ cancel: () => undefined, finished: Promise.resolve() })
  Object.assign(Element.prototype, { animate: still })
})
afterEach(cleanup)

const settle = () =>
  act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })

const login: ShellLogin = {
  state: () => 'signed-in',
  subscribe: () => () => undefined,
  login: async () => 'signed-in',
  logout: async () => 'signed-out',
}

const never = () => new Promise<never>(() => {})
const silent = () => new Proxy({}, { get: (_, name) => (name === 'observe' ? {} : never) })

function releaseCard(value: string): HumanInterventionCardItem {
  const option = (id: string, label: string, role: 'approve' | 'reject') => ({
    id,
    label,
    description: '',
    role,
    offered: true,
    lasting: false,
  })
  return {
    card: {
      kind: 'pending',
      ref: { request: { tenantRef: 'tenant-ref-1', requestId: 'request-1' }, cardId: 'card-1' },
      revision: '1',
      question: {
        kind: 'release',
        cardId: 'card-1',
        title: '要让日程生效，放行吗？',
        description: '',
        declineConsequence: '这一次调用不执行。',
        target: { tool: 'Schedule', command: 'create', preview: '交月报' },
        gateTitle: '执行',
        arguments: { text: '{}', truncated: false, digest: 'digest' },
        origin: { session: 'ses_0123456789abcdef', agent: 'exe-1' },
        options: [
          option('deny-once', '本次不放行', 'reject'),
          option('allow-once', '本次放行', 'approve'),
        ],
        detail: {
          state: 'given',
          rows: [{ label: '日程', value: '交月报' }],
          typed: { kind: 'schedule.activation@1', value },
        },
      },
    },
    origin: { kind: 'admission', sessionRef: 'ses_0123456789abcdef' },
    displayContext: '',
  }
}

async function shown(value: string) {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(shellPlugin(createShellState(login)))
  await serveProtocol(root, scheduleProtocol, silent())
  await serveProtocol(root, humanInterventionProtocol, {
    'list-cards': async () => ({
      outcome: 'succeeded',
      body: {
        items: [releaseCard(value)],
        next: null,
        snapshotRef: 'snap-1',
        completeness: 'complete',
      },
    }),
    'read-card': never,
    'submit-reply': never,
    'query-submit-reply': never,
    observe: { 'observe-cards': () => (async function* () {})() },
  })
  for (const module of assembly.modules)
    if (MODULES.has(module.name ?? '')) await root.plugin(module)
  const shell = root.get('shell') as unknown as DesktopShell
  const page = shell.items('pages').find(item => item.id === 'decisions')!
  render(<>{page.render({ scope: TENANT })}</>)
  await settle()
  return within(await screen.findByRole('article'))
}

describe('the detail of a release card in the desktop assembly', () => {
  it('is drawn by the schedule module under its kind, with the rows one switch away', async () => {
    const card = await shown(
      JSON.stringify({ action: 'create', name: '交月报', next: { kind: 'none' } }),
    )
    expect(card.getByText('新建并生效')).toBeTruthy()
    expect(card.getByText('这一动作之后不再执行。')).toBeTruthy()
    const faces = within(card.getByRole('group', { name: '详情的画法' }))
    expect(faces.getByRole('button', { name: '工具的画法' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  it('falls back to the rows of the card when the schedule module cannot read the value', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const card = await shown('{}')
    expect(card.queryByText('新建并生效')).toBeNull()
    expect(card.queryByRole('group', { name: '详情的画法' })).toBeNull()
    expect(card.getByText('日程')).toBeTruthy()
    expect(card.getByText('交月报')).toBeTruthy()
    expect(card.queryByText('这一块读不出')).toBeNull()
    quiet.mockRestore()
  })
})
