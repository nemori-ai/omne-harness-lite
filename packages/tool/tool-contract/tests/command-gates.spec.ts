import { describe, expect, it } from 'vitest'
import { commandGateOf, type ToolDefinition } from '@omne-harness/tool-contract'
import {
  defineCommandTool,
  defineToolOperation,
  judgeToolDefinition,
} from '@omne-harness/tool-contract/provider'
import {
  commandsDefinition,
  declaration,
  functionDefinition,
  ordinaryAuthor,
  ordinaryReturns,
  parameters,
} from './tool-values.ts'

type Commands = Extract<ToolDefinition, { kind: 'commands' }>

const READ = { id: 'read', title: '读', default: 'auto' } as const
const WRITE = { id: 'write', title: '写', default: 'ask' } as const

function gated(gates: unknown, releases: readonly unknown[]): Commands {
  const source = commandsDefinition()
  if (source.kind !== 'commands') throw new Error('commands')
  return {
    ...source,
    ...(gates === undefined ? {} : { gates }),
    commands: source.commands.map((command, index) =>
      releases[index] === undefined ? command : { ...command, release: releases[index] },
    ),
  } as unknown as Commands
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

function implemented(gates: unknown, read: unknown, run: unknown) {
  return defineCommandTool({
    encoding: 'wrapped',
    implementation: declaration(),
    ...(gates === undefined ? {} : { gates: gates as never }),
    commands: {
      read: {
        summary: 'Read a file.',
        operation: operation(),
        ...(read === undefined ? {} : { release: read as never }),
      },
      run: {
        summary: 'Run once.',
        operation: operation(),
        ...(run === undefined ? {} : { release: run as never }),
      },
    },
  })
}

describe('a tool declares its gates and the gate of each command', () => {
  it('keeps declared gates and each command release in the facts it registers', () => {
    const made = implemented([READ, WRITE], { gate: 'read' }, { gate: 'write' })
    if (!('ok' in made)) throw new Error(made.failure.field)
    const shape = made.ok.facts.implements
    if (shape.kind !== 'commands') throw new Error('commands')
    expect(shape.gates).toEqual([READ, WRITE])
    expect(shape.commands.map(command => [command.name, command.release])).toEqual([
      ['read', { gate: 'read' }],
      ['run', { gate: 'write' }],
    ])
  })

  it('accepts a definition whose commands name declared gates or declare none', () => {
    expect(
      judgeToolDefinition(gated([READ, WRITE], [{ gate: 'read' }, { gate: null }])),
    ).toHaveProperty('ok')
    expect(judgeToolDefinition(gated(undefined, []))).toHaveProperty('ok')
  })

  it('refuses a command naming a gate its tool did not declare', () => {
    expect(implemented([READ], { gate: 'read' }, { gate: 'write' })).toEqual({
      failure: { field: 'input.commands["run"].release.gate', reason: 'unknown-gate' },
    })
    expect(judgeToolDefinition(gated([READ], [undefined, { gate: 'write' }]))).toEqual({
      failure: { field: 'commands[1].release.gate', reason: 'unknown-gate' },
    })
  })

  it('refuses a named gate when the tool declares none, and repeated or malformed gates', () => {
    expect(judgeToolDefinition(gated(undefined, [{ gate: 'read' }]))).toEqual({
      failure: { field: 'commands[0].release.gate', reason: 'unknown-gate' },
    })
    expect(judgeToolDefinition(gated([READ, { ...WRITE, id: 'read' }], []))).toEqual({
      failure: { field: 'gates[1].id', reason: 'duplicate' },
    })
    expect(judgeToolDefinition(gated([], []))).toEqual({
      failure: { field: 'gates', reason: 'empty' },
    })
    expect(judgeToolDefinition(gated([{ ...READ, id: 'Read Me' }], []))).toEqual({
      failure: { field: 'gates[0].id', reason: 'gate-id' },
    })
    expect(judgeToolDefinition(gated([{ ...READ, default: 'never' }], []))).toEqual({
      failure: { field: 'gates[0].default', reason: 'value' },
    })
  })
})

describe('the gate a command belongs to is read from the definition alone', () => {
  const definition = gated([READ, WRITE], [{ gate: 'write' }, { gate: null }])

  it('answers the gate a command names', () => {
    expect(commandGateOf(definition, 'read', [])).toEqual({ kind: 'gate', gate: WRITE })
  })

  it('answers ungated only for a command the assembly names', () => {
    expect(commandGateOf(definition, 'shell', ['shell'])).toEqual({ kind: 'ungated' })
    expect(commandGateOf(definition, 'shell', [])).toEqual({ kind: 'gate', gate: READ })
    expect(commandGateOf(definition, 'shell', ['read'])).toEqual({ kind: 'gate', gate: READ })
  })

  it('puts a command without a release, and a command the tool lacks, under the first gate', () => {
    const partial = gated([WRITE, READ], [{ gate: 'read' }])
    expect(commandGateOf(partial, 'shell', [])).toEqual({ kind: 'gate', gate: WRITE })
    expect(commandGateOf(partial, 'missing', ['missing'])).toEqual({ kind: 'gate', gate: WRITE })
    expect(commandGateOf(partial, null, [])).toEqual({ kind: 'gate', gate: WRITE })
  })

  it('puts every command of a tool that declares no gate under one gate that asks', () => {
    const invoke = { kind: 'gate', gate: { id: 'invoke', title: '调用', default: 'ask' } }
    expect(commandGateOf(gated(undefined, []), 'read', [])).toEqual(invoke)
    expect(commandGateOf(gated(undefined, []), 'shell', ['shell'])).toEqual(invoke)
    expect(commandGateOf(functionDefinition(), null, [])).toEqual(invoke)
  })
})
