import type { ToolJournalPayload } from './tool-journal.ts'
export type ResourceJournalValue = Extract<
  ToolJournalPayload,
  {
    kind: 'resource_planned' | 'resource_permitted' | 'resource_adopted' | 'physical_stop_observed'
  }
>
const kinds = new Set([
  'resource_planned',
  'resource_permitted',
  'resource_adopted',
  'physical_stop_observed',
])
export function isResourceJournalValue(value: ToolJournalPayload): value is ResourceJournalValue {
  return kinds.has(value.kind)
}
