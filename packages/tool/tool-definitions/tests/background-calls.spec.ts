import { describe, expect, it, vi } from 'vitest'
import { createIndependentToolScope, executeTool } from '@omne-harness/tool'
import { readJsonText } from '@omne-harness/json-text'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import {
  commandArguments,
  commandGuide,
  deriveDefinition,
} from '@omne-harness/tool-contract/provider'
import {
  attachBackgroundCalls,
  backgroundCallsOf,
  backgroundCallsToolModule,
  createBackgroundCallsAuthor,
  type BackgroundCallItem,
  type BackgroundOutputView,
  type BackgroundReply,
  type BackgroundStopAnswer,
  type BoundBackgroundCalls,
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
    maxBytes: 65536,
    maxDepth: 8,
    maxItems: 16,
    maxMembers: 16,
    maxStringLength: 4096,
    maxNumberLength: 32,
  })
  if (parsed.kind !== 'ok') throw new Error('test JSON')
  return parsed.value
}

function fixture(maximum = 65536) {
  const implementation = createBackgroundCallsAuthor(json({ resultMaxBytes: maximum }))
  if ('failure' in implementation) throw new Error(JSON.stringify(implementation.failure))
  const registration = readToolRegistration(implementation.ok)
  if (registration?.kind !== 'commands') throw new Error('commands')
  const definition = deriveDefinition(
    {
      asset: { name: 'BkgToolCalls', adoption: backgroundCallsToolModule.executor },
      requiredCapabilities: [],
    },
    implementation.ok.facts,
  )
  function decode(command: string, params: unknown) {
    const operation = registration?.operations.find(([name]) => name === command)?.[1]
    if (operation === undefined || operation.author.kind !== 'ordinary')
      throw new Error('ordinary command')
    const text = JSON.stringify({ command, params })
    const cut = commandArguments(definition, command, {
      original: text,
      effective: text,
      complete: true,
    })
    return {
      author: operation.author,
      parsed: 'failure' in cut ? cut : operation.author.parameters.parse(cut.ok),
    }
  }
  async function run(command: string, params: unknown, port?: BoundBackgroundCalls) {
    const { author, parsed } = decode(command, params)
    if ('failure' in parsed) throw new Error(JSON.stringify(parsed.failure))
    const execution = port === undefined ? scope() : attachBackgroundCalls(scope(), port)
    const result = await executeTool(parsed.ok, author.executor, null, execution)
    if ('failure' in result) throw new Error(JSON.stringify(result.failure))
    return result.ok as string
  }
  return { implementation: implementation.ok, definition, decode, run }
}

const item = (id: string, extra: Partial<BackgroundCallItem> = {}): BackgroundCallItem => ({
  id,
  intent: 'build the front end',
  action: 'Shell execute · pnpm build',
  status: 'running',
  stop: null,
  lastLine: 'step 3/7',
  ...extra,
})

function port(
  answers: Partial<{
    list: BackgroundReply<readonly BackgroundCallItem[]>
    output: BackgroundReply<BackgroundOutputView>
    terminate: BackgroundReply<BackgroundStopAnswer>
  }>,
): BoundBackgroundCalls {
  const none = { failure: { kind: 'unavailable', diagnostic: 'not set' } } as const
  return {
    list: vi.fn(async () => answers.list ?? none),
    output: vi.fn(async () => answers.output ?? none),
    terminate: vi.fn(async () => answers.terminate ?? none),
  }
}

describe('BkgToolCalls: one declaration slot, help from its guide, no background (C23)', () => {
  it('publishes four wrapped commands; it does not allow the background itself', () => {
    const test = fixture()
    if (test.definition.kind !== 'commands') throw new Error('commands')
    expect(test.definition.encoding).toBe('wrapped')
    expect(test.definition.commands.map(command => command.name)).toEqual([
      'help',
      'list',
      'output',
      'terminate',
    ])
    expect(test.implementation.facts.backgroundAllowed).toBe(false)
  })

  it('help answers the command guide, whole or for one command, without a binding', async () => {
    const test = fixture()
    if (test.definition.kind !== 'commands') throw new Error('commands')
    expect(await test.run('help', {})).toBe(
      `done BkgToolCalls help\n${commandGuide(test.definition, undefined)}`,
    )
    expect(await test.run('help', { name: 'output' })).toBe(
      `done BkgToolCalls help output\n${commandGuide(test.definition, 'output')}`,
    )
  })

  it.each([
    ['output', { id: 'x2' }, 'invalid-field:id'],
    ['output', { id: 'b0' }, 'invalid-field:id'],
    ['output', { id: 'b2', after: '' }, 'invalid-field:after'],
    ['output', { id: 'b2', limit: 3 }, 'invalid-field:limit'],
    ['terminate', { id: 'b2' }, 'invalid-field:reason'],
    ['terminate', { id: 'b2', reason: '  ' }, 'invalid-field:reason'],
    ['terminate', { id: 'b2', reason: 'two\nlines' }, 'invalid-field:reason'],
    ['terminate', { id: 'b2', reason: 'x'.repeat(501) }, 'invalid-field:reason'],
    ['list', { all: true }, 'invalid-field:all'],
    ['help', { name: 'stop' }, 'invalid-field:name'],
  ])('%s %j is refused with %s', (command, params, reason) => {
    const parsed = fixture().decode(command, params).parsed
    expect(parsed).toMatchObject({ failure: { reason } })
  })

  it('without a binding each command answers unavailable and touches nothing', async () => {
    expect(await fixture().run('list', {})).toBe(
      'BkgToolCalls list: unavailable: the Session is not bound',
    )
  })

  it('attaches the port to the execution and removes it when the execution finishes', async () => {
    const bound = port({})
    const attached = attachBackgroundCalls(scope(), bound)
    expect(backgroundCallsOf(attached.context)).toBe(bound)
    await attached.finish('returned')
    expect(backgroundCallsOf(attached.context)).toBeUndefined()
  })
})

