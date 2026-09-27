import type { JsonObject } from '@omne-harness-lite/content-blocks'
import type { ModelToolEntry, ModelToolName, ToolDefinition } from './types.ts'
import { copyJson, object } from './json.ts'

export function modelName(name: string): ModelToolName {
  return name.replaceAll(':', '__')
}
export function definitionNameOf(name: ModelToolName): string {
  return name.replaceAll('__', ':')
}
function codePointCompare(left: string, right: string): number {
  const first = Array.from(left)
  const second = Array.from(right)
  for (let i = 0; i < Math.min(first.length, second.length); i++) {
    const a = first[i]?.codePointAt(0)
    const b = second[i]?.codePointAt(0)
    if (a !== undefined && b !== undefined && a !== b) return a - b
  }
  return first.length - second.length
}
export function modelInput(definition: ToolDefinition): JsonObject {
  if (definition.paradigm === 'single') {
    const copied = copyJson(definition.input)
    if (!object(copied)) throw new TypeError('JSON object input schema required')
    return copied
  }
  const names = Object.keys(definition.commands).sort(codePointCompare)
  return Object.freeze({
    type: 'object',
    properties: Object.freeze({
      command: Object.freeze({
        type: 'string',
        enum: Object.freeze(names),
        description: names
          .map(name => `${name} — ${definition.commands[name]?.description}`)
          .join('\n'),
      }),
      args: Object.freeze({
        type: 'object',
        description: '所选命令的参数；各命令的参数用法经 Tools().inspect 取得',
      }),
    }),
    required: Object.freeze(['command']),
    additionalProperties: false,
  })
}
export function modelEntry(definition: ToolDefinition): ModelToolEntry {
  return Object.freeze({
    name: modelName(definition.name),
    description: definition.description,
    parameters: modelInput(definition),
  })
}
