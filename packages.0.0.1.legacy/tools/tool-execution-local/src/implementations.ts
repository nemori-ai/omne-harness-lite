import {
  createParameterJudge,
  judgeToolDefinition,
  type ParameterJudge,
  type ToolDefinition,
} from '@omne-harness-lite/tool-definition'
import { copyJsonValue, type JsonValue } from '@omne-harness-lite/content-blocks'
import type {
  ToolImplementation,
  ToolImplementationOperations,
} from '@omne-harness-lite/tool-execution-runtime'
import { sameOwnedJson } from './json-values.ts'

function validDefinition(value: unknown, judge: ParameterJudge): value is ToolDefinition {
  return 'ok' in judgeToolDefinition(value, judge)
}
function key(value: Pick<ToolImplementation, 'capability' | 'asset' | 'version'>): string {
  if (
    ![value.capability, value.asset, value.version].every(
      v => typeof v === 'string' && v.length > 0,
    )
  )
    throw new TypeError('exact implementation coordinates required')
  return JSON.stringify([value.capability, value.asset, value.version])
}

/** Registration withdrawal closes new acquisition; a captured closure keeps its own generation. */
export function createToolImplementationRegistry(
  options: { readonly parameters?: ParameterJudge } = {},
): ToolImplementationOperations {
  const entries = new Map<
    string,
    { readonly implementation: ToolImplementation; readonly definition: JsonValue }
  >()
  let parameters = options.parameters
  return Object.freeze({
    register(input) {
      const identity = key(input)
      if (entries.has(identity)) throw new Error('duplicate tool implementation')
      if (typeof input.executor !== 'function') throw new TypeError('tool executor required')
      const copied = copyJsonValue(input.definition)
      if (
        'failed' in copied ||
        !validDefinition(copied.ok, (parameters ??= createParameterJudge()))
      )
        throw new TypeError('invalid tool definition')
      const implementation: ToolImplementation = Object.freeze({
        capability: input.capability,
        asset: input.asset,
        version: input.version,
        definition: copied.ok,
        executor: input.executor,
        ...(input.invalidated === undefined ? {} : { invalidated: input.invalidated }),
      })
      const entry = { implementation, definition: copied.ok }
      entries.set(identity, entry)
      return () => {
        if (entries.get(identity) === entry) entries.delete(identity)
      }
    },
    acquire(selected) {
      const entry = entries.get(key(selected))
      if (!entry || entry.implementation.invalidated?.aborted) return { kind: 'unavailable' }
      const copied = copyJsonValue(selected.definition)
      if ('failed' in copied || !sameOwnedJson(entry.definition, copied.ok))
        return { kind: 'definitionMismatch' }
      return Object.freeze({ implementation: entry.implementation, release() {} })
    },
  } satisfies ToolImplementationOperations)
}
