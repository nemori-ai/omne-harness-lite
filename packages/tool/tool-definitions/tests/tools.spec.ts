import { describe, expect, it } from 'vitest'
import { judgeContentBlock, type ContentBlock } from '@omne-harness/content-block'
import { readJsonText } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import { createIndependentToolScope, executeTool } from '@omne-harness/tool'
import {
  toolsCapabilityOf,
  type ToolsCapability,
  type ToolResult,
} from '@omne-harness/tool-contract'
import {
  attachToolsCapability,
  commandArguments,
  commandGuide,
  decodeToolInvocationRef,
  defaultResultPolicy,
  deriveDefinition,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import { createToolsAuthor, filesToolModule } from '@omne-harness/tool-definitions'
import { value } from './run-author.ts'

const limits = {
  maxBytes: 65536,
  maxDepth: 32,
  maxItems: 4096,
  maxMembers: 256,
  maxStringLength: 32768,
  maxNumberLength: 64,
}
function tree(input: unknown) {
  const parsed = readJsonText(JSON.stringify(input), limits)
  if (parsed.kind !== 'ok') throw new Error('Fixture JSON')
  return parsed.value
}
const adoption = { owner: 'test', name: 'Tools', revision: '1', digest: 'tools-test' }
const reference = value(decodeToolInvocationRef('["tool-invocation",2,"target","admit"]'))
const parent = value(decodeToolInvocationRef('["tool-invocation",2,"parent","admit-parent"]'))
const unavailable = () =>
  fail({ kind: 'unavailable' as const, dependency: 'fixture', diagnostic: 'unused' })
const empty: ToolResult<ToolMessageContentBlock> = {
  content: [],
  attachments: [],
  original: { kind: 'none' },
  data: { kind: 'none' },
}
function capability(patch: Partial<ToolsCapability> = {}): ToolsCapability {
  return {
    search: async () => unavailable(),
    inspect: async () => unavailable(),
    execute: async () => ({ kind: 'rejected', failure: { kind: 'denied', action: 'fixture' } }),
    readResult: async () => empty,
    ...patch,
  }
}
function author(outputModalities = ['text'], resultMaxBytes = 65536) {
  const implementation = value(createToolsAuthor(tree({ resultMaxBytes, outputModalities })))
  return {
    implementation,
    definition: deriveDefinition(
      { asset: { name: 'Tools', adoption }, requiredCapabilities: [], programmable: false },
      implementation.facts,
    ),
  }
}
async function call(
  command: string,
  params: unknown,
  bound?: ToolsCapability,
  outputModalities = ['text'],
) {
  const made = author(outputModalities)
  const registration = readToolRegistration(made.implementation)
  if (registration?.kind !== 'commands') throw new Error('Fixture commands absent')
  const operation = registration.operations.find(([name]) => name === command)?.[1]
  if (operation === undefined || operation.author.kind !== 'structured')
    throw new Error('Fixture structured operation absent')
  const text = JSON.stringify({ command, params })
  const cut = value(
    commandArguments(made.definition, command, { original: text, effective: text, complete: true }),
  )
  const parsed = operation.author.parameters.parse(cut)
  if ('failure' in parsed) return parsed
  let scope = value(
    createIndependentToolScope({
      limits: {
        authorBufferBytes: 65536,
        authorBufferItems: 64,
        authorWaitHistoryBytes: 65536,
        authorWaitHistoryItems: 64,
      },
      signal: new AbortController().signal,
      process: null,
      waits: null,
    }),
  )
  if (bound !== undefined)
    scope = attachToolsCapability(scope, { value: bound, close: async () => {} })
  const answer = await executeTool(parsed.ok, operation.author.executor, {}, scope)
  expect(toolsCapabilityOf(scope.context)).toBeUndefined()
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return operation.author.output.check({ arguments: parsed.ok, value: answer.ok })
}
const textOf = (result: ToolResult<ContentBlock>) =>
  result.content.flatMap(block => (block.kind === 'text' ? [block.text] : [])).join('\n')

describe('Tools complete author', () => {
  it('publishes five wrapped commands and help from that same declaration', async () => {
    const made = author()
    if (made.definition.kind !== 'commands') throw new Error('Fixture commands absent')
    expect(made.definition.commands.map(command => command.name)).toEqual([
      'help',
      'search',
      'inspect',
      'execute',
      'read_result',
    ])
    expect(made.definition.declarations.outputModalities).toEqual(['text'])
    expect(textOf(value(await call('help', {})))).toBe(commandGuide(made.definition))
    expect(textOf(value(await call('help', { command: 'execute' })))).toBe(
      commandGuide(made.definition, 'execute'),
    )
    const bad = JSON.stringify({ command: 'help', parameters: {} })
    expect(
      commandArguments(made.definition, 'help', { original: bad, effective: bad, complete: true }),
    ).toHaveProperty('failure')
  })

  it('requires an invocation capability for every business command', async () => {
    const answer = value(await call('search', { query: '', after: null, limit: 10 }))
    expect(textOf(answer)).toBe('ERROR: unavailable')
  })

  it.each([
    ['search', { query: 'files', after: null, limit: 0 }],
    ['search', { query: 'files', after: null, limit: 3, tenant: 'other' }],
    ['inspect', { name: 'Files' }],
    ['execute', { name: 'Files', command: 'read', arguments: {}, source: 'direct' }],
    ['read_result', { kind: 'raw', reference: 'x', after: null }],
    ['read_result', { kind: 'invocation', reference, after: 'cursor' }],
  ])('rejects invalid closed parameters for %s', async (command, params) => {
    expect(await call(command, params)).toHaveProperty('failure')
  })

  it('shows lawful resident metadata and returns the exact next cursor', async () => {
    const files = value(filesToolModule.createAuthor(tree({ resultMaxBytes: 4096 })))
    const definition = deriveDefinition(
      {
        asset: { name: 'Files', adoption: { ...adoption, name: 'Files' } },
        requiredCapabilities: [],
      },
      files.facts,
    )
    const seen: unknown[] = []
    const reply = value(
      await call(
        'search',
        { query: 'open', after: null, limit: 2 },
        capability({
          search: async args => {
            seen.push(args)
            return succeed({
              entries: [
                {
                  kind: 'available',
                  definition,
                  executor: filesToolModule.executor,
                  layer: { kind: 'official' },
                  resident: false,
                },
              ],
              next: 'opaque-next',
            })
          },
        }),
      ),
    )
    expect(seen).toEqual([{ query: 'open', after: null, limit: 2 }])
    expect(JSON.parse(textOf(reply))).toMatchObject({
      tools: [{ name: 'Files', resident: false, directCall: false }],
      next: 'opaque-next',
    })
  })

  it.each(['waiting', 'commit-unknown'] as const)(
    'retains both references for %s without calling completion a success',
    async reason => {
      const reply = value(
        await call(
          'execute',
          { name: 'Files', command: 'read', arguments: { path: '/a' } },
          capability({
            execute: async intent => {
              expect(intent.name).toBe('Files')
              expect(intent.arguments).toEqual(tree({ path: '/a' }))
              return { kind: 'pending', reason, reference, parent }
            },
          }),
        ),
      )
      expect(JSON.parse(textOf(reply))).toMatchObject({
        state: 'pending',
        reference,
        parent,
        next: {
          command: 'read_result',
          params: {
            kind: reason === 'waiting' ? 'invocation' : 'forwarding',
            reference: reason === 'waiting' ? reference : parent,
            after: null,
          },
        },
      })
    },
  )

  it('keeps association unknown recoverable at the original parent slot', async () => {
    const reply = value(
      await call(
        'execute',
        { name: 'Files', command: 'read', arguments: {} },
        capability({ execute: async () => ({ kind: 'association-unknown', parent }) }),
      ),
    )
    expect(JSON.parse(textOf(reply))).toMatchObject({
      state: 'association-unknown',
      next: { params: { kind: 'forwarding', reference: parent } },
    })
  })

  it('preserves image references for a compatible author and refuses them for the text release', async () => {
    const judged = judgeContentBlock({
      kind: 'image',
      id: 'image',
      visibility: { toHuman: true, toModel: true },
      ref: {
        storage: 'test',
        key: 'image',
        mediaType: 'image/png',
        bytes: '12',
        digest: 'sha256:test',
      },
      transcript: null,
    })
    if ('rejected' in judged) throw new Error(judged.rejected)
    const content = value(defaultResultPolicy.judge(judged.ok))
    const result = { ...empty, content: [content] }
    const bound = capability({ readResult: async () => result })
    expect(
      value(
        await call(
          'read_result',
          { kind: 'result', reference: 'opaque-fixed-reference', after: null },
          bound,
          ['text', 'image', 'voice', 'video'],
        ),
      ),
    ).toEqual(result)
    expect(
      textOf(
        value(
          await call(
            'read_result',
            { kind: 'result', reference: 'opaque-fixed-reference', after: null },
            bound,
          ),
        ),
      ),
    ).toContain('ERROR: unsupported')
  })
})
