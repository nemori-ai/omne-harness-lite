import type { JsonValue } from '@omne-harness-lite/content-blocks'
import { object } from '../json.ts'

export function unsupportedToolCall(call: JsonValue): boolean {
  return (
    !object(call) ||
    Object.keys(call).some(key => key !== 'id' && key !== 'type' && key !== 'function') ||
    typeof call.id !== 'string' ||
    call.type !== 'function' ||
    !object(call.function) ||
    Object.keys(call.function).some(key => key !== 'name' && key !== 'arguments') ||
    typeof call.function.name !== 'string' ||
    typeof call.function.arguments !== 'string'
  )
}

export function unsupportedTool(tool: JsonValue): boolean {
  return (
    !object(tool) ||
    Object.keys(tool).some(key => key !== 'type' && key !== 'function') ||
    tool.type !== 'function' ||
    !object(tool.function) ||
    Object.keys(tool.function).some(
      key => key !== 'name' && key !== 'description' && key !== 'parameters',
    ) ||
    typeof tool.function.name !== 'string' ||
    typeof tool.function.description !== 'string' ||
    !object(tool.function.parameters)
  )
}
