// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Fragment, type ReactNode } from 'react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { modelProtocol } from '@omne-harness/model-protocol'
import { defineKeyedPoint, serviceKey, type PointItem } from '@omne-harness/shell-contract'
import {
  ReferenceShell,
  provideOn,
  serveProtocol,
  startShellOf,
} from '@omne-harness/shell-contract/testing'
import { MODELS_BLOCK_ID, createModelUiModule } from '../src/cordis.ts'
import { stubAnimation } from './fixtures/dom-stubs.ts'

type Holding = Readonly<{ category: string; name: string }>
type Claiming = PointItem<Holding> & Readonly<{ claims?: readonly string[] }>

const holding = defineKeyedPoint<Holding>({
  name: 'assets.holding',
  subject: { encode: value => JSON.stringify(value), decode: text => JSON.parse(text) as Holding },
})
const claimed: Claiming[] = []
const claimingHolding = {
  ...holding,
  contribute: (shell: Parameters<typeof holding.contribute>[0], key: string, item: Claiming) => {
    claimed.push(item)
    holding.contribute(shell, key, item)
  },
}

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const LIMITS = {
  maxBytes: 65536,
  maxDepth: 16,
  maxItems: 256,
  maxMembers: 64,
  maxStringLength: 4096,
  maxNumberLength: 32,
}
const tree = (value: unknown): JsonValue => {
  const read = readJsonText(JSON.stringify(value), LIMITS)
  if (read.kind !== 'ok') throw new Error('not a document')
  return read.value
}
const plain = (value: JsonValue): unknown => JSON.parse(writeJsonText(value))

const GLM53 = {
  kind: 'llm',
  model: 'z-ai/glm-5.3',
  title: 'GLM 5.3',
  input: ['text'],
  output: ['text'],
  window: '202752',
  efforts: ['low', 'medium', 'high'],
  enabled: true,
}
const GLM52 = {
  ...GLM53,
  model: 'z-ai/glm-5.2',
  title: 'GLM 5.2',
  efforts: ['high', 'xhigh'],
  enabled: false,
}
const VISION = {
  ...GLM53,
  model: 'qwen/vision',
  title: 'qwen/vision',
  input: ['text', 'image', 'audio', 'video', 'file'],
  efforts: [],
}
const JUDGE = {
  kind: 'decisions',
  model: 'z-ai/glm-5.3',
  title: 'GLM 5.3 判定',
  input: ['text'],
  output: ['text'],
  maxQuestions: '200',
  enabled: true,
}
const BODY = { name: 'openrouter', models: [GLM53, GLM52, VISION] }
const BOTH = { name: 'openrouter', models: [GLM53, GLM52, VISION, JUDGE] }

type Own = Readonly<{ kind: 'unset' } | { kind: 'set'; value: JsonValue }>
type Write = Readonly<{ kind: string; notice?: Readonly<{ text: string }> }>
type Settings = Readonly<{
  switches?: Own
  efforts?: Own
  write?: Write
  editable?: boolean
  reason?: string
  readingEfforts?: boolean
}>

const UNSET: Own = { kind: 'unset' }
const setTo = (value: Record<string, unknown>): Own => ({ kind: 'set', value: tree(value) })

