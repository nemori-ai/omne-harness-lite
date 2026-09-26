import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readJsonStrict, type JsonObject, type JsonValue } from '@omne-harness-lite/content-blocks'
import {
  judgeSlashCommand,
  judgeSlashCommandValue,
  isSlashCommandDefinition,
  judgeInvocation,
} from '../src/judge.ts'
import { recognize } from '../src/recognize.ts'
import { parseInvocation } from '../src/parser.ts'
import { validate, type SchemaDefName } from '../src/schema.ts'
import type { SessionCommandSet, ParseResult } from '../src/types.ts'

const spec = new URL(
  '../../../../.meta_harness/design/spec/data/slash-command/v1/examples.md',
  import.meta.url,
)
const text = readFileSync(spec, 'utf8')
function json(source: string): JsonValue {
  const value = readJsonStrict(source)
  if ('failed' in value) throw new Error(`invalid normative JSON: ${source}`)
  return value.ok
}
function object(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function inline(cell: string): string | undefined {
  return /`([^`]+)`/u.exec(cell)?.[1]
}
const section = (number: number) =>
  text.split(new RegExp(`^## ${number}[.]`, 'mu'))[1]?.split(/^## /mu)[0] ?? ''
function rows(number: number): string[][] {
  return section(number)
    .split('\n')
    .filter(line => line.startsWith('| `') || line.startsWith('| D-'))
    .map(line =>
      line
        .split('|')
        .slice(1, -1)
        .map(cell => cell.trim()),
    )
}
const setSource = /```json\n([\s\S]+?)\n```/u.exec(section(4))?.[1]
if (setSource === undefined) throw new Error('normative command set missing')
const setValue = json(setSource)
if (!object(setValue)) throw new Error('normative command set is not an object')
const entries = Object.entries(setValue).map(([name, definition]) => {
  if (!isSlashCommandDefinition(definition))
    throw new Error(`invalid normative definition: ${name}`)
  return [name, definition] as const
})
const commandSet: SessionCommandSet = Object.freeze(Object.fromEntries(entries))

describe('V-1/V-3 normative Schema and receiver tables', () => {
  let current: SchemaDefName = 'SlashCommandDefinition'
  let index = 0
  for (const line of text.split('\n')) {
    if (line.startsWith('## 4.')) break
    const name = /\*\*校验对象\*\*：`\$defs\/([^`]+)`/u.exec(line)?.[1]
    if (name !== undefined) {
      const definitions: readonly SchemaDefName[] = [
        'SlashCommandDefinition',
        'CommandName',
        'CommandInvocation',
        'ParseResult',
      ]
      const found = definitions.find(item => item === name)
      if (found === undefined) throw new Error(`unexpected normative definition: ${name}`)
      current = found
    }
    if (!line.startsWith('| `')) continue
    const cells = line
      .split('|')
      .slice(1, -1)
      .map(cell => cell.trim())
    const source = inline(cells[0] ?? '')
    if (source === undefined || !['通过', '拒绝'].includes(cells[1] ?? '')) continue
    const definition = current
    const value = json(source),
      accepted = cells[1] === '通过'
    const rejection = inline(cells[2] ?? '')
    it(`EX1-3-${++index} ${definition} Schema and rejection`, () => {
      expect(validate(definition, value).valid).toBe(accepted)
      expect(judgeSlashCommandValue(definition, value)).toEqual(
        accepted ? { ok: true } : { rejected: rejection },
      )
    })
  }
  it('EX1-3 inventory is complete', () => expect(index).toBe(59))
})

