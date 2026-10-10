import type { ToolPoolConstruction, SelectedTool } from '@omne-harness-lite/tool-execution-runtime'
declare const tool: ToolPoolConstruction
declare const selected: SelectedTool
// @ts-expect-error Tool construction cannot enumerate or manage Session logs.
tool.owner.enumerate()
// @ts-expect-error Tool execution does not own admission history preparation.
tool.history.read()
tool.implementations.acquire(selected)
