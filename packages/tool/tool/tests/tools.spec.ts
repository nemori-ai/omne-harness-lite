import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { createTools, type ToolsReadRuntime } from '@omne-harness/tool'
import { projectToolResult, type ToolResult } from '@omne-harness/tool-contract'
import { judgeContentBlock } from '@omne-harness/content-block'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import {
  access,
  authorRun,
  body,
  options,
  page,
  registeredFixture,
  result,
  sourceFixture,
  token,
  version,
  visible,
} from './tools-values.ts'
import { ok, principalB, tenantB, type Block, type Principal } from './runtime-values.ts'

function provider(
  read: ToolsReadRuntime<Principal>['queries']['readResult'],
): ToolsReadRuntime<Principal> {
  return {
    queries: { readResult: read },
    content: {
      read: async () => {
        throw new Error('unexpected content read')
      },
    },
  }
}
function encode(prefix: string, fields: unknown[]) {
  return `${prefix}.${Buffer.from(JSON.stringify(fields)).toString('base64url')}`
}
function decode(text: string): unknown[] {
  const parsed: unknown = JSON.parse(
    Buffer.from(text.slice(text.indexOf('.') + 1), 'base64url').toString(),
  )
  if (!Array.isArray(parsed)) throw new Error('not array')
  return parsed
}
const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value))

