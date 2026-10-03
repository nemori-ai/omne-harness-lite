import type { JsonObject } from '@omne-harness-lite/content-blocks'
import { object } from '../json.ts'

export function messageToolCalls(raw: JsonObject): JsonObject[] | undefined {
  const toolCalls: JsonObject[] = []
  if (raw.tool_calls !== undefined) {
    if (!Array.isArray(raw.tool_calls)) return undefined
    for (const call of raw.tool_calls) {
      if (!object(call)) return undefined
      toolCalls.push(call)
    }
  }
  return toolCalls
}

export function promptTools(body: JsonObject): readonly JsonObject[] | undefined {
  let tools: readonly JsonObject[] = []
  if (body.tools !== undefined) {
    if (!Array.isArray(body.tools)) return undefined
    const checked: JsonObject[] = []
    for (const tool of body.tools) {
      if (!object(tool) || !object(tool.function)) return undefined
      checked.push(tool)
    }
    tools = checked
  }
  return tools
}
