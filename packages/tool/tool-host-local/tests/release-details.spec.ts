import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import { close, createSchemaProvider } from '@omne-harness/schema-provider'
import type { ToolAvailability, ToolReleaseDescriber } from '@omne-harness/tool-contract'
import {
  DEFAULT_RELEASE_DETAIL_POLICY,
  defineCommandTool,
  defineFunctionTool,
  defineToolOperation,
  type ToolImplementationModule,
  type ToolOperationParameters,
} from '@omne-harness/tool-contract/provider'
import { ordinaryReturnFixture } from '@omne-harness/tool-contract/testing'
import { createLocalReleaseDetails, type ReleaseDetailAttach } from '@omne-harness/tool-host-local'
import { authorAccess, authorAuthority, loadAuthor, unbox } from './author-values.ts'
import { fiberedRegistry, scriptedVerifier } from './binding-values.ts'
import { adoption, request } from './coordinator-values.ts'

const tree = (value: unknown): JsonValue => {
  const read = readJsonText(JSON.stringify(value), {
    maxBytes: 65536,
    maxDepth: 8,
    maxItems: 64,
    maxMembers: 16,
    maxStringLength: 32768,
    maxNumberLength: 32,
  })
  if (read.kind !== 'ok') throw new Error('not JSON')
  return read.value
}

const TEST_KIND = 'test.release@1'
const OTHER_KIND = 'test.other@1'
const typedSchema = tree({
  type: 'object',
  required: ['title'],
  properties: { title: { type: 'string' } },
})

type Args = Readonly<{ title: string }>

function operation(describeRelease?: ToolReleaseDescriber<Args>) {
  const definition = request().availability
  if (definition.kind !== 'available' || definition.definition.kind !== 'function')
    throw new Error('function fixture')
  const made = defineToolOperation<
    Args,
    unknown,
    unknown,
    ContentBlock,
    Extract<ToolOperationParameters, { kind: 'declared' }>
  >({
    parameters: { kind: 'declared', value: definition.definition.parameters },
    returns: ordinaryReturnFixture(adoption('codec')),
    author: {
      kind: 'ordinary',
      parameters: {
        adoption: adoption('parameters'),
        parse: args => {
          const value: unknown = JSON.parse(args.effective)
          if ((value as { title?: unknown }).title === 'throw') throw new Error('parser')
          return typeof value === 'object' &&
            value !== null &&
            typeof (value as { title?: unknown }).title === 'string'
            ? succeed({ title: (value as { title: string }).title })
            : fail({ kind: 'invalid', reason: 'title' })
        },
      },
      waits: [],
      executor: { execute: async () => ({ kind: 'final' }) as never },
      codec: {
        adoption: adoption('codec'),
        encode: () => succeed(new Uint8Array()),
        decode: () => succeed({}),
      },
      output: { adoption: adoption('output'), check: ({ value }) => succeed(value) },
      renderer: { render: () => succeed('done') },
      program: { kind: 'none' },
    },
    ...(describeRelease === undefined ? {} : { describeRelease }),
  })
  return unbox(made)
}

function probeModule(
  describeRelease: ToolReleaseDescriber<Args>,
): ToolImplementationModule<unknown, ContentBlock> {
  return {
    executor: { ...adoption('executor'), owner: 'conformance' },
    createAuthor() {
      const declarations = request().availability
      if (declarations.kind !== 'available') throw new Error('available fixture')
      return defineCommandTool({
        implementation: {
          description: 'A test tool whose send command describes what it would do',
          backgroundAllowed: false,
          declarations: declarations.definition.declarations,
        },
        encoding: 'wrapped',
        commands: {
          send: {
            summary: 'Send a titled message.',
            operation: operation(describeRelease),
            release: { gate: null, detail: { kind: TEST_KIND, schema: typedSchema } },
          },
          post: {
            summary: 'Post a titled note.',
            operation: operation(describeRelease),
            release: { gate: null, detail: { kind: OTHER_KIND, schema: typedSchema } },
          },
          peek: { summary: 'Read the last message.', operation: operation() },
        },
      })
    },
  }
}

function probeFunctionModule(
  describeRelease: ToolReleaseDescriber<Args>,
): ToolImplementationModule<unknown, ContentBlock> {
  return {
    executor: { ...adoption('executor'), owner: 'conformance' },
    createAuthor() {
      const declarations = request().availability
      if (declarations.kind !== 'available') throw new Error('available fixture')
      return defineFunctionTool({
        operation: operation(describeRelease),
        implementation: {
          description: 'A test function tool that describes what it would do',
          backgroundAllowed: false,
          declarations: declarations.definition.declarations,
        },
      })
    },
  }
}