describe('Tools real author registration and presentation', () => {
  it('registers two structured nonprogrammable commands with closed declared schemas and real codecs', async () => {
    const f = await sourceFixture()
    const definition = f.tools.author.definition
    expect(definition.name).toBe('Tools')
    expect(definition.programmable).toBe(false)
    if (definition.kind !== 'commands') throw new Error('not commands')
    expect(definition.commands.map(command => command.name)).toEqual(['help', 'read_result'])
    for (const command of definition.commands) {
      expect(command.returns).toEqual({ kind: 'structured', program: { kind: 'none' } })
      expect(command.parameters.kind).toBe('declared')
    }
    const help = ok(await authorRun(f.tools, 'help', '{}'))
    expect(body(help)).toContain('"additionalProperties":false')
    expect(body(help)).toContain('"oneOf"')
    expect(body(help)).toContain('completed Tools invocation')
    const detailed = ok(await authorRun(f.tools, 'help', '{"command":"read_result"}'))
    expect(body(detailed)).toContain('USAGE: Tools(command="read_result"')
    expect(body(ok(await authorRun(f.tools, 'help', '{"command":"raw"}')))).toContain(
      'ERROR: invalid',
    )
    expect(await authorRun(f.tools, 'raw', '{}')).toHaveProperty('failure')
  })
  it.each([
    '{}',
    '{"kind":"result","reference":"x"}',
    '{"kind":"raw","reference":"x","after":null}',
    '{"kind":"result","reference":"","after":null}',
    '{"kind":"result","reference":"x","after":""}',
    '{"kind":"result","reference":"x","after":null,"tenant":"a"}',
    '{"kind":"result","kind":"attachment","reference":"x","after":null}',
    '{"kind":"result"',
  ])('rejects invalid or incomplete parameters before reading %s', async args => {
    const tools = createTools(
      provider(async () => {
        throw new Error('must not read')
      }),
      options,
    )
    expect(await authorRun(tools, 'read_result', args)).toHaveProperty('failure')
  })
  it('uses parameter completeness and strict help schema and input budgets', async () => {
    const tools = createTools(
      provider(async () => {
        throw new Error('must not read')
      }),
      { ...options, arguments: { ...options.arguments, maxBytes: 32 } },
    )
    expect(
      await authorRun(tools, 'help', { original: '{}', effective: '{}', complete: false }),
    ).toMatchObject({ failure: { kind: 'incomplete' } })
    for (const args of [
      '{"command":"a","command":"b"}',
      '{"other":1}',
      '{"command":null}',
      JSON.stringify({ command: 'a'.repeat(100) }),
    ])
      expect(await authorRun(tools, 'help', args)).toHaveProperty('failure')
  })
  it('preserves block order, visibility and visible refs without forwarding source data', async () => {
    const judged = judgeContentBlock({
      kind: 'image',
      id: 'photo',
      visibility: { toHuman: true, toModel: true },
      ref: {
        storage: 'logical',
        key: 'photo',
        mediaType: 'image/png',
        bytes: '4',
        digest: 'sha256:photo',
      },
      transcript: null,
    })
    if ('rejected' in judged) throw new Error('invalid ref')
    const ref = judged.ok
    if (!('ref' in ref)) throw new Error('not ref')
    const source: ToolResult<Block> = {
      ...result([
        visible('Tools.status', 'first'),
        ref,
        { ...visible('hidden', 'private'), visibility: { toHuman: true, toModel: false } },
        visible('last', 'last'),
      ]),
      data: {
        kind: 'json',
        contract: { owner: 'test', name: 'program', revision: '1', digest: 'sha256:x' },
        schema: { id: 'program', revision: '1', digest: 'sha256:x' },
        value: { kind: 'string', value: 'secret-data' },
      },
    }
    const f = await sourceFixture(source)
    const displayed = await f.tools.present(f.access)
    expect(displayed.content.slice(1)).toEqual(source.content)
    expect(displayed.content[0]?.id).not.toBe('Tools.status')
    expect(displayed.data).toEqual({ kind: 'none' })
    expect(JSON.stringify(displayed)).not.toContain('secret-data')
    const projected = ok(projectToolResult(displayed, []))
    expect(JSON.stringify(projected)).toContain('photo')
    expect(JSON.stringify(projected.filter(block => block.visibility.toModel))).not.toContain(
      'private',
    )
  })
  it('returns a new full meta response through the actual runtime when source blocks and status need another page', async () => {
    const f = await sourceFixture(
      result([
        visible('one', '中'.repeat(550)),
        visible('two', 'y'.repeat(1900)),
        visible('three', 'z'.repeat(1900)),
        visible('four', 'q'.repeat(1900)),
      ]),
    )
    const first = await f.tools.present(f.access)
    const reference = token(first, 'reference'),
      next = token(first, 'next')
    expect(next).not.toBe('null')
    const registered = registeredFixture(f.tools)
    const reply = await registered.invoke('read_result', { kind: 'result', reference, after: next })
    const full = ok(reply.full)
    expect(full.content.slice(1).map(block => block.id)).toEqual(['three', 'four'])
    expect(token(full, 'next')).toBe('null')
    expect(registered.calls()).toBe(1)
    const pageOne = ok(
      await registered.h.runtime.queries.readResult({
        ...f.access,
        reference: reply.reference,
        result: reply.result,
        after: null,
      }),
    )
    expect(pageOne.next).not.toBeNull()
    expect(pageOne.value.content.length).toBeLessThan(full.content.length)
    expect(reply.state.terminal.kind).toBe('completed')
  })
  it('distinguishes source failure, read denial, byte failures and meta completion without disclosing partial source', async () => {
    const failedSource = createTools(
      provider(async () =>
        succeed({
          ...page(result([visible('body', 'source')])),
          terminal: { kind: 'failed', cause: 'executor', diagnostic: 'secret-diagnostic' },
        }),
      ),
      options,
    )
    const first = await failedSource.present(access)
    expect(body(first)).toContain('failed')
    expect(body(first)).toContain('reading')
    expect(body(first)).not.toContain('secret-diagnostic')
    const denied = createTools(
      provider(async () => fail({ kind: 'denied', action: 'read-result' })),
      options,
    )
    const registered = registeredFixture(denied)
    const reply = await registered.invoke('read_result', {
      kind: 'result',
      reference: token(first, 'reference'),
      after: null,
    })
    expect(reply.state.terminal.kind).toBe('completed')
    const failure = ok(reply.full)
    expect(body(failure)).toContain('denied')
    expect(failure.content).toHaveLength(1)
    expect(failure.attachments).toEqual([])
    expect(body(failure)).not.toContain('next')
    const f = await sourceFixture()
    expect(
      body(await f.tools.present({ ...f.access, principal: principalB, tenant: tenantB })),
    ).toContain('denied')
  })
})