function portOf(body: unknown | undefined, first: Settings | undefined) {
  const writes: Array<Readonly<{ key: string; value: unknown }>> = []
  const confirms: string[] = []
  const listeners = new Set<() => void>()
  const row = (key: string, item: string, own: Own, settings: Settings) => ({
    key,
    view: {
      kind: 'ordinary',
      item,
      own,
      editable:
        settings.editable === false
          ? { kind: 'no', reason: settings.reason ?? 'locked' }
          : { kind: 'yes' },
    },
    write: item === 'model-switches' ? (settings.write ?? { kind: 'none' }) : { kind: 'none' },
    read:
      item === 'model-reasoning-efforts' && settings.readingEfforts === true
        ? { kind: 'reading', token: 2 }
        : { kind: 'read' },
  })
  const snapshotOf = (settings: Settings | undefined) => ({
    kind: 'read',
    assets: {
      kind: 'read',
      entries: [
        {
          row: { name: 'openrouter' },
          detail:
            body === undefined
              ? { kind: 'reading' }
              : { kind: 'read', asset: { content: { kind: 'data', body: tree(body) } } },
          settings:
            settings === undefined
              ? []
              : [
                  { key: 'k-secret', view: { kind: 'secret', item: 'api-key', own: 'unset' } },
                  ...(settings.switches === undefined
                    ? []
                    : [row('k-switches', 'model-switches', settings.switches, settings)]),
                  ...(settings.efforts === undefined
                    ? []
                    : [row('k-efforts', 'model-reasoning-efforts', settings.efforts, settings)]),
                ],
        },
      ],
    },
  })
  let snapshot = snapshotOf(first)
  return {
    writes,
    confirms,
    change(settings: Settings) {
      snapshot = snapshotOf(settings)
      for (const listener of listeners) listener()
    },
    port: {
      open: () => ({
        subscribe: (listener: () => void) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        getSnapshot: () => snapshot,
        close: () => {},
        setValue: (key: string, value: JsonValue) => writes.push({ key, value: plain(value) }),
        confirm: (key: string) => confirms.push(key),
      }),
    },
  }
}

const portKey = serviceKey<ReturnType<typeof portOf>['port']>('test.assets')
const client = { 'list-models': async () => ({ outcome: 'succeeded', body: { models: [] } }) }
const fragments = (entries: readonly Readonly<{ id: string; node: ReactNode }>[]) =>
  entries.map(entry => <Fragment key={entry.id}>{entry.node}</Fragment>)

beforeAll(stubAnimation)

afterEach(() => {
  cleanup()
  claimed.length = 0
})

