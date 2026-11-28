// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { Fragment, type ReactNode } from 'react'
import { afterEach, expect, it } from 'vitest'
import { readJsonText } from '@omne-harness/json-text'
import { modelProtocol } from '@omne-harness/model-protocol'
import { defineKeyedPoint, serviceKey } from '@omne-harness/shell-contract'
import {
  ReferenceShell,
  provideOn,
  serveProtocol,
  startShellOf,
} from '@omne-harness/shell-contract/testing'
import { MODELS_BLOCK_ID, PROVIDER_BLOCK_ID, createModelUiModule } from '../src/cordis.ts'

type Holding = Readonly<{ category: string; name: string }>

/** The point the assets module hosts; the case stands in for it and declares it. */
const holding = defineKeyedPoint<Holding>({
  title: 'test',
  name: 'assets.holding',
  subject: { encode: value => JSON.stringify(value), decode: text => JSON.parse(text) as Holding },
})

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
const tree = (value: unknown) => {
  const read = readJsonText(JSON.stringify(value), LIMITS)
  if (read.kind !== 'ok') throw new Error('not a document')
  return read.value
}

const OPENROUTER = {
  name: 'openrouter',
  endpoints: [
    { protocol: 'chat-completions', url: 'https://openrouter.ai/api/v1/chat/completions' },
    { protocol: 'messages', url: 'https://openrouter.ai/api/v1/messages' },
  ],
}

function portOf(body: unknown | undefined) {
  const opened: string[] = []
  const snapshot = {
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
        },
      ],
    },
  }
  return {
    opened,
    port: {
      open: (tenant: string, category: string) => {
        opened.push(`${tenant}|${category}`)
        return {
          subscribe: () => () => undefined,
          getSnapshot: () => snapshot,
          close: () => {},
          setValue: () => {},
          confirm: () => {},
        }
      },
    },
  }
}

const portKey = serviceKey<ReturnType<typeof portOf>['port']>('test.assets')
const client = { 'list-models': async () => ({ outcome: 'succeeded', body: { models: [] } }) }
const fragments = (entries: readonly Readonly<{ id: string; node: ReactNode }>[]) =>
  entries.map(entry => <Fragment key={entry.id}>{entry.node}</Fragment>)

afterEach(cleanup)

async function shown(body: unknown | undefined) {
  const { root, shell } = await startShellOf(ReferenceShell)
  shell.tenant = TENANT
  holding.declare(shell)
  const fake = portOf(body)
  await provideOn(root, portKey, fake.port)
  await serveProtocol(root, modelProtocol, client)
  await root.plugin(createModelUiModule({ holding, assets: portKey }))
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
  })
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
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  return { shell, fake }
}

it('the page of a provider: where its requests go and the interfaces it speaks, read from its body', async () => {
  const { shell, fake } = await shown(OPENROUTER)
  expect(screen.getByRole('heading', { name: '接入方式' })).toBeTruthy()
  expect(screen.getByText('请求发往').nextElementSibling?.textContent).toBe('openrouter.ai')
  expect(screen.getByText('接口').nextElementSibling?.textContent).toBe(
    'Chat Completions、Messages',
  )
  // The access block and the models block each open the category; the port shares one reading.
  expect(fake.opened).toEqual([`${TENANT}|model-provider`, `${TENANT}|model-provider`])
  expect(shell.items('attached').map(item => item.id)).toEqual([PROVIDER_BLOCK_ID, MODELS_BLOCK_ID])
})

it('before its body is read, the block takes no room', async () => {
  await shown(undefined)
  expect(screen.queryByRole('heading', { name: '接入方式' })).toBeNull()
})

it('without the assets port the block draws nothing on the page of a provider', async () => {
  const { root, shell } = await startShellOf(ReferenceShell)
  shell.tenant = TENANT
  holding.declare(shell)
  await serveProtocol(root, modelProtocol, client)
  await root.plugin(createModelUiModule({ holding, assets: portKey }))
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
  expect(screen.queryByRole('heading', { name: '接入方式' })).toBeNull()
})
