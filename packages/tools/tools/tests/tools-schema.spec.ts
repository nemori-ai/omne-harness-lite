// Selectively ported from DSH schema/json-schema tests; the supported subset is intentional.
import { describe, expect, expectTypeOf, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  JsonSchemaError,
  assertObjectJsonSchema,
  assertSupportedJsonSchema,
  defineTool,
  parameterSchemaSpecToJsonSchema,
  validateJsonSchemaValue,
  default as ToolRuntime,
  type InferArgs,
} from '../dist/index.js'
import { ToolCallId } from '@omne-harness-lite/llm/baseline'

describe('source tool schema baseline', () => {
  it('compiles parameter requiredness and validates all visible violations', () => {
    const schema = parameterSchemaSpecToJsonSchema({
      path: { type: 'string', required: true },
      limit: { type: 'integer' },
    })
    expect(schema).toEqual({
      type: 'object',
      properties: { path: { type: 'string' }, limit: { type: 'integer' } },
      required: ['path'],
    })
    expect(validateJsonSchemaValue({ ...schema, additionalProperties: false }, { limit: 1, extra: true }, '')).toEqual([
      'missing required property "path"',
      '"extra" is not a declared property (additionalProperties: false)',
    ])
  })

  it('rejects unsupported raw JSON Schema rather than accepting ignored keywords', () => {
    expect(() => assertSupportedJsonSchema({ type: 'string', pattern: '^x$' }))
      .toThrow(JsonSchemaError)
    expect(() => assertObjectJsonSchema({ type: 'string' }))
      .toThrow('schema.type must be "object"')
  })

  it('walks deep schemas and values without consuming the JavaScript call stack', () => {
    let schema: Record<string, unknown> = { type: 'string' }
    let value: unknown = 'ok'
    for (let index = 0; index < 2_000; index++) {
      schema = { type: 'array', items: schema }
      value = [value]
    }
    assertSupportedJsonSchema(schema)
    expect(validateJsonSchemaValue(schema, value)).toEqual([])
  })

  it('preserves typed authoring and fails invalid arguments before the body', async () => {
    type Args = InferArgs<{ text: { type: 'string'; required: true }; count: { type: 'integer' } }>
    expectTypeOf<Args>().toEqualTypeOf<{ text: string; count?: number }>()
    let called = false
    const tool = defineTool({
      name: 'echo',
      description: 'echo text',
      parameters: { text: { type: 'string', required: true } },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute({ text }) {
        called = true
        return text
      },
    })
    const ctx = new Context()
    const fiber = await ctx.plugin(ToolRuntime)
    ctx.tools.register(tool)
    await expect(ctx.tools.execute({
      callId: ToolCallId('invalid'), name: 'echo', arguments: {}, signal: new AbortController().signal,
    })).resolves.toMatchObject({ isError: true, error: { info: { code: 'INVALID_ARGS' } } })
    expect(called).toBe(false)
    await fiber.dispose()
  })
})
