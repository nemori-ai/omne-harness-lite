// The sixth group (SPEC「组六」): `toolsSourceOf(lookup)` over the conditions, alone and through the
// real Request Context registry and operation group, where the tools the model sees are projected
// from the definitions that the lookup gave.
import { describe, expect, it } from 'vitest'
import type { Adoption, RuntimeConditions } from '@omne-harness/agent-contract'
import {
  absentToolLookup,
  toolsSourceOf,
  type ToolAvailabilityRead,
  type ToolLookup,
} from '@omne-harness/agent-context'
import type { JsonValue } from '@omne-harness/json-text'
import type { SourceRead } from '@omne-harness/request-context-contract'
import { createWorld, evidence, owner, tenantOf, type World } from './fixtures/context-world.ts'

type Definition = ToolAvailabilityRead['definition']

const adoption = (name: string): Adoption => ({
  owner: '@omne-harness/harness-server',
  name,
  revision: '0.0.0',
  digest: `sha256:${name}`,
})
const binding = (name: string): Adoption => ({
  owner: 'session',
  name,
  revision: '0.0.0',
  digest: `sha256:admitted-${name}`,
})
const schemaOf = (field: string): JsonValue => ({
  kind: 'object',
  entries: [
    { key: 'type', value: { kind: 'string', value: 'object' } },
    {
      key: 'properties',
      value: {
        kind: 'object',
        entries: [
          {
            key: field,
            value: {
              kind: 'object',
              entries: [{ key: 'type', value: { kind: 'string', value: 'string' } }],
            },
          },
        ],
      },
    },
  ],
})

/** A command tool with one declared command per entry: the name, its summary and its schema. */
function commandTool(
  name: string,
  description: string,
  commands: readonly Readonly<{ name: string; summary: string; field: string }>[],
): Definition {
  return {
    adoption: adoption(name),
    name,
    description,
    requiredCapabilities: [],
    backgroundAllowed: false,
    declarations: {
      adoption: adoption(`${name}-declarations`),
      environment: null,
      attachments: [],
      inputModalities: ['text'],
      outputModalities: ['text'],
      settings: null,
    },
    kind: 'commands',
    encoding: 'wrapped',
    commands: commands.map(command => ({
      name: command.name,
      summary: command.summary,
      parameters: {
        kind: 'declared',
        value: {
          schema: schemaOf(command.field),
          vocabulary: adoption('json-schema'),
          descriptions: [],
        },
      },
      returns: { kind: 'ordinary', program: { kind: 'none' } },
    })),
  }
}

const FILES = commandTool('Files', 'Read and change files of the workspace.', [
  { name: 'read', summary: 'Read one text file.', field: 'path' },
  { name: 'write', summary: 'Write one text file.', field: 'content' },
])
const SHELL = commandTool('Shell', 'Run commands in the workspace.', [
  { name: 'execute', summary: 'Run one command.', field: 'command' },
])
const available = (definition: Definition): ToolAvailabilityRead => ({
  kind: 'available',
  definition,
  executor: adoption(`${definition.name}-executor`),
  layer: { kind: 'official' },
})

/** A lookup over a table of tools by binding name, which counts its calls. */
function lookupOf(
  table: Readonly<Record<string, SourceRead<ToolAvailabilityRead>>>,
): ToolLookup<string> & { calls: Adoption[] } {
  const calls: Adoption[] = []
  const lookup = async ({ binding: asked }: Parameters<ToolLookup<string>>[0]) => {
    calls.push(asked)
    return (
      table[asked.name] ?? {
        kind: 'unavailable' as const,
        diagnostic: `tool-unknown: ${asked.name}`,
      }
    )
  }
  return Object.assign(lookup, { calls })
}

const KNOWN = {
  Files: { kind: 'value', value: available(FILES) },
  Shell: { kind: 'value', value: available(SHELL) },
} as const

const access = { principal: 'agent', tenant: tenantOf('1') }
const conditionsWith = (bindings: readonly Adoption[]): RuntimeConditions => ({
  source: evidence('conditions'),
  configuration: owner,
  progression: { kind: 'continue', basis: evidence('progression') },
  model: owner,
  context: evidence('context'),
  bindings,
})

