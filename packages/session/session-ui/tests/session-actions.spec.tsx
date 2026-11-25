// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import type { ActionItem } from '@omne-harness/shell-contract'
import { afterEach, describe, expect, it } from 'vitest'
import { createFakeClient } from './fixtures/fake-client.ts'
import {
  assistantEntry,
  listed,
  listPage,
  page,
  stateFrame,
  toolCallBlock,
  messageEntry,
} from './fixtures/frames.ts'
import { mountModule } from './fixtures/shell.tsx'
import { providedOn } from '@omne-harness/shell-contract/testing'
import { sessionComposerKey } from '../src/module.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const MAC = /Mac/.test(navigator.platform)
const mod = MAC ? { metaKey: true } : { ctrlKey: true }

afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

/** A session open on the conversation page; with `run`, the state frame says that run is going. */
async function opened(run: string | null, entries = [assistantEntry('1', '1', '内容')]) {
  const fake = createFakeClient()
  const mounted = await mountModule(fake.client, TENANT)
  ;(await fake.next('list-sessions')).answer(
    listPage([listed('ses_a', '甲'), listed('ses_b', '乙')]),
  )
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '甲' }))
  await settle()
  ;(await fake.next('read-history')).answer({ outcome: 'succeeded', body: page(entries, '1') })
  await settle()
  const observation = fake.observations.at(-1)
  if (observation === undefined) throw new Error('no observation')
  act(() => observation.push(stateFrame(run, '1')))
  await settle()
  const action = (id: string): ActionItem => {
    const found = mounted.shell.items('actions').find(item => item.id === id)
    if (found === undefined) throw new Error(`no action ${id}`)
    return found
  }
  return { fake, action, mounted }
}

const box = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: '输入消息' })

describe('the controls of the run on show (C14)', () => {
  it('with no run going, stopping is refused with the reason every trigger gives', async () => {
    const { action } = await opened(null)
    expect(action('session.stop').available()).toBe('没有在做的一轮')
    expect(action('session.force-stop').available()).toBe('没有在做的一轮')
    expect(action('session.background').available()).toBe('没有在等的调用')
    expect(action('session.retry').available()).toBe('没有可以重试的一轮')
  })

  it('stop and force-stop name the run the window sees', async () => {
    const { fake, action } = await opened('run_1')
    expect(action('session.stop').available()).toBe(true)
    await act(async () => void action('session.stop').run())
    expect((await fake.next('cancel-run')).body).toMatchObject({
      run: 'run_1',
      urgency: 'graceful',
    })
    await settle()
    expect(action('session.stop').available()).toBe('这一轮正在停止')
    await act(async () => void action('session.force-stop').run())
    expect((await fake.next('cancel-run')).body).toMatchObject({ run: 'run_1', urgency: 'force' })
  })

  it('a call the run waits on can go to the background or stop, by its id, from its line too', async () => {
    const call = messageEntry('2', '1', 'assistant', [toolCallBlock('call_7', 'shell', {})])
    const { fake, action } = await opened('run_1', [call])
    expect(action('session.background').available()).toBe(true)
    await act(async () => void action('session.background').run())
    const moved = await fake.next('background-call')
    expect(moved.body).toMatchObject({
      session: 'ses_a',
      producer: { kind: 'tool', call: 'call_7' },
    })
    const line = document.querySelector<HTMLElement>(
      '[data-omne-part="session.transcript.tool-call"] [aria-expanded]',
    )
    if (line === null) throw new Error('no tool call line')
    fireEvent.click(line)
    fireEvent.pointerDown(screen.getByRole('button', { name: '这个调用' }), {
      button: 0,
      ctrlKey: false,
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: '停掉这个调用' }))
    const stopped = await fake.next('stop-call')
    expect(stopped.body).toMatchObject({ producer: { kind: 'tool', call: 'call_7' } })
  })
})

