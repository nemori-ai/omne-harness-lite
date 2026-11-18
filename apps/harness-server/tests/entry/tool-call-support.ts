import { writeJsonText } from '@omne-harness/json-text'
import { encodeCommandCall } from '@omne-harness/tool-contract/provider'
import { tree } from '../rows/tool-host/support.ts'
import type { forwardWorld } from './tool-forward-support.ts'

type World = Awaited<ReturnType<typeof forwardWorld>>

export function objectTree(value: unknown) {
  const read = tree(value)
  if (read.kind !== 'object') throw new Error('fixture: params are not an object')
  return read
}

export function toolsCall(world: World, intent: unknown): string {
  const tools = world.request('Tools').availability
  if (tools.kind !== 'available' || tools.definition.kind !== 'commands')
    throw new Error('fixture Tools is not a command tool')
  return writeJsonText(
    encodeCommandCall(tools.definition.encoding, {
      command: 'execute',
      intent: null,
      params: objectTree(intent),
    }),
  )
}

export function echoCall(world: World, params: unknown): string {
  const echo = world.request('ToyEcho').availability
  if (echo.kind !== 'available' || echo.definition.kind !== 'commands')
    throw new Error('fixture ToyEcho is not a command tool')
  return writeJsonText(
    encodeCommandCall(echo.definition.encoding, {
      command: 'info',
      intent: null,
      params: objectTree(params),
    }),
  )
}
