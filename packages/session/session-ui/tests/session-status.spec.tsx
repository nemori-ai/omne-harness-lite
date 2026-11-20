// @vitest-environment happy-dom
import type { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { SESSION_STATUS, sessionStatus } from '../src/cordis.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { assistantEntry, listed, listPage, page } from './fixtures/frames.ts'
import { mountModule } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function opened() {
  const fake = createFakeClient()
  const mounted = await mountModule(fake.client, TENANT)
  ;(await fake.next('list-sessions')).answer(
    listPage([listed('ses_a', '甲'), listed('ses_b', '乙')]),
  )
  await settle()
  const open = async (name: string, id: string) => {
    fireEvent.click(screen.getByRole('button', { name }))
    await settle()
    ;(await fake.next('read-history')).answer({
      outcome: 'succeeded',
      body: page([assistantEntry('1', '1', `${id}的内容`)], '1'),
    })
    await settle()
  }
  return { ...mounted, open }
}

it('附着位置的名字是 session.status (C31)', () => {
  expect(SESSION_STATUS).toBe('session.status')
  expect(sessionStatus.name).toBe(SESSION_STATUS)
})

it('会话打开后，放进来的项按次序排在输入框下方的一行里，收到会话标识与当前租户', async () => {
  const { shell, open } = await opened()
  for (const [id, order] of [
    ['second', 2],
    ['first', 1],
  ] as const)
    sessionStatus.contribute(shell, {
      id,
      order,
      render: ({ scope, subject }) => (
        <span data-testid={id}>
          {subject.session}|{scope}
        </span>
      ),
    })
  await open('甲', 'ses_a')
  const first = screen.getByTestId('first')
  expect(first.textContent).toBe(`ses_a|${TENANT}`)
  const row = first.closest('.omne-session-status')
  const composer = screen.getByRole('textbox', { name: '输入消息' }).closest('form')
  expect(row?.previousElementSibling).toBe(composer)
  expect([...(row?.children ?? [])].map(child => child.getAttribute('data-testid'))).toEqual([
    'first',
    'second',
  ])
  await open('乙', 'ses_b')
  expect(screen.getByTestId('first').textContent).toContain('ses_b|')
})

it('没有项时这一行是空的，项随贡献方撤下', async () => {
  const { root, open } = await opened()
  await open('甲', 'ses_a')
  expect(document.querySelector('.omne-session-status')?.children).toHaveLength(0)
  const contributor = await act(async () =>
    root.plugin({
      name: 'status-contributor',
      inject: ['shell'],
      apply: (ctx: Context) => {
        sessionStatus.contribute(ctx.shell, {
          id: 'occupancy',
          order: 0,
          render: () => <span data-testid="occupancy" />,
        })
      },
    }),
  )
  await settle()
  expect(screen.getByTestId('occupancy')).not.toBeNull()
  await contributor.dispose()
  await settle()
  expect(screen.queryByTestId('occupancy')).toBeNull()
})