describe('Tools canonical references and attachment bytes', () => {
  it('rejects reference versions, noncanonical encodings and cursor identity or projection changes', async () => {
    const tools = createTools(
      provider(async input =>
        succeed(
          page(result([visible('body', 'source')]), input.after === null ? 'position-one' : null),
        ),
      ),
      options,
    )
    const first = await tools.present(access)
    const reference = token(first, 'reference'),
      after = token(first, 'next')
    const cursor = decode(after)
    for (const bad of [
      after + '=',
      after.replace('tc1.', 'tc2.'),
      encode('tc1', [1, 'attachment', reference, 'bytes', 'position-one']),
      encode('tc1', [1, 'result', reference, 'bytes', 'position-one']),
      encode('tc1', [1, 'result', `${reference}x`, 'full', 'position-one']),
      encode('tc1', [2, ...cursor.slice(1)]),
    ]) {
      expect(
        body(
          ok(
            await authorRun(
              tools,
              'read_result',
              JSON.stringify({ kind: 'result', reference, after: bad }),
            ),
          ),
        ),
      ).toContain('ERROR:')
    }
    for (const bad of [
      reference + '=',
      reference.replace('tr1.', 'tr2.'),
      encode('tr1', [1, 'invalid-invocation', 'result-one']),
      encode('tr1', [1, ...decode(reference).slice(1), 'extra']),
    ])
      expect(
        body(
          ok(
            await authorRun(
              tools,
              'read_result',
              JSON.stringify({ kind: 'result', reference: bad, after: null }),
            ),
          ),
        ),
      ).toContain('ERROR:')
  })
  it('returns fixed version failures instead of choosing the latest result', async () => {
    const f = await sourceFixture()
    const first = await f.tools.present(f.access)
    const reference = token(first, 'reference'),
      decoded = decode(reference)
    const bad = encode('tr1', [1, decoded[1], 'nonexistent-version'])
    const value = ok(
      await authorRun(
        f.tools,
        'read_result',
        JSON.stringify({ kind: 'result', reference: bad, after: null }),
      ),
    )
    expect(body(value)).toContain('ERROR:')
    expect(body(value)).not.toContain('source')
  })
  it('encodes arbitrary bytes as base64 across UTF-8 boundaries and only uses actual next responses', async () => {
    const seed = await sourceFixture()
    const f = await sourceFixture(result([visible('body', 'attachment result')], [seed.attachment]))
    const first = await f.tools.present(f.access)
    const attachmentReference = token(first, 'reference')
    const tr = decode(attachmentReference)
    const ta = encode('ta1', [1, encode('tr1', tr), 0])
    const parts: Buffer[] = []
    let after: string | null = null
    do {
      const response = ok(
        await authorRun(
          f.tools,
          'read_result',
          JSON.stringify({ kind: 'attachment', reference: ta, after }),
        ),
      )
      expect(body(response)).toContain('encoding')
      expect(Number(token(response, 'offset'))).toBe(
        parts.reduce((sum, part) => sum + part.length, 0),
      )
      parts.push(Buffer.from(token(response, 'base64'), 'base64'))
      const next = token(response, 'next')
      after = next === 'null' ? null : next
    } while (after !== null)
    expect(Buffer.concat(parts)).toEqual(Buffer.from(f.bytes))
    expect(parts[0]?.toString('utf8')).not.toBe('中')
    expect(
      body(
        ok(
          await authorRun(
            f.tools,
            'read_result',
            JSON.stringify({
              kind: 'attachment',
              reference: encode('ta1', [1, encode('tr1', tr), -1]),
              after: null,
            }),
          ),
        ),
      ),
    ).toContain('ERROR:')
  })
  it('does not catch unexpected provider faults or report them as success', async () => {
    const tools = createTools(
      provider(async () => {
        throw new Error('unexpected provider fault')
      }),
      options,
    )
    await expect(tools.present(access)).rejects.toThrow('unexpected provider fault')
    const slots = readToolRegistration(tools.author)
    if (slots?.kind !== 'commands') throw new Error('not commands')
    const author = slots.operations[0]?.[1].author
    if (author === undefined) throw new Error('missing author')
    expect(
      author.codec.encode({
        content: [],
        data: { kind: 'json' },
        original: { kind: 'none' },
        attachments: [],
      }),
    ).toHaveProperty('failure')
    expect(
      author.codec.decode(
        Buffer.from(
          '{"content":[],"content":[],"data":{"kind":"none"},"original":{"kind":"none"},"attachments":[]}',
        ),
      ),
    ).toHaveProperty('failure')
  })
})