describe('toolsSourceOf: the sixth group from the bindings of the conditions', () => {
  it('gives exactly the bound tools, resident, each with its binding and the availability that was read', async () => {
    const lookup = lookupOf(KNOWN)
    const bindings = [binding('Files'), binding('Shell')]
    const read = await toolsSourceOf(lookup)({ access, conditions: conditionsWith(bindings) })
    expect(read).toEqual({
      kind: 'value',
      value: [
        { resident: true, availability: available(FILES), binding: bindings[0] },
        { resident: true, availability: available(SHELL), binding: bindings[1] },
      ],
    })
    expect(lookup.calls).toEqual(bindings)
  })

  it('gives no tool for an empty set of bindings, and makes no lookup', async () => {
    const lookup = lookupOf(KNOWN)
    expect(await toolsSourceOf(lookup)({ access, conditions: conditionsWith([]) })).toEqual({
      kind: 'value',
      value: [],
    })
    expect(lookup.calls).toEqual([])
  })

  it('closes the whole group for a binding that the lookup does not know', async () => {
    const lookup = lookupOf(KNOWN)
    const bindings = [binding('Files'), binding('Search'), binding('Shell')]
    expect(await toolsSourceOf(lookup)({ access, conditions: conditionsWith(bindings) })).toEqual({
      kind: 'unavailable',
      diagnostic: 'tool-unknown: Search',
    })
  })

  it('passes a denied read and closes on a lookup that throws', async () => {
    const denied = lookupOf({ ...KNOWN, Shell: { kind: 'denied' } })
    const bindings = [binding('Files'), binding('Shell')]
    expect(await toolsSourceOf(denied)({ access, conditions: conditionsWith(bindings) })).toEqual({
      kind: 'denied',
    })
    const throwing: ToolLookup<string> = async () => {
      throw new Error('broken')
    }
    expect(await toolsSourceOf(throwing)({ access, conditions: conditionsWith(bindings) })).toEqual(
      {
        kind: 'unavailable',
        diagnostic: 'tool-lookup-failed',
      },
    )
  })

  it('closes for a tool that is not the one the binding names', async () => {
    const lookup = lookupOf({ ...KNOWN, Files: KNOWN.Shell })
    expect(
      await toolsSourceOf(lookup)({ access, conditions: conditionsWith([binding('Files')]) }),
    ).toEqual({ kind: 'unavailable', diagnostic: 'tool-binding-mismatch: Files' })
  })

  it('closes for two bindings of the same name before any lookup', async () => {
    const lookup = lookupOf(KNOWN)
    const twice = [binding('Files'), { ...binding('Files'), revision: '0.0.1' }]
    expect(await toolsSourceOf(lookup)({ access, conditions: conditionsWith(twice) })).toEqual({
      kind: 'unavailable',
      diagnostic: 'tool-binding-duplicate: Files',
    })
    expect(lookup.calls).toEqual([])
  })

  it('has no source without conditions, and the absent lookup reads no tool', async () => {
    expect(await toolsSourceOf(lookupOf(KNOWN))({ access, conditions: null })).toEqual({
      kind: 'unavailable',
      diagnostic: 'tools-source-absent',
    })
    const absent = toolsSourceOf(absentToolLookup)
    expect(await absent({ access, conditions: conditionsWith([]) })).toEqual({
      kind: 'value',
      value: [],
    })
    expect(await absent({ access, conditions: conditionsWith([binding('Files')]) })).toEqual({
      kind: 'unavailable',
      diagnostic: 'tool-lookup-absent',
    })
  })
})

describe('the sixth group through the real Request Context', () => {
  async function preparedWith(w: World, bindings: readonly Adoption[]) {
    const context = await w.read()
    return w.requests.prepare(
      w.prepareInput(context, { conditions: { ...w.conditions, bindings } }),
    )
  }

  it('declares to the model exactly the commands of the bound definitions, with their summaries and schemas', async () => {
    const w = await createWorld({ tools: toolsSourceOf(lookupOf(KNOWN)) })
    const result = await preparedWith(w, [binding('Shell'), binding('Files')])
    if (!('ok' in result) || result.ok.kind !== 'assembled')
      throw new Error(`expected assembled, got ${JSON.stringify(result)}`)
    const declared = [FILES, SHELL].flatMap(definition =>
      definition.kind === 'commands'
        ? definition.commands.map(command => ({
            name: `${definition.name}.${command.name}`,
            description: command.summary,
            argumentsSchema:
              command.parameters.kind === 'declared' ? command.parameters.value.schema : null,
          }))
        : [],
    )
    expect(result.ok.input.tools).toEqual(declared)
  })

  it('declares no tool for an empty set of bindings', async () => {
    const w = await createWorld({ tools: toolsSourceOf(lookupOf(KNOWN)) })
    const result = await preparedWith(w, [])
    if (!('ok' in result) || result.ok.kind !== 'assembled')
      throw new Error(`expected assembled, got ${JSON.stringify(result)}`)
    expect(result.ok.input.tools).toEqual([])
  })

  it('fails the preparation, with no candidate, for an unknown binding', async () => {
    const w = await createWorld({ tools: toolsSourceOf(lookupOf(KNOWN)) })
    const before = w.candidates.length
    const result = await preparedWith(w, [binding('Files'), binding('Search')])
    expect('failure' in result && result.failure).toMatchObject({
      kind: 'unavailable',
      diagnostic: expect.stringContaining('tool-unknown: Search'),
    })
    expect(w.candidates).toHaveLength(before)
  })
})
