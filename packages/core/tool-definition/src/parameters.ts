import {
  createSchemaRuntime,
  type SchemaValidator,
} from '@omne-harness-lite/content-blocks/schema-runtime'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { copyJson, object } from './json.ts'
import { patternFlags, unsupportedPattern } from './pattern.ts'
import { schemaPositions } from './schema-positions.ts'
import { judgeToolDefinition } from './judge.ts'
import type { ArgumentJudgment, JsonSchema, ParameterJudge, ToolDefinition } from './types.ts'

/** Compilation and every author-driven cache belong to this caller-owned object. */
export function createParameterJudge(): ParameterJudge {
  const runtime = createSchemaRuntime([], {
    patternFactory(source) {
      const flags = patternFlags(source)
      if (flags === undefined) throw new SyntaxError('invalid ECMA-262 pattern')
      return new RegExp(source, flags)
    },
  })
  const cache = new Map<string, SchemaValidator | { readonly unsupported: string }>()
  function compiled(schema: JsonSchema): SchemaValidator | { readonly unsupported: string } {
    const key = writeJsonLossless(schema)
    const prior = cache.get(key)
    if (prior !== undefined) return prior
    for (const position of schemaPositions(schema))
      if (typeof position.pattern === 'string') {
        const limit = unsupportedPattern(position.pattern)
        if (limit !== undefined) {
          const rejected = Object.freeze({ unsupported: limit })
          cache.set(key, rejected)
          return rejected
        }
      }
    try {
      // S5: only this private root view receives the default, never the model payload.
      const checker = runtime.compile(
        Object.hasOwn(schema, 'additionalProperties')
          ? schema
          : { ...schema, additionalProperties: false },
      )
      cache.set(key, checker)
      return checker
    } catch (error) {
      const result = Object.freeze({
        unsupported: `U-6: ${error instanceof Error ? error.message : String(error)}`,
      })
      cache.set(key, result)
      return result
    }
  }
  const judge: ParameterJudge = Object.freeze({
    metaValidate(schema: JsonSchema) {
      return runtime.metaValidate(schema)
    },
    compile(schema: JsonSchema) {
      const result = compiled(schema)
      return 'unsupported' in result ? result : Object.freeze({ ok: true })
    },
    judgeCallArguments(definition: ToolDefinition, call: unknown): ArgumentJudgment {
      const admission = judgeToolDefinition(definition, judge)
      if ('rejected' in admission) {
        if (admission.rejected === 'schema_unsupported')
          return Object.freeze({ unsupported: admission.unsupported ?? 'U-6' })
        throw new TypeError(`valid ToolDefinition required: ${admission.rejected}`)
      }
      const copied = copyJson(call)
      if (!object(copied)) return Object.freeze({ invalid: 'arguments must be a JSON object' })
      let schema: JsonSchema
      let command: string | undefined
      let args = copied
      if (definition.paradigm === 'single') schema = definition.input
      else {
        if (Object.keys(copied).some(key => key !== 'command' && key !== 'args'))
          return Object.freeze({ invalid: 'multi call has unknown members' })
        if (
          typeof copied.command !== 'string' ||
          !Object.hasOwn(definition.commands, copied.command)
        )
          return Object.freeze({ invalid: 'unknown or absent command' })
        command = copied.command
        const selected = definition.commands[command]
        if (selected === undefined) throw new Error('own command missing from definition')
        schema = selected.input
        if (Object.hasOwn(copied, 'args')) {
          if (!object(copied.args)) return Object.freeze({ invalid: 'args must be a JSON object' })
          args = copied.args
        } else args = Object.freeze({})
      }
      const checker = compiled(schema)
      if ('unsupported' in checker) return checker
      if (!checker.validate(args))
        return Object.freeze({ invalid: 'arguments do not satisfy the selected input schema' })
      return Object.freeze({
        ok: Object.freeze({ ...(command === undefined ? {} : { command }), args }),
      })
    },
  })
  return judge
}
