// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import { AssetsPage, createGovernance } from '../src/index.ts'
import { assetRow, serveAssetReads } from './fixtures/asset-reads.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'
import { createFakeClient, type FakeClient } from './fixtures/fake-client.ts'
import { namesOf } from './fixtures/names.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

beforeAll(stubAnimation)

afterEach(cleanup)

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

function serveSettings(fake: FakeClient): void {
  void (async () => {
    for (;;)
      (await fake.next('list-settings')).answer({
        outcome: 'succeeded',
        body: { items: [], next: null, completeness: 'complete' },
      })
  })()
}

const text = (value: string): JsonValue => ({ kind: 'string', value })
const object = (entries: Record<string, JsonValue>): JsonValue => ({
  kind: 'object',
  entries: Object.entries(entries).map(([key, value]) => ({ key, value })),
})
const array = (...items: JsonValue[]): JsonValue => ({ kind: 'array', items })

const FIELDS_SCHEMA = object({
  type: text('object'),
  properties: object({
    url: object({ type: text('string'), title: text('地址') }),
    mode: object({ enum: array(text('fast'), text('slow')) }),
    enabled: object({ type: text('boolean') }),
    depth: object({ type: text('integer') }),
  }),
  required: array(text('url')),
})
const LIMITS = { files: 2, fileBytes: 8, totalBytes: 12 }

async function shown(detail: unknown, hint: string | null = null, listed = ['taken']) {
  const fake = createFakeClient()
  serveSettings(fake)
  serveAssetReads(
    fake,
    listed.map(name => assetRow('note', name)),
    undefined,
    { detail, hint },
  )
  render(
    <AssetsPage
      governance={createGovernance({ client: fake.client })}
      tenant={TENANT}
      categoryNames={namesOf({ note: '笔记' })}
    />,
  )
  await settle()
  await settle()
  return fake
}

async function openForm(): Promise<ReturnType<typeof within>> {
  fireEvent.click(screen.getByRole('button', { name: '新建' }))
  await settle()
  return within(screen.getByRole('form', { name: '新建' }))
}

const named = (form: ReturnType<typeof within>, name: string) =>
  fireEvent.change(form.getByLabelText('名字（必填）'), { target: { value: name } })

it('F1 新建的方式是 none 时没有「新建」', async () => {
  await shown({ kind: 'none' })
  expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('笔记')
  expect(screen.queryByRole('button', { name: '新建' })).toBeNull()
})

it('F2 数据型：照 schema 每个属性一个控件，必填的标出来，提交的正文就是填的值；类别的提示只当文本', async () => {
  const fake = await shown({ kind: 'data', schema: FIELDS_SCHEMA }, '<b>先</b>填地址。')
  const form = await openForm()
  expect(form.getByText('<b>先</b>填地址。')).toBeTruthy()
  named(form, 'notes')
  fireEvent.change(form.getByLabelText('地址（必填）'), { target: { value: 'https://x' } })
  fireEvent.click(form.getByRole('radio', { name: 'slow' }))
  fireEvent.click(form.getByRole('switch', { name: 'enabled' }))
  fireEvent.change(form.getByLabelText('depth'), { target: { value: '3' } })
  fireEvent.click(form.getByRole('button', { name: '提交' }))
  const sent = await fake.next('create-asset')
  expect(sent.body).toMatchObject({
    category: 'note',
    name: 'notes',
    body: object({
      url: text('https://x'),
      mode: text('slow'),
      enabled: { kind: 'boolean', value: true },
      depth: { kind: 'number', lexeme: '3' },
    }),
  })
  sent.answer({ outcome: 'succeeded', body: { version: 'v', holding: 'h', changed: true } })
  await settle()
  expect(form.getByText('已新建 notes。')).toBeTruthy()
})

