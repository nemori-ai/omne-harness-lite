// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import {
  SESSION_COMPOSER_ATTACHMENTS,
  sessionComposerAttachments,
  sessionComposerDraftsKey,
} from '../src/cordis.ts'
import type { ComposerDrafts, DraftOffer } from '../src/model/composer-drafts.ts'
import { createFakeClient } from './fixtures/fake-client.ts'
import { assistantEntry, listed, listPage, page } from './fixtures/frames.ts'
import { mountModule } from './fixtures/shell.tsx'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const PICTURE = {
  kind: 'image',
  ref: { storage: 'local', key: 'k1', mediaType: 'image/png', bytes: '11', digest: 'sha256:k1' },
} as const

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
  ;(await fake.next('list-sessions')).answer(listPage([listed('ses_a', '甲')]))
  await settle()
  const seen: { session: string; draft: string; scope: string | undefined }[] = []
  sessionComposerAttachments.contribute(mounted.shell, {
    id: 'pictures',
    order: 0,
    render: ({ scope, subject }) => {
      seen.push({ ...subject, scope })
      return <span data-testid="pictures">{subject.draft}</span>
    },
  })
  fireEvent.click(screen.getByRole('button', { name: '甲' }))
  await settle()
  ;(await fake.next('read-history')).answer({
    outcome: 'succeeded',
    body: page([assistantEntry('1', '1', '内容')], '1'),
  })
  await settle()
  const drafts = (mounted.root as unknown as { get(name: string): ComposerDrafts }).get(
    sessionComposerDraftsKey,
  )
  const offer = async (ready: boolean, attachments: DraftOffer['attachments'] = [PICTURE]) => {
    const draft = seen.at(-1)?.draft ?? ''
    await act(async () => {
      drafts.offer({ session: 'ses_a', draft, source: 'pictures', attachments, ready })
    })
  }
  return { ...mounted, fake, seen, offer }
}

const sendButton = () => screen.getByRole('button', { name: '发送' })
const kindsOf = (body: unknown) => {
  type Tree = { entries: { key: string; value: { value?: string; items?: Tree[] } }[] }
  const { message } = body as { message: Tree }
  const blocks = message.entries.find(each => each.key === 'blocks')?.value.items ?? []
  return blocks.map(block => block.entries.find(each => each.key === 'kind')?.value.value)
}

it('附着位置的名字是 session.composer-attachments，交回附件的口的键是 session.composer-drafts', () => {
  expect(SESSION_COMPOSER_ATTACHMENTS).toBe('session.composer-attachments')
  expect(sessionComposerAttachments.name).toBe(SESSION_COMPOSER_ATTACHMENTS)
  expect(sessionComposerDraftsKey).toBe('session.composer-drafts')
})

it('放进来的项画在输入框的表单里，收到会话标识、草稿标识与当前租户', async () => {
  const { seen } = await opened()
  const item = screen.getByTestId('pictures')
  expect(item.closest('form')).toBe(
    screen.getByRole('textbox', { name: '输入消息' }).closest('form'),
  )
  expect(seen.at(-1)).toEqual({ session: 'ses_a', draft: item.textContent, scope: TENANT })
  expect(item.textContent).not.toBe('')
})

it('附件没备好时不能发送；备好之后只有附件也能发送，发出之后草稿换新', async () => {
  const { fake, seen, offer } = await opened()
  expect(sendButton()).toHaveProperty('disabled', true)
  await offer(false)
  fireEvent.change(screen.getByRole('textbox', { name: '输入消息' }), {
    target: { value: '看这张图' },
  })
  expect(sendButton()).toHaveProperty('disabled', true)
  fireEvent.change(screen.getByRole('textbox', { name: '输入消息' }), { target: { value: '' } })
  await offer(true)
  expect(sendButton()).toHaveProperty('disabled', false)
  const before = seen.at(-1)?.draft
  fireEvent.click(sendButton())
  await settle()
  const sent = await fake.next('send-input')
  expect(kindsOf(sent.body)).toEqual(['image'])
  expect(seen.at(-1)?.draft).not.toBe(before)
  expect(sendButton()).toHaveProperty('disabled', true)
  expect(screen.getByText('附件 1 份')).not.toBeNull()
})

it('有文字又有附件时，文字块在前、附件块跟在后面，进同一条用户消息', async () => {
  const { fake, offer } = await opened()
  await offer(true, [PICTURE, { ...PICTURE, ref: { ...PICTURE.ref, key: 'k2' } }])
  fireEvent.change(screen.getByRole('textbox', { name: '输入消息' }), {
    target: { value: '看这两张图' },
  })
  fireEvent.click(sendButton())
  await settle()
  const sent = await fake.next('send-input')
  expect(kindsOf(sent.body)).toEqual(['text', 'image', 'image'])
  expect(JSON.stringify(sent.body)).toContain('"k2"')
})

it('没有项、没有附件时，输入框照旧：有文字才能发，发出的只有文字块', async () => {
  const { fake } = await opened()
  fireEvent.change(screen.getByRole('textbox', { name: '输入消息' }), { target: { value: '你好' } })
  fireEvent.click(sendButton())
  await settle()
  expect(kindsOf((await fake.next('send-input')).body)).toEqual(['text'])
})
