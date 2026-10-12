import { expect, test, vi } from 'vitest'
import type {
  SchemaDocument,
  SchemaRuntime,
} from '@omne-harness-lite/content-blocks/schema-runtime'
import {
  createParameterJudge,
  judgeToolDefinition,
  type ToolDefinition,
} from '@omne-harness-lite/tool-definition'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import {
  captureToolJournalValue,
  inspectToolJournalEntry,
  prepareToolJournalEntry,
  projectToolJournal,
  toolJournalKey,
  type ToolJournalPayload,
} from '../src/index.ts'
const compiled = vi.hoisted(() => [] as SchemaDocument[])
vi.mock('@omne-harness-lite/content-blocks/schema-runtime', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@omne-harness-lite/content-blocks/schema-runtime')>()
  return {
    ...actual,
    createSchemaRuntime(...args: Parameters<typeof actual.createSchemaRuntime>): SchemaRuntime {
      const runtime = actual.createSchemaRuntime(...args)
      return {
        ...runtime,
        compile(schema) {
          compiled.push(schema)
          return runtime.compile(schema)
        },
      }
    },
  }
})
const scope = {
  tenant: unwrap(parseTenantId({ organization: 'organization', account: 'account' })),
  session: unwrap(parseOpaqueIdentifier('session', 'SessionRef')),
}
const definition: ToolDefinition = {
  name: 'echo',
  description: 'Echo text',
  paradigm: 'single',
  origin: { kind: 'authored' },
  input: {
    type: 'object',
    properties: { value: { type: 'string', description: 'Text' } },
    required: ['value'],
  },
  permissions: { execute: { default: 'auto' } },
}
function intent(): Extract<ToolJournalPayload, { kind: 'execution_intended' }> {
  return {
    kind: 'execution_intended',
    revision: 1,
    ref: { ...scope, callId: unwrap(parseOpaqueIdentifier('call', 'CallId')) },
    origin: { run: 'run', attempt: 1, assistantMessage: 'reply' },
    selected: {
      capability: 'tool/echo',
      asset: 'echo',
      version: '1',
      adoption: 'adopted',
      definition,
    },
    input: {},
  }
}
test('all journal codec operations reuse the supplied compiler', () => {
  const parameters = createParameterJudge()
  expect(judgeToolDefinition(definition, parameters)).toHaveProperty('ok')
  compiled.length = 0
  const value = intent()
  expect(captureToolJournalValue(value, parameters)).toEqual(value)
  const prepared = prepareToolJournalEntry({ origin: value.origin, value }, parameters)
  if ('invalid' in prepared) throw new Error('valid intent rejected')
  const row = { ...prepared.entry, session: scope.session, position: 1 }
  expect(toolJournalKey(value, parameters)).toBe(prepared.entry.dedupeKey)
  for (let count = 0; count < 2; count++) {
    expect(inspectToolJournalEntry(scope, row, parameters)).toHaveProperty('value', value)
    expect(projectToolJournal(scope, [row], parameters)).toHaveProperty('executions')
  }
  expect(compiled).toHaveLength(0)
  const changed = {
    ...value,
    selected: {
      ...value.selected!,
      definition: { ...definition, input: { type: 'invalid-schema-type' } },
    },
  }
  expect(captureToolJournalValue(changed, parameters)).toEqual({ invalid: true })
  expect(inspectToolJournalEntry(scope, { ...row, run: 'wrong' }, parameters)).toEqual({
    invalid: true,
  })
})