// The rows of the BkgToolCalls table as the author shows them; the binding decides the row.
describe('BkgToolCalls: the table as the model reads it (C23, C24)', () => {
  const test = fixture()

  it('a short id that is not found: list leaves it out, output and terminate say not found', async () => {
    const missing = { failure: { kind: 'not-found', id: 'b9' } } as const
    const bound = port({ list: { ok: [] }, output: missing, terminate: missing })
    expect(await test.run('list', {}, bound)).toBe(
      'done BkgToolCalls list\nNo calls in the background.',
    )
    for (const [command, params] of [
      ['output', { id: 'b9' }],
      ['terminate', { id: 'b9', reason: 'done' }],
    ] as const)
      expect(await test.run(command, params, bound)).toBe(
        `BkgToolCalls ${command}: no call b9 in this Session. Use list for the short ids.`,
      )
  })

  it('queued, running, unknown and stopping rows list with their states, stops and last lines', async () => {
    const bound = port({
      list: {
        ok: [
          item('b1', { status: 'queued', lastLine: null }),
          item('b2'),
          item('b3', { status: 'unknown', lastLine: null, intent: null }),
          item('b4', {
            status: 'stopping',
            stop: { by: 'user', reason: 'not needed', progress: 'accepted' },
          }),
        ],
      },
    })
    expect(await test.run('list', {}, bound)).toBe(
      [
        'done BkgToolCalls list',
        'b1  queued  build the front end  Shell execute · pnpm build',
        'b2  running  build the front end  Shell execute · pnpm build  | step 3/7',
        'b3  unknown  (no intent)  Shell execute · pnpm build',
        'b4  stopping  build the front end  Shell execute · pnpm build  [stop accepted by user: not needed]  | step 3/7',
      ].join('\n'),
    )
  })

  it('output gives the state and one part with the position to read on; a part read again with it is new only', async () => {
    const output = vi.fn(async ({ after }: { after: string | null }) => ({
      ok: {
        id: 'b2',
        status: 'running' as const,
        output: {
          kind: 'open' as const,
          text: after === null ? 'one\ntwo' : 'three',
          next: after === null ? '8' : '14',
        },
      },
    }))
    const bound = { ...port({}), output }
    expect(await test.run('output', { id: 'b2' }, bound)).toBe(
      'done BkgToolCalls output\nb2 running\none\ntwo\nnext: 8 (open; pass it as after to read only what is new)',
    )
    expect(await test.run('output', { id: 'b2', after: '8' }, bound)).toBe(
      'done BkgToolCalls output\nb2 running\nthree\nnext: 14 (open; pass it as after to read only what is new)',
    )
    expect(output.mock.calls.map(([input]) => input)).toEqual([
      { id: 'b2', after: null },
      { id: 'b2', after: '8' },
    ])
  })

  it.each([
    [
      'queued, no output yet',
      { id: 'b1', status: 'queued', output: { kind: 'none' } },
      'b1 queued\nNo output body: the call has written no output that can be read.',
    ],
    [
      'unknown, unreadable',
      { id: 'b3', status: 'unknown', output: { kind: 'unreadable', reason: 'Tool is away' } },
      'b3 unknown\nThe output cannot be read now: Tool is away',
    ],
    [
      'ended, sealed',
      { id: 'b5', status: 'ended', output: { kind: 'sealed', text: 'done', next: '4' } },
      'b5 ended\ndone\nnext: 4 (sealed; pass it as after to read only what is new)\nThe call ended; its outcome is in a system reminder. Do not call it again to get it.',
    ],
    [
      'ended, none',
      { id: 'b6', status: 'ended', output: { kind: 'none' } },
      'b6 ended\nNo output body: the call has written no output that can be read.\nThe call ended; its outcome is in a system reminder. Do not call it again to get it.',
    ],
  ] as const)('output when %s', async (_name, view, text) => {
    const bound = port({ output: { ok: view as BackgroundOutputView } })
    expect(await test.run('output', { id: view.id }, bound)).toBe(
      `done BkgToolCalls output\n${text}`,
    )
  })

  it('terminate answers requested, not stopped; an ended call has nothing to stop', async () => {
    const terminate = vi.fn(async ({ id }: { id: string }) => ({
      ok: { id, kind: id === 'b5' ? ('ended' as const) : ('requested' as const) },
    }))
    const bound = { ...port({}), terminate }
    expect(await test.run('terminate', { id: 'b2', reason: 'not needed' }, bound)).toBe(
      'done BkgToolCalls terminate\nb2 stop requested. It has not stopped yet; its outcome arrives later as a system reminder that says you stopped it.',
    )
    expect(await test.run('terminate', { id: 'b5', reason: 'not needed' }, bound)).toBe(
      'done BkgToolCalls terminate\nb5 already ended; nothing to stop.',
    )
    expect(terminate.mock.calls[0]?.[0]).toEqual({ id: 'b2', reason: 'not needed' })
  })

  it('a denied or unavailable port answers with its reason', async () => {
    const bound = port({ list: { failure: { kind: 'denied' } } })
    expect(await test.run('list', {}, bound)).toBe('BkgToolCalls list: denied.')
    expect(await test.run('output', { id: 'b1' }, bound)).toBe(
      'BkgToolCalls output: unavailable: not set',
    )
  })
})
