// @vitest-environment happy-dom
import type { Context } from '@deepseek-ai/cordis'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { definePoint } from '@omne-harness/shell-contract'
import { CALL_OUTPUT_ID, createToolUiModule, toolClientService } from '../src/cordis.ts'
import { CallOutputStore } from '../src/index.ts'
import { startShell } from './fixtures/reference-shell.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const detail = definePoint<{ readonly session: string; readonly call: string }>({
  name: 'session.call-detail',
  subject: {
    encode: value => JSON.stringify([value.session, value.call]),
    decode: text => {
      const [session, call] = JSON.parse(text) as [string, string]
      return { session, call }
    },
  },
})

afterEach(cleanup)

// happy-dom cancels a notice's arrival animation on unmount; the look is not under test here.
Object.assign(Element.prototype, {
  animate: () => ({ cancel: () => undefined, finished: Promise.resolve() }),
})

const attached = (root: Context) =>
  (root.shell as unknown as { items(slot: 'attached'): { id: string }[] })
    .items('attached')
    .map(item => item.id)

function client(answers: readonly unknown[]) {
  const read = vi.fn(
    async (_input: unknown) => answers[Math.min(read.mock.calls.length - 1, answers.length - 1)],
  )
  return { client: { 'read-call-output': read }, read }
}

describe('the tool-ui module (C26)', () => {
  it('with the Tool client, puts the output into the point it was given; without it, nothing', async () => {
    const { root } = await startShell()
    await root.plugin(createToolUiModule({ callDetail: detail }))
    expect(attached(root)).toEqual([])
    const unprovide = root.reflect.provide(toolClientService, client([]).client)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(attached(root)).toEqual([CALL_OUTPUT_ID])
    unprovide()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(attached(root)).toEqual([])
  })

  it('without a point, it places nothing', async () => {
    const { root } = await startShell()
    root.reflect.provide(toolClientService, client([]).client)
    await root.plugin(createToolUiModule())
    expect(attached(root)).toEqual([])
  })
})

describe('the output of a call as the view keeps it (C26, C24)', () => {
  it('reads the last part first, then only what is new after the position Tool gave', async () => {
    const fake = client([
      {
        outcome: 'succeeded',
        body: { kind: 'open', from: '0', through: '4', total: '4', text: 'one\n' },
      },
      {
        outcome: 'succeeded',
        body: { kind: 'sealed', from: '4', through: '8', total: '8', text: 'two\n' },
      },
    ])
    const store = new CallOutputStore(fake.client as never, 60_000)
    const stop = store.subscribe(TENANT, 'ref-1', () => {})
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)))
    expect(store.read(TENANT, 'ref-1')).toEqual({ kind: 'text', text: 'one\n', sealed: false })
    await store.refresh(TENANT, 'ref-1')
    expect(store.read(TENANT, 'ref-1')).toEqual({ kind: 'text', text: 'one\ntwo\n', sealed: true })
    expect(
      fake.read.mock.calls.map(([input]) => (input as { after: string | null }).after),
    ).toEqual([null, '4'])
    stop()
  })

  it('says when there is no output yet; reading it is the activity mark with its words', async () => {
    const { CallOutput } = await import('../src/index.ts')
    const store = new CallOutputStore(
      client([{ outcome: 'succeeded', body: { kind: 'none' } }]).client as never,
      60_000,
    )
    render(<CallOutput store={store} tenant={TENANT} reference="ref-2" />)
    const reading = screen.getByRole('status', { name: '正在读输出…' })
    expect(reading.querySelector('[data-loading-indicator]')).not.toBeNull()
    // The empty line is weak ink, said at caption size (SPEC 界面模块).
    expect((await screen.findByText('还没有可读的输出')).className).toContain('text-ink-muted')
  })

  it('an output it cannot read is said in words, its outcome kept in 详情; a refusal or an unknown is neutral', async () => {
    const { CallOutput } = await import('../src/index.ts')
    const tones: (string | null)[] = []
    for (const outcome of ['basis-unavailable', 'denied', 'uncertain']) {
      const store = new CallOutputStore(client([{ outcome }]).client as never, 60_000)
      render(<CallOutput store={store} tenant={TENANT} reference="ref-3" />)
      const notice = (await screen.findByText('输出现在读不到。')).closest('[data-inline-notice]')
      expect(notice?.textContent).not.toContain(`读不到：${outcome}`)
      expect(screen.getByRole('button', { name: '详情' })).toBeTruthy()
      expect(notice?.querySelector('code')?.textContent).toBe(outcome)
      tones.push(notice?.getAttribute('data-tone') ?? null)
      cleanup()
    }
    expect(tones).toEqual(['caution', 'neutral', 'neutral'])
  })

  it('the output is a code surface named 调用的输出; while open a neutral 输出还在写, once sealed nothing', async () => {
    const { CallOutput } = await import('../src/index.ts')
    const fake = client([
      {
        outcome: 'succeeded',
        body: { kind: 'open', from: '0', through: '4', total: '4', text: 'one\n' },
      },
      {
        outcome: 'succeeded',
        body: { kind: 'sealed', from: '4', through: '8', total: '8', text: 'two\n' },
      },
    ])
    const store = new CallOutputStore(fake.client as never, 60_000)
    render(<CallOutput store={store} tenant={TENANT} reference="ref-4" />)
    const output = await screen.findByRole('group', { name: '调用的输出' })
    const surface = output.querySelector('.code-surface')
    expect(surface?.querySelector('pre')?.textContent).toBe('one\n')
    const word = output.querySelector('[data-state-word]')
    expect([word?.textContent, word?.getAttribute('data-tone')]).toEqual(['输出还在写', 'neutral'])
    expect(word?.querySelector('[data-loading-indicator]')).toBeNull()
    await act(async () => store.refresh(TENANT, 'ref-4'))
    expect(surface?.querySelector('pre')?.textContent).toBe('one\ntwo\n')
    expect(output.querySelector('[data-state-word]')).toBeNull()
    expect(output.textContent).not.toContain('输出已写完')
  })
})
