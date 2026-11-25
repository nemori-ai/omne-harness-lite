// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { provideOn } from '@omne-harness/shell-contract/testing'
import type {
  Assist,
  AssistAnswer,
  AssistKey,
  ComposerHelper,
} from '../src/model/composer-assistant.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { assistantEntry, listed, listPage, page } from './fixtures/frames.ts'
import { mountModule, TAKEN } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

/** A helper whose answers the case sets; it records what the composer told it. */
function scripted() {
  const told: string[] = []
  const listeners = new Set<() => void>()
  let shown: Assist = { marks: [], ghost: '', menu: null, blocked: null, seen: null }
  const answers = new Map<AssistKey, AssistAnswer>()
  const helper: ComposerHelper = {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    read: () => shown,
    input: (text, caret) => told.push(`input ${text} ${String(caret)}`),
    composing: on => told.push(`composing ${String(on)}`),
    key: key => answers.get(key) ?? { kind: 'pass' },
    take: at => (told.push(`take ${String(at)}`), { kind: 'edit', text: '/review ', caret: 8 }),
    literal: text => `\\${text}`,
    refused: reason => told.push(`refused ${reason}`),
    close: () => told.push('close'),
  }
  const show = (next: Partial<Assist>) =>
    act(() => {
      shown = { ...shown, ...next }
      for (const listener of listeners) listener()
    })
  const opened: string[] = []
  const assistant = {
    open: (tenant: string, session: string) => (opened.push(`${tenant} ${session}`), helper),
  }
  return { assistant, told, show, answers, opened }
}

async function opened() {
  const fake = createFakeClient()
  const mounted = await mountModule(fake.client, TENANT)
  const script = scripted()
  await provideOn(mounted.root, TAKEN.composerAssistant, script.assistant)
  ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '甲' }))
  await settle()
  ;(await fake.next('read-history')).answer({
    outcome: 'succeeded',
    body: page([assistantEntry('1', '1', '内容')], '1'),
  })
  await settle()
  return { ...mounted, fake, ...script }
}

const box = () => screen.getByRole('textbox', { name: '输入消息' })
const sendButton = () => screen.getByRole('button', { name: '发送' })

it('opens a helper for the tenant and the session, and tells it the words, the caret and the IME', async () => {
  const { opened: asked, told } = await opened()
  expect(asked).toEqual([`${TENANT} ses_a`])
  fireEvent.change(box(), { target: { value: '/re' } })
  fireEvent.compositionStart(box())
  fireEvent.compositionEnd(box())
  expect(told).toEqual(['input /re 3', 'composing true', 'input /re 3', 'composing false'])
})

it('draws the marks and the menu the helper gives, and takes a row clicked or the key it holds', async () => {
  const { show, answers, told } = await opened()
  fireEvent.change(box(), { target: { value: '用 /re' } })
  await show({
    marks: [{ from: 2, to: 5, tone: 'reference', label: '引用 /re' }],
    menu: {
      items: [
        { id: 'skill:review', label: '/review', title: '评审', kind: 'Skill', unavailable: null },
        { id: 'skill:old', label: '/old', title: '旧', kind: 'Skill', unavailable: '停用了' },
      ],
      selected: 0,
      note: '句中：只列能引用的 Skill，共 2 项',
    },
  })
  const mark = document.querySelector('.omne-composer-marks mark')
  expect([mark?.textContent, mark?.getAttribute('data-tone')]).toEqual(['/re', 'reference'])
  const rows = screen.getAllByRole('option')
  expect(rows.map(row => row.getAttribute('aria-disabled'))).toEqual(['false', 'true'])
  expect(screen.getByText('停用了')).not.toBeNull()
  expect(box().getAttribute('aria-expanded')).toBe('true')
  fireEvent.mouseDown(rows[0]!)
  expect(told).toContain('take 0')
  expect((box() as HTMLTextAreaElement).value).toBe('/review ')
  answers.set('tab', { kind: 'edit', text: '/release ', caret: 9 })
  fireEvent.keyDown(box(), { key: 'Tab' })
  expect((box() as HTMLTextAreaElement).value).toBe('/release ')
})

