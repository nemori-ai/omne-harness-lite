import { expect, it } from 'vitest'
import { unwrap, parseTenantId, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { createSessionPresentation } from '../src/session-presentation.ts'
import { presentationLines } from '../src/session-presentation-output.ts'
import { humanBlocks, humanBlockSchema, boundHumanBlocks } from '../src/session-human-content.ts'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import { terminalMessageLines } from '../src/session-terminal-output.ts'

const id = (value: string) => unwrap(parseOpaqueIdentifier(value, 'BlockId'))
const call = unwrap(parseOpaqueIdentifier('call-one', 'CallId'))
const scope = {
  tenant: unwrap(parseTenantId({ organization: 'org', account: 'owner' })),
  session: unwrap(parseOpaqueIdentifier('session', 'SessionRef')),
}
const visibility = { toHuman: true, toModel: true }
it('retains tool arguments in cumulative model content and its original text/call/text position', async () => {
  const store = createSessionPresentation({
    maxCalls: 4,
    maxBlocks: 20,
    maxCharactersPerCall: 10000,
  })
  store.bindModel(scope, 'run', 'model')
  store.model(
    { ...scope, callId: 'model', dispatch: 0 },
    {
      position: 1,
      blocks: [
        {
          index: 0,
          closed: true,
          block: { id: id('before'), kind: 'text', visibility, text: 'before call' },
        },
        {
          index: 1,
          closed: true,
          block: {
            id: id('call-block'),
            kind: 'tool_call',
            complete: true,
            visibility,
            callId: call,
            tool: 'Shell',
            arguments: { command: 'printf content-marker' },
          },
        },
        {
          index: 2,
          closed: true,
          block: { id: id('after'), kind: 'text', visibility, text: 'after call' },
        },
      ],
    },
  )
  const lines = presentationLines(await store.read(scope, 'run')).join('\n')
  expect(lines).toContain('printf content-marker')
  expect(lines.indexOf('before call')).toBeLessThan(lines.indexOf('Shell'))
  expect(lines.indexOf('Shell')).toBeLessThan(lines.indexOf('after call'))
})
it('does not print an empty reasoning heading', () => {
  expect(
    terminalMessageLines({
      position: 1,
      run: 'run',
      id: 'message',
      type: 'assistant',
      createdAt: '2026-10-10T00:00:00Z',
      blocks: [{ id: 'empty', kind: 'thinking', text: '' }],
    }),
  ).toEqual([])
})

it('keeps exact numeric arguments, unparseable input, and nested results without exporting private fields', () => {
  const args = readJsonStrict('{"value":9007199254740993}')
  if ('failed' in args) throw Error('bad fixture')
  const blocks = humanBlocks([
    {
      id: id('call'),
      kind: 'tool_call',
      complete: true,
      visibility,
      callId: call,
      tool: 'Shell',
      arguments: args.ok,
    },
    {
      id: id('bad-call'),
      kind: 'tool_call',
      complete: true,
      visibility,
      callId: call,
      tool: 'Shell',
      unparseable: true,
      rawArguments: '{bad JSON',
    },
    {
      id: id('result'),
      kind: 'tool_result',
      visibility,
      callId: call,
      outcome: 'interrupted',
      reason: { code: 'user_interrupted', text: 'stopped' },
      blocks: [
        { id: id('visible'), kind: 'text', text: 'visible result', visibility },
        {
          id: id('hidden'),
          kind: 'tool_result',
          callId: call,
          outcome: 'completed',
          visibility: { toHuman: false, toModel: true },
          blocks: [{ id: id('secret'), kind: 'text', text: 'secret descendant', visibility }],
        },
        { id: id('thinking'), kind: 'thinking', text: 'actual summary', visibility },
      ],
    },
  ])
  expect(blocks[0]).toMatchObject({ arguments: { text: '{"value":9007199254740993}' } })
  expect(blocks[1]).toMatchObject({ arguments: { encoding: 'unparseable', text: '{bad JSON' } })
  const lines = terminalMessageLines({
    position: 1,
    run: 'run',
    id: 'message',
    type: 'tool',
    createdAt: '',
    blocks,
  }).join('\n')
  expect(lines).toContain('visible result')
  expect(lines).toContain('interrupted')
  expect(lines).toContain('actual summary')
  expect(lines).not.toContain('secret')
  expect(blocks.every(block => humanBlockSchema.safeParse(block).success)).toBe(true)
  expect(humanBlockSchema.safeParse({ ...blocks[0], opaque: 'secret' }).success).toBe(false)
  const bounded = boundHumanBlocks(blocks, 12, 20)
  expect(bounded.omitted).toBe(true)
  expect(JSON.stringify(bounded)).not.toContain('visible result')
})
it('decorates a model tool call in place and uses terminal output instead of provisional frames', async () => {
  const store = createSessionPresentation({
    maxCalls: 4,
    maxBlocks: 20,
    maxCharactersPerCall: 10000,
  })
  store.bindModel(scope, 'run', 'model')
  const [tool] = humanBlocks([
    {
      id: id('call-block'),
      kind: 'tool_call',
      complete: true,
      visibility,
      callId: call,
      tool: 'Shell',
      arguments: { command: 'printf marker' },
    },
  ])
  if (!tool || tool.kind !== 'tool_call') throw Error('fixture')
  store.model(
    { ...scope, callId: 'model', dispatch: 0 },
    {
      position: 1,
      blocks: [
        {
          index: 0,
          closed: true,
          block: { id: id('before'), kind: 'text', visibility, text: 'before call' },
        },
        {
          index: 1,
          closed: true,
          block: {
            id: id('call-block'),
            kind: 'tool_call',
            complete: true,
            visibility,
            callId: call,
            tool: 'Shell',
            arguments: { command: 'printf marker' },
          },
        },
        {
          index: 2,
          closed: true,
          block: { id: id('after'), kind: 'text', visibility, text: 'after call' },
        },
      ],
    },
  )
  let ended = false
  store.bindTool({
    scope,
    run: 'run',
    call,
    block: tool,
    read: async () => ({
      terminal: ended,
      observation: {
        state: ended ? 'completed' : 'running',
        blocks: [{ id: 'output', kind: 'text', text: ended ? 'final result' : 'provisional' }],
        notice: null,
        offloaded: false,
      },
    }),
  })
  expect(presentationLines(await store.read(scope, 'run')).join('\n')).toContain('provisional')
  ended = true
  const lines = presentationLines(await store.read(scope, 'run')).join('\n')
  expect(lines).not.toContain('provisional')
  expect(lines).toContain('final result')
  expect(lines.indexOf('before call')).toBeLessThan(lines.indexOf('Shell'))
  expect(lines.indexOf('final result')).toBeLessThan(lines.indexOf('after call'))
  expect(lines.split('Tool: Shell')).toHaveLength(2)
})

it('counts identities in the display budget instead of returning an oversized identity', () => {
  expect(boundHumanBlocks([{ id: 'x'.repeat(1000), kind: 'text', text: 'a' }], 10, 1)).toEqual({
    items: [],
    omitted: true,
  })
})

it.each([
  { name: 'keeps a terminal observation', firstTerminal: false, secondTerminal: true },
  { name: 'keeps the latest provisional observation', firstTerminal: false, secondTerminal: false },
  { name: 'accepts an earlier terminal result', firstTerminal: true, secondTerminal: false },
])('$name when the first read returns last', async ({ firstTerminal, secondTerminal }) => {
  const store = createSessionPresentation({
    maxCalls: 4,
    maxBlocks: 20,
    maxCharactersPerCall: 10000,
  })
  const [block] = humanBlocks([
    {
      id: id('call-block'),
      kind: 'tool_call',
      complete: true,
      visibility,
      callId: call,
      tool: 'Shell',
      arguments: {},
    },
  ])
  if (!block || block.kind !== 'tool_call') throw Error('fixture')
  const gate = Promise.withResolvers<{
    terminal: boolean
    observation: {
      state: string
      blocks: { id: string; kind: 'text'; text: string }[]
      notice: null
      offloaded: boolean
    }
  }>()
  let count = 0
  store.bindTool({
    scope,
    run: 'run',
    call,
    block,
    read: () =>
      ++count === 1
        ? gate.promise
        : Promise.resolve({
            terminal: secondTerminal,
            observation: {
              state: secondTerminal ? 'completed' : 'running',
              blocks: [{ id: 'output', kind: 'text', text: 'second output' }],
              notice: null,
              offloaded: false,
            },
          }),
  })
  const early = store.read(scope, 'run')
  expect(presentationLines(await store.read(scope, 'run')).join('\n')).toContain('second output')
  gate.resolve({
    terminal: firstTerminal,
    observation: {
      state: firstTerminal ? 'completed' : 'running',
      blocks: [{ id: 'output', kind: 'text', text: 'first output' }],
      notice: null,
      offloaded: false,
    },
  })
  const later = presentationLines(await early).join('\n')
  const firstWins = firstTerminal && !secondTerminal
  expect(later).toContain(firstWins ? 'first output' : 'second output')
  expect(later).not.toContain(firstWins ? 'second output' : 'first output')
})