type Built = Readonly<{
  function?: true
  closed?: true
  noPolicy?: true
  attach?: ReleaseDetailAttach<unknown>
}>

async function detailsOf(
  describeRelease: ToolReleaseDescriber<Args>,
  policy = DEFAULT_RELEASE_DETAIL_POLICY,
  registered: 'loaded' | 'none' | 'absent' = 'loaded',
  maxSnapshots = 8,
  built: Built = {},
) {
  const module =
    built.function === true ? probeFunctionModule(describeRelease) : probeModule(describeRelease)
  const loaded = unbox(await loadAuthor(module))
  const { registry } = fiberedRegistry(scriptedVerifier([authorAuthority]))
  if (registered === 'loaded')
    unbox(registry.register({ ...authorAccess, authority: authorAuthority, loaded }))
  const availability: Extract<ToolAvailability, { kind: 'available' }> = {
    kind: 'available',
    definition: loaded.definition,
    executor: loaded.executor,
    layer: loaded.key.layer,
  }
  const provider = createSchemaProvider({
    maxSnapshots,
    maxConstructDepth: 32,
    maxConstructNodes: 4096,
    maxAttempts: 1,
    failureBackoffMs: 0,
  })
  if (built.closed === true) close(provider)
  const details = createLocalReleaseDetails({
    registry: () => (registered === 'absent' ? undefined : registry),
    provider,
    ...(built.noPolicy === true ? {} : { policy }),
    ...(built.attach === undefined ? {} : { attach: built.attach }),
  })
  const describe = (command: string | null, params: unknown, sent = command) =>
    details.describe({
      ...authorAccess,
      availability,
      command,
      effectiveArguments: JSON.stringify(sent === null ? params : { command: sent, params }),
    })
  return { describe, pins: () => unbox(registry.pins(loaded.key)) }
}

const rows = [
  { label: '收件人', value: '你' },
  { label: '标题', value: 'T' },
]
const describing: ToolReleaseDescriber<Args> = async ({ arguments: args }) => ({
  rows: [rows[0]!, { label: '标题', value: args.title }],
  typed: tree({ title: args.title }),
})

