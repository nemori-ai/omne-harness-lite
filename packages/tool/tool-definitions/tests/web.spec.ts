// The Web author through real command decoding, `executeTool`, output check and codec. `WebAccess`
// is a scripted double: these tests prove the result text, not the network.
import { describe, expect, it, vi } from 'vitest'
import { createIndependentToolScope, executeTool } from '@omne-harness/tool'
import { readJsonText } from '@omne-harness/json-text'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import {
  attachToolsCapability,
  commandArguments,
  commandGuide,
  deriveDefinition,
  judgeToolDefinition,
} from '@omne-harness/tool-contract/provider'
import { toolAssetBody, toolBodyContract, toolsCapabilityOf } from '@omne-harness/tool-contract'
import {
  attachWebAccess,
  createWebAuthor,
  webAccessOf,
  webToolModule,
  type FetchedPage,
  type SearchHit,
  type WebAccess,
  type WebFailure,
} from '@omne-harness/tool-definitions'

function scope() {
  const answer = createIndependentToolScope({
    limits: {
      authorBufferBytes: 65536,
      authorBufferItems: 100,
      authorWaitHistoryBytes: 65536,
      authorWaitHistoryItems: 100,
    },
    signal: new AbortController().signal,
    process: null,
    waits: null,
  })
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}
function json(value: unknown) {
  const parsed = readJsonText(JSON.stringify(value), {
    maxBytes: 1048576,
    maxDepth: 12,
    maxItems: 128,
    maxMembers: 32,
    maxStringLength: 1048576,
    maxNumberLength: 32,
  })
  if (parsed.kind !== 'ok') throw new Error('test JSON')
  return parsed.value
}
const hits: readonly SearchHit[] = [
  {
    title: 'Node.js permissions',
    url: 'https://nodejs.org/api/permissions.html',
    publishedAt: '2026-05-01T00:00:00.000Z',
    excerpt: 'The Permission Model is a mechanism for restricting access to resources.',
  },
  { title: '掘金文章', url: 'https://juejin.cn/post/1', excerpt: '中文摘录。' },
]
const page: FetchedPage = {
  finalUrl: 'https://example.test/final',
  mediaType: 'text/html',
  markdown: '# Title\n\nBody with 中文.',
  truncated: false,
}
function access(
  search: Awaited<ReturnType<WebAccess['search']>>,
  fetch: Awaited<ReturnType<WebAccess['fetch']>> = { ok: page },
): WebAccess & { search: ReturnType<typeof vi.fn>; fetch: ReturnType<typeof vi.fn> } {
  return { search: vi.fn(async () => search), fetch: vi.fn(async () => fetch) }
}
function fixture(construction: object = { resultMaxBytes: 1048576, maxSearchResults: 10 }) {
  const created = createWebAuthor(json(construction))
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  const implementation = created.ok
  const registration = readToolRegistration(implementation)
  if (registration?.kind !== 'commands') throw new Error('commands')
  const operations = registration.operations
  const definition = deriveDefinition(
    { asset: { name: 'Web', adoption: webToolModule.executor }, requiredCapabilities: [] },
    implementation.facts,
  )
  function decode(command: string, params: unknown) {
    const operation = operations.find(([name]) => name === command)?.[1]
    if (operation === undefined || operation.author.kind !== 'ordinary')
      throw new Error('ordinary command')
    const text = JSON.stringify({ command, params })
    const cut = commandArguments(definition, command, {
      original: text,
      effective: text,
      complete: true,
    })
    const parsed = 'failure' in cut ? cut : operation.author.parameters.parse(cut.ok)
    return { operation: operation.author, parsed }
  }
  async function run(command: string, params: unknown, web?: WebAccess) {
    const { operation, parsed } = decode(command, params)
    if ('failure' in parsed) throw new Error(JSON.stringify(parsed.failure))
    const execution = web === undefined ? scope() : attachWebAccess(scope(), web)
    const result = await executeTool(parsed.ok, operation.executor, null, execution)
    if ('failure' in result) throw new Error(JSON.stringify(result.failure))
    const checked = operation.output.check({ arguments: parsed.ok, value: result.ok })
    if ('failure' in checked) throw new Error(JSON.stringify(checked.failure))
    const bytes = operation.codec.encode(checked.ok)
    if ('failure' in bytes) throw new Error(JSON.stringify(bytes.failure))
    const decoded = operation.codec.decode(bytes.ok)
    if ('failure' in decoded) throw new Error(JSON.stringify(decoded.failure))
    const rendered = operation.renderer.render(decoded.ok)
    if ('failure' in rendered) throw new Error(JSON.stringify(rendered.failure))
    return rendered.ok
  }
  return { implementation, definition, decode, run }
}
const BEGIN = '[external data begins'
const END = '[external data ends]'

