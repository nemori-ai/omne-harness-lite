// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeAll, expect, it } from 'vitest'
import {
  sessionModelChoicesKey,
  type ModelChoiceHolder,
  type ModelChoiceSource,
} from '../src/cordis.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { mountModule } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const CLAUDE = 'anthropic/claude-y'

const list: ModelChoiceSource = {
  list: async () => ({
    kind: 'listed',
    choices: [
      { route: 'openai/gpt-x', selectable: true, note: null },
      { route: CLAUDE, selectable: true, note: null },
    ],
  }),
}

beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    setPointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  })
})
afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

const picker = () => screen.queryByRole('button', { name: /新会话的模型/u })
const holderOf = (root: Context): ModelChoiceHolder =>
  (root as unknown as { get(name: string): unknown }).get(
    sessionModelChoicesKey,
  ) as ModelChoiceHolder

it('nobody lists models: the session interface is whole, and a new session names no model', async () => {
  const fake = createFakeClient()
  const { shell } = await mountModule(fake.client, TENANT)
  await settle()
  expect(shell.items('pages').map(item => item.id)).toEqual(['conversation', 'history-search'])
  expect(picker()).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
  const create = await fake.next('create-session')
  expect(create.body).toEqual({ createCallId: expect.any(String), purpose: '' })
})

it('a list is handed over: a new session starts with the model picked; taken away: the rest stays', async () => {
  const fake = createFakeClient()
  const { root, shell } = await mountModule(fake.client, TENANT)
  let withdraw: () => void = () => {}
  await act(async () => {
    withdraw = holderOf(root).attach(list)
  })
  await settle()
  fireEvent.pointerDown(picker()!, { button: 0, ctrlKey: false })
  fireEvent.click(await screen.findByRole('menuitemradio', { name: /claude-y/u }))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
  const create = await fake.next('create-session')
  expect(create.body).toEqual({ createCallId: expect.any(String), purpose: '', model: CLAUDE })

  await act(async () => {
    withdraw()
  })
  await settle()
  expect(picker()).toBeNull()
  expect(shell.items('sidebar').map(item => item.id)).toEqual(['session-list', 'archived-sessions'])
  expect(shell.items('pages').map(item => item.id)).toEqual(['conversation', 'history-search'])
})

it('the heading of a conversation shows the model Session answered, and a choice once listed', async () => {
  const fake = createFakeClient()
  const { root } = await mountModule(fake.client, TENANT)
  fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
  ;(await fake.next('create-session')).answer({
    outcome: 'succeeded',
    body: { session: 'ses_a', recovered: false },
  })
  await settle()
  const read = await fake.next('read-model-selection')
  expect(read.body).toMatchObject({ session: 'ses_a' })
  read.answer({ outcome: 'succeeded', body: { model: 'openai/gpt-x', revision: '1' } })
  await settle()
  expect(screen.getByText('模型：openai/gpt-x')).toBeTruthy()
  await act(async () => {
    holderOf(root).attach(list)
  })
  await settle()
  expect(screen.getByRole('combobox', { name: '模型' }).textContent).toContain('openai/gpt-x')
})

it('the place a list is handed over goes when the session interface unloads', async () => {
  const fake = createFakeClient()
  const mounted = await mountModule(fake.client, TENANT)
  expect(holderOf(mounted.root)).toBeDefined()
  await mounted.withdraw()
  expect(holderOf(mounted.root)).toBeUndefined()
})