async function settle(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function shown(body: unknown | undefined, settings: Settings | undefined) {
  const { root, shell } = await startShellOf(ReferenceShell)
  shell.tenant = TENANT
  holding.declare(shell)
  const fake = portOf(body, settings)
  await provideOn(root, portKey, fake.port)
  await serveProtocol(root, modelProtocol, client)
  await root.plugin(createModelUiModule({ holding: claimingHolding, assets: portKey }))
  await settle()
  render(
    <>
      {holding.slot(
        shell,
        'model-provider',
        { category: 'model-provider', name: 'openrouter' },
        fragments,
      )}
    </>,
  )
  await settle()
  return fake
}

const rowOf = (title: string) => {
  const cell = screen.getByText(title)
  const row = cell.closest('tr')
  if (row === null) throw new Error(`no row for ${title}`)
  return within(row)
}

it('claims the two model settings, and draws a row for each model of the catalog with its facts', async () => {
  await shown(BODY, { switches: UNSET, efforts: UNSET })
  expect(claimed.find(item => item.id === MODELS_BLOCK_ID)?.claims).toEqual([
    'model-switches',
    'model-reasoning-efforts',
  ])
  expect(screen.getByRole('heading', { name: '模型' })).toBeTruthy()
  expect(screen.queryByText(/不能改/u)).toBeNull()
  expect(screen.getAllByRole('row')).toHaveLength(3)
  const glm = rowOf('GLM 5.3')
  expect(glm.getByText('z-ai/glm-5.3')).toBeTruthy()
  expect(glm.getByText('收：文字 · 发：文字')).toBeTruthy()
  expect(glm.getByText('窗口 202752')).toBeTruthy()
  expect(glm.getByText('low、medium、high')).toBeTruthy()
  expect(rowOf('qwen/vision').getByText('收：文字、图片、声音、视频、文件 · 发：文字')).toBeTruthy()
  expect(rowOf('qwen/vision').getByText('不能调推理强度')).toBeTruthy()
  expect(rowOf('qwen/vision').queryAllByText('qwen/vision')).toHaveLength(1)
})

it('each switch is as this layer holds it over the release default, and says which', async () => {
  await shown(BODY, { switches: setTo({ llm: { 'z-ai/glm-5.2': true } }), efforts: UNSET })
  const on = (title: string) =>
    rowOf(title)
      .getByRole('switch', { name: `启用 ${title}` })
      .getAttribute('aria-checked')
  expect([on('GLM 5.3'), on('GLM 5.2')]).toEqual(['true', 'true'])
  expect(rowOf('GLM 5.3').getByText('发行缺省')).toBeTruthy()
  expect(rowOf('GLM 5.2').getByText('这一层设的')).toBeTruthy()
})

it('turning a switch writes the whole map of this layer with that model changed', async () => {
  const fake = await shown(BODY, {
    switches: setTo({ llm: { 'z-ai/glm-5.2': true } }),
    efforts: UNSET,
  })
  fireEvent.click(rowOf('GLM 5.3').getByRole('switch', { name: '启用 GLM 5.3' }))
  expect(fake.writes).toEqual([
    { key: 'k-switches', value: { llm: { 'z-ai/glm-5.2': true, 'z-ai/glm-5.3': false } } },
  ])
})

it('draws one group for each kind of model, chat first, each with its own rows', async () => {
  await shown(BOTH, { switches: UNSET, efforts: UNSET })
  const groups = screen.getAllByRole('table')
  expect(groups.map(group => group.getAttribute('aria-label'))).toEqual(['聊天', '判定'])
  expect(screen.getByRole('heading', { name: '聊天' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: '判定' })).toBeTruthy()
  expect(within(groups[0] as HTMLElement).getAllByRole('row')).toHaveLength(3)
  expect(within(groups[1] as HTMLElement).getAllByRole('row')).toHaveLength(1)
})

it('a decisions model shows its question limit, takes no effort, and its switch writes under its own kind', async () => {
  const fake = await shown(BOTH, {
    switches: setTo({ llm: { 'z-ai/glm-5.3': true } }),
    efforts: UNSET,
  })
  const judge = rowOf('GLM 5.3 判定')
  expect(judge.getByText('每次至多 200 题')).toBeTruthy()
  expect(judge.queryByText(/窗口/u)).toBeNull()
  expect(judge.queryByRole('combobox')).toBeNull()
  expect(judge.queryByText('不能调推理强度')).toBeNull()
  fireEvent.click(judge.getByRole('switch', { name: '启用 GLM 5.3 判定' }))
  expect(fake.writes).toEqual([
    {
      key: 'k-switches',
      value: { llm: { 'z-ai/glm-5.3': true }, decisions: { 'z-ai/glm-5.3': false } },
    },
  ])
})

it('choosing a default effort writes it, and going back to the provider default takes it out', async () => {
  const fake = await shown(BODY, { switches: UNSET, efforts: setTo({ 'z-ai/glm-5.2': 'high' }) })
  const choose = async (title: string, option: string) => {
    fireEvent.keyDown(rowOf(title).getByRole('combobox', { name: `${title} 的缺省推理强度` }), {
      key: 'Enter',
    })
    fireEvent.click(await screen.findByRole('option', { name: option }))
    await settle()
  }
  expect(
    rowOf('GLM 5.2').getByRole('combobox', { name: 'GLM 5.2 的缺省推理强度' }).textContent,
  ).toContain('high')
  await choose('GLM 5.3', 'medium')
  await choose('GLM 5.2', '供应商默认')
  expect(fake.writes).toEqual([
    { key: 'k-efforts', value: { 'z-ai/glm-5.2': 'high', 'z-ai/glm-5.3': 'medium' } },
    { key: 'k-efforts', value: {} },
  ])
})

it('a stored effort the model no longer takes is named, and the provider default is used', async () => {
  await shown(BODY, { switches: UNSET, efforts: setTo({ 'z-ai/glm-5.3': 'xhigh' }) })
  expect(rowOf('GLM 5.3').getByText('存的是 xhigh，这个模型现在不支持，按供应商默认')).toBeTruthy()
  expect(screen.getAllByText(/现在不支持/u)).toHaveLength(1)
  expect(
    rowOf('GLM 5.3').getByRole('combobox', { name: 'GLM 5.3 的缺省推理强度' }).textContent,
  ).toContain('供应商默认')
})

it('while a write is out the switches wait; a refused one says why; an unknown one can be asked again', async () => {
  const fake = await shown(BODY, {
    switches: UNSET,
    efforts: UNSET,
    write: { kind: 'submitting' },
  })
  const glm = () => rowOf('GLM 5.3').getByRole('switch', { name: '启用 GLM 5.3' })
  expect(glm().hasAttribute('disabled')).toBe(true)
  act(() =>
    fake.change({
      switches: UNSET,
      efforts: UNSET,
      write: { kind: 'refused', notice: { text: '这一项在别处改过了，没有写入。已重新读取。' } },
    }),
  )
  expect(glm().hasAttribute('disabled')).toBe(false)
  expect(screen.getByText('这一项在别处改过了，没有写入。已重新读取。')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '再确认' })).toBeNull()
  expect(document.querySelector('[data-inline-notice]')?.getAttribute('data-tone')).toBe('danger')
  act(() =>
    fake.change({
      switches: UNSET,
      efforts: UNSET,
      write: { kind: 'unknown', notice: { text: '不知道写没写进去。' } },
    }),
  )
  expect(document.querySelector('[data-inline-notice]')?.getAttribute('data-tone')).toBe('caution')
  fireEvent.click(screen.getByRole('button', { name: '再确认' }))
  expect(fake.confirms).toEqual(['k-switches'])
})