describe('Web author: declaration and help', () => {
  it('publishes one wrapped declaration with help, search and fetch, no environment and one secret setting', async () => {
    const test = fixture()
    expect(judgeToolDefinition(test.definition)).toHaveProperty('ok')
    if (test.definition.kind !== 'commands') throw new Error('commands')
    expect(test.definition.encoding).toBe('wrapped')
    expect(test.definition.commands.map(item => item.name)).toEqual(['help', 'search', 'fetch'])
    expect(test.implementation.facts.backgroundAllowed).toBe(false)
    expect(test.implementation.facts.declarations).toMatchObject({
      environment: null,
      inputModalities: ['text'],
      outputModalities: ['text'],
    })
    expect(test.implementation.facts.declarations.settings?.items).toEqual([
      expect.objectContaining({ path: ['exa', 'apiKey'], category: 'binding', sensitive: true }),
    ])
    // The menu is not repeated in the description: the declaration adds it (D-94).
    expect(test.implementation.facts.description).not.toContain('{"command"')
    const help = await test.run('help', {})
    expect(help).toBe(`done Web help\n${commandGuide(test.definition)}`)
    expect(help).toContain('\nsearch {query, limit?} - ')
    expect(help).toContain('\nfetch {url} - ')
    const search = await test.run('help', { name: 'search' })
    expect(search).toBe(`done Web help search\n${commandGuide(test.definition, 'search')}`)
    expect(search).toContain('Usage: Web {"command": "search", "params": {query, limit?}}')
    expect(search).toContain('exa.apiKey')
    expect(test.decode('help', { name: 'browse' }).parsed).toHaveProperty('failure')
  })

  it('declares exa.apiKey as a secret Settings item', () => {
    const test = fixture()
    const projected = toolBodyContract().settings?.(toolAssetBody(test.definition), {
      capabilityName: test.definition.name,
      definition: test.definition.adoption.digest,
    })
    expect(projected?.items).toEqual([
      expect.objectContaining({
        id: 'exa.apiKey',
        category: 'binding',
        sensitivity: 'secret',
        default: { kind: 'absent' },
        valueSchema: { type: 'string', minLength: 1 },
      }),
    ])
    expect(projected?.items[0]?.presentation).toMatchObject({ adoption: 'next-read' })
    expect(projected?.items[0]?.presentation.clear).toContain('fetch')
  })

  it('the definition does not depend on the construction values (the release manifest fixes it)', () => {
    const small = fixture({ resultMaxBytes: 1, maxSearchResults: 1 })
    const large = fixture({ resultMaxBytes: 65536, maxSearchResults: 10 })
    expect(JSON.stringify(small.definition)).toBe(JSON.stringify(large.definition))
  })

  it('requires both positive construction values', () => {
    expect(createWebAuthor(json({ resultMaxBytes: 4096 }))).toMatchObject({
      failure: { field: 'construction', reason: 'missing-field:maxSearchResults' },
    })
    expect(createWebAuthor(json({ resultMaxBytes: 4096, maxSearchResults: 0 }))).toMatchObject({
      failure: { field: 'construction', reason: 'invalid-field:maxSearchResults' },
    })
    expect(
      createWebAuthor(json({ resultMaxBytes: 4096, maxSearchResults: 5, exaKey: 'x' })),
    ).toMatchObject({ failure: { field: 'construction' } })
  })
})