describe('V-2 normative D-01..D-50 in three caller forms', () => {
  const cases = rows(4)
  for (const cells of cases) {
    const id = cells[0] ?? '',
      input = json(inline(cells[1] ?? '') ?? ''),
      expected = json(inline(cells[3] ?? '') ?? '')
    if (typeof input !== 'string') throw new Error('input must be string')
    for (const mode of ['human', 'machine', 'intake']) {
      it(`${id} ${mode} recognition and parse`, () => {
        const received = mode === 'human' ? input : json(JSON.stringify(input))
        if (typeof received !== 'string') throw new Error('bad transport fixture')
        const actual = recognize(received)
        expect(actual.kind).toBe(inline(cells[2] ?? ''))
        expect(validate('Recognition', actual).valid).toBe(true)
        if (actual.kind !== 'invocation') {
          expect(actual.text).toBe(expected)
          return
        }
        expect(actual.invocation).toEqual(expected)
        expect(judgeInvocation(actual.invocation)).toEqual({ ok: true })
        const parsed = parseInvocation(actual.invocation, commandSet)
        expect(validate('ParseResult', parsed).valid).toBe(true)
        expect(judgeSlashCommandValue('ParseResult', parsed, { raw: input })).toEqual({ ok: true })
        const expectedResult = json(inline(cells[4] ?? '') ?? '')
        if (parsed.kind === 'failed') {
          const { explanation, ...stable } = parsed
          expect(explanation.length).toBeGreaterThan(0)
          expect(stable).toEqual(expectedResult)
        } else expect(parsed).toEqual(expectedResult)
      })
    }
  }
  it('D table and fixed set inventories', () => {
    expect(cases).toHaveLength(50)
    expect(entries).toHaveLength(8)
  })
  for (const [name, definition] of entries)
    it(`fixed set ${name} Schema and record context`, () => {
      expect(validate('CommandName', name).valid).toBe(true)
      expect(validate('SlashCommandDefinition', definition).valid).toBe(true)
      expect(
        judgeSlashCommand(definition, {
          capabilityName: name,
          origin: definition.binding.kind === 'command' ? 'official' : 'customized',
        }),
      ).toEqual({ ok: true })
    })
})
describe('V-3 extra receiver checks EX5 and priority EX6', () => {
  let index = 0
  for (const cells of rows(5)) {
    const source = inline(cells[0] ?? '')
    const definition = inline(cells[1] ?? '')
    if (
      source === undefined ||
      definition === undefined ||
      !['SlashCommandDefinition', 'CommandInvocation', 'ParseResult'].includes(definition)
    )
      continue
    const def =
      definition === 'SlashCommandDefinition'
        ? 'SlashCommandDefinition'
        : definition === 'CommandInvocation'
          ? 'CommandInvocation'
          : 'ParseResult'
    const value = json(source),
      rejection = inline(cells[2] ?? '')
    it(`EX5-${++index} ${def} extra receiver constraint`, () => {
      expect(validate(def, value).valid).toBe(true)
      expect(judgeSlashCommandValue(def, value)).toEqual({ rejected: rejection })
    })
  }
  it('EX5 machine-readable inventory', () => expect(index).toBe(11))
  const recordRows = [
    {
      name: 'omne-official:reload-skill',
      definition: {
        description: 'reload',
        binding: { kind: 'command', service: 'registry.reload.skill' },
      },
      origin: 'customized',
    },
    {
      name: 'omne-official:summarize',
      definition: { description: 'summary', binding: { kind: 'prompt', template: '$ARGUMENTS' } },
      origin: 'official',
    },
    {
      name: 'omne-official:code-review',
      definition: {
        description: 'review',
        binding: { kind: 'skill', skill: { category: 'skill', name: 'code-review' } },
      },
      origin: 'official',
    },
    {
      name: 'reload-skill',
      definition: {
        description: 'reload',
        binding: { kind: 'command', service: 'registry.reload.skill' },
      },
      origin: 'official',
    },
  ] as const
  recordRows.forEach((row, i) =>
    it(`EX5-record-${i + 1} reserved name`, () =>
      expect(
        judgeSlashCommand(row.definition, { capabilityName: row.name, origin: row.origin }),
      ).toEqual({ rejected: 'name_reserved' })),
  )
  rows(6).forEach((cells, i) =>
    it(`EX6-${i + 1} priority`, () => {
      const body = json(inline(cells[1] ?? '') ?? ''),
        name = inline(cells[0] ?? '')
      expect(validate('SlashCommandDefinition', body).valid).toBe(cells[2] === '通过')
      expect(
        judgeSlashCommand(
          body,
          name === undefined ? undefined : { capabilityName: name, origin: 'official' },
        ),
      ).toEqual({ rejected: inline(cells[4] ?? '') })
    }),
  )
})

export function invoke(text: string, set: SessionCommandSet = commandSet): ParseResult {
  const recognized = recognize(text)
  if (recognized.kind !== 'invocation') throw new Error('test input is not invocation')
  return parseInvocation(recognized.invocation, set)
}