describe('Tools bounded response collection', () => {
  it('counts metadata once and matches exact full JSON UTF-8 size at and over the budget', async () => {
    const value = result(
      [visible('one', '中\\"'.repeat(60)), visible('two', 'last')],
      [
        {
          storage: 'logical',
          key: 'metadata'.repeat(100),
          bytes: '1',
          mediaType: 'image/png',
          digest: 'sha256:x',
        },
      ],
    )
    const total = size(value)
    for (const maxBytes of [total, total - 1]) {
      let reads = 0
      const tools = createTools(
        provider(async () => {
          reads += 1
          return succeed(
            page(
              {
                ...value,
                content: reads === 1 ? value.content.slice(0, 1) : value.content.slice(1),
              },
              reads === 1 ? 'two' : null,
            ),
          )
        }),
        { ...options, resultPageBytes: 600, replyMaxBytes: maxBytes },
      )
      const actual = await tools.readReply(access)
      expect(reads).toBe(2)
      if (maxBytes === total) expect(actual).toEqual(succeed(value))
      else expect(actual).toMatchObject({ failure: { kind: 'unsupported' } })
    }
  })
  it.each([
    'cycle',
    'empty',
    'metadata',
    'version',
    'count',
    'page-budget',
    'read-failure',
  ] as const)('rejects %s without handing partial content to its consumer', async fault => {
    let count = 0
    const tools = createTools(
      provider(async () => {
        count += 1
        if (fault === 'read-failure' && count === 2)
          return fail({ kind: 'unavailable', dependency: 'ledger-store', diagnostic: 'unreadable' })
        const current = page(
          result(
            fault === 'empty'
              ? []
              : [visible(String(count), fault === 'page-budget' ? 'x'.repeat(5000) : 'x')],
          ),
          fault === 'cycle' ? 'same' : String(count),
        )
        return succeed({
          ...current,
          result: fault === 'version' && count === 2 ? version('changed') : current.result,
          terminal:
            fault === 'metadata' && count === 2
              ? { kind: 'unavailable', reason: 'changed' }
              : current.terminal,
        })
      }),
      { ...options, resultPageBytes: 1000, replyMaxBytes: 4000 },
    )
    const actual = await tools.readReply(access)
    expect(actual).toHaveProperty('failure')
    expect(actual).not.toHaveProperty('ok')
    expect(count).toBeLessThanOrEqual(9)
    if (fault === 'read-failure') expect(actual).toMatchObject({ failure: { kind: 'unavailable' } })
  })
  it('returns unsupported instead of truncating a source block, credential or schema and rejects unusable configurations', async () => {
    const f = await sourceFixture(result([visible('large', 'x'.repeat(5000))]))
    expect(body(await f.tools.present(f.access))).toContain('unsupported')
    const small = createTools(
      provider(async () => succeed(page(result()))),
      { ...options, resultPageBytes: 250, replyMaxBytes: 500 },
    )
    expect(body(ok(await authorRun(small, 'help', '{}')))).toContain('unsupported')
    const empty = provider(async () => succeed(page(result())))
    for (const overrides of [
      { resultPageBytes: 1 },
      { replyMaxBytes: 1 },
      { contentPageBytes: 0 },
      { resultPageBytes: NaN },
      { replyMaxBytes: Number.MAX_SAFE_INTEGER + 1 },
      { arguments: { ...options.arguments, maxBytes: 0 } },
    ])
      expect(() => createTools(empty, { ...options, ...overrides })).toThrow(TypeError)
  })
})