describe('Web author: search', () => {
  it('lists title, url, optional publication time and excerpt inside external data marks', async () => {
    const test = fixture()
    const web = access({ ok: hits })
    const text = await test.run('search', { query: 'node permissions', limit: 3 }, web)
    expect(web.search).toHaveBeenCalledWith(
      { query: 'node permissions', limit: 3 },
      expect.any(AbortSignal),
    )
    expect(text.startsWith('done Web search query="node permissions" results=2\n')).toBe(true)
    const begin = text.indexOf(BEGIN)
    const end = text.indexOf(END)
    expect(begin).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(begin)
    const body = text.slice(begin, end)
    expect(body).toContain(
      '1. Node.js permissions\n   url=https://nodejs.org/api/permissions.html\n',
    )
    expect(body).toContain('   published=2026-05-01T00:00:00.000Z\n')
    expect(body).toContain('   The Permission Model is a mechanism')
    expect(body).toContain('2. 掘金文章\n   url=https://juejin.cn/post/1\n   中文摘录。')
    expect(body).not.toContain('published=undefined')
  })

  it('zero results is a success that says there are no results, not a failure', async () => {
    const test = fixture()
    const text = await test.run('search', { query: 'nothing here' }, access({ ok: [] }))
    expect(text.startsWith('done Web search query="nothing here" results=0\n')).toBe(true)
    expect(text).toContain('no results')
    expect(text).not.toMatch(/^(unavailable|upstream|network) /u)
  })

  it('uses the default count without limit and reduces a limit above maxSearchResults to it', async () => {
    const test = fixture({ resultMaxBytes: 1048576, maxSearchResults: 4 })
    const web = access({ ok: [] })
    await test.run('search', { query: 'q' }, web)
    expect(web.search).toHaveBeenLastCalledWith({ query: 'q', limit: 4 }, expect.any(AbortSignal))
    await test.run('search', { query: 'q', limit: 99 }, web)
    expect(web.search).toHaveBeenLastCalledWith({ query: 'q', limit: 4 }, expect.any(AbortSignal))
    const wide = fixture({ resultMaxBytes: 1048576, maxSearchResults: 10 })
    const other = access({ ok: [] })
    await wide.run('search', { query: 'q' }, other)
    expect(other.search).toHaveBeenLastCalledWith({ query: 'q', limit: 5 }, expect.any(AbortSignal))
  })

  it('refuses invalid parameters before the port is called', () => {
    const test = fixture()
    expect(test.decode('search', { query: 'q', limit: 0 }).parsed).toMatchObject({
      failure: { kind: 'invalid', reason: 'invalid-field:limit' },
    })
    expect(test.decode('search', { query: 'q', limit: 1.5 }).parsed).toHaveProperty('failure')
    expect(test.decode('search', { query: '   ' }).parsed).toMatchObject({
      failure: { kind: 'invalid', reason: 'invalid-field:query' },
    })
    expect(test.decode('search', {}).parsed).toMatchObject({
      failure: { kind: 'invalid', reason: 'missing-field:query' },
    })
    expect(test.decode('search', { query: 'q', tenant: 't' }).parsed).toMatchObject({
      failure: { kind: 'invalid', reason: 'invalid-field:tenant' },
    })
    expect(test.decode('fetch', { url: '' }).parsed).toMatchObject({
      failure: { kind: 'invalid', reason: 'invalid-field:url' },
    })
    expect(test.decode('fetch', { url: 'https://a', limit: 1 }).parsed).toHaveProperty('failure')
  })
})

describe('Web author: fetch', () => {
  it('writes the final url, the media type and the Markdown body inside external data marks', async () => {
    const test = fixture()
    const web = access({ ok: [] })
    const text = await test.run('fetch', { url: 'https://example.test/start' }, web)
    expect(web.fetch).toHaveBeenCalledWith(
      { url: 'https://example.test/start' },
      expect.any(AbortSignal),
    )
    expect(
      text.startsWith(
        'done Web fetch url=https://example.test/final media_type=text/html truncated=false\n',
      ),
    ).toBe(true)
    expect(text).toContain(`${BEGIN}`)
    expect(text).toContain('\n# Title\n\nBody with 中文.\n')
    expect(text.trimEnd().endsWith(END)).toBe(true)
  })

  it('says truncated=true when the provider cut the body', async () => {
    const test = fixture()
    const web = access({ ok: [] }, { ok: { ...page, truncated: true } })
    const text = await test.run('fetch', { url: 'https://example.test/big' }, web)
    expect(text).toContain(' truncated=true\n')
    expect(text).toContain('cut the page body')
  })

  it('a body over resultMaxBytes is cut with the tool truncation marker and stays within the bound', async () => {
    const test = fixture({ resultMaxBytes: 600, maxSearchResults: 5 })
    const long = { ...page, markdown: 'x'.repeat(5000) }
    const text = await test.run(
      'fetch',
      { url: 'https://example.test/long' },
      access({ ok: [] }, { ok: long }),
    )
    expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(600)
    expect(text).toMatch(/\n\[tool truncated bytes \d+\.\.\d+ of \d+\]\n/u)
    expect(text.startsWith('done Web fetch url=')).toBe(true)
    expect(text.trimEnd().endsWith(END)).toBe(true)
  })
})

