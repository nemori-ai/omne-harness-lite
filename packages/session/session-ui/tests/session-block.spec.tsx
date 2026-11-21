// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { SESSION_BLOCK, sessionBlock, sessionBlockReadsKey } from '../src/cordis.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { listed, listPage, messageEntry, page } from './fixtures/frames.ts'
import { mountModule } from './fixtures/shell.tsx'

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
    const holder = (
      mounted.root as unknown as { get(name: string): { attach(source: unknown): () => void } }
    ).get(sessionBlockReadsKey)
    holder.attach({ readsOf: async () => reads })
  }
  ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
  await settle()
  contribute(mounted.shell)
  fireEvent.click(screen.getByRole('button', { name: '甲' }))
  await settle()
  ;(await fake.next('read-history')).answer({
    outcome: 'succeeded',
    body: page([messageEntry('1', '1', 'user', [WORDS, PICTURE], 'msg_pictured')], '1'),
  })
  await settle()
  return mounted
}

it('附着位置的名字是 session.block', () => {
  expect(SESSION_BLOCK).toBe('session.block')
  expect(sessionBlock.name).toBe(SESSION_BLOCK)
})

it('消息里一块非文字内容的位置由放进来的项画，收到会话、消息、块的标识与这一块的内容', async () => {
  const seen: unknown[] = []
  await opened(shell =>
    sessionBlock.contribute(shell, {
      id: 'pictures',
      order: 0,
      render: ({ scope, subject }) => {
        seen.push({ scope, subject })
        return <span data-testid="drawn">图</span>
      },
    }),
  )
  expect(screen.getByTestId('drawn').closest('.omne-message')).not.toBeNull()
  expect(seen.at(-1)).toEqual({
    scope: TENANT,
    subject: { session: 'ses_a', message: 'msg_pictured', block: 'blk_picture', content: PICTURE },
  })
  expect(screen.queryByText(/〔image〕/u)).toBeNull()
  expect(screen.getByText('看这张图')).not.toBeNull()
})

it('交来了读法的来源时，块的位置还收到模型这一次读的是哪一份', async () => {
  const seen: unknown[] = []
  await opened(
    shell =>
      sessionBlock.contribute(shell, {
        id: 'pictures',
        order: 0,
        render: ({ subject }) => {
          seen.push(subject)
          return <span data-testid="drawn">图</span>
        },
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

it('没有项时宿主画占位的文字：种类与行内的文字兜底或媒体类型', async () => {
  await opened(() => {})
  expect(screen.getByText(/〔image〕/u).textContent).toBe('〔image〕image/png')
})
