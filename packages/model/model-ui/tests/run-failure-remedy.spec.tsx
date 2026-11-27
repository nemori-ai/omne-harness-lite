// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Fragment, type ReactNode } from 'react'
import { afterEach, expect, it } from 'vitest'
import { MODEL_PROVIDER_CATEGORY } from '@omne-harness/model-contract/provider-asset'
import { modelProtocol } from '@omne-harness/model-protocol'
import { definePoint, serviceKey } from '@omne-harness/shell-contract'
import {
  ReferenceShell,
  provideOn,
  serveProtocol,
  startShellOf,
} from '@omne-harness/shell-contract/testing'
import { CREDENTIAL_REMEDY_ID, PROVIDER_CATEGORY, createModelUiModule } from '../src/cordis.ts'

type Fault = Readonly<{ cause: string; upstreamStatus: string | null; throttled: boolean }>
type RunFailure = Readonly<{
  session: string
  cause: string
  detail: string | null
  fault: Fault | null
}>

const REFUSED: Fault = { cause: 'credential', upstreamStatus: '401', throttled: false }
const THROTTLED: Fault = { cause: 'upstream-unavailable', upstreamStatus: '429', throttled: true }
const DOWN: Fault = { cause: 'upstream-unavailable', upstreamStatus: null, throttled: false }

/** The point the session module hosts; the case stands in for it and declares it. */
const runFailure = definePoint<RunFailure>({
  name: 'session.run-failure',
  subject: {
    encode: value => JSON.stringify(value),
    decode: text => JSON.parse(text) as RunFailure,
  },
})

class NavigatingShell extends ReferenceShell {
  readonly went: Array<readonly [string, string | undefined]> = []
  override navigate(pageId: string, subject?: string): void {
    this.went.push([pageId, subject])
  }
}

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

/** The providers of a tenant as the asset governance port gives them, with the states of their key item. */
function portOf(own: string, official: string) {
  const snapshot = {
    kind: 'read',
    assets: {
      kind: 'read',
      entries: [
        {
          row: { name: 'openrouter', summary: null },
          detail: null,
          settings: [{ view: { kind: 'secret', own, official } }],
        },
      ],
    },
  }
  const opened: string[] = []
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
const providers = { page: 'assets', subject: PROVIDER_CATEGORY }
const fragments = (entries: readonly Readonly<{ id: string; node: ReactNode }>[]) =>
  entries.map(entry => <Fragment key={entry.id}>{entry.node}</Fragment>)

afterEach(cleanup)

const chooserKey = serviceKey<Readonly<{ open(session: string): void }>>('test.model-choice')

async function shown(
  told: Readonly<{ cause: string; detail: string | null; fault?: Fault }>,
  keys: readonly [string, string] | null,
  withProviders = true,
  asked: string[] | null = null,
) {
  const failure = { ...told, fault: told.fault ?? null }
  const { root, shell } = await startShellOf(NavigatingShell)
  shell.tenant = TENANT
  runFailure.declare(shell)
  const fake = keys === null ? null : portOf(keys[0], keys[1])
  if (fake !== null) await provideOn(root, portKey, fake.port)
  await serveProtocol(root, modelProtocol, client)
  if (asked !== null)
    await provideOn(root, chooserKey, { open: (session: string) => void asked.push(session) })
  await root.plugin(
    createModelUiModule({
      runFailure,
      assets: portKey,
      modelChoice: chooserKey,
      ...(withProviders ? { providers } : {}),
    }),
  )
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  render(<>{runFailure.slot(shell, { session: 's1', ...failure }, fragments)}</>)
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  return { shell, fake }
}

const NO_KEY = ['unset', 'unset'] as const
const KEYED = ['available', 'unset'] as const

it('a provider with no key at any layer: named under any failed run, and 去填 goes to the providers', async () => {
  const { shell, fake } = await shown({ cause: 'node-failed', detail: null }, NO_KEY)
  expect(screen.getByText('openrouter 还没填密钥。填好之后按「重试」接着做。')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '去填' }))
  expect(shell.went).toEqual([['assets', 'model-provider']])
  expect(fake?.opened).toEqual([`${TENANT}|model-provider`])
})

it('a key the deployment holds counts: nothing is said when no failure points at the key', async () => {
  await shown({ cause: 'node-failed', detail: null }, ['unset', 'available'])
  expect(screen.queryByText(/密钥/)).toBeNull()
})

it('a key that is there but the provider turned away: says so', async () => {
  await shown({ cause: 'no-reply', detail: 'http-401', fault: REFUSED }, KEYED)
  expect(screen.getByText('模型供应商没有收下填的密钥。换一把之后按「重试」接着做。')).toBeTruthy()
  expect(screen.getByRole('button', { name: '去填' })).toBeTruthy()
})

it.each([
  [
    'a provider that limits the rate',
    'http-429',
    THROTTLED,
    '模型供应商在限流，请求没有得到回复。可以稍后按「重试」，或换一个模型再试。',
  ],
  [
    'a provider that is unavailable',
    'in-band-error',
    DOWN,
    '模型供应商暂时不可用，请求没有得到回复。可以稍后按「重试」，或换一个模型再试。',
  ],
])(
  '%s: says so, and 换模型 asks for the model choice of that session',
  async (_, detail, fault, text) => {
    const asked: string[] = []
    await shown({ cause: 'no-reply', detail, fault }, KEYED, true, asked)
    expect(screen.getByText(text)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '去填' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '换模型' }))
    expect(asked).toEqual(['s1'])
  },
)

it('an unavailable provider with no way handed in to choose a model: the sentence alone', async () => {
  await shown({ cause: 'no-reply', detail: 'http-502', fault: DOWN }, KEYED)
  expect(screen.getByText(/模型供应商暂时不可用/)).toBeTruthy()
  expect(screen.queryByRole('button')).toBeNull()
})

it.each([
  ['a cause of a failed model call this module says nothing of', { ...DOWN, cause: 'stream-lost' }],
  ['a failure Model said nothing of', undefined],
])('with a key in place, %s: nothing is put under the reason', async (_, fault) => {
  await shown({ cause: 'no-reply', detail: 'x', ...(fault === undefined ? {} : { fault }) }, KEYED)
  expect(screen.queryByText(/密钥|供应商/)).toBeNull()
})

it('reads the cause from what Model said, never from the text of the diagnosis', async () => {
  await shown({ cause: 'no-reply', detail: 'model-failed/credential/http-401' }, KEYED)
  expect(screen.queryByText(/密钥/)).toBeNull()
})

it('without the assets port only a refused key is said', async () => {
  await shown({ cause: 'no-reply', detail: 'http-401', fault: REFUSED }, null)
  expect(screen.getByText(/没有收下填的密钥/)).toBeTruthy()
  cleanup()
  await shown({ cause: 'node-failed', detail: null }, null)
  expect(screen.queryByText(/密钥/)).toBeNull()
})

it('without a place to fill keys in, the words stay and there is no 去填', async () => {
  await shown({ cause: 'node-failed', detail: null }, NO_KEY, false)
  expect(screen.getByText(/还没填密钥/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: '去填' })).toBeNull()
})

it('puts one item under its own name, and the category is the one Model registers its providers under', async () => {
  const { shell } = await shown({ cause: 'node-failed', detail: null }, KEYED)
  expect(shell.items('attached').map(item => item.id)).toEqual([CREDENTIAL_REMEDY_ID])
  expect(PROVIDER_CATEGORY).toBe(MODEL_PROVIDER_CATEGORY)
})