describe('one command, whatever triggers it (C15)', () => {
  it('the stop button and the stop action ask Session the same thing of the same run', async () => {
    const { fake, action } = await opened('run_1')
    fireEvent.click(screen.getByRole('button', { name: '停止' }))
    const byButton = (await fake.next('cancel-run')).body as Record<string, unknown>
    fake.calls.findLast(call => call.operation === 'cancel-run')?.answer({ outcome: 'uncertain' })
    await settle()
    await act(async () => void action('session.stop').run())
    const byAction = (await fake.next('cancel-run')).body as Record<string, unknown>
    const { controlId: _a, ...button } = byButton
    const { controlId: _b, ...run } = byAction
    expect(run).toEqual(button)
    expect(run).toMatchObject({ run: 'run_1', urgency: 'graceful' })
  })

  it('what other modules write starts the composer, and what they say goes out as it is', async () => {
    const { fake, mounted } = await opened('run_1')
    const composer = providedOn(mounted.shell, sessionComposerKey)!
    fireEvent.change(box(), { target: { value: '  旧的话' } })
    act(() => void composer.write('/model '))
    expect(box().value).toBe('/model 旧的话')
    act(() => void composer.say('/archive'))
    expect((await fake.next('send-input')).body).toMatchObject({ session: 'ses_a' })
    expect(box().value).toBe('/model 旧的话')
  })
})

describe('the three ways to send (C14)', () => {
  it('Enter, Mod+Enter and Alt+Enter in the composer send as they come, first, and after this run', async () => {
    const { fake } = await opened('run_1')
    fireEvent.change(box(), { target: { value: '一' } })
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect((await fake.next('send-input')).body).not.toHaveProperty('afterRun')
    fireEvent.change(box(), { target: { value: '二' } })
    fireEvent.keyDown(box(), { key: 'Enter', code: 'Enter', ...mod })
    expect((await fake.next('interrupt-input')).body).toMatchObject({ session: 'ses_a' })
    fireEvent.change(box(), { target: { value: '三' } })
    fireEvent.keyDown(box(), { key: 'Enter', code: 'Enter', altKey: true })
    expect((await fake.next('send-input')).body).toMatchObject({ afterRun: 'yes' })
    fireEvent.change(box(), { target: { value: '四' } })
    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true })
    await settle()
    expect(box().value).toBe('四')
  })

  it('while a run goes on, each way and the hard stop are a press away without a key', async () => {
    const { fake } = await opened('run_1')
    fireEvent.change(box(), { target: { value: '等一下再说' } })
    fireEvent.pointerDown(screen.getByRole('button', { name: '更多发法' }), {
      button: 0,
      ctrlKey: false,
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: '等这一轮结束再发' }))
    expect((await fake.next('send-input')).body).toMatchObject({ afterRun: 'yes' })
    fireEvent.pointerDown(screen.getByRole('button', { name: '更多发法' }), {
      button: 0,
      ctrlKey: false,
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: '强制停止这一轮' }))
    expect((await fake.next('cancel-run')).body).toMatchObject({ urgency: 'force' })
  })

  it('the send actions reach the composer on show, and say why not with nothing written', async () => {
    const { fake, action } = await opened('run_1')
    await act(
      async () => void expect(() => action('session.send-first').run()).toThrow('没有要发的内容'),
    )
    fireEvent.change(box(), { target: { value: '先说这句' } })
    await act(async () => void action('session.send-first').run())
    expect((await fake.next('interrupt-input')).body).toMatchObject({ session: 'ses_a' })
  })
})

describe('moving between sessions and to the composer', () => {
  it('next and previous open the sessions of the list in turn; / starts a command in the composer', async () => {
    const { fake, action } = await opened(null)
    await act(async () => void action('session.next').run())
    expect((await fake.next('read-history')).body).toMatchObject({ session: 'ses_b' })
    await act(async () => void action('session.previous').run())
    expect((await fake.next('read-history')).body).toMatchObject({ session: 'ses_a' })
  })

  it('/ puts the caret in the composer after a slash', async () => {
    const { action } = await opened(null)
    expect(action('session.start-command').available()).toBe(true)
    await act(async () => void action('session.start-command').run())
    expect(box().value).toBe('/')
    expect(document.activeElement).toBe(box())
  })
})

