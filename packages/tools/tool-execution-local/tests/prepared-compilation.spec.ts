import { expect, test, vi } from 'vitest'
import type {
  SchemaDocument,
  SchemaRuntime,
} from '@omne-harness-lite/content-blocks/schema-runtime'
import { createParameterJudge, judgeToolDefinition } from '@omne-harness-lite/tool-definition'
import type { PreparedToolExecution } from '@omne-harness-lite/tool-execution-runtime'
import { capturePreparedExecution } from '../src/prepared-submission.ts'
import { access, definition, ref, request } from './execution-owner-fixture.ts'

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
function prepared(): Extract<PreparedToolExecution, { selected: unknown }> {
  if (!request.call.arguments) throw new Error('fixture arguments required')
  return {
    access,
    ref,
    origin: request.origin,
    call: request.call,
    source: { session: ref.session, tenant: ref.tenant, journalGeneration: 'original', tail: 1 },
    afterAction: { pass: 'after', selectedChain: [] },
    selected: {
      capability: 'tool:echo',
      asset: 'echo-asset',
      version: '1',
      adoption: 'adopted',
      definition,
    },
    args: request.call.arguments,
  }
}
test('prepared capture reuses compiled tool schema and still checks each submission', () => {
  const parameters = createParameterJudge()
  expect(judgeToolDefinition(definition, parameters)).toHaveProperty('ok')
  compiled.length = 0
  expect(capturePreparedExecution(prepared(), parameters)).toHaveProperty(
    'selected.definition',
    definition,
  )
  expect(capturePreparedExecution(prepared(), parameters)).toHaveProperty(
    'selected.definition',
    definition,
  )
  expect(compiled).toHaveLength(0)
  expect(
    capturePreparedExecution({ ...prepared(), args: { value: 'changed' } }, parameters),
  ).toEqual({ kind: 'rejected', reason: 'invalidInput' })
  expect(compiled).toHaveLength(0)
})
test('prepared capture still rejects a changed invalid schema with the owned compiler', () => {
  const parameters = createParameterJudge()
  const valid = prepared()
  const original = valid.selected.definition
  if (original.paradigm !== 'single') throw new Error('fixture single tool required')
  const invalid = {
    ...valid,
    selected: {
      ...valid.selected,
      definition: { ...original, input: { type: 'not-a-json-schema-type' } },
    },
  }
  expect(capturePreparedExecution(invalid, parameters)).toEqual({
    kind: 'rejected',
    reason: 'invalidInput',
  })
})