it('sends what the helper saw with the words, and nothing when it saw nothing', async () => {
  const { fake, show } = await opened()
  fireEvent.change(box(), { target: { value: '用 /review 看' } })
  await show({ seen: { command: null, references: ['skill:review'] } })
  fireEvent.keyDown(box(), { key: 'Enter' })
  await settle()
  const sent = await fake.next('send-input')
  expect(sent.body).toMatchObject({ seen: { command: null, references: ['skill:review'] } })
  await show({ seen: null })
  fireEvent.change(box(), { target: { value: '你好' } })
  fireEvent.click(sendButton())
  await settle()
  expect((await fake.next('send-input')).body).not.toHaveProperty('seen')
})

it('cannot send a head that would be refused; sending it as it is puts a backslash first and sends no view', async () => {
  const { fake, show } = await opened()
  fireEvent.change(box(), { target: { value: '/nope' } })
  await show({
    blocked: '没有这个命令：/nope',
    menu: { items: [], selected: 0, note: '开头：命令与 Skill，共 0 项' },
  })
  expect(screen.queryByText('没有这个命令：/nope')).toBeNull()
  expect(sendButton()).toHaveProperty('disabled', true)
  fireEvent.change(box(), { target: { value: '/nope 做' } })
  await show({
    blocked: '没有这个命令：/nope',
    menu: null,
    seen: { command: null, references: [] },
  })
  expect(sendButton()).toHaveProperty('disabled', true)
  fireEvent.keyDown(box(), { key: 'Enter' })
  expect(screen.getByText('没有这个命令：/nope')).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '按原样发送' }))
  await settle()
  const sent = await fake.next('send-input')
  expect(JSON.stringify(sent.body)).toContain('\\\\/nope 做')
  expect(sent.body).not.toHaveProperty('seen')
})

it('tells the helper once why the server refused an input, and closes it with the composer', async () => {
  const { fake, told, withdraw } = await opened()
  fireEvent.change(box(), { target: { value: '照 /gone 做' } })
  fireEvent.keyDown(box(), { key: 'Enter' })
  await settle()
  ;(await fake.next('send-input')).answer({
    outcome: 'invalid',
    body: { field: 'value.message', reason: 'what was shown changed: now x, was y' },
  })
  await settle()
  expect(told.filter(line => line.startsWith('refused'))).toEqual([
    'refused what was shown changed: now x, was y',
  ])
  expect(screen.getByText(/原因：what was shown changed/u)).not.toBeNull()
  await withdraw()
  expect(told.at(-1)).toBe('close')
})

it('leaves the caret where the person put it when they type or clear before the taken words are drawn', async () => {
  const { answers } = await opened()
  const field = box() as HTMLTextAreaElement
  answers.set('tab', { kind: 'edit', text: '/release ', caret: 9 })
  fireEvent.keyDown(field, { key: 'Tab' })
  fireEvent.change(field, { target: { value: '/release now' } })
  field.setSelectionRange(12, 12)
  await act(() => new Promise(resolve => requestAnimationFrame(() => resolve(undefined))))
  expect([field.value, field.selectionStart]).toEqual(['/release now', 12])
  fireEvent.keyDown(field, { key: 'Tab' })
  field.select()
  await act(() => new Promise(resolve => requestAnimationFrame(() => resolve(undefined))))
  expect([field.selectionStart, field.selectionEnd]).toEqual([0, 9])
  fireEvent.change(field, { target: { value: '' } })
  await act(() => new Promise(resolve => requestAnimationFrame(() => resolve(undefined))))
  expect([field.value, field.selectionStart]).toEqual(['', 0])
})