it('declares text input and all supported direct output modalities for an actual nontext read_result response', async () => {
  const blocks = ['image/png', 'audio/ogg', 'video/mp4', 'application/pdf'].map(
    (mediaType, index) => {
      const judged = judgeContentBlock({
        kind: index === 0 ? 'image' : index === 1 ? 'voice' : 'file',
        id: `media-${index}`,
        visibility: { toModel: true, toHuman: true },
        ref: {
          storage: 'logical',
          key: String(index),
          bytes: '1',
          digest: 'sha256:media',
          mediaType,
        },
        transcript: null,
      })
      if ('rejected' in judged || !('ref' in judged.ok)) throw new Error('invalid fixture ref')
      return judged.ok
    },
  )
  const f = await sourceFixture(result(blocks))
  expect(f.tools.author.definition.declarations.inputModalities).toEqual(['text'])
  expect(f.tools.author.definition.declarations.outputModalities).toEqual([
    'text',
    'image',
    'voice',
    'video',
  ])
  const initial = await f.tools.present(f.access)
  const registered = registeredFixture(f.tools)
  const response = await registered.invoke('read_result', {
    kind: 'result',
    reference: token(initial, 'reference'),
    after: null,
  })
  const full = ok(response.full)
  const projected = ok(projectToolResult(full, []))
  expect(projected.slice(1)).toEqual(blocks)
  expect(response.state.terminal.kind).toBe('completed')
})

it('keeps an offloaded original separate and propagates raw-byte qualification denial through the actual meta call', async () => {
  const denied: import('@omne-harness/tool').ToolLedgerAction[] = []
  const f = await sourceFixture(
    raw => ({
      ...result([visible('summary', 'summary only')]),
      original: {
        kind: 'offloaded',
        source: raw.content,
        summary: [visible('summary', 'summary only')],
      },
      attachments: [raw.content],
    }),
    {},
    denied,
  )
  const initial = await f.tools.present(f.access)
  expect(token(initial, 'content')).toBe('end')
  expect(token(initial, 'original')).toContain('offloaded')
  expect(initial.original).toEqual({ kind: 'none' })
  denied.push('read-raw')
  const registered = registeredFixture(f.tools)
  const response = await registered.invoke('read_result', {
    kind: 'attachment',
    reference: token(initial, 'originalReference'),
    after: null,
  })
  const value = ok(response.full)
  expect(body(value)).toContain('denied (read-raw-content)')
  expect(value.attachments).toEqual([])
  expect(value.content).toHaveLength(1)
  expect(body(value)).not.toContain('summary only')
  expect(body(value)).not.toContain('next')
})

it('rechecks a previously visible reference after current result qualification is revoked', async () => {
  const denied: import('@omne-harness/tool').ToolLedgerAction[] = []
  const f = await sourceFixture(result([visible('body', 'private source')]), {}, denied)
  const first = await f.tools.present(f.access)
  denied.push('read-result')
  const response = await registeredFixture(f.tools).invoke('read_result', {
    kind: 'result',
    reference: token(first, 'reference'),
    after: null,
  })
  const value = ok(response.full)
  expect(body(value)).toContain('denied')
  expect(body(value)).not.toContain('private source')
  expect(value.attachments).toEqual([])
})

it('reports byte provider failure without byte payload, attachments or next', async () => {
  const seed = await sourceFixture()
  const f = await sourceFixture(result([], [seed.attachment]))
  const initial = await f.tools.present(f.access)
  const reference = encode('ta1', [1, token(initial, 'reference'), 0])
  f.content.controls.failNext({ kind: 'failure' })
  const reply = await registeredFixture(f.tools).invoke('read_result', {
    kind: 'attachment',
    reference,
    after: null,
  })
  const value = ok(reply.full)
  expect(body(value)).toContain('ERROR: unavailable')
  expect(body(value)).not.toContain('base64')
  expect(body(value)).not.toContain('next')
  expect(value.attachments).toEqual([])
})

