import type {
  ModelObligationReader,
  ModelExecutionObligations,
  ModelExecutionCallRef,
} from '@omne-harness-lite/model-request-runtime'
declare const reader: ModelObligationReader<ModelExecutionCallRef>
declare const scan: ModelExecutionObligations<ModelExecutionCallRef>
// @ts-expect-error A borrowed reader exposes no SQL transaction.
reader.tx
// @ts-expect-error A borrowed reader cannot enumerate Sessions.
reader.enumerateSessions()
// @ts-expect-error The original provider owns the cursor; caller cannot replace it.
reader.next('replacement-cursor')
// @ts-expect-error Snapshot exit cannot close shared storage.
reader.closeStorage()
async function inspect() {
  const result = await reader.next()
  if (result.kind === 'page') {
    const first: ModelExecutionCallRef = result.refs[0]
    // @ts-expect-error A discovery ref is data, not an execution claim.
    first.launch()
    // @ts-expect-error Call discovery cannot invent a dispatch for an unopened call.
    first.dispatch
  }
  if (result.kind === 'unavailable') {
    // @ts-expect-error Unavailable is not a complete empty page.
    result.refs
  }
}
type ScanUseResult = Awaited<ReturnType<typeof scan.withObligations>>
declare const result: ScanUseResult
if (result.kind === 'used') {
  // @ts-expect-error A used scope does not prove all obligations settled.
  result.ready
}
// @ts-expect-error A page is nonempty; successful exhaustion has an explicit end.
const emptyPage: Awaited<ReturnType<typeof reader.next>> = { kind: 'page', refs: [] }
void inspect
