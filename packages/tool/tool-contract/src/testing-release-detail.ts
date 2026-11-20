import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ReleaseDescription, ToolReleaseDescriber } from './release-detail.ts'

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (typeof value === 'object' && value !== null)
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}

/** Conforms when every run on one input gives the same description and leaves the domain state as it was. */
export async function checkReleaseDescription<A>(
  describe: ToolReleaseDescriber<A>,
  input: Parameters<ToolReleaseDescriber<A>>[0],
  options: Readonly<{ state: () => Promise<unknown>; times?: number }>,
): Promise<Outcome<ReleaseDescription, string>> {
  const before = stable(await options.state())
  const runs: ReleaseDescription[] = []
  for (let run = 0; run < (options.times ?? 3); run += 1) runs.push(await describe(input))
  const after = stable(await options.state())
  if (before !== after) return fail('the description changed the domain state')
  const first = stable(runs[0])
  if (runs.some(value => stable(value) !== first))
    return fail('the same input gave different descriptions')
  return succeed(runs[0]!)
}