it('uses exact emission JSON budgets and rejects oversized protocol credentials without truncation', async () => {
  const read = provider(async () => succeed(page(result([visible('body', '中\\"source')]))))
  const baseline = createTools(read, options)
  const first = await baseline.present(access)
  for (const extra of [0, -1]) {
    const tools = createTools(read, { ...options, replyMaxBytes: size(first) + extra })
    const actual = await tools.present(access)
    if (extra === 0) expect(actual).toEqual(first)
    else {
      expect(body(actual)).toContain('unsupported')
      expect(actual.content).toHaveLength(1)
    }
  }
  const credentialBound = createTools(read, {
    ...options,
    arguments: { ...options.arguments, maxStringLength: 8 },
  })
  const rejected = await credentialBound.present(access)
  expect(body(rejected)).toContain('unsupported')
  expect(body(rejected)).not.toContain('tr1.')
})

it('validates every configuration field and derived read-count overflow while accepting legal safe-integer extremes', () => {
  const runtime = provider(async () => succeed(page(result())))
  for (const field of ['resultPageBytes', 'replyMaxBytes', 'contentPageBytes'] as const) {
    for (const bad of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(() => createTools(runtime, { ...options, [field]: bad })).toThrow(
        'Invalid Tools byte budget',
      )
  }
  expect(() =>
    createTools(runtime, {
      ...options,
      resultPageBytes: 1,
      replyMaxBytes: Number.MAX_SAFE_INTEGER,
    }),
  ).toThrow('Invalid Tools reply read limit')
  expect(() => createTools(runtime, { ...options, resultPageBytes: 1 })).toThrow(
    'Tools fixed error cannot fit one page',
  )
  expect(() =>
    createTools(runtime, {
      ...options,
      replyMaxBytes: Number.MAX_SAFE_INTEGER,
      contentPageBytes: Number.MAX_SAFE_INTEGER,
    }),
  ).not.toThrow()
  expect(() =>
    createTools(runtime, { ...options, resultPageBytes: Number.MAX_SAFE_INTEGER }),
  ).not.toThrow()
})

it('refuses unusable complete continuation and attachment arguments even when each encoded token fits', async () => {
  const runtime = provider(async () => succeed(page(result(), 'provider-cursor')))
  const first = await createTools(runtime, options).present(access)
  const reference = token(first, 'reference'),
    after = token(first, 'next')
  const maxBytes = Math.max(Buffer.byteLength(reference), Buffer.byteLength(after)) + 10
  const tools = createTools(runtime, { ...options, arguments: { ...options.arguments, maxBytes } })
  expect(Buffer.byteLength(reference)).toBeLessThan(maxBytes)
  expect(Buffer.byteLength(after)).toBeLessThan(maxBytes)
  expect(
    await authorRun(tools, 'read_result', JSON.stringify({ kind: 'result', reference, after })),
  ).toMatchObject({ failure: { kind: 'invalid' } })
  expect(body(await tools.present(access))).toContain('unsupported')
  const fewMembers = createTools(runtime, {
    ...options,
    arguments: { ...options.arguments, maxMembers: 2 },
  })
  expect(body(await fewMembers.present(access))).toContain('unsupported')
  const attachment = {
    storage: 'logical',
    key: 'file',
    bytes: '0',
    digest: 'sha256:empty',
    mediaType: 'application/octet-stream',
  }
  const files = provider(async () => succeed(page(result([], [attachment]))))
  const initial = await createTools(files, options).present(access)
  const ta = encode('ta1', [1, token(initial, 'reference'), 0])
  const limited = createTools(files, {
    ...options,
    arguments: { ...options.arguments, maxBytes: Buffer.byteLength(ta) + 10 },
  })
  expect(
    await authorRun(
      limited,
      'read_result',
      JSON.stringify({ kind: 'attachment', reference: ta, after: null }),
    ),
  ).toHaveProperty('failure')
  expect(body(await limited.present(access))).toContain('unsupported')
})

it('applies the emission boundary through real author codecs and runtime collection at the exact JSON byte limit', async () => {
  const source = provider(async () => succeed(page(result([visible('body', '中\\"source')]))))
  const baseline = createTools(source, options)
  const initial = await baseline.present(access)
  const args = { kind: 'result', reference: token(initial, 'reference'), after: null }
  const full = ok(await authorRun(baseline, 'read_result', JSON.stringify(args)))
  for (const delta of [0, -1]) {
    const config = { ...options, replyMaxBytes: size(full) + delta }
    const registered = registeredFixture(createTools(source, config), config)
    const received = ok((await registered.invoke('read_result', args)).full)
    if (delta === 0) expect(received).toEqual(full)
    else expect(body(received)).toContain('unsupported')
    expect(size(received)).toBeLessThanOrEqual(config.replyMaxBytes)
  }
})

it('marks an empty result as ended and rejects a byte cursor copied to another attachment reference', async () => {
  const seed = await sourceFixture()
  const second = { ...seed.attachment, key: 'second' }
  const f = await sourceFixture(result([], [seed.attachment, second]))
  ok(f.content.controls.seed({ ...f.f.access, attachment: second, bytes: f.bytes }))
  const initial = await f.tools.present(f.access)
  expect(token(initial, 'content')).toBe('end')
  expect(token(initial, 'next')).toBe('null')
  const firstReference = encode('ta1', [1, token(initial, 'reference'), 0])
  const secondReference = encode('ta1', [1, token(initial, 'reference'), 1])
  const first = ok(
    await authorRun(
      f.tools,
      'read_result',
      JSON.stringify({ kind: 'attachment', reference: firstReference, after: null }),
    ),
  )
  const bad = ok(
    await authorRun(
      f.tools,
      'read_result',
      JSON.stringify({
        kind: 'attachment',
        reference: secondReference,
        after: token(first, 'next'),
      }),
    ),
  )
  expect(body(bad)).toContain('invalid-cursor')
  expect(body(bad)).not.toContain('base64')
  expect(body(bad)).not.toContain('next')
})

it.each([4, 5])(
  'does not issue a continuation its protocol cannot decode with maxItems=%s',
  async maxItems => {
    const source = provider(async input =>
      succeed(
        page(result([visible('body', 'source')]), input.after === null ? 'position-one' : null),
      ),
    )
    const limited = { ...options, arguments: { ...options.arguments, maxItems } }
    const tools = createTools(source, limited)
    const initial = await tools.present(access)
    if (!body(initial).includes('ERROR:')) {
      const response = await registeredFixture(tools).invoke('read_result', {
        kind: 'result',
        reference: token(initial, 'reference'),
        after: token(initial, 'next'),
      })
      expect(body(ok(response.full))).not.toContain('invalid-cursor')
    }
    expect(body(initial)).toContain('unsupported')
  },
)

it('accepts a continuation at the six-item protocol boundary and rejects an unparseable attachment selector before issuing it', async () => {
  const runtime = provider(async input =>
    succeed(
      page(result([visible('body', 'source')]), input.after === null ? 'position-one' : null),
    ),
  )
  const tools = createTools(runtime, {
    ...options,
    arguments: { ...options.arguments, maxItems: 6 },
  })
  const initial = await tools.present(access)
  const response = await registeredFixture(tools).invoke('read_result', {
    kind: 'result',
    reference: token(initial, 'reference'),
    after: token(initial, 'next'),
  })
  expect(token(ok(response.full), 'next')).toBe('null')
  const attachments = Array.from({ length: 11 }, (_, index) => ({
    storage: 'logical',
    key: String(index),
    mediaType: 'application/octet-stream',
    bytes: '0',
    digest: 'sha256:empty',
  }))
  const files = createTools(
    provider(async () => succeed(page(result([], attachments)))),
    { ...options, arguments: { ...options.arguments, maxNumberLength: 1 } },
  )
  expect(body(await files.present(access))).toContain('unsupported')
})
