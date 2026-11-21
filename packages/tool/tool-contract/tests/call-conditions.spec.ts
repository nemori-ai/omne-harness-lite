import { describe, expect, it } from 'vitest'
import {
  commandMenu,
  offeredDefinition,
  unmetConditions,
  type ToolDefinition,
} from '@omne-harness/tool-contract'
import { defineCommandTool, judgeToolDefinition } from '@omne-harness/tool-contract/provider'
import { commandsDefinition, declaration, functionDefinition } from './tool-values.ts'
import { ordinaryOperation } from './call-conditions-values.ts'

type Commands = Extract<ToolDefinition, { kind: 'commands' }>

// `read` needs nothing, `ask` needs a person who answers, `tell` a person and a channel.
function conditioned(): Commands {
  const base = commandsDefinition()
  if (base.kind !== 'commands') throw new Error('commands')
  const [first] = base.commands
  if (first === undefined) throw new Error('a command')
  return {
    ...base,
    commands: [
      { ...first, name: 'read' },
      { ...first, name: 'ask', conditions: ['person-answers'] },
      { ...first, name: 'tell', conditions: ['person-present', 'channel-open'] },
    ],
  }
}

const held = (...names: string[]): ReadonlySet<string> => new Set(names)
const names = (definition: ToolDefinition | null) =>
  definition?.kind === 'commands' ? definition.commands.map(command => command.name) : null

describe('the conditions a command declares (TL-62)', () => {
  it('are part of the definition: a judged definition keeps them', () => {
    const judged = judgeToolDefinition(conditioned())
    if (!('ok' in judged)) throw new Error(JSON.stringify(judged))
    expect(judged.ok).toEqual(conditioned())
  })

  it.each([
    ['an empty list', []],
    ['a name that is not a condition name', ['Person Present']],
    ['a name twice', ['person-present', 'person-present']],
    ['a value that is not a list', 'person-present'],
  ])('refuses %s', (_name, conditions) => {
    const base = conditioned()
    const broken = {
      ...base,
      commands: base.commands.map(command =>
        command.name === 'ask' ? { ...command, conditions } : command,
      ),
    }
    expect(judgeToolDefinition(broken)).toMatchObject({
      failure: { field: expect.stringContaining('conditions') },
    })
  })

  it('come from the registration of the author, command by command', () => {
    const implemented = defineCommandTool({
      encoding: 'wrapped',
      implementation: declaration(),
      commands: {
        read: { summary: 'Read.', operation: ordinaryOperation() },
        ask: { summary: 'Ask.', operation: ordinaryOperation(), conditions: ['person-answers'] },
      },
    })
    if (!('ok' in implemented)) throw new Error(JSON.stringify(implemented))
    const shape = implemented.ok.facts.implements
    if (shape.kind !== 'commands') throw new Error('commands')
    expect(shape.commands.map(command => command.conditions)).toEqual([
      undefined,
      ['person-answers'],
    ])
  })
})

describe('offering and accepting use the one declaration', () => {
  // Rows: what holds. Columns: which commands are offered, and what each call lacks.
  it.each([
    [
      held(),
      ['read'],
      { read: [], ask: ['person-answers'], tell: ['person-present', 'channel-open'] },
    ],
    [
      held('person-answers'),
      ['read', 'ask'],
      { read: [], ask: [], tell: ['person-present', 'channel-open'] },
    ],
    [
      held('person-present'),
      ['read'],
      { read: [], ask: ['person-answers'], tell: ['channel-open'] },
    ],
    [
      held('person-present', 'person-answers', 'channel-open'),
      ['read', 'ask', 'tell'],
      { read: [], ask: [], tell: [] },
    ],
    [
      held('something-unknown'),
      ['read'],
      { read: [], ask: ['person-answers'], tell: ['person-present', 'channel-open'] },
    ],
  ] as const)('when %o holds', (holding, offered, lacks) => {
    const definition = conditioned()
    expect(names(offeredDefinition(definition, holding))).toEqual(offered)
    for (const [command, missing] of Object.entries(lacks))
      expect(unmetConditions(definition, command, holding), command).toEqual(missing)
  })

  it('offers the very definition when every command stands, and the menu drops the others', () => {
    const definition = conditioned()
    expect(
      offeredDefinition(definition, held('person-answers', 'person-present', 'channel-open')),
    ).toBe(definition)
    const offered = offeredDefinition(definition, held())
    if (offered?.kind !== 'commands') throw new Error('commands')
    const menu = commandMenu(offered)
    expect(menu).toContain('read ')
    expect(menu).not.toMatch(/\bask\b|\btell\b/u)
  })

  it('offers nothing of a tool whose commands all lack a condition', () => {
    const definition = conditioned()
    const only = { ...definition, commands: definition.commands.slice(1) }
    expect(offeredDefinition(only, held())).toBeNull()
  })

  it('lacks nothing for a command the tool does not have: the call is refused elsewhere', () => {
    expect(unmetConditions(conditioned(), 'nothing', held())).toEqual([])
    expect(unmetConditions(conditioned(), null, held())).toEqual([])
  })

  it('reads the conditions of a function tool from the tool', () => {
    const plain = functionDefinition()
    expect(offeredDefinition(plain, held())).toBe(plain)
    const gated = { ...plain, conditions: ['person-present'] } as ToolDefinition
    expect(judgeToolDefinition(gated)).toEqual({ ok: gated })
    expect(offeredDefinition(gated, held())).toBeNull()
    expect(offeredDefinition(gated, held('person-present'))).toBe(gated)
    expect(unmetConditions(gated, null, held())).toEqual(['person-present'])
  })
})