describe('Web author: failures', () => {
  const failures: readonly WebFailure[] = [
    { kind: 'unconfigured' },
    { kind: 'denied' },
    { kind: 'quota-exhausted' },
    { kind: 'rate-limited' },
    { kind: 'upstream', status: 503 },
    { kind: 'invalid-url' },
    { kind: 'redirect-limit' },
    { kind: 'timeout' },
    { kind: 'too-large' },
    { kind: 'not-text', mediaType: 'image/png' },
    { kind: 'network', diagnostic: 'ECONNREFUSED' },
    { kind: 'unavailable', diagnostic: 'provider shape' },
  ]
  it.each(failures.map(failure => [failure.kind, failure] as const))(
    'search %s is one failure line that starts with the kind and gives a reason',
    async (kind, failure) => {
      const test = fixture()
      const text = await test.run('search', { query: 'q' }, access({ failure }))
      expect(text.startsWith(`${kind} reason=`)).toBe(true)
      expect(text).not.toContain(BEGIN)
      expect(text).not.toContain('done ')
    },
  )
  it.each(failures.map(failure => [failure.kind, failure] as const))(
    'fetch %s is the same failure line',
    async (kind, failure) => {
      const test = fixture()
      const text = await test.run(
        'fetch',
        { url: 'https://x.test/' },
        access({ ok: [] }, { failure }),
      )
      expect(text.startsWith(`${kind} reason=`)).toBe(true)
    },
  )
  it('unconfigured names the Web setting exa.apiKey; upstream carries the status; not-text the media type', async () => {
    const test = fixture()
    expect(
      await test.run('search', { query: 'q' }, access({ failure: { kind: 'unconfigured' } })),
    ).toContain('Web setting exa.apiKey')
    expect(
      await test.run(
        'search',
        { query: 'q' },
        access({ failure: { kind: 'upstream', status: 502 } }),
      ),
    ).toContain('status=502')
    expect(
      await test.run(
        'fetch',
        { url: 'https://x.test/' },
        access({ ok: [] }, { failure: { kind: 'not-text', mediaType: 'image/png' } }),
      ),
    ).toContain('media_type="image/png"')
    expect(
      await test.run(
        'fetch',
        { url: 'https://x.test/' },
        access({ ok: [] }, { failure: { kind: 'network', diagnostic: 'reset' } }),
      ),
    ).toBe('network reason=reset')
  })
  it('without an attached port, search and fetch answer unavailable; help still answers', async () => {
    const test = fixture()
    expect(await test.run('search', { query: 'q' })).toMatch(/^unavailable reason=.*not attached/u)
    expect(await test.run('fetch', { url: 'https://x.test/' })).toMatch(/^unavailable reason=/u)
    expect((await test.run('help', {})).startsWith('done Web help\n')).toBe(true)
  })
})

describe('attachWebAccess', () => {
  it('keeps the Tools context and clears both attachments before finishing once', async () => {
    const original = scope()
    const finish = vi.fn(original.finish.bind(original))
    const close = vi.fn(async () => {
      expect(webAccessOf(attached.context)).toBeUndefined()
      expect(toolsCapabilityOf(attached.context)).toBeUndefined()
    })
    const tools = {
      search: async () => ({
        failure: { kind: 'unavailable' as const, dependency: 'test', diagnostic: 'offline' },
      }),
      inspect: async () => ({
        failure: { kind: 'unavailable' as const, dependency: 'test', diagnostic: 'offline' },
      }),
      execute: async () => {
        throw new Error('unused')
      },
      readResult: async () => {
        throw new Error('unused')
      },
    }
    const withTools = attachToolsCapability({ ...original, finish }, { value: tools, close })
    const web = access({ ok: [] })
    const attached = attachWebAccess(withTools, web)
    expect(attached.context).toBe(withTools.context)
    expect(webAccessOf(attached.context)).toBe(web)
    expect(toolsCapabilityOf(attached.context)).toBe(tools)
    const first = attached.finish('returned')
    expect(attached.finish('failed')).toBe(first)
    await expect(first).resolves.toHaveProperty('ok')
    expect(webAccessOf(attached.context)).toBeUndefined()
    expect(toolsCapabilityOf(attached.context)).toBeUndefined()
    expect(finish).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })
})
