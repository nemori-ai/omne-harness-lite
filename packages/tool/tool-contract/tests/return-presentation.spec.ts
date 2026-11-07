import { expect, it } from 'vitest'
import { commandMenu, type CommandTable } from '@omne-harness/tool-contract'
import { commandGuide } from '@omne-harness/tool-contract/provider'
import { adoption, json, ordinaryReturns, structuredReturns } from './tool-values.ts'

const declaration = {
  ...ordinaryReturns,
  value: {
    ...ordinaryReturns.value,
    value: {
      identity: { id: 'rows', revision: '2', digest: 'sha256:rows' },
      definition: {
        vocabulary: adoption('json-schema'),
        schema: json(
          '{"type":"array","items":{"type":"object","properties":{"uniqueColumn":{"type":"string"}}}}',
        ),
        descriptions: [{ path: 'uniqueColumn', text: 'A column disclosed only by inspection.' }],
      },
    },
  },
  body: {
    kind: 'json-lines',
    codec: adoption('json-lines'),
    record: {
      identity: { id: 'row', revision: '1', digest: 'sha256:row' },
      definition: {
        vocabulary: adoption('json-schema'),
        schema: json('{"type":"object","required":["uniqueColumn"]}'),
        descriptions: [],
      },
    },
  },
} as const
const table: CommandTable = {
  name: 'Data',
  encoding: 'wrapped',
  commands: [
    {
      name: 'query',
      summary: 'Query rows.',
      parameters: { kind: 'executor-owned' },
      returns: declaration,
    },
  ],
}

it('advertises the return shape and body format without repeating full schemas in the menu', () => {
  const menu = commandMenu(table)
  expect(menu).toContain('Returns array (rows@2). Model body: json-lines. Program data: none.')
  expect(menu).not.toContain('uniqueColumn')
})

it('inspection discloses the exact value and record schemas for executor-owned parameters too', () => {
  const guide = commandGuide(table, 'query')
  expect(guide).toContain('Return value schema rows@2 (sha256:rows):')
  expect(guide).toContain(
    '"items":{"type":"object","properties":{"uniqueColumn":{"type":"string"}}}',
  )
  expect(guide).toContain('uniqueColumn: A column disclosed only by inspection.')
  expect(guide).toContain(
    'Body record schema row@1 (sha256:row): {"type":"object","required":["uniqueColumn"]}',
  )
})

it('describes structured returns and no model body without inventing a value schema', () => {
  const guide = commandGuide(
    {
      ...table,
      commands: [
        {
          name: 'query',
          summary: 'Query rows.',
          parameters: { kind: 'executor-owned' },
          returns: { ...structuredReturns, body: { kind: 'none' } },
        },
      ],
    },
    'query',
  )
  expect(guide).toContain('Returns ToolResult. Model body: none. Program data: none.')
  expect(guide).not.toContain('Return value schema')
})

it('keeps JSON document and program schemas separate in the detailed guide', () => {
  const document = declaration.body.record
  const returns = {
    ...structuredReturns,
    body: { kind: 'json-document', codec: adoption('json'), document },
    program: {
      kind: 'json',
      contract: adoption('program'),
      schema: { id: 'count', revision: '3', digest: 'sha256:count' },
      definition: {
        schema: json('{"type":"integer"}'),
        vocabulary: adoption('json-schema'),
        descriptions: [],
      },
      maxBytes: 128,
    },
  } as const
  const guide = commandGuide(
    {
      ...table,
      commands: [
        { name: 'query', summary: 'Query.', parameters: { kind: 'executor-owned' }, returns },
      ],
    },
    'query',
  )
  expect(guide).toContain(
    'Returns ToolResult. Model body: json-document. Program data: JSON (count@3).',
  )
  expect(guide).toContain(
    'Body document schema row@1 (sha256:row): {"type":"object","required":["uniqueColumn"]}',
  )
  expect(guide).toContain('Program data schema count@3 (sha256:count): {"type":"integer"}')
  expect(guide).toContain('Program byte limit: 128')
  expect(guide).toContain('"name":"program"')
})
