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
declare const operations: import('../src/index.ts').ToolRuntimeOperations
// @ts-expect-error Raw submissions are not an execution control capability.
operations.submit({})
declare const controls: ToolPoolControls
// @ts-expect-error Tool control cannot enumerate Sessions.
controls.enumerateSessions()
declare const result: ToolSubmitResult
if (result.kind === 'unknownCommit') {
  result.original.tenant
  // @ts-expect-error Unknown tool admission does not grant author execution.
  result.launch()
}

declare const input: import('../src/index.ts').PreparedToolExecution
if (input.notExecutable !== undefined) {
  const absent: undefined = input.selected
  const adoption: string = input.adoption
  void [absent, adoption]
} else {
  const selected: import('../src/index.ts').SelectedTool = input.selected
  void selected
}
declare const common: Omit<
  Extract<import('../src/index.ts').PreparedToolExecution, { notExecutable: string }>,
  'notExecutable'
>
declare const selected: import('../src/index.ts').SelectedTool
// @ts-expect-error A failed lookup cannot carry a fabricated selected implementation.
const mixed: import('../src/index.ts').PreparedToolExecution = {
  ...common,
  notExecutable: 'no_such_entry',
  selected,
}
void mixed
