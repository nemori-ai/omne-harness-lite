// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { SESSION_BLOCK_RENDER, sessionBlockRender } from '../src/cordis.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import {
  assistantEntry,
  listed,
  listPage,
  messageEntry,
  page,
  plainEntry,
} from './fixtures/frames.ts'
import { mountModule, providerOf, TAKEN } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const visibility = { toHuman: true, toModel: true }
const PICTURE = {
  kind: 'image',
  id: 'blk_picture',
  visibility,
  ref: { storage: 'local', key: 'k1', mediaType: 'image/png', bytes: '11', digest: 'sha256:k1' },
  transcript: null,
  facts: { kind: 'image', widthPixels: 64, heightPixels: 48 },
}
const WORDS = { kind: 'text', id: 'blk_words', visibility, text: '看这张图' }
const PAPER = {
  ...PICTURE,
  kind: 'file',
  id: 'blk_paper',
  ref: { ...PICTURE.ref, key: 'k2', mediaType: 'application/pdf' },
}

afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function opened(
  contribute: (shell: Awaited<ReturnType<typeof mountModule>>['shell']) => void,
  reads?: ReadonlyMap<string, 'original' | 'fitted' | 'derived' | 'transcript'>,
) {
  const fake = createFakeClient()
  const mounted = await mountModule(fake.client, TENANT)
  if (reads !== undefined) {
    providerOf(mounted.root, TAKEN.blockReads).attach({
      readsOf: async () => ({ blocks: reads, replies: new Map() }),
    })
  }
  ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
  await settle()
  contribute(mounted.shell)
  fireEvent.click(screen.getByRole('button', { name: '甲' }))
  await settle()
  ;(await fake.next('read-history')).answer({
    outcome: 'succeeded',
    body: page([messageEntry('1', '1', 'user', [WORDS, PICTURE, PAPER], 'msg_pictured')], '1'),
  })
  await settle()
  return mounted
}

it('点的名字是 session.block-render，每个种类一项', () => {
  expect(SESSION_BLOCK_RENDER).toBe('session.block-render')
  expect(sessionBlockRender.name).toBe(SESSION_BLOCK_RENDER)
  expect(sessionBlockRender.contract).toMatchObject({ arity: 'keyed-one' })
})

it('消息里一块非文字内容由放在它的种类上的画法画，收到会话、消息、块的标识与这一块的内容；别的种类照旧画占位', async () => {
  const seen: unknown[] = []
  await opened(
    shell =>
      void sessionBlockRender.put(shell, 'image', ({ scope, subject }) => {
        seen.push({ scope, subject })
        return <span data-testid="drawn">图</span>
      }),
  )
  expect(screen.getByTestId('drawn').closest('.omne-message')).not.toBeNull()
  expect(seen.at(-1)).toEqual({
    scope: TENANT,
    subject: { session: 'ses_a', message: 'msg_pictured', block: 'blk_picture', content: PICTURE },
  })
  expect(screen.queryByText(/〔image〕/u)).toBeNull()
  expect(screen.getByText(/〔file〕/u).textContent).toBe('〔file〕application/pdf')
  expect(screen.getByText('看这张图')).not.toBeNull()
})

it('画法抛出时这一块落回占位的文字，别的块不受影响', async () => {
  await opened(shell => {
    sessionBlockRender.put(shell, 'image', () => {
      throw new Error('this drawing is broken')
    })
    sessionBlockRender.put(shell, 'file', () => <span data-testid="paper">文件</span>)
  })
  expect(screen.getByText(/〔image〕/u).textContent).toBe('〔image〕image/png')
  expect(screen.getByTestId('paper')).not.toBeNull()
})

it('交来了读法的来源时，块的位置还收到模型这一次读的是哪一份', async () => {
  const seen: unknown[] = []
  await opened(
    shell =>
      void sessionBlockRender.put(shell, 'image', ({ subject }) => {
        seen.push(subject)
        return <span data-testid="drawn">图</span>
      }),
    new Map([['msg_pictured\nblk_picture', 'fitted']]),
  )
  await settle()
  expect(seen.at(-1)).toMatchObject({
    message: 'msg_pictured',
    block: 'blk_picture',
    read: 'fitted',
  })
})

it('没有画法时宿主画占位的文字：种类与行内的文字兜底或媒体类型', async () => {
  await opened(() => {})
  expect(screen.getByText(/〔image〕/u).textContent).toBe('〔image〕image/png')
})

it('一轮好好结束时，回复下面一行写这一轮最后一次发出的模型与推理强度；读不到不写；失败的一轮照旧写失败', async () => {
  const fake = createFakeClient()
  const mounted = await mountModule(fake.client, TENANT)
  const replies = new Map([['run_1', 'a/model · high（会话选择）']])
  providerOf(mounted.root, TAKEN.blockReads).attach({
    readsOf: async () => ({ blocks: new Map(), replies }),
  })
  ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: '甲' }))
  await settle()
  ;(await fake.next('read-history')).answer({
    outcome: 'succeeded',
    body: page(
      [
        plainEntry('1', '1', 'run.started', { run: 'run_1' }),
        assistantEntry('2', '2', '第一轮的回复'),
        plainEntry('3', '3', 'run.terminal', { terminal: { run: 'run_1', outcome: 'completed' } }),
        plainEntry('4', '4', 'run.started', { run: 'run_2' }),
        assistantEntry('5', '5', '第二轮的回复'),
        plainEntry('6', '6', 'run.terminal', { terminal: { run: 'run_2', outcome: 'completed' } }),
        plainEntry('7', '7', 'run.started', { run: 'run_3' }),
        plainEntry('8', '8', 'run.terminal', { terminal: { run: 'run_3', outcome: 'failed' } }),
      ],
      '8',
    ),
  })
  await settle()
  await settle()
  const lines = [...document.querySelectorAll('.omne-session-reply-receipt')]
  expect(lines.map(line => line.textContent)).toEqual(['a/model · high（会话选择）'])
  expect(screen.queryByText('这一轮已完成')).toBeNull()
  expect(screen.getByText('这一轮失败了')).not.toBeNull()
})
