import { stripTypeScriptTypes } from 'node:module'
import { describe, expect, it } from 'vitest'
import type {
  ToolDefinition,
  ToolProgramAccess,
  ToolReturnDeclaration,
} from '@omne-harness/tool-contract'
import {
  isProgramName,
  judgeToolDefinition,
  programFunctions,
  programSignature,
} from '@omne-harness/tool-contract/provider'
import { adoption, commandsDefinition, functionDefinition, json } from './tool-values.ts'

const open: ToolProgramAccess = { kind: 'open', unless: [] }
const closed: ToolProgramAccess = { kind: 'closed' }

function withData(returns: ToolReturnDeclaration, schema: string): ToolReturnDeclaration {
  return {
    ...returns,
    program: {
      kind: 'json',
      contract: adoption('program-data'),
      schema: { id: 'data', revision: '1', digest: 'sha256:data' },
      definition: { schema: json(schema), vocabulary: adoption('json-schema'), descriptions: [] },
      maxBytes: 1024,
      external: true,
    },
  }
}

function commands(
  access: readonly (ToolProgramAccess | undefined)[],
  more: Partial<ToolDefinition> = {},
): ToolDefinition {
  const base = commandsDefinition()
  if (base.kind !== 'commands') throw new Error('commands')
  const declared = base.commands.map((command, index) => {
    const program = access[index]
    return program === undefined ? command : { ...command, program }
  })
  return {
    ...base,
    name: 'Files',
    programmable: true,
    ...more,
    commands: declared,
  } as ToolDefinition
}

function lookupTool(): ToolDefinition {
  const base = functionDefinition()
  if (base.kind !== 'function') throw new Error('function')
  return { ...base, name: 'Lookup', programmable: true, program: open }
}

function rejection(value: unknown) {
  const judged = judgeToolDefinition(value)
  if ('ok' in judged) throw new Error('the definition was accepted')
  return judged.failure
}

describe('program access of a definition (TL-72)', () => {
  it('accepts a programmable command tool whose every command says how it faces a program', () => {
    expect('ok' in judgeToolDefinition(commands([open, closed]))).toBe(true)
    expect(
      'ok' in judgeToolDefinition(commands([{ kind: 'open', unless: ['terminal'] }, open])),
    ).toBe(true)
  })

  it('rejects a programmable command tool with a command that does not say', () => {
    expect(rejection(commands([open, undefined]))).toEqual({
      field: 'commands[1].program',
      reason: 'undeclared',
    })
    expect(rejection(commands([undefined, open]))).toEqual({
      field: 'commands[0].program',
      reason: 'undeclared',
    })
  })

  it('rejects a programmable tool with no command open to a program', () => {
    expect(rejection(commands([closed, closed]))).toEqual({
      field: 'commands',
      reason: 'no-open-command',
    })
    expect(rejection({ ...functionDefinition(), programmable: true, program: closed })).toEqual({
      field: 'program',
      reason: 'no-open-command',
    })
    expect(rejection({ ...functionDefinition(), programmable: true })).toEqual({
      field: 'program',
      reason: 'undeclared',
    })
  })

  it('rejects names a program cannot write, on the tool and on an open command only', () => {
    expect(rejection(commands([open, closed], { name: 'my-files' }))).toEqual({
      field: 'name',
      reason: 'program-name',
    })
    const base = commands([open, closed])
    if (base.kind !== 'commands') throw new Error('commands')
    const renamed = (index: number, name: string) => ({
      ...base,
      commands: base.commands.map((command, at) => (at === index ? { ...command, name } : command)),
    })
    expect(rejection(renamed(0, 'read-all'))).toEqual({
      field: 'commands[0].name',
      reason: 'program-name',
    })
    expect('ok' in judgeToolDefinition(renamed(1, 'close-it'))).toBe(true)
    for (const name of ['tools', 'ToolError', 'input', 'class'])
      expect(
        rejection({ ...functionDefinition(), name, programmable: true, program: open }),
      ).toEqual({
        field: 'name',
        reason: 'program-name',
      })
  })

  it('does not ask a tool that is not programmable to say anything', () => {
    for (const programmable of [false, undefined]) {
      const base = commandsDefinition()
      const value = programmable === undefined ? base : { ...base, programmable }
      expect('ok' in judgeToolDefinition(value)).toBe(true)
    }
    expect(
      'ok' in judgeToolDefinition({ ...commands([open, undefined]), programmable: false }),
    ).toBe(true)
  })

  it('rejects a program access of another shape', () => {
    expect(rejection(commands([{ kind: 'open' } as never, closed]))).toMatchObject({
      field: 'commands[0].program.unless',
    })
    expect(rejection(commands([{ kind: 'maybe' } as never, closed]))).toMatchObject({
      field: 'commands[0].program.kind',
    })
  })

  it('judges a name by what a program can write', () => {
    expect(isProgramName('Files', 'read')).toBe(true)
    expect(isProgramName('Web')).toBe(true)
    expect(isProgramName('Files', 'delete')).toBe(true)
    expect(isProgramName('web-search')).toBe(false)
    expect(isProgramName('Files', 'read-all')).toBe(false)
    expect(isProgramName('ToolError')).toBe(false)
    expect(isProgramName('ToolError', 'x')).toBe(false)
  })
})

