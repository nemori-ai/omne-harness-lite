import { describe, expect, it } from 'vitest'
import type { ToolDefinition } from '@omne-harness/tool-contract'
import {
  defineCommandTool,
  defineToolOperation,
  judgeToolDefinition,
} from '@omne-harness/tool-contract/provider'
import {
  commandsDefinition,
  declaration,
  ordinaryAuthor,
  ordinaryReturns,
  parameters,
} from './tool-values.ts'

type Commands = Extract<ToolDefinition, { kind: 'commands' }>

function commands(backgroundAllowed: boolean, background?: unknown): Commands {
  const source = commandsDefinition()
  if (source.kind !== 'commands') throw new Error('commands')
  const [read, shell] = source.commands
  return {
    ...source,
    backgroundAllowed,
    commands: [read!, { ...shell!, ...(background === undefined ? {} : { background }) }],
  } as Commands
}

function operation() {
  const defined = defineToolOperation({
    parameters: { kind: 'declared', value: parameters() },
    returns: ordinaryReturns,
    author: ordinaryAuthor(),
  })
  if (!('ok' in defined)) throw new Error(defined.failure.field)
  return defined.ok
}

function implemented(backgroundAllowed: boolean, background?: unknown) {
  return defineCommandTool({
    encoding: 'wrapped',
    implementation: { ...declaration(), backgroundAllowed },
    commands: {
      read: { summary: 'Read a file.', operation: operation() },
      run: {
        summary: 'Run once.',
        operation: operation(),
        ...(background === undefined ? {} : { background: background as never }),
      },
    },
  })
}

describe('a command declares where the background is permitted', () => {
  it('accepts a declared command in a tool that permits the background, with or without exceptions', () => {
    expect(judgeToolDefinition(commands(true, { unless: ['terminal'] }))).toHaveProperty('ok')
    expect(judgeToolDefinition(commands(true, { unless: [] }))).toHaveProperty('ok')
  })

  it('accepts a command whose calls all start in the background, and refuses one that also names exceptions', () => {
    expect(judgeToolDefinition(commands(true, { unless: [], start: 'launch' }))).toHaveProperty(
      'ok',
    )
    expect(judgeToolDefinition(commands(true, { unless: ['terminal'], start: 'launch' }))).toEqual({
      failure: { field: 'commands[1].background', reason: 'launch-with-unless' },
    })
    expect(judgeToolDefinition(commands(true, { unless: [], start: 'soon' }))).toHaveProperty(
      'failure',
    )
  })

  it('refuses a declaration in a tool that does not permit the background', () => {
    expect(judgeToolDefinition(commands(false, { unless: [] }))).toEqual({
      failure: { field: 'commands[1].background', reason: 'background-not-allowed' },
    })
  })

  it('judges the first command like any other', () => {
    const first = (allowed: boolean) => {
      const source = commands(allowed)
      const [read, shell] = source.commands
      return { ...source, commands: [{ ...read!, background: { unless: [] } }, shell!] }
    }
    expect(judgeToolDefinition(first(true))).toHaveProperty('ok')
    expect(judgeToolDefinition(first(false))).toEqual({
      failure: { field: 'commands[0].background', reason: 'background-not-allowed' },
    })
  })

  it('refuses a command tool that permits the background but declares it on no command', () => {
    expect(judgeToolDefinition(commands(true))).toEqual({
      failure: { field: 'commands', reason: 'no-background-command' },
    })
  })

  it('refuses an empty or repeated parameter name in the exceptions', () => {
    expect(judgeToolDefinition(commands(true, { unless: [''] }))).toHaveProperty('failure')
    expect(judgeToolDefinition(commands(true, { unless: ['a', 'a'] }))).toHaveProperty('failure')
  })

  it('keeps an unknown member of the declaration out', () => {
    expect(judgeToolDefinition(commands(true, { unless: [], always: true }))).toHaveProperty(
      'failure',
    )
  })
})

describe('defineCommandTool carries the declaration into the implementation facts', () => {
  it('writes background on the declared command only', () => {
    const tool = implemented(true, { unless: ['terminal'] })
    if (!('ok' in tool)) throw new Error(tool.failure.field)
    const shape = tool.ok.facts.implements
    if (shape.kind !== 'commands') throw new Error('commands')
    expect(shape.commands.map(command => command.background)).toEqual([
      undefined,
      { unless: ['terminal'] },
    ])
  })

  it('refuses the same two disagreements as the definition', () => {
    expect(implemented(false, { unless: [] })).toEqual({
      failure: { field: 'implements.commands[1].background', reason: 'background-not-allowed' },
    })
    expect(implemented(true)).toEqual({
      failure: { field: 'implements.commands', reason: 'no-background-command' },
    })
  })
})