describe('Tool asks the implementer what one call would do, and only reads', () => {
  it('has no detail for a command that gave no describe function', async () => {
    const { describe } = await detailsOf(describing)
    expect(await describe('peek', { title: 'T' })).toEqual({ kind: 'none' })
  })

  it('gives the rows and the typed value of the declared kind, and pins nothing', async () => {
    let seen: unknown
    const { describe, pins } = await detailsOf(async input => {
      seen = input
      return describing(input)
    })
    expect(await describe('send', { title: 'T' })).toEqual({
      kind: 'detail',
      rows,
      typed: { kind: TEST_KIND, value: '{"title":"T"}' },
    })
    expect(seen).toEqual({
      principal: authorAccess.principal,
      tenant: authorAccess.tenant,
      arguments: { title: 'T' },
      signal: expect.any(AbortSignal),
    })
    expect(pins()).toBe('0')
  })

  it.each([
    ['the arguments do not parse', async () => ({ rows }), { title: 5 }, 'arguments'],
    [
      'the function throws',
      async () => {
        throw new Error('boom')
      },
      { title: 'T' },
      'threw',
    ],
    [
      'the description breaks the budget',
      async () => ({ rows: [{ label: 'l'.repeat(41), value: 'v' }] }),
      { title: 'T' },
      'row',
    ],
    [
      'the typed value does not fit the declared schema',
      async () => ({ rows, typed: tree({ title: 1 }) }),
      { title: 'T' },
      'typed-schema',
    ],
  ] as const)('cannot give a detail when %s', async (_name, describeRelease, params, reason) => {
    const { describe } = await detailsOf(describeRelease as ToolReleaseDescriber<Args>)
    expect(await describe('send', params)).toEqual({ kind: 'unavailable', reason })
  })

  it('cannot give a detail when the argument parser of the command throws', async () => {
    const { describe } = await detailsOf(describing)
    expect(await describe('send', { title: 'throw' })).toEqual({
      kind: 'unavailable',
      reason: 'threw',
    })
  })

  it('checks typed values of two declared kinds in turn on a provider that keeps one schema', async () => {
    const { describe } = await detailsOf(describing, DEFAULT_RELEASE_DETAIL_POLICY, 'loaded', 1)
    const kinds = []
    for (const command of ['send', 'post', 'send', 'post', 'send']) {
      const answer = await describe(command, { title: 'T' })
      kinds.push(answer.kind === 'detail' ? answer.typed?.kind : answer)
    }
    expect(kinds).toEqual([TEST_KIND, OTHER_KIND, TEST_KIND, OTHER_KIND, TEST_KIND])
  })

  it('gives the rows of a function tool, which declares no typed kind', async () => {
    const rowsOnly: ToolReleaseDescriber<Args> = async ({ arguments: args }) => ({
      rows: [{ label: '标题', value: args.title }],
    })
    const { describe } = await detailsOf(rowsOnly, DEFAULT_RELEASE_DETAIL_POLICY, 'loaded', 8, {
      function: true,
    })
    expect(await describe(null, { title: 'T' })).toEqual({
      kind: 'detail',
      rows: [{ label: '标题', value: 'T' }],
    })
  })

  it('cannot give a detail when the arguments name another command than the one asked', async () => {
    const { describe } = await detailsOf(describing)
    expect(await describe('send', { title: 'T' }, 'post')).toEqual({
      kind: 'unavailable',
      reason: 'arguments',
    })
  })

  it('checks with the default policy when none is given', async () => {
    const { describe } = await detailsOf(describing, DEFAULT_RELEASE_DETAIL_POLICY, 'loaded', 8, {
      noPolicy: true,
    })
    expect(await describe('send', { title: 'T' })).toMatchObject({ kind: 'detail' })
  })

  it('cannot give a detail when the schema check is not there to run', async () => {
    const { describe } = await detailsOf(describing, DEFAULT_RELEASE_DETAIL_POLICY, 'loaded', 8, {
      closed: true,
    })
    expect(await describe('send', { title: 'T' })).toEqual({
      kind: 'unavailable',
      reason: 'schema-refused',
    })
  })

  it('cannot give a detail when the function does not answer in time', async () => {
    const { describe } = await detailsOf(() => new Promise(() => {}), {
      ...DEFAULT_RELEASE_DETAIL_POLICY,
      timeoutMs: 20,
    })
    expect(await describe('send', { title: 'T' })).toEqual({
      kind: 'unavailable',
      reason: 'timeout',
    })
  })

  it('attaches what the tool reads under the description signal, and detaches after it, in time or not', async () => {
    const events: string[] = []
    let attached: AbortSignal | undefined
    const attach: ReleaseDetailAttach<unknown> = ({ name, signal }) => {
      attached = signal
      events.push(`attach ${name} ${String(signal.aborted)}`)
      return () => events.push(`detach ${String(signal.aborted)}`)
    }
    const reading = async (input: { signal: AbortSignal }) => {
      events.push(`describe ${String(input.signal === attached)}`)
      return describing(input as never)
    }
    const { describe } = await detailsOf(reading, DEFAULT_RELEASE_DETAIL_POLICY, 'loaded', 8, {
      attach,
    })
    expect(await describe('send', { title: 'T' })).toMatchObject({ kind: 'detail' })
    const name = request().availability
    expect(events).toEqual([
      `attach ${name.kind === 'available' ? name.definition.name : ''} false`,
      'describe true',
      'detach true',
    ])
    events.length = 0
    const { describe: late } = await detailsOf(
      () => new Promise(() => {}),
      { ...DEFAULT_RELEASE_DETAIL_POLICY, timeoutMs: 20 },
      'loaded',
      8,
      { attach },
    )
    expect(await late('send', { title: 'T' })).toEqual({ kind: 'unavailable', reason: 'timeout' })
    expect(events).toEqual([expect.stringMatching(/^attach /), 'detach true'])
  })

  it('cannot give a detail when the host has no registry or no registration to read', async () => {
    const { describe } = await detailsOf(describing, DEFAULT_RELEASE_DETAIL_POLICY, 'none')
    expect(await describe('send', { title: 'T' })).toEqual({
      kind: 'unavailable',
      reason: 'no-registration',
    })
    const { describe: absent } = await detailsOf(
      describing,
      DEFAULT_RELEASE_DETAIL_POLICY,
      'absent',
    )
    expect(await absent('send', { title: 'T' })).toEqual({
      kind: 'unavailable',
      reason: 'no-registry',
    })
  })
})
