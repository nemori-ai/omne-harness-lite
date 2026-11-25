import { describe, expect, it } from 'vitest'
import { HISTORY_PAGE_LIMIT, madeCalls, plainOf } from '../src/index.ts'
import { SESSION, TENANT, world } from './world.ts'

const text = (value: string) => ({ kind: 'string', value })
const object = (entries: Readonly<Record<string, unknown>>) => ({
  kind: 'object',
  entries: Object.entries(entries).map(([key, value]) => ({ key, value })),
})
/** An assistant entry that asks for tool calls, with the arguments in the tagged form the history keeps. */
const asking = (...calls: readonly (readonly [string, string, unknown])[]) => ({
  kind: 'message.assistant',
  payload: {
    message: {
      role: 'assistant',
      blocks: [
        { kind: 'text', text: 'on it' },
        ...calls.map(([callId, name, args]) => ({
          kind: 'tool_call',
          callId,
          name,
          arguments: args,
        })),
      ],
    },
  },
})
const answering = (callId: string, ...texts: readonly string[]) => ({
  kind: 'message.tool',
  payload: {
    message: {
      role: 'tool',
      blocks: [
        { kind: 'tool_result', callId },
        ...texts.map(value => ({ kind: 'text', text: value })),
      ],
    },
  },
})
const page = (entries: readonly unknown[], next: string | null = null) =>
  ({ kind: 'read', value: { entries, next } }) as const
const run = (script: string) => object({ command: text('execute'), script: text(script) })

describe('the plain data of a value the history keeps in its tagged form', () => {
  it('reads objects, arrays, texts, numbers, booleans and null, to any depth', () => {
    const tagged = object({
      command: text('write'),
      params: object({
        lines: { kind: 'array', items: [{ kind: 'number', value: '12' }, { kind: 'null' }] },
        force: { kind: 'boolean', value: true },
      }),
    })
    expect(plainOf(tagged)).toEqual({
      command: 'write',
      params: { lines: [12, null], force: true },
    })
  })

  it('keeps a value of another shape as it is', () => {
    expect(plainOf('raw')).toBe('raw')
    expect(plainOf(null)).toBeNull()
    expect(plainOf({ kind: 'another', odd: 1 })).toEqual({ kind: 'another', odd: 1 })
  })
})

describe('the answered tool calls of a history', () => {
  it('are each a call with its result, in the order they were answered; a call without a result is left out', () => {
    const entries = [
      asking(['c1', 'Shell', run('pnpm test')], ['c2', 'Files', object({ command: text('read') })]),
      answering('c2', 'the file'),
      answering('c1', 'done', 'exit 0'),
      asking(['c3', 'Shell', run('pnpm lint')]),
      { kind: 'message.user', payload: { message: { blocks: [{ kind: 'text', text: 'hi' }] } } },
      answering('c9', 'a result of no call that was read'),
    ]
    expect(madeCalls(entries)).toEqual([
      { ref: 'c2', tool: 'Files', arguments: { command: 'read' }, result: 'the file' },
      {
        ref: 'c1',
        tool: 'Shell',
        arguments: { command: 'execute', script: 'pnpm test' },
        result: 'done\nexit 0',
      },
    ])
  })

  it('reads entries of any other shape as holding no call', () => {
    expect(madeCalls([null, 'text', { payload: null }, { payload: { message: {} } }])).toEqual([])
  })
})

describe('the tool calls a judging is shown', () => {
  it('are read from after the moment the goal was set, page after page, and described by the assembly', async () => {
    const { history, state, asked } = world()
    state.pages = [
      page([asking(['c1', 'Shell', run('pnpm test')])], 'cursor-1'),
      page([answering('c1', 'all green'), asking(['c2', 'Shell', run('pnpm lint')])], 'cursor-2'),
      page([answering('c2', 'clean')]),
    ]
    expect(await history.calls(TENANT, SESSION, '41')).toEqual({
      kind: 'read',
      value: [
        {
          ref: 'c1',
          order: 0,
          tool: 'Shell',
          command: 'pnpm test',
          path: null,
          exit: 0,
          output: 'shown: all green',
          writes: false,
        },
        {
          ref: 'c2',
          order: 1,
          tool: 'Shell',
          command: 'pnpm lint',
          path: null,
          exit: 0,
          output: 'shown: clean',
          writes: false,
        },
      ],
    })
    expect(asked).toEqual([
      { after: '41', cursor: null },
      { after: '41', cursor: 'cursor-1' },
      { after: '41', cursor: 'cursor-2' },
    ])
  })

  it('are read from the beginning for a goal set before the session had any entry', async () => {
    const { history, asked } = world()
    expect(await history.calls(TENANT, SESSION, '0')).toEqual({ kind: 'read', value: [] })
    expect(asked).toEqual([{ after: null, cursor: null }])
  })

  it('cannot be told when a page is away, a read throws, or the history does not end within the limit', async () => {
    const away = world()
    away.state.pages = [page([], 'more'), { kind: 'unavailable' }]
    expect(await away.history.calls(TENANT, SESSION, '41')).toEqual({ kind: 'unavailable' })
    const down = world()
    down.breakHistory()
    expect(await down.history.calls(TENANT, SESSION, '41')).toEqual({ kind: 'unavailable' })
    const endless = world()
    endless.state.pages = Array.from({ length: HISTORY_PAGE_LIMIT + 1 }, () => page([], 'more'))
    expect(await endless.history.calls(TENANT, SESSION, '41')).toEqual({ kind: 'unavailable' })
    expect(endless.asked).toHaveLength(HISTORY_PAGE_LIMIT)
  })

  it('are none for a text that names no tenant: nothing is read', async () => {
    const { history, asked } = world()
    expect(await history.calls('not-a-tenant', SESSION, '41')).toEqual({ kind: 'read', value: [] })
    expect(asked).toEqual([])
  })
})
