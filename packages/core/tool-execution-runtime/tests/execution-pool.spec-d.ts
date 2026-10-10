import type {
  ToolExecutionRecords,
  ToolSubmitResult,
  ToolPoolControls,
} from '@omne-harness-lite/tool-execution-runtime'
declare const tools: ToolExecutionRecords
// @ts-expect-error The tool record capability cannot enumerate Sessions.
tools.enumerateSessions()
// @ts-expect-error The tool record capability cannot obtain complete Session prefixes.
tools.readPrefix()
declare const controls: ToolPoolControls
// @ts-expect-error Tool control cannot enumerate Sessions.
controls.enumerateSessions()
declare const result: ToolSubmitResult
if (result.kind === 'unknownCommit') {
  result.original.tenant
  // @ts-expect-error Unknown tool admission does not grant author execution.
  result.launch()
}
