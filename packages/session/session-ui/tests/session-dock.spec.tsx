// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { SESSION_DOCK } from '../src/cordis.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { assistantEntry, listed, listPage, page } from './fixtures/frames.ts'
import { mountModule, type TestShell } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

function attach(shell: TestShell, anchor: string, id: string): void {
  shell.contribute('attached', {
    id,
    order: 0,
    anchor,
    render: ({ scope, subject }) => (
      <aside data-testid={id}>
        {subject}|{scope}
      </aside>
    ),
  })
}

async function openFromList(fake: ReturnType<typeof createFakeClient>, name: string, id: string) {
  fireEvent.click(screen.getByRole('button', { name }))
  await settle()
  ;(await fake.next('read-history')).answer({
    outcome: 'succeeded',
    body: page([assistantEntry('1', '1', `${id}的内容`)], '1'),
  })
  await settle()
}

it('附着位置的名字是 session.dock', () => {
  expect(SESSION_DOCK).toBe('session.dock')
})

it('会话打开后，附着在这个位置的项出现在转写区与输入框之间，收到会话标识与当前租户', async () => {
  const fake = createFakeClient()
  const { shell } = await mountModule(fake.client, TENANT)
  attach(shell, SESSION_DOCK, 'extra')
  ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
  await settle()
  await openFromList(fake, '甲', 'ses_a')

  const extra = screen.getByTestId('extra')
  expect(extra.textContent).toBe(`ses_a|${TENANT}`)
  const transcript = screen.getByText('ses_a的内容').closest('.omne-conversation')
  const composer = screen.getByRole('textbox', { name: '输入消息' }).closest('form')
  if (transcript === null || composer === null) throw new Error('page not rendered')
  expect(transcript.nextElementSibling?.contains(extra)).toBe(true)
  expect(extra.closest('.omne-session-dock')?.nextElementSibling).toBe(composer)
})

it('换一个会话：位置收到的对象跟着变', async () => {
  const fake = createFakeClient()
  const { shell } = await mountModule(fake.client, TENANT)
  attach(shell, SESSION_DOCK, 'extra')
  ;(await fake.next('list-sessions')).answer(
    listPage([listed('ses_a', '甲'), listed('ses_b', '乙')]),
  )
  await settle()
  await openFromList(fake, '甲', 'ses_a')
  expect(screen.getByTestId('extra').textContent).toContain('ses_a|')
  await openFromList(fake, '乙', 'ses_b')
  expect(screen.getByTestId('extra').textContent).toContain('ses_b|')
})

it('没有会话打开时，位置不出现', async () => {
  const fake = createFakeClient()
  const { shell } = await mountModule(fake.client, TENANT)
  attach(shell, SESSION_DOCK, 'extra')
  await settle()
  expect(screen.getByText('点「新建会话」开始一段对话。')).toBeTruthy()
  expect(screen.queryByTestId('extra')).toBeNull()
  expect(document.querySelector('.omne-session-dock')).toBeNull()
})

it('附着在别的位置的项不出现在这里', async () => {
  const fake = createFakeClient()
  const { shell } = await mountModule(fake.client, TENANT)
  attach(shell, 'other.place', 'elsewhere')
  ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
  await settle()
  await openFromList(fake, '甲', 'ses_a')
  expect(screen.queryByTestId('elsewhere')).toBeNull()
  expect(document.querySelector('.omne-session-dock')?.childElementCount).toBe(0)
})
