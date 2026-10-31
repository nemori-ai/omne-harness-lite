import type { ResultPart } from '@omne-harness/model-contract'
import type { TransportTermination } from '@omne-harness/model-contract/provider'
import type { runtimeFixture } from './runtime-fixture.ts'
import { eventually } from './runtime-fixture.ts'
import { resultFacts } from './runtime-settlement-facts.ts'
import { unbox } from './memory-fixture.ts'

export const partialParts: readonly ResultPart[] = [
  { kind: 'partial', content: 'text', value: 'first', trims: [] },
  { kind: 'partial', content: 'voice', value: 'second', trims: [] },
  {
    kind: 'partial',
    content: 'tool-arguments',
    value: '{"kept":',
    trims: [{ removed: '1', reason: 'cut' }],
  },
]
export async function settleRuntime(
  f: ReturnType<typeof runtimeFixture>,
  parts: readonly ResultPart[] = partialParts,
  paging = { resultPageParts: 2, resultPageTargetBytes: 1024 },
) {
  unbox(await f.provider.runtime.calls.admit(f.admit))
  await f.start(f.admit.call)
  f.controls.commands.configureResultPaging({ ...f.admit, ...paging })
  const termination: TransportTermination = {
    kind: 'failed',
    fault: { cause: 'upstream-protocol', diagnostic: 'partial', upstreamStatus: null },
  }
  f.channel(f.admit.call).push([...resultFacts(parts), { kind: 'ended', termination }])
  await eventually(() => f.results.has(f.admit.call))
  const record = unbox(await f.dependencies.commands.loadRecovery(f.admit))
  if (record.state.phase !== 'settled') throw new Error('real driver did not settle')
  return record.state.settlement
}
