import type { EndpointName } from '@omne-harness/mcp-contract'
import { commandMenu, type ToolDefinition } from '@omne-harness/tool-contract'
import { commandGuide, judgeToolDefinition } from '@omne-harness/tool-contract/provider'
import { describe, expect, it } from 'vitest'
import {
  commandOf,
  commandText,
  endpointTool,
  MCP_INVOKE_GATE,
  PEER_MARK,
  PEER_TEXT_BEGIN,
  PEER_TEXT_END,
} from '../src/index.ts'
import { action, realCatalog, shape } from './support.ts'

const endpoint = 'docs' as EndpointName

function toolOf(...actions: Parameters<typeof endpointTool>[1][number][]) {
  const made = endpointTool(endpoint, actions, shape)
  if ('failure' in made) throw new Error(`no tool: ${made.failure}`)
  return made.ok
}

function commandsOf(definition: ToolDefinition) {
  if (definition.kind !== 'commands') throw new Error('the endpoint is not a commands tool')
  return definition
}

describe('one endpoint is one multi-command tool', () => {
  it.each(['context7', 'deepwiki', 'mslearn'] as const)(
    'the real catalog of %s converts to a lawful definition, one command for each action',
    name => {
      const catalog = realCatalog(name)
      const { definition, unadmitted } = (() => {
        const made = endpointTool(catalog.name, catalog.actions, shape)
        if ('failure' in made) throw new Error(made.failure)
        return made.ok
      })()
      expect(judgeToolDefinition(definition)).toHaveProperty('ok')
      expect(unadmitted).toEqual([])
      const table = commandsOf(definition)
      expect(definition.name).toBe(`mcp__${name}`)
      expect(table.commands.map(command => command.name)).toEqual(
        catalog.actions.map(known => known.name),
      )
      expect(table.encoding).toBe('wrapped')
      expect(table.gates).toEqual([
        { id: MCP_INVOKE_GATE, title: expect.any(String), default: 'ask' },
      ])
      for (const command of table.commands) {
        expect(command.release).toEqual({ gate: MCP_INVOKE_GATE })
        expect(command.summary.startsWith(`${PEER_MARK} `)).toBe(true)
        expect([...command.summary].length).toBeLessThanOrEqual(PEER_MARK.length + 1 + 160)
        expect(command.returns.kind).toBe('structured')
      }
      expect(commandMenu(table).split('\n').length).toBeGreaterThanOrEqual(catalog.actions.length)
    },
  )

  it('the summary is the first sentence of what the endpoint says, marked as its text', () => {
    const { definition } = toolOf(
      action('search', {
        description: '\n  Finds pages. Use it before fetch.\nSecond line.',
      }),
    )
    expect(commandsOf(definition).commands[0]?.summary).toBe(`${PEER_MARK} Finds pages.`)
  })

  it('a long first sentence is cut at 160 characters and control characters become spaces', () => {
    const long = `A${'b'.repeat(200)}`
    const [cut, tabbed] = commandsOf(
      toolOf(
        action('long', { description: long }),
        action('tabbed', { description: 'One\ttwo\u0000three' }),
      ).definition,
    ).commands
    expect(cut?.summary).toBe(`${PEER_MARK} ${long.slice(0, 157)}...`)
    expect(tabbed?.summary).toBe(`${PEER_MARK} One two three`)
  })

  it('an action without a description takes its title, and without both a fixed sentence', () => {
    const [titled, bare] = commandsOf(
      toolOf(action('titled', { title: 'Query Docs' }), action('bare')).definition,
    ).commands
    expect(titled?.summary).toBe(`${PEER_MARK} Query Docs`)
    expect(bare?.summary).toBe('The endpoint gave no description.')
  })

  it('the whole description stands at the root of the parameters, between the marks', () => {
    const description = 'Finds pages. Use it before fetch.\n\nDo not call it twice.'
    const command = commandsOf(toolOf(action('search', { description })).definition).commands[0]
    if (command?.parameters.kind !== 'declared') throw new Error('parameters are not declared')
    expect(command.parameters.value.descriptions).toEqual([
      { path: '$', text: `${PEER_TEXT_BEGIN}\n${description}\n${PEER_TEXT_END}` },
    ])
    const guide = commandGuide(
      commandsOf(toolOf(action('search', { description })).definition),
      'search',
    )
    expect(guide).toContain('Do not call it twice.')
    expect(guide).toContain('"required":["query"]')
  })

  it('a description that is only the summary is not repeated at the root', () => {
    const command = commandsOf(toolOf(action('search', { description: 'Finds pages.' })).definition)
      .commands[0]
    if (command?.parameters.kind !== 'declared') throw new Error('parameters are not declared')
    expect(command.parameters.value.descriptions).toEqual([])
  })

  it('the input schema of the action is the schema of the command, as it is', () => {
    const known = action('search')
    const made = commandOf(known, shape)
    if (!('ok' in made) || made.ok.parameters.kind !== 'declared') throw new Error('not admitted')
    const definition = known.lastLawful.definition
    if (definition.kind !== 'object') throw new Error('the fixture is not an object')
    expect(made.ok.parameters.value.schema).toBe(
      definition.entries.find(entry => entry.key === 'inputSchema')?.value,
    )
  })

  it.each([
    ['an input schema that is not an object', { inputSchema: ['string'] }, 'input-schema'],
    ['no input schema', { inputSchema: undefined }, 'input-schema'],
  ] as const)('%s keeps the action out of the table, by name and reason', (_, facts, reason) => {
    const { definition, unadmitted } = toolOf(action('search'), action('odd', facts))
    expect(commandsOf(definition).commands.map(command => command.name)).toEqual(['search'])
    expect(unadmitted).toEqual([{ action: 'odd', reason }])
    expect(definition.description).toContain('"odd"')
    expect(definition.description).toContain('input schema')
  })

  it('a name that is not one word keeps the action out', () => {
    const { unadmitted } = toolOf(action('search'), action('two words'), action('line\nbreak'))
    expect(unadmitted).toEqual([
      { action: 'two words', reason: 'name' },
      { action: 'line\nbreak', reason: 'name' },
    ])
  })

  it('the description names the endpoint and carries no line of an unadmitted name', () => {
    const { definition } = toolOf(action('search'), action('line\nbreak'))
    expect(definition.description).toContain('"docs"')
    expect(definition.description).toContain('"line\\nbreak"')
  })

  it('an endpoint with no action that can be offered gives no tool', () => {
    expect(endpointTool(endpoint, [], shape)).toEqual({ failure: 'no-action' })
    expect(endpointTool(endpoint, [action('two words')], shape)).toEqual({ failure: 'no-action' })
  })

  it('two actions of one name give no tool', () => {
    expect(endpointTool(endpoint, [action('search'), action('search')], shape)).toEqual({
      failure: 'definition',
    })
  })

  it('the adoption of the definition changes when a command changes, and only then', () => {
    const first = toolOf(action('search'), action('fetch')).definition
    const again = toolOf(action('search'), action('fetch')).definition
    const changed = toolOf(
      action('search', { description: 'Now different.' }),
      action('fetch'),
    ).definition
    const fewer = toolOf(action('search')).definition
    expect(again.adoption).toEqual(first.adoption)
    expect(changed.adoption.digest).not.toBe(first.adoption.digest)
    expect(fewer.adoption.digest).not.toBe(first.adoption.digest)
  })

  it('the text of a command ignores the order of the keys of its schema', () => {
    const one = commandOf(
      action('search', { inputSchema: { type: 'object', properties: {} } }),
      shape,
    )
    const other = commandOf(
      action('search', { inputSchema: { properties: {}, type: 'object' } }),
      shape,
    )
    if (!('ok' in one) || !('ok' in other)) throw new Error('not admitted')
    expect(commandText(one.ok)).toBe(commandText(other.ok))
  })
})