describe('a control under a folded face is not there (FE-I57)', () => {
  /** The session open, its permission mode read, and everything the module drew put under an inert face. */
  async function folded() {
    const opening = await opened('run_1')
    ;(await opening.fake.next('read-permission-mode')).answer({
      outcome: 'succeeded',
      body: { mode: 'never', revision: '1' },
    })
    await settle()
    fireEvent.change(box(), { target: { value: '草稿' } })
    const face = document.body.firstElementChild
    if (face === null) throw new Error('nothing is drawn')
    face.setAttribute('inert', '')
    return { ...opening, face }
  }
  const expanded = () =>
    [...document.querySelectorAll('[aria-expanded]')].map(
      element => `${element.getAttribute('aria-expanded')}:${element.getAttribute('data-state')}`,
    )

  it('the pick answers that the control is not there, and neither presses nor focuses it', async () => {
    const { action, face } = await folded()
    const pick = action('session.pick-permission')
    const before = expanded()
    expect(pick.available()).toBe('对话页上现在没有这个控件')
    expect(() => pick.run()).toThrow('对话页上现在没有这个控件')
    await settle()
    expect(expanded()).toEqual(before)
    expect(document.activeElement?.closest('[inert]') ?? null).toBeNull()
    face.removeAttribute('inert')
    expect(pick.available()).toBe(true)
    act(() => void pick.run())
    await settle()
    expect(expanded()).not.toEqual(before)
  })

  it('the ways to send and what another module writes do not reach a folded composer', async () => {
    const { action, fake, mounted, face } = await folded()
    const composer = providedOn(mounted.shell, sessionComposerKey)!
    expect(action('session.send-first').available()).toBe('没有打开的输入框')
    expect(() => action('session.send-first').run()).toThrow('没有打开的输入框')
    expect(composer.write('/model ')).toBe('没有打开的输入框')
    await settle()
    expect(box().value).toBe('草稿')
    expect(fake.calls.some(call => call.operation === 'interrupt-input')).toBe(false)
    face.removeAttribute('inert')
    expect(action('session.send-first').available()).toBe(true)
  })
})

describe('the view actions press what a person would press', () => {
  it('details opens every process line when one is shut and shuts them all when all are open', async () => {
    const calls = messageEntry('2', '1', 'assistant', [
      toolCallBlock('call_1', 'shell', {}),
      toolCallBlock('call_2', 'shell', {}),
    ])
    const { action } = await opened('run_1', [calls])
    const lines = () => [
      ...document.querySelectorAll<HTMLElement>(
        '[data-omne-part="session.transcript.tool-call"] [aria-expanded]:not([aria-haspopup])',
      ),
    ]
    const menus = () =>
      [...document.querySelectorAll('[aria-haspopup="menu"]')].map(menu =>
        menu.getAttribute('aria-expanded'),
      )
    const shown = () => lines().map(line => line.getAttribute('aria-expanded'))
    expect(lines().length).toBe(2)
    fireEvent.click(lines()[0]!)
    expect(shown()).toEqual(['true', 'false'])
    act(() => action('session.details').run())
    expect(shown()).toEqual(['true', 'true'])
    act(() => action('session.details').run())
    expect(shown()).toEqual(['false', 'false'])
    expect(menus().every(state => state !== 'true')).toBe(true)
  })

  it('a control that is not on the page says so instead of doing something else', async () => {
    const { action } = await opened(null)
    for (const part of document.querySelectorAll('button.omne-session-figure[aria-controls]'))
      part.remove()
    expect(() => action('session.side-panel').run()).toThrow('对话页上现在没有这个控件')
  })

  it('the previous of the first session is the last one', async () => {
    const { fake, action } = await opened(null)
    expect(action('session.previous').available()).toBe(true)
    await act(async () => void action('session.previous').run())
    expect((await fake.next('read-history')).body).toMatchObject({ session: 'ses_b' })
  })
})
