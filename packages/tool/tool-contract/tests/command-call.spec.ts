// The one-slot call of a multi-command tool (D-94): each case names the property of the model
// (mct-model §2.3–2.7) it would catch a wrong implementation of.
import { describe, expect, it } from 'vitest'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import {
  commandCallSchema,
  commandMenu,
  decodeCommandCallText,
  describeCommandCallRejection,
  type CommandCallEncoding,
  type ToolDefinition,
} from '@omne-harness/tool-contract'
import {
  COMMAND_CALL_ENCODINGS,
  commandArguments,
  commandExample,
  commandSignature,
  decodeCommandCall,
  encodeCommandCall,
  judgeToolDefinition,
} from '@omne-harness/tool-contract/provider'
import { commandsDefinition, functionDefinition } from './tool-values.ts'

const LIMITS = {
  maxBytes: 65536,
  maxDepth: 16,
  maxItems: 1024,
  maxMembers: 1024,
  maxStringLength: 65536,
  maxNumberLength: 32,
}
function json(text: string): JsonValue {
  const read = readJsonText(text, LIMITS)
  if (read.kind !== 'ok') throw new Error(text)
  return read.value
}
type Commands = Extract<ToolDefinition, { kind: 'commands' }>
function withEncoding(encoding: CommandCallEncoding): Commands {
  const source = commandsDefinition()
  if (source.kind !== 'commands') throw new Error('commands')
  return { ...source, encoding }
}
const PARAMS = ['{}', '{"path":"a.txt"}', '{"path":"x","text":"line\\nnext","n":3,"deep":{"k":[1,true,null]}}']

describe('command call encodings', () => {
  for (const encoding of COMMAND_CALL_ENCODINGS) {
    const definition = withEncoding(encoding)
    const names = definition.commands.map(command => command.name)

    it(`${encoding}: decode inverts encode for every command and parameter object (RT)`, () => {
      for (const command of names)
        for (const text of PARAMS) {
          const params = json(text)
          if (params.kind !== 'object') throw new Error(text)
          const call = { command, params }
          const encoded = encodeCommandCall(encoding, call)
          expect(decodeCommandCall(encoding, names, encoded)).toEqual({ ok: call })
          // The same through text, as the model sends it.
          expect(decodeCommandCallText(encoding, names, writeJsonText(encoded))).toEqual({ ok: call })
        }
    })

    it(`${encoding}: decode is undefined off the image of encode, with a named rejection`, () => {
      const reject = (text: string) => decodeCommandCallText(encoding, names, text)
      expect(reject('[1]')).toEqual({ failure: { kind: 'not-object' } })
      expect(reject('{"params":{}}')).toEqual({ failure: { kind: 'command-missing' } })
      expect(reject('{"command":7}')).toEqual({ failure: { kind: 'command-missing' } })
      expect(reject('{"command":"nope"}')).toEqual({
        failure: { kind: 'command-unknown', command: 'nope' },
      })
      expect(reject('{"command":')).toMatchObject({ failure: { kind: 'unreadable' } })
      if (encoding === 'wrapped') {
        expect(reject(`{"command":"${names[0]}","path":"a"}`)).toEqual({
          failure: { kind: 'extra-field', field: 'path' },
        })
        expect(reject(`{"command":"${names[0]}","params":[]}`)).toEqual({
          failure: { kind: 'params-not-object' },
        })
        // An omitted params is the empty object.
        expect(reject(`{"command":"${names[0]}"}`)).toEqual({
          ok: { command: names[0], params: { kind: 'object', entries: [] } },
        })
      } else {
        expect(reject(`{"command":"${names[0]}","path":"a"}`)).toEqual({
          ok: { command: names[0], params: json('{"path":"a"}') },
        })
      }
    })

    it(`${encoding}: the one declaration enumerates exactly the commands (I1, U1)`, () => {
      const schema = commandCallSchema(definition)
      const text = writeJsonText(schema)
      const value = JSON.parse(text) as {
        required: string[]
        properties: Record<string, { enum?: string[] }>
        additionalProperties: boolean
      }
      expect(value.required).toEqual(['command'])
      expect(value.properties['command']?.enum).toEqual(names)
      expect(value.additionalProperties).toBe(encoding === 'flat')
      expect(Object.keys(value.properties)).toEqual(
        encoding === 'wrapped' ? ['command', 'params'] : ['command'],
      )
    })

    it(`${encoding}: every example in the menu decodes to its own command (U4)`, () => {
      for (const command of names) {
        const example = commandExample(definition, command)
        expect(example.startsWith(`${definition.name} `)).toBe(true)
        expect(commandMenu(definition)).toContain(`${command} ${commandSignature(
          definition.commands.find(item => item.name === command)!.parameters,
        )}`)
      }
    })

    it(`${encoding}: the codec arguments are the parameters of the admitted command`, () => {
      const call = { command: names[0]!, params: json('{"path":"a.txt"}') as never }
      const effective = writeJsonText(encodeCommandCall(encoding, call))
      const args = { original: effective, effective, complete: true }
      expect(commandArguments(definition, names[0]!, args)).toEqual({
        ok: { ...args, effective: '{"path":"a.txt"}' },
      })
      expect(commandArguments(definition, names[1] ?? 'other', args)).toMatchObject({
        failure: { kind: 'command-mismatch', command: names[0] },
      })
      // An incomplete block is left to the codec, which answers incomplete.
      const partial = { ...args, complete: false }
      expect(commandArguments(definition, names[0]!, partial)).toEqual({ ok: partial })
    })
  }

  it('leaves the arguments of a function tool unchanged', () => {
    const args = { original: '{"a":1}', effective: '{"a":1}', complete: true }
    expect(commandArguments(functionDefinition(), null, args)).toEqual({ ok: args })
  })

  it('derives the signature from the schema: required, optional with ?, choices with =a|b (U2)', () => {
    const parameters = {
      kind: 'declared' as const,
      value: {
        vocabulary: { owner: 'o', name: 'n', revision: '1', digest: 'd' },
        descriptions: [],
        schema: json(
          '{"type":"object","required":["path","mode"],"properties":{"path":{"type":"string"},"mode":{"type":"string","enum":["create","replace"]},"limit":{"type":"integer"},"kind":{"enum":["a","b"]}}}',
        ),
      },
    }
    expect(commandSignature(parameters)).toBe('{path, mode=create|replace, limit?, kind?=a|b}')
    expect(commandSignature({ kind: 'executor-owned' })).toBe('{…}')
  })

  it('names the reason and repeats the menu in a rejection text (U3)', () => {
    const definition = withEncoding('wrapped')
    const text = describeCommandCallRejection(definition, { kind: 'command-unknown', command: 'x' })
    expect(text).toContain('has no command "x"')
    expect(text).toContain(commandMenu(definition))
  })

  it('rejects a flat definition whose command declares a command field', () => {
    const definition = withEncoding('flat')
    const first = definition.commands[0]
    if (first?.parameters.kind !== 'declared') throw new Error('declared')
    const clash = {
      ...definition,
      commands: [
        {
          ...first,
          parameters: {
            kind: 'declared' as const,
            value: { ...first.parameters.value, schema: json('{"type":"object","properties":{"command":{}}}') },
          },
        },
      ],
    }
    expect(judgeToolDefinition(clash)).toMatchObject({
      failure: { reason: `flat-conflict:${first.name}` },
    })
    expect(judgeToolDefinition({ ...clash, encoding: 'wrapped' })).toHaveProperty('ok')
  })
})