it('F7 被拒照服务端的原因说；结果不明给「认回」，认回用同一个操作标识，答原结局就照它写', async () => {
  const fake = await shown({ kind: 'data', schema: FIELDS_SCHEMA })
  const form = await openForm()
  named(form, 'notes')
  fireEvent.change(form.getByLabelText('地址（必填）'), { target: { value: 'https://x' } })
  fireEvent.click(form.getByRole('button', { name: '提交' }))
  ;(await fake.next('create-asset')).answer({
    outcome: 'invalid',
    body: { reason: '地址不通', missing: ['url'] },
  })
  await settle()
  expect(form.getByText('服务端没有收下：地址不通。缺：url。')).toBeTruthy()

  fireEvent.click(form.getByRole('button', { name: '提交' }))
  const sent = await fake.next('create-asset')
  sent.answer({ outcome: 'unknown' })
  await settle()
  expect(form.getByText(/结果不明/)).toBeTruthy()
  fireEvent.click(form.getByRole('button', { name: '认回' }))
  const recall = await fake.next('query-asset-operation')
  expect(recall.body).toMatchObject({
    operation: (sent.body as { operation: string }).operation,
    request: { kind: 'create-asset', name: 'notes' },
  })
  recall.answer({ outcome: 'succeeded', body: { version: 'v', holding: 'h', changed: true } })
  await settle()
  expect(form.getByText('已新建 notes。')).toBeTruthy()
})

it('F3 一个数字框里不是数：说出来，不能提交', async () => {
  await shown({ kind: 'data', schema: FIELDS_SCHEMA })
  const form = await openForm()
  named(form, 'notes')
  fireEvent.change(form.getByLabelText('depth'), { target: { value: 'three' } })
  expect(form.getByText('「depth」不是一个数。')).toBeTruthy()
  expect((form.getByRole('button', { name: '提交' }) as HTMLButtonElement).disabled).toBe(true)
})

it('F4 认不得的形状退到一个 JSON 文本框，仍能提交；不合法的 JSON 不提交', async () => {
  const nested = object({
    type: text('object'),
    properties: object({ deep: object({ type: text('object') }) }),
  })
  const fake = await shown({ kind: 'data', schema: nested })
  const form = await openForm()
  named(form, 'notes')
  const box = form.getByRole('textbox', { name: '正文（JSON）' })
  fireEvent.change(box, { target: { value: '{nope' } })
  expect(form.getByText('这不是一段合法的 JSON。')).toBeTruthy()
  expect((form.getByRole('button', { name: '提交' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(box, { target: { value: '{"deep":{"a":1}}' } })
  fireEvent.click(form.getByRole('button', { name: '提交' }))
  expect((await fake.next('create-asset')).body).toMatchObject({
    body: object({ deep: object({ a: { kind: 'number', lexeme: '1' } }) }),
  })
})

it('F5 同名已在持：提交之前写明会成为它的新版本', async () => {
  await shown({ kind: 'data', schema: FIELDS_SCHEMA })
  const form = await openForm()
  named(form, 'taken')
  expect(form.getByText('已有同名的 taken：提交后会成为它的新版本。')).toBeTruthy()
})

function picked(path: string, content: string): File {
  const file = new File([content], path.split('/').at(-1)!)
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}

it('F6 目录型：选完显示文件数与总字节，超上限先说明；提交分段送，进度取自服务端的答复', async () => {
  const fake = await shown({ kind: 'directory', limits: LIMITS })
  const form = await openForm()
  named(form, 'review')
  fireEvent.change(form.getByLabelText('选择目录'), {
    target: {
      files: [
        picked('review/SKILL.md', '0123456789'),
        picked('review/a.txt', 'abc'),
        picked('review/b.txt', 'd'),
      ],
    },
  })
  await settle()
  expect(form.getByText('3 个文件，共 14 字节')).toBeTruthy()
  expect(form.getByText(/文件数超过这一类的上限 2 个.*仍可以提交，以服务端的答复为准/)).toBeTruthy()
  fireEvent.click(form.getByRole('button', { name: '提交' }))
  const begin = await fake.next('begin-asset-upload')
  expect(begin.body).toMatchObject({
    name: 'review',
    manifest: [
      { path: 'SKILL.md', bytes: 10 },
      { path: 'a.txt', bytes: 3 },
      { path: 'b.txt', bytes: 1 },
    ],
  })
  begin.answer({ outcome: 'succeeded', body: { partBytes: 64, received: [] } })
  const append = await fake.next('append-asset-upload')
  append.answer({ outcome: 'succeeded', body: { received: 10 } })
  await settle()
  expect(form.getByText(/服务端已收 10 \/ 14 字节/)).toBeTruthy()
})