describe('the functions of a definition and their signatures', () => {
  const read =
    '{"type":"object","required":["text","next"],"properties":{"text":{"type":"string"},"next":{"type":["integer","null"]},"entries":{"type":"array","items":{"type":"object","required":["name"],"properties":{"name":{"type":"string"},"kind":{"enum":["file","dir"]}}}},"env":{"type":"object","additionalProperties":{"type":"string"}},"odd-key":{"const":1},"any":{}}}'

  function programmable(): ToolDefinition {
    const base = commands([{ kind: 'open', unless: ['later'] }, open])
    if (base.kind !== 'commands') throw new Error('commands')
    const [first, second] = base.commands
    if (first === undefined || second === undefined) throw new Error('two commands')
    const parameters = {
      kind: 'declared' as const,
      value: {
        schema: json(
          '{"type":"object","required":["path"],"properties":{"path":{"type":"string"},"limit":{"type":"integer"},"later":{"type":"boolean"},"mode":{"type":"string","enum":["a","b"]}}}',
        ),
        vocabulary: adoption('json-schema'),
        descriptions: [],
      },
    }
    return {
      ...base,
      commands: [
        { ...first, parameters, returns: withData(first.returns, read) },
        second,
        { ...first, name: 'help', program: closed },
      ],
    }
  }

  it('lists the open commands with what closes them, and nothing for a tool that is not programmable', () => {
    expect(programFunctions(programmable())).toMatchObject([
      { entry: 'Files.read', tool: 'Files', command: 'read', unless: ['later'], external: true },
      { entry: 'Files.shell', tool: 'Files', command: 'shell', unless: [], external: false },
    ])
    expect(programFunctions({ ...programmable(), programmable: false })).toEqual([])
    expect(programFunctions(commandsDefinition())).toEqual([])
    expect(programFunctions(lookupTool())).toMatchObject([
      { entry: 'Lookup', tool: 'Lookup', command: null },
    ])
  })

  it('derives the declaration of a command tool from its contracts, word for word', () => {
    expect(programSignature(programmable())).toBe(
      [
        'declare const Files: {',
        '  /** Read a file. */',
        '  read(params: { path: string; limit?: number; mode?: "a" | "b" }): Promise<{ text: string; next: number | null; entries?: { name: string; kind?: "file" | "dir" }[]; env?: Record<string, string>; "odd-key"?: 1; any?: unknown }>',
        '  /** Run a command. */',
        '  shell(params: Record<string, unknown>): Promise<void>',
        '}',
      ].join('\n'),
    )
  })

  it('derives the declaration of a function tool', () => {
    const lookup = lookupTool()
    expect(programSignature(lookup)).toBe(
      '/** Reads one file. */\ndeclare function Lookup(params: { path?: string }): Promise<void>',
    )
    expect(programSignature(functionDefinition())).toBe('')
  })

  it('gives declarations TypeScript accepts', () => {
    const lookup = lookupTool()
    for (const text of [programSignature(programmable()), programSignature(lookup)])
      expect(
        stripTypeScriptTypes(text)
          .replaceAll(/\/\*\*.*?\*\//gs, '')
          .trim(),
      ).toBe('')
  })
})
