import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type { EnvironmentTool } from '@omne-harness-lite/execution-environments'
import type { SelectedTool } from './tool-execution.ts'

/** Stable represented identity of the original selected version, not an authority token. */
export function environmentToolOf(selected: SelectedTool): EnvironmentTool {
  return Object.freeze({
    name: selected.definition.name,
    definition: writeJsonLossless([selected.capability, selected.asset, selected.version]),
  })
}
