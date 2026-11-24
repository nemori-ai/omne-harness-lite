// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Fragment, type ReactNode } from 'react'
import { afterEach, expect, it } from 'vitest'
import { MODEL_PROVIDER_CATEGORY } from '@omne-harness/model-contract/provider-asset'
import { modelProtocol } from '@omne-harness/model-protocol'
import { definePoint } from '@omne-harness/shell-contract'
import { ReferenceShell, serveProtocol, startShellOf } from '@omne-harness/shell-contract/testing'
import { CREDENTIAL_REMEDY_ID, PROVIDER_CATEGORY, createModelUiModule } from '../src/cordis.ts'

type RunFailure = Readonly<{ session: string; cause: string; detail: string | null }>

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

const client = { 'list-models': async () => ({ outcome: 'succeeded', body: { models: [] } }) }
const providers = { page: 'assets', subject: PROVIDER_CATEGORY }
const fragments = (entries: readonly Readonly<{ id: string; node: ReactNode }>[]) =>
  entries.map(entry => <Fragment key={entry.id}>{entry.node}</Fragment>)

afterEach(cleanup)

async function shown(detail: string | null, options = { runFailure, providers }) {
  const { root, shell } = await startShellOf(NavigatingShell)
  runFailure.declare(shell)
  await serveProtocol(root, modelProtocol, client)
  await root.plugin(createModelUiModule(options))
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  render(<>{runFailure.slot(shell, { session: 's1', cause: 'no-reply', detail }, fragments)}</>)
  return shell
}

it('a run that failed for want of a usable key: says so, and 去填 goes to the providers on the assets page', async () => {
  const shell = await shown('model-failed/credential/credential-not-provided')
  expect(screen.getByText(/调用模型的密钥还没填，或者填的不能用/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '去填' }))
  expect(shell.went).toEqual([['assets', 'model-provider']])
})

it('a key the provider turns away fails on the same cause and gets the same words', async () => {
  await shown('model-failed/credential/http-401')
  expect(screen.getByRole('button', { name: '去填' })).toBeTruthy()
})

it.each([
  ['another cause of a failed model call', 'model-failed/upstream-unavailable/connect-failed'],
  ['a failure with no detail', null],
  ['a detail that only mentions the word', 'node-failed/credential'],
])('%s: nothing is put under the reason', async (_, detail) => {
  await shown(detail)
  expect(screen.queryByText(/密钥/)).toBeNull()
})

it('without a place to fill keys in, the words stay and there is no 去填', async () => {
  await shown('model-failed/credential/credential-not-provided', { runFailure } as never)
  expect(screen.getByText(/调用模型的密钥还没填/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: '去填' })).toBeNull()
})

it('puts one item under its own name, and the category is the one Model registers its providers under', async () => {
  const shell = await shown(null)
  expect(shell.items('attached').map(item => item.id)).toEqual([CREDENTIAL_REMEDY_ID])
  expect(PROVIDER_CATEGORY).toBe(MODEL_PROVIDER_CATEGORY)
})
