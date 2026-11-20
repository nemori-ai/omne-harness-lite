import { describe, expect, it } from 'vitest'
import type { ToolDefinition } from '@omne-harness/tool-contract'
import {
  commandAddedModalities,
  defineCommandTool,
  defineToolOperation,
  judgeToolDefinition,
} from '@omne-harness/tool-contract/provider'
import {
  commandsDefinition,
  declaration,
  declarations,
  functionDefinition,
  ordinaryAuthor,
  ordinaryReturns,
  parameters,
} from './tool-values.ts'

type Commands = Extract<ToolDefinition, { kind: 'commands' }>

function commands(modalities?: unknown): Commands {
  const source = commandsDefinition()
  if (source.kind !== 'commands') throw new Error('commands')
  const [read, shell] = source.commands
  return {
    ...source,
    declarations: { ...declarations(), outputModalities: ['text'] },
    commands: [{ ...read!, ...(modalities === undefined ? {} : { modalities }) }, shell!],
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

function implemented(modalities?: unknown) {
  return defineCommandTool({
    encoding: 'wrapped',
    implementation: declaration(),
    commands: {
      read: { summary: 'Read a file.', operation: operation() },
      open: {
        summary: 'Open an image.',
        operation: operation(),
        ...(modalities === undefined ? {} : { modalities: modalities as never }),
      },
    },
  })
}

describe('a command declares the modalities its result adds to the tool’s', () => {
  it('accepts a command that adds modalities, and one that adds none', () => {
    expect(judgeToolDefinition(commands(['image']))).toHaveProperty('ok')
    expect(judgeToolDefinition(commands(['image', 'voice']))).toHaveProperty('ok')
    expect(judgeToolDefinition(commands())).toHaveProperty('ok')
  })

  it.each([
    ['an unknown modality', ['smell'], 'commands[0].modalities[0]'],
    ['a repeated modality', ['image', 'image'], 'commands[0].modalities[1]'],
    ['an empty list, which says nothing', [], 'commands[0].modalities'],
    ['a value that is not a list', 'image', 'commands[0].modalities'],
  ])('refuses %s', (_, modalities, field) => {
    expect(judgeToolDefinition(commands(modalities))).toMatchObject({ failure: { field } })
  })

  it('carries the declaration from the author’s command table into the definition, and adds nothing when absent', () => {
    const tool = implemented(['image'])
    if (!('ok' in tool)) throw new Error(tool.failure.field)
    const shape = tool.ok.facts.implements
    if (shape.kind !== 'commands') throw new Error('commands')
    const [read, open] = shape.commands
    expect(open).toMatchObject({ name: 'open', modalities: ['image'] })
    expect(read).not.toHaveProperty('modalities')
    expect(implemented(['smell'])).toMatchObject({
      failure: { field: 'commands["open"].modalities[0]' },
    })
  })
})

describe('what a command adds to the modalities of its tool', () => {
  it('is what the command declares, without what the tool already declares for every result', () => {
    expect(commandAddedModalities(commands(['image', 'text']), 'read')).toEqual(['image'])
    expect(commandAddedModalities(commands(['voice', 'image']), 'read')).toEqual(['voice', 'image'])
  })

  it('is nothing for a command that declares none, for no command, and for a name the tool does not have', () => {
    const definition = commands(['image'])
    expect(commandAddedModalities(definition, 'shell')).toEqual([])
    expect(commandAddedModalities(definition, null)).toEqual([])
    expect(commandAddedModalities(definition, 'missing')).toEqual([])
  })

  it('is nothing for a function tool, whatever command is named', () => {
    const definition = {
      ...functionDefinition(),
      declarations: { ...declarations(), outputModalities: ['text', 'image'] as const },
    }
    expect(commandAddedModalities(definition, 'read')).toEqual([])
  })
})
