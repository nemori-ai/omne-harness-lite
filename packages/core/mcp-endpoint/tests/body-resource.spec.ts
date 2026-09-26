import { describe, expect, it } from 'vitest'
import {
  attributeDeclarationsOf,
  createAssetModelJudge,
  type BodyCategory,
  type BodyContract,
  type JsonSchema,
} from '@omne-harness-lite/asset-model'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import schema from '@omne-harness-lite/mcp-endpoint/schema' with { type: 'json' }
import toolSchema from '@omne-harness-lite/tool-definition/schema' with { type: 'json' }
import loopSchema from '../../../../.meta_harness/design/spec/data/loop-extension/v1/loop-extension.schema.json' with { type: 'json' }
import skillSchema from '../../../../.meta_harness/design/spec/data/skill-package/v1/skill-package.schema.json' with { type: 'json' }
import slashSchema from '../../../../.meta_harness/design/spec/data/slash-command/v1/slash-command.schema.json' with { type: 'json' }
import connectorSchema from '../../../../.meta_harness/design/spec/data/connector/v1/connector.schema.json' with { type: 'json' }
import { mcpBodyContract, schemaId } from '../src/index.ts'

/** Only the MCP port is real: other categories supply resources and must never run. */
function otherPort<C extends Exclude<BodyCategory, 'mcp'>>(
  category: C,
  resource: JsonSchema,
): BodyContract<C> {
  function outsideScope(): never {
    throw new Error(`the ${category} protocol double cannot judge, derive or list references`)
  }
  return {
    category,
    schema: resource,
    judge: outsideScope,
    deriveDeclarations: outsideScope,
    references: outsideScope,
  }
}
const bodies = {
  tool: otherPort('tool', toolSchema),
  loop_extension: otherPort('loop_extension', loopSchema),
  skill: otherPort('skill', skillSchema),
  slash_command: otherPort('slash_command', slashSchema),
  connector: otherPort('connector', connectorSchema),
  mcp: mcpBodyContract,
}
const body = {
  transport: { kind: 'streamable_http', url: 'https://example.invalid/mcp' },
  timeouts: { connect: 'PT1S', call: 'PT2S' },
  permissions: { execute: { default: 'ask' } },
}

describe('MCP resource handoff to the real public asset-model consumer', () => {
  it('owns the complete frozen resource with the explicit endpoint entry point', () => {
    expect(mcpBodyContract.schema).toEqual({ ...schema, $ref: '#/$defs/McpEndpoint' })
    expect(mcpBodyContract.schema).not.toBe(schema)
    expect(typeof mcpBodyContract.schema).toBe('object')
    if (typeof mcpBodyContract.schema === 'boolean') throw new Error('resource is an object')
    expect(Object.hasOwn(mcpBodyContract.schema, '$id')).toBe(true)
    expect(mcpBodyContract.schema.$id).toBe(schemaId)
    expect(Object.isFrozen(mcpBodyContract.schema)).toBe(true)
    expect(Object.isFrozen(mcpBodyContract.schema.$defs)).toBe(true)
  })
  it('binds without losing definitions or the base URI needed by relative references', () => {
    const actual = createAssetModelJudge(bodies)
    const content = { category: 'mcp', body }
    expect(actual.validate('AssetContent', content)).toEqual({ valid: true })
    expect(actual.judgeAssetValue('AssetContent', content)).toEqual({ ok: true })
    const zeroDuration = {
      ...content,
      body: { ...body, timeouts: { connect: 'PT0S', call: 'PT2S' } },
    }
    expect(actual.validate('AssetContent', zeroDuration)).toEqual({ valid: false })
    expect(actual.judgeAssetValue('AssetContent', zeroDuration)).toEqual({
      rejected: 'malformed',
    })
    const credential = { ...content, body: { ...body, credential: 'not-a-body-member' } }
    expect(actual.validate('AssetContent', credential)).toEqual({ valid: false })
    expect(actual.judgeAssetValue('AssetContent', credential)).toEqual({ rejected: 'malformed' })
    const url = {
      ...content,
      body: { ...body, transport: { kind: 'streamable_http', url: 'file:///tmp/x' } },
    }
    expect(actual.judgeAssetValue('AssetContent', url)).toEqual({ rejected: 'url_invalid' })
  })
  it('lets the real asset-model guard retain partial knowledge and append its reserved items', () => {
    const parsed = readJsonStrict(JSON.stringify(body))
    if ('failed' in parsed) throw new Error('invalid fixture JSON')
    const result = attributeDeclarationsOf({ category: 'mcp', body: parsed.ok }, bodies, {
      kind: 'not_fetched',
    })
    expect(Object.hasOwn(result, 'actionSnapshotKind')).toBe(true)
    expect(result.actionSnapshotKind).toBe('not_fetched')
    expect(result.declarations.map(item => item.item)).toEqual([
      'connectionTarget',
      'credential',
      'connectTimeout',
      'callTimeout',
      'disabled',
      'usableBy',
    ])
  })
})
