import { report, standingOf, type Effect } from './catalog.ts'
import type { Placed, Registry } from './registry.ts'

export type Change = Readonly<{
  entry: Placed
  before: Effect['state'] | 'absent'
  after: Effect['state'] | 'absent'
  detail: string
  late: boolean
}>

const markOf = (entry: Placed): string =>
  JSON.stringify([entry.instance, entry.point, entry.key, entry.id, entry.scope, entry.digest])

/** The receipt of every entry in a registry, the withdrawing ones included, in registry order. */
function receipts(registry: Registry): Map<string, Effect> {
  const all = new Map<string, Effect>()
  for (const instance of [...registry.serving, ...registry.retiring])
    for (const effect of report(registry, instance)) all.set(markOf(effect.entry), effect)
  return new Map(registry.placed.map(entry => [markOf(entry), all.get(markOf(entry)) as Effect]))
}

/** An entry that shows up at run time in a point whose contributions are fixed when the application is built. */
function late(after: Registry, entry: Placed): boolean {
  const standing = standingOf(after, entry.point, entry.scope)
  return standing.kind === 'declared' && standing.contract.binding === 'build'
}

/** What a change does to every receipt. It compares two registries, so any change is previewed the same way. */
export function impact(before: Registry, after: Registry): readonly Change[] {
  const was = receipts(before)
  const changes: Change[] = []
  for (const [mark, now] of receipts(after)) {
    const then = was.get(mark)
    was.delete(mark)
    if (then === undefined)
      changes.push({
        entry: now.entry,
        before: 'absent',
        after: now.state,
        detail: now.detail,
        late: late(after, now.entry),
      })
    else if (then.state !== now.state || then.detail !== now.detail)
      changes.push({
        entry: now.entry,
        before: then.state,
        after: now.state,
        detail: now.detail,
        late: false,
      })
  }
  for (const gone of was.values())
    changes.push({
      entry: gone.entry,
      before: gone.state,
      after: 'absent',
      detail: '',
      late: false,
    })
  return changes
}