it('a setting being read again takes no pick: its controls wait for the read', async () => {
  await shown(BODY, { switches: UNSET, efforts: UNSET, readingEfforts: true })
  const glm = rowOf('GLM 5.3')
  expect(
    glm.getByRole('combobox', { name: 'GLM 5.3 的缺省推理强度' }).hasAttribute('disabled'),
  ).toBe(true)
  expect(glm.getByRole('switch', { name: '启用 GLM 5.3' }).hasAttribute('disabled')).toBe(false)
})

it('settings this layer cannot change are drawn, not offered', async () => {
  await shown(BODY, { switches: UNSET, efforts: UNSET, editable: false })
  expect(
    rowOf('GLM 5.3').getByRole('switch', { name: '启用 GLM 5.3' }).hasAttribute('disabled'),
  ).toBe(true)
  expect(screen.getByText('这两项被上层锁定，这里不能改。')).toBeTruthy()
})

it('a setting this layer may not write for another reason says so in its own words', async () => {
  await shown(BODY, {
    switches: UNSET,
    efforts: UNSET,
    editable: false,
    reason: 'prohibited-above',
  })
  expect(screen.getByText('这一层不能改这两项。')).toBeTruthy()
})

it('says so in one line when the catalog or the settings cannot be read, and takes no room before', async () => {
  await shown(undefined, undefined)
  expect(screen.queryByRole('heading', { name: '模型' })).toBeNull()
  cleanup()
  await shown({ name: 'openrouter' }, { switches: UNSET, efforts: UNSET })
  expect(screen.getByText('读不出这家的模型目录。')).toBeTruthy()
  expect(screen.queryByRole('table')).toBeNull()
  cleanup()
  await shown(BODY, undefined)
  expect(screen.getByText('读不出这家的模型设置。')).toBeTruthy()
  cleanup()
  await shown(BODY, { switches: UNSET })
  expect(screen.getByText('读不出这家的模型设置。')).toBeTruthy()
  cleanup()
  await shown(BODY, { efforts: UNSET })
  expect(screen.getByText('读不出这家的模型设置。')).toBeTruthy()
  expect(screen.queryByRole('table')).toBeNull()
})
