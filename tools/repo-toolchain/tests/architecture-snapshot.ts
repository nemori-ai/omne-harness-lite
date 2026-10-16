import { memberOf, type Member } from '../src/deps/graph.ts'
import type { Snapshot } from '../src/arch/actual-model.ts'

export function snapshotOf(texts: ReadonlyMap<string, string>): Snapshot {
  const members = new Map<string, Member>()
  for (const path of texts.keys()) {
    if (!path.endsWith('/package.json')) continue
    const member = memberOf(path)
    if (member !== undefined && member.group !== 'examples') members.set(member.path, member)
  }
  return { texts, members: [...members.values()].sort((a, b) => a.path.localeCompare(b.path)) }
}
