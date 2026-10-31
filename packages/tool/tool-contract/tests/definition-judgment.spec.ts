import { describe, expect, it } from 'vitest'
import { type ToolDefinition } from '@omne-harness/tool-contract'
import { judgeToolDefinition } from '@omne-harness/tool-contract/provider'
import { commandsDefinition, functionDefinition, json, parameters } from './tool-values.ts'

function rejection(value: unknown) {
  const judged = judgeToolDefinition(value)
  if ('ok' in judged) throw new Error('the definition was accepted')
  return judged.failure
}

describe('definition judgment', () => {
  it('definition judgment: accepts a function definition and keeps an omitted programmable omitted', () => {
    const definition = functionDefinition()
    const judged = judgeToolDefinition(definition)
    if (!('ok' in judged)) throw new Error(judged.failure.field)
    expect(judged.ok).toEqual(definition)
    expect(Object.hasOwn(judged.ok, 'programmable')).toBe(false)
  })

  it('definition judgment: keeps an explicit programmable value', () => {
    for (const programmable of [true, false]) {
      const judged = judgeToolDefinition({ ...commandsDefinition(), programmable })
      expect(judged).toEqual({ ok: { ...commandsDefinition(), programmable } })
    }
  })

  it('definition judgment: rejects programmable "true" as a string and names the field', () => {
    for (const programmable of ['true', 1, null])
      expect(rejection({ ...functionDefinition(), programmable })).toEqual({
        field: 'programmable',
        reason: 'type',
      })
  })

  it('definition judgment: rejects a repeated command name and names the second one', () => {
    const definition = commandsDefinition()
    if (definition.kind !== 'commands') throw new Error('commands')
    const [first, second] = definition.commands
    if (first === undefined || second === undefined) throw new Error('two commands')
    const repeated = { ...definition, commands: [first, { ...second, name: first.name }] }
    expect(rejection(repeated)).toEqual({ field: 'commands[1].name', reason: 'duplicate' })
  })

  it('definition judgment: rejects a blank tool description and a blank command summary', () => {
    expect(rejection({ ...functionDefinition(), description: ' \t' })).toEqual({
      field: 'description',
      reason: 'blank',
    })
    const definition = commandsDefinition()
    if (definition.kind !== 'commands') throw new Error('commands')
    const commands = definition.commands.map((command, index) =>
      index === 1 ? { ...command, summary: '   ' } : command,
    )
    expect(rejection({ ...definition, commands })).toEqual({
      field: 'commands[1].summary',
      reason: 'blank',
    })
  })

  it('definition judgment: rejects a command summary of more than one line', () => {
    const definition = commandsDefinition()
    if (definition.kind !== 'commands') throw new Error('commands')
    const commands = definition.commands.map(command => ({
      ...command,
      summary: 'Read.\nThen more.',
    }))
    expect(rejection({ ...definition, commands })).toEqual({
      field: 'commands[0].summary',
      reason: 'multiline',
    })
  })

  it('definition judgment: rejects a parameter whose description is missing or blank', () => {
    const contract = parameters(['path'])
    const missing = { ...contract, descriptions: [{ path: 'path' }] }
    expect(rejection({ ...functionDefinition(), parameters: missing })).toEqual({
      field: 'parameters.descriptions[0].text',
      reason: 'missing',
    })
    const blank = { ...contract, descriptions: [{ path: 'path', text: '' }] }
    expect(rejection({ ...functionDefinition(), parameters: blank })).toEqual({
      field: 'parameters.descriptions[0].text',
      reason: 'blank',
    })
    const twice = {
      ...contract,
      descriptions: [...contract.descriptions, ...contract.descriptions],
    }
    expect(rejection({ ...functionDefinition(), parameters: twice })).toEqual({
      field: 'parameters.descriptions[1].path',
      reason: 'duplicate',
    })
  })

  it('definition judgment: rejects an unknown field, an empty command list and a schema that is not a json-text tree', () => {
    expect(rejection({ ...functionDefinition(), help: 'x' })).toEqual({
      field: 'help',
      reason: 'unknown-field',
    })
    expect(rejection({ ...commandsDefinition(), commands: [] })).toEqual({
      field: 'commands',
      reason: 'empty',
    })
    const schema = { type: 'object' }
    expect(rejection({ ...functionDefinition(), parameters: { ...parameters(), schema } })).toEqual(
      {
        field: 'parameters.schema.kind',
        reason: 'missing',
      },
    )
    expect(rejection('read_file')).toEqual({ field: 'ToolDefinition', reason: 'type' })
  })

  it('definition judgment: rejects a cyclic schema tree and accepts a shared leaf node', () => {
    const leaf = { kind: 'string', value: 'string' }
    const shared = {
      kind: 'object',
      entries: [
        { key: 'type', value: leaf },
        { key: 'format', value: leaf },
      ],
    }
    const contract = { ...parameters([]), schema: shared }
    expect('ok' in judgeToolDefinition({ ...functionDefinition(), parameters: contract })).toBe(
      true,
    )
    const cyclic: { kind: 'object'; entries: { key: string; value: unknown }[] } = {
      kind: 'object',
      entries: [],
    }
    cyclic.entries.push({ key: 'self', value: cyclic })
    expect(
      rejection({ ...functionDefinition(), parameters: { ...parameters([]), schema: cyclic } }),
    ).toEqual({ field: 'parameters.schema.entries[0].value', reason: 'cycle' })
  })

  it('definition judgment: accepts a container shared by two parents and copies it twice', () => {
    const string = {
      kind: 'object',
      entries: [{ key: 'type', value: { kind: 'string', value: 'string' } }],
    }
    const schema = {
      kind: 'object',
      entries: [
        { key: 'source', value: string },
        { key: 'target', value: { kind: 'array', items: [string] } },
      ],
    }
    const definition = { ...functionDefinition(), parameters: { ...parameters([]), schema } }
    const judged = judgeToolDefinition(definition)
    expect(judged).toEqual({ ok: definition })
    if (!('ok' in judged) || judged.ok.kind !== 'function') throw new Error('not accepted')
    const copied = judged.ok.parameters.schema
    expect(copied.kind === 'object' && copied.entries[0]?.value).not.toBe(string)
  })

  it('definition judgment: counts a shared subtree each time it is reached', () => {
    let shared: unknown = { kind: 'null' }
    for (let level = 0; level < 24; level += 1) shared = { kind: 'array', items: [shared, shared] }
    const schema = { kind: 'object', entries: [{ key: 'wide', value: shared }] }
    const judged = judgeToolDefinition({
      ...functionDefinition(),
      parameters: { ...parameters([]), schema },
    })
    expect('failure' in judged && judged.failure.reason).toBe('budget')
  })

  it('definition judgment: rejects a duplicate key in an object-form schema tree', () => {
    const schema = {
      kind: 'object',
      entries: [
        { key: 'type', value: { kind: 'string', value: 'object' } },
        { key: 'type', value: { kind: 'string', value: 'string' } },
      ],
    }
    expect(
      rejection({ ...functionDefinition(), parameters: { ...parameters([]), schema } }),
    ).toEqual({ field: 'parameters.schema.entries[1].key', reason: 'duplicate' })
  })

  it('definition judgment: rejects a value whose Proxy traps throw, without throwing', () => {
    const hostile = new Proxy(functionDefinition(), {
      ownKeys: () => {
        throw new Error('trap')
      },
    })
    expect(rejection(hostile)).toEqual({ field: 'ToolDefinition', reason: 'unreadable' })
  })

  it('definition judgment: returns a frozen copy and does not run a getter of the input', () => {
    const definition = functionDefinition()
    const judged = judgeToolDefinition(definition)
    if (!('ok' in judged)) throw new Error(judged.failure.field)
    expect(judged.ok).not.toBe(definition)
    expect(Object.isFrozen(judged.ok)).toBe(true)
    expect(Object.isFrozen(judged.ok.requiredCapabilities)).toBe(true)
    let reads = 0
    const tricky = functionDefinition()
    Object.defineProperty(tricky, 'description', {
      enumerable: true,
      get() {
        reads += 1
        return 'Reads one file.'
      },
    })
    expect(rejection(tricky)).toEqual({ field: 'description', reason: 'accessor' })
    expect(reads).toBe(0)
  })

  it('definition judgment: applies the closed settings paths of P15', () => {
    const settings = (items: readonly (readonly string[])[], defaults: string) => ({
      schema: parameters([]),
      defaults: json(defaults),
      items: items.map(path => ({ path, category: 'preference', sensitive: false })),
    })
    const withSettings = (value: ReturnType<typeof settings>): ToolDefinition => {
      const definition = functionDefinition()
      return {
        ...definition,
        declarations: { ...definition.declarations, settings: value },
      } as ToolDefinition
    }
    const legal = withSettings(
      settings([['limits', 'lines'], ['encoding']], '{"limits":{"lines":10}}'),
    )
    expect(judgeToolDefinition(legal)).toEqual({ ok: legal })
    expect(rejection(withSettings(settings([['limits'], ['limits', 'lines']], '{}')))).toEqual({
      field: 'declarations.settings.items[1].path',
      reason: 'overlap',
    })
    expect(rejection(withSettings(settings([['encoding'], ['encoding']], '{}')))).toEqual({
      field: 'declarations.settings.items[1].path',
      reason: 'duplicate',
    })
    expect(rejection(withSettings(settings([['encoding']], '{"mode":"fast"}')))).toEqual({
      field: 'declarations.settings.defaults.mode',
      reason: 'undeclared',
    })
    expect(rejection(withSettings(settings([[]], '{}')))).toEqual({
      field: 'declarations.settings.items[0].path',
      reason: 'empty',
    })
  })

  describe('modality declarations', () => {
    const withModalities = (field: 'inputModalities' | 'outputModalities', value: unknown) => {
      const definition = functionDefinition()
      return { ...definition, declarations: { ...definition.declarations, [field]: value } }
    }
    const fields = ['inputModalities', 'outputModalities'] as const

    for (const modality of ['text', 'image', 'voice', 'video'] as const)
      it(`definition judgment: accepts the modality ${modality} in both declarations`, () => {
        for (const field of fields) {
          const definition = withModalities(field, [modality])
          const judged = judgeToolDefinition(definition)
          expect(judged).toEqual({ ok: definition })
          if ('ok' in judged) expect(Object.isFrozen(judged.ok.declarations[field])).toBe(true)
        }
      })

    it('definition judgment: rejects a modality declaration that is not a list as type', () => {
      for (const field of fields)
        expect(rejection(withModalities(field, 'text'))).toEqual({
          field: `declarations.${field}`,
          reason: 'type',
        })
    })

    it('definition judgment: rejects an element that is not text as type and names it', () => {
      for (const field of fields)
        expect(rejection(withModalities(field, ['text', 1]))).toEqual({
          field: `declarations.${field}[1]`,
          reason: 'type',
        })
    })

    it('definition judgment: rejects audio, speech and Image as an unknown modality, unmapped', () => {
      for (const field of fields)
        for (const unknown of ['audio', 'speech', 'Image'])
          expect(rejection(withModalities(field, ['image', unknown]))).toEqual({
            field: `declarations.${field}[1]`,
            reason: 'modality',
          })
    })

    it('definition judgment: rejects a repeated modality and names the later element', () => {
      for (const field of fields)
        expect(rejection(withModalities(field, ['voice', 'video', 'voice']))).toEqual({
          field: `declarations.${field}[2]`,
          reason: 'duplicate',
        })
    })
  })
})
