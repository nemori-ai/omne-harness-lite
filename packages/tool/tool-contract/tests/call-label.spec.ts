import { describe, expect, it } from 'vitest'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import { callLabel } from '@omne-harness/tool-contract'
import { PREVIEW_MAX_CHARS, actionPreview } from '@omne-harness/tool-contract/provider'
import { adoption, commandsDefinition, functionDefinition } from './tool-values.ts'

type JsonObject = Extract<JsonValue, { kind: 'object' }>
function json(text: string): JsonObject {
  const read = readJsonText(text, {
    maxBytes: 65536,
    maxDepth: 16,
    maxItems: 1024,
    maxMembers: 1024,
    maxStringLength: 65536,
    maxNumberLength: 32,
  })
  if (read.kind !== 'ok' || read.value.kind !== 'object') throw new Error(text)
  return read.value
}
const contract = (schema: string) => ({
  schema: json(schema),
  vocabulary: adoption('json-schema'),
  descriptions: [],
})
const REQUIRED_SCRIPT = contract(
  '{"type":"object","required":["timeout","script"],"properties":{"timeout":{"type":"integer"},"script":{"type":"string"}}}',
)

describe('the action preview', () => {
  it('is the first line of the first required text parameter the call gives', () => {
    expect(actionPreview(REQUIRED_SCRIPT, json('{"timeout":5,"script":"pnpm build\\nls"}'))).toBe(
      'pnpm build',
    )
    expect(actionPreview(REQUIRED_SCRIPT, json('{"timeout":5,"script":"a\\r\\nb"}'))).toBe('a')
  })

  it('is cut to the bound with an ellipsis', () => {
    const long = 'é'.repeat(PREVIEW_MAX_CHARS + 5)
    const preview = actionPreview(REQUIRED_SCRIPT, json(`{"script":"${long}"}`))
    expect([...preview]).toHaveLength(PREVIEW_MAX_CHARS)
    expect(preview.endsWith('…')).toBe(true)
    const exact = 'x'.repeat(PREVIEW_MAX_CHARS)
    expect(actionPreview(REQUIRED_SCRIPT, json(`{"script":"${exact}"}`))).toBe(exact)
  })

  it('is empty without a declared schema, a required text parameter, or its value', () => {
    expect(actionPreview(null, json('{"script":"x"}'))).toBe('')
    expect(
      actionPreview(
        contract('{"type":"object","properties":{"script":{"type":"string"}}}'),
        json('{"script":"x"}'),
      ),
    ).toBe('')
    expect(actionPreview(REQUIRED_SCRIPT, json('{"script":7}'))).toBe('')
    expect(actionPreview(REQUIRED_SCRIPT, json('{}'))).toBe('')
  })
})

describe('the call label', () => {
  it('names the intent, the tool, the command and the preview of a command call', () => {
    const definition = commandsDefinition()
    if (definition.kind !== 'commands') throw new Error('commands')
    const read = {
      ...definition.commands[0]!,
      parameters: { kind: 'declared' as const, value: REQUIRED_SCRIPT },
    }
    const tool = { ...definition, commands: [read, definition.commands[1]!] }
    expect(
      callLabel(tool, {
        command: 'read',
        intent: 'see the log',
        params: json('{"script":"tail -n 5 x.log"}'),
      }),
    ).toEqual({ intent: 'see the log', tool: 'files', command: 'read', preview: 'tail -n 5 x.log' })
    expect(
      callLabel(tool, { command: 'shell', intent: null, params: json('{"script":"x"}') }),
    ).toEqual({
      intent: null,
      tool: 'files',
      command: 'shell',
      preview: '',
    })
  })

  it('names a function tool with no command', () => {
    const definition = { ...functionDefinition(), parameters: REQUIRED_SCRIPT } as ReturnType<
      typeof functionDefinition
    >
    expect(
      callLabel(definition, { command: null, intent: null, params: json('{"script":"go"}') }),
    ).toEqual({
      intent: null,
      tool: definition.name,
      command: null,
      preview: 'go',
    })
  })
})
