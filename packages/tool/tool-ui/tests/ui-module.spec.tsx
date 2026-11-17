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

  it('says when there is no output yet, or when it cannot be read', async () => {
    const { CallOutput } = await import('../src/index.ts')
    for (const [answer, words] of [
      [{ outcome: 'succeeded', body: { kind: 'none' } }, '还没有可读的输出'],
      [{ outcome: 'basis-unavailable' }, '输出现在读不到：basis-unavailable'],
    ] as const) {
      const store = new CallOutputStore(client([answer]).client as never, 60_000)
      render(<CallOutput store={store} tenant={TENANT} reference="ref-2" />)
      expect(await screen.findByText(words)).toBeTruthy()
      cleanup()
    }
  })
})
