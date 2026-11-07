import { expect, it, vi } from 'vitest'
import { createIndependentToolScope, executeTool } from '@omne-harness/tool'
import {
  commandArguments,
  commandGuide,
  deriveDefinition,
  attachToolsCapability,
} from '@omne-harness/tool-contract/provider'
import { toolsCapabilityOf } from '@omne-harness/tool-contract'
import {
  createTodoItemsAuthor,
  todoItemsToolModule,
  attachTodoItems,
  todoItemsOf,
  type BoundTodoItems,
  type TodoAuthorReply,
  type TodoAuthorPage,
  type TodoAuthorFailure,
} from '@omne-harness/tool-definitions'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import { readJsonText } from '@omne-harness/json-text'

const unavailable = {
  failure: { kind: 'unavailable', owner: 'test', diagnostic: 'offline' },
} as const
function bound(): BoundTodoItems {
  return {
    add: vi.fn(async () => unavailable),
    remove: vi.fn(async () => unavailable),
    markComplete: vi.fn(async () => unavailable),
    list: vi.fn(async () => unavailable),
  }
}
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
it('preserves Tools context and clears both attachments before finishing once', async () => {
  const original = scope()
  const finish = vi.fn(original.finish.bind(original))
  const close = vi.fn(async () => {
    expect(todoItemsOf(attached.context)).toBeUndefined()
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
  const todos = bound()
  const attached = attachTodoItems(withTools, todos)
  expect(attached.context).toBe(withTools.context)
  expect(todoItemsOf(attached.context)).toBe(todos)
  expect(toolsCapabilityOf(attached.context)).toBe(tools)
  const first = attached.finish('returned')
  expect(attached.finish('failed')).toBe(first)
  await expect(first).resolves.toHaveProperty('ok')
  expect(todoItemsOf(attached.context)).toBeUndefined()
  expect(toolsCapabilityOf(attached.context)).toBeUndefined()
  expect(finish).toHaveBeenCalledTimes(1)
  expect(close).toHaveBeenCalledTimes(1)
})

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
function author(maximum = 1048576) {
  const result = createTodoItemsAuthor(json({ resultMaxBytes: maximum }))
  if ('failure' in result) throw new Error(JSON.stringify(result.failure))
  return result.ok
}
it('publishes the actual string return contract for all Todo commands', () => {
  const registration = readToolRegistration(author())
  if (registration?.kind !== 'commands') throw new Error('commands')
  expect(registration.operations).toHaveLength(5)
  for (const [, operation] of registration.operations) {
    expect(operation.returns).toMatchObject({
      kind: 'ordinary',
      value: {
        kind: 'encoded-value',
        codec: operation.author.codec.adoption,
        value: {
          definition: {
            schema: {
              kind: 'object',
              entries: [{ key: 'type', value: { kind: 'string', value: 'string' } }],
            },
          },
        },
      },
      body: { kind: 'text' },
      offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
    })
  }
})
function fixture(maximum = 1048576) {
  const implementation = author(maximum)
  const registration = readToolRegistration(implementation)
  if (registration?.kind !== 'commands') throw new Error('commands')
  const operations = registration.operations
  const definition = deriveDefinition(
    {
      asset: { name: 'TodoItems', adoption: todoItemsToolModule.executor },
      requiredCapabilities: [],
    },
    implementation.facts,
  )
  function decode(command: string, params: unknown, extra = {}) {
    const operation = operations.find(([name]) => name === command)?.[1]
    if (operation === undefined || operation.author.kind !== 'ordinary')
      throw new Error('ordinary command')
    const text = JSON.stringify({ command, params, ...extra })
    const cut = commandArguments(definition, command, {
      original: text,
      effective: text,
      complete: true,
    })
    const parsed = 'failure' in cut ? cut : operation.author.parameters.parse(cut.ok)
    return { operation: operation.author, parsed }
  }
  async function run(command: string, params: unknown, todos?: BoundTodoItems) {
    const { operation, parsed } = decode(command, params)
    if ('failure' in parsed) throw new Error(JSON.stringify(parsed.failure))
    const execution = todos === undefined ? scope() : attachTodoItems(scope(), todos)
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
const receipt = {
  receipt: {
    operation: 'original-call',
    revision: '4',
    first: 'entry-4',
    last: 'entry-4',
    recovered: true,
    source: { owner: 'session', record: 'log', revision: '4', digest: 'sha256:receipt' },
  },
  item: { id: 'todo-1', text: '  中文原文\n', status: 'completed', createdAt: '2', changedAt: '4' },
} as const
const cursor = { tenant: 'tenant-a', session: 'session-a', revision: '4', after: 'todo-1' }
function replying(reply: TodoAuthorReply): BoundTodoItems {
  return {
    add: vi.fn(async () => reply),
    remove: vi.fn(async () => reply),
    markComplete: vi.fn(async () => reply),
    list: vi.fn(async () => reply),
  }
}
it('publishes five wrapped commands and help without a Session binding', async () => {
  const test = fixture()
  expect(test.definition.kind).toBe('commands')
  if (test.definition.kind !== 'commands') throw new Error('commands')
  expect(test.definition.encoding).toBe('wrapped')
  expect(test.definition.commands.map(item => item.name)).toEqual([
    'help',
    'add',
    'remove',
    'mark_complete',
    'list',
  ])
  expect(test.implementation.facts.backgroundAllowed).toBe(false)
  expect(test.implementation.facts.declarations).toMatchObject({
    environment: null,
    inputModalities: ['text'],
    outputModalities: ['text'],
  })
  expect(test.definition.commands.every(item => item.returns.program.kind === 'none')).toBe(true)
  expect(await test.run('help', {})).toBe(`done TodoItems help\n${commandGuide(test.definition)}`)
  const help = await test.run('help', { name: 'list' })
  expect(help).toBe(`done TodoItems help list\n${commandGuide(test.definition, 'list')}`)
  expect(help).toContain('100')
  expect(help).toContain('commit-unknown')
  expect(test.decode('help', { name: 'update' }).parsed).toHaveProperty('failure')
})
it('rejects extra identity parameters and malformed calls before business execution', () => {
  const test = fixture()
  for (const field of ['tenant', 'session', 'principal', 'operation', 'run', 'agent']) {
    for (const [command, params] of [
      ['add', { text: 'work' }],
      ['remove', { item: 'id' }],
      ['mark_complete', { item: 'id' }],
      ['list', {}],
      ['help', {}],
    ] as const) {
      expect(
        test.decode(command, { ...params, [field]: 'forged' }).parsed,
        `${command}.${field}`,
      ).toHaveProperty('failure')
    }
    expect(test.decode('list', {}, { [field]: 'forged' }).parsed).toHaveProperty('failure')
  }
  for (const value of [undefined, '', ' \n\t', 42, '中'.repeat(1366), 'x'.repeat(4097)])
    expect(test.decode('add', { text: value }).parsed).toHaveProperty('failure')
  for (const value of [0, 101, 1.5, '50', null])
    expect(test.decode('list', { limit: value }).parsed).toHaveProperty('failure')
  for (const after of [
    'opaque',
    [],
    {},
    { ...cursor, principal: 'forged' },
    { ...cursor, revision: '' },
  ])
    expect(test.decode('list', { after }).parsed).toHaveProperty('failure')
  const operation = test.decode('add', { text: 'x' }).operation
  expect(
    operation.parameters.parse({
      original: '{"text":"x","text":"y"}',
      effective: '{"text":"x","text":"y"}',
      complete: true,
    }),
  ).toHaveProperty('failure')
  expect(
    operation.parameters.parse({ original: '{"text":', effective: '{"text":', complete: false }),
  ).toMatchObject({ failure: { kind: 'incomplete' } })
})
it('routes exact business arguments and preserves complete recovered receipts and cursor pages', async () => {
  const test = fixture()
  const todos = replying({ ok: receipt })
  for (const text of ['  中文原文\n', 'x'.repeat(4096), '中'.repeat(1365) + 'x']) {
    expect(JSON.parse(await test.run('add', { text }, todos))).toEqual({ ok: receipt })
    expect(todos.add).toHaveBeenLastCalledWith({ text })
  }
  expect(JSON.parse(await test.run('mark_complete', { item: 'todo-1' }, todos))).toEqual({
    ok: receipt,
  })
  expect(todos.markComplete).toHaveBeenCalledWith({ item: 'todo-1' })
  const removed = { ...receipt, item: { ...receipt.item, status: 'removed' as const } }
  const deleting = replying({ ok: removed })
  expect(JSON.parse(await test.run('remove', { item: 'todo-1' }, deleting))).toEqual({
    ok: removed,
  })
  expect(deleting.remove).toHaveBeenCalledWith({ item: 'todo-1' })
  const page = { revision: '4', items: [receipt.item], next: cursor }
  const listing = replying({ ok: page })
  expect(JSON.parse(await test.run('list', {}, listing))).toEqual({ ok: page })
  expect(listing.list).toHaveBeenLastCalledWith({ after: null, limit: 50 })
  await test.run('list', { after: cursor, limit: 100 }, listing)
  expect(listing.list).toHaveBeenLastCalledWith({ after: cursor, limit: 100 })
  await test.run('list', { after: null, limit: 1 }, listing)
  expect(listing.list).toHaveBeenLastCalledWith({ after: null, limit: 1 })
})
it('preserves unknown and all reachable Session failures without claiming a successful mutation', async () => {
  const test = fixture()
  const failures: TodoAuthorFailure[] = [
    { kind: 'commit-unknown', operation: 'original-call' },
    { kind: 'denied', action: 'addTodo' },
    { kind: 'invalid', field: 'after', reason: 'cursor' },
    { kind: 'conflict', operation: 'original-call' },
    { kind: 'changed', revision: '5' },
    { kind: 'todo-not-found', item: 'todo-1' },
    { kind: 'unavailable', owner: 'session', diagnostic: 'offline' },
    { kind: 'quarantined', diagnostic: 'bad-log' },
    { kind: 'archived' },
    { kind: 'not-ready' },
    { kind: 'frozen', verdict: null },
    { kind: 'frozen', verdict: { cause: 'tool-shape-lost', evidence: receipt.receipt.source } },
  ]
  for (const failure of failures) {
    const todos = replying({ failure })
    expect(JSON.parse(await test.run('add', { text: 'work' }, todos))).toEqual({ failure })
    expect(todos.add).toHaveBeenCalledTimes(1)
    expect(todos.list).not.toHaveBeenCalled()
  }
  expect(JSON.parse(await test.run('list', {}))).toMatchObject({ failure: { kind: 'unavailable' } })
})
it('preserves full 100-item multibyte pages and returns unavailable instead of truncated JSON', async () => {
  const test = fixture()
  const page: TodoAuthorPage = {
    revision: '4',
    items: Array.from({ length: 100 }, (_, id) => ({
      ...receipt.item,
      id: `todo-${id}`,
      text: '中'.repeat(1365) + 'x',
    })),
    next: cursor,
  }
  const large = await test.run('list', { limit: 100 }, replying({ ok: page }))
  expect(JSON.parse(large)).toEqual({ ok: page })
  expect(new TextEncoder().encode(large).byteLength).toBeLessThanOrEqual(1048576)
  const small = fixture(256)
  const limited = await small.run('list', { limit: 100 }, replying({ ok: page }))
  expect(JSON.parse(limited)).toMatchObject({
    failure: { kind: 'unavailable', diagnostic: expect.stringContaining('Reduce list limit') },
  })
  expect(new TextEncoder().encode(limited).byteLength).toBeLessThanOrEqual(256)
  await expect(fixture(1).run('list', {})).rejects.toThrow('unavailable')
})
it('reports control-character JSON expansion as unavailable within the deployment budget', async () => {
  const test = fixture()
  const page: TodoAuthorPage = {
    revision: '4',
    items: Array.from({ length: 100 }, (_, id) => ({
      ...receipt.item,
      id: `todo-${id}`,
      text: '\u0001'.repeat(4096),
    })),
    next: cursor,
  }
  expect(JSON.parse(await test.run('list', { limit: 100 }, replying({ ok: page })))).toMatchObject({
    failure: { kind: 'unavailable', diagnostic: expect.stringContaining('Reduce list limit') },
  })
})
it('requires only positive safe resultMaxBytes and checks strict UTF-8 output', () => {
  for (const config of [
    {},
    { resultMaxBytes: 0 },
    { resultMaxBytes: -1 },
    { resultMaxBytes: 1.5 },
    { resultMaxBytes: Number.MAX_SAFE_INTEGER + 1 },
    { resultMaxBytes: 1024, session: 'forged' },
  ])
    expect(createTodoItemsAuthor(json(config))).toHaveProperty('failure')
  expect(createTodoItemsAuthor(json({ resultMaxBytes: 1 }))).toHaveProperty('ok')
  expect(todoItemsToolModule.createAuthor(json({ resultMaxBytes: 1048576 }))).toHaveProperty('ok')
  const operation = fixture().decode('list', {}).operation
  expect(operation.codec.encode(42)).toHaveProperty('failure.reason', 'text-required')
  expect(operation.codec.decode(new Uint8Array([0xc3, 0x28]))).toHaveProperty(
    'failure.reason',
    'invalid-utf8',
  )
  expect(operation.output.check({ arguments: {}, value: 42 })).toHaveProperty('failure')
})

it('clears Todo before failing cleanup and preserves one rejected finish promise', async () => {
  const original = scope()
  const error = new Error('cleanup failure')
  let repeat: ReturnType<typeof original.finish> | undefined
  const finish = vi.fn(() => {
    expect(todoItemsOf(attached.context)).toBeUndefined()
    repeat = attached.finish('failed')
    throw error
  })
  const attached = attachTodoItems({ ...original, finish }, bound())
  const first = attached.finish('returned')
  expect(repeat).toBe(first)
  expect(attached.finish('failed')).toBe(first)
  await expect(first).rejects.toBe(error)
  expect(finish).toHaveBeenCalledTimes(1)
  await original.finish('failed')
})
