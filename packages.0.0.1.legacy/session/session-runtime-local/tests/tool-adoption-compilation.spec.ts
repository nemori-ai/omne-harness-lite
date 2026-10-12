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
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { factLogPayload } from '@omne-harness-lite/session-log'
import { inspectSessionToolAdoption, sessionToolActionOwner } from '../src/driver-tool-adoption.ts'

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
  session: unwrap(parseOpaqueIdentifier('session', 'SessionRef')),
  tenant: unwrap(parseTenantId({ organization: 'organization', account: 'account' })),
}
function tool(type: 'integer' | 'string'): ToolDefinition {
  return {
    permissions: { execute: { default: 'ask' } },
    name: 'read',
    description: 'Read a value',
    paradigm: 'single',
    origin: { kind: 'authored' },
    input: {
      type: 'object',
      properties: { value: { type, description: 'The value' } },
      required: ['value'],
    },
  }
}
function json(value: unknown) {
  const copied = copyJsonValue(value)
  if ('failed' in copied) throw new Error('invalid fixture JSON')
  return copied.ok
}
function entry(definition: ToolDefinition) {
  const categories = ['tool', 'skill', 'mcp', 'plugin', 'slash_command', 'loop_extension']
  return {
    ...scope,
    readKeys: [],
    position: 1,
    run: 'run',
    attempt: 1,
    dedupeKey: `${sessionToolActionOwner}/1/adoption/"call"`,
    payload: json(
      factLogPayload(sessionToolActionOwner, '1', {
        kind: 'tools_adopted',
        call: 'call',
        run: 'run',
        attempt: 1,
        report: {
          session: scope.session,
          runId: 'run',
          attempt: 1,
          computedAt: 1,
          snapshots: categories.map(category => ({ category, filledAt: 1 })),
          availability: [],
          mcpActions: [],
          endpointHoldings: [],
          skillGate: [],
          effectivePermissions: { read: 'not_in_composition' },
        },
        tools: [
          { name: 'read', capability: 'tool/read', asset: 'read-asset', version: '1', definition },
        ],
      }),
    ),
  }
}

test('fact inspection reuses the assembly compiler and validates changed schemas independently', () => {
  const integer = tool('integer'),
    string = tool('string')
  const parameters = createParameterJudge()
  expect(judgeToolDefinition(integer, parameters)).toHaveProperty('ok')
  compiled.length = 0
  expect(inspectSessionToolAdoption(scope, entry(integer))).toHaveProperty('kind', 'adoption')
  expect(compiled.length).toBeGreaterThan(0)
  compiled.length = 0
  expect(inspectSessionToolAdoption(scope, entry(integer), parameters)).toHaveProperty(
    'kind',
    'adoption',
  )
  expect(inspectSessionToolAdoption(scope, entry(integer), parameters)).toHaveProperty(
    'kind',
    'adoption',
  )
  expect(compiled).toHaveLength(0)
  expect(inspectSessionToolAdoption(scope, entry(string), parameters)).toHaveProperty(
    'kind',
    'adoption',
  )
  expect(compiled).toHaveLength(1)
  expect(parameters.judgeCallArguments(integer, { value: 'bad' })).toHaveProperty('invalid')
  expect(parameters.judgeCallArguments(string, { value: 'valid' })).toHaveProperty('ok')
  expect(compiled).toHaveLength(1)
})
