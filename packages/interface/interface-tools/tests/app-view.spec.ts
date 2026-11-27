import { readJsonText } from '@omne-harness/json-text'
import { succeed } from '@omne-harness/operation-result'
import { createIndependentToolScope } from '@omne-harness/tool'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import { commandArguments, deriveDefinition } from '@omne-harness/tool-contract/provider'
import { describe, expect, it } from 'vitest'
import {
  appViewToolModule,
  attachAppView,
  createAppViewAuthor,
  type AppViewSource,
  type LookAsked,
  type Looked,
} from '@omne-harness/interface-tools'

const ONE_PIXEL = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  each => each.charCodeAt(0),
)
const BUDGET = {
  imageMaxWidth: 4096,
  imageMaxHeight: 4096,
  imageMaxDecodedBytes: 1 << 26,
  imageConcurrency: 2,
}

function json(value: unknown) {
  const read = readJsonText(JSON.stringify(value), {
    maxBytes: 65_536,
    maxDepth: 16,
    maxItems: 256,
    maxMembers: 64,
    maxStringLength: 4096,
    maxNumberLength: 32,
  })
  if (read.kind !== 'ok') throw new Error('json')
  return read.value
}

function tool(construction: object = { resultMaxBytes: 65_536, ...BUDGET }) {
  const created = createAppViewAuthor(json(construction))
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  const read = readToolRegistration(created.ok)
  if (read?.kind !== 'commands') throw new Error('commands')
  const definition = deriveDefinition(
    { asset: { name: 'AppView', adoption: appViewToolModule.executor }, requiredCapabilities: [] },
    created.ok.facts,
  )
  return { read, definition }
}

/** One call of AppView with the given answer of the application; what it asked and kept is recorded. */
async function call(params: unknown, answer: Looked) {
  const { read, definition } = tool()
  const operation = read.operations.find(([name]) => name === 'look')?.[1]
  if (operation === undefined || operation.author.kind !== 'structured')
    throw new Error('structured')
  const text = JSON.stringify({ command: 'look', params })
  const cut = commandArguments(definition, 'look', {
    original: text,
    effective: text,
    complete: true,
  })
  if ('failure' in cut) return { failure: cut.failure, asked: [], kept: [] }
  const parsed = operation.author.parameters.parse(cut.ok)
  if ('failure' in parsed) return { failure: parsed.failure, asked: [], kept: [] }
  const asked: LookAsked[] = []
  const kept: string[] = []
  const source: AppViewSource = {
    async look(given) {
      asked.push(given)
      return answer
    },
    media: {
      async put({ mediaType, bytes }) {
        kept.push(mediaType)
        return succeed({
          ref: {
            storage: 'media',
            key: `kept-${String(bytes.byteLength)}`,
            mediaType,
            bytes: String(bytes.byteLength),
            digest: `sha256:${'d'.repeat(64)}`,
          },
          facts: { kind: 'image', widthPixels: 1, heightPixels: 1 },
        })
      },
    },
  }
  const created = createIndependentToolScope({
    signal: new AbortController().signal,
    limits: {
      authorBufferBytes: 65_536,
      authorBufferItems: 100,
      authorWaitHistoryBytes: 65_536,
      authorWaitHistoryItems: 100,
    },
    process: null,
    waits: null,
  })
  if ('failure' in created) throw new Error('scope')
  const { context } = attachAppView(created.ok, source)
  const result = await operation.author.executor.execute(parsed.ok as never, null, context)
  return { result, asked, kept }
}

const textOf = (result: unknown) =>
  (result as { content: { kind: string; text?: string }[] }).content
    .filter(block => block.kind === 'text')
    .map(block => block.text)

describe('AppView look', () => {
  it('asks the application for the page in the mode, the defaults filled in, and keeps the picture as a product of the call', async () => {
    const image = { bytes: ONE_PIXEL, width: 1, height: 1 }
    const { result, asked, kept } = await call(
      { page: 'notes', theme: 'dark' },
      { kind: 'image', image },
    )
    expect(asked).toEqual([
      {
        page: 'notes',
        mode: {
          theme: 'dark',
          size: 'medium',
          look: { kind: 'built-in' },
          width: 1280,
          height: 800,
        },
      },
    ])
    expect(kept).toEqual(['image/png'])
    const content = (result as unknown as { content: readonly { kind: string }[] }).content
    expect(content.map(block => block.kind)).toEqual(['text', 'image'])
    expect(textOf(result)).toEqual([
      'done AppView look page="notes" theme=dark size=medium viewport=1280x800 image_pixels=1x1',
    ])
  })

  it('says the app is not open, and gives no picture, when no client of the tenant is there (IV-2)', async () => {
    const { result, kept } = await call({ page: 'notes' }, { kind: 'client-absent' })
    expect(kept).toEqual([])
    expect(textOf(result)[0]).toMatch(/^unavailable reason=client-absent page="notes"/u)
  })

  it('passes on why the app could not draw it', async () => {
    const { result } = await call({ page: 'nowhere' }, { kind: 'cannot', reason: 'no-page' })
    expect(textOf(result)[0]).toMatch(/^rejected reason=no-page page="nowhere"/u)
  })

  it('does not ask the application for a mode out of bounds (IV-5)', async () => {
    const { result, asked } = await call({ page: 'notes', width: 100 }, { kind: 'client-absent' })
    expect(asked).toEqual([])
    expect(textOf(result)[0]).toMatch(/^rejected reason=bad-mode/u)
  })

  it('refuses a field it does not have, rather than dropping it', async () => {
    const answer = await call({ page: 'notes', zoom: 2 }, { kind: 'client-absent' })
    expect(answer).toHaveProperty('failure')
  })
})
