import type { Fiber } from '@deepseek-ai/cordis'
import type { ReleaseTree } from './release-tree.ts'

/** The official layer as it is held now: for every row, the fiber that serves it and the state of that fiber. */
export function officialLayer(
  tree: ReleaseTree,
): Map<string, Readonly<{ fiber: Fiber; state: number }>> {
  const rows = new Set(tree.records.filter(r => r.kind === 'row-state').map(r => String(r['id'])))
  const held = new Map<string, Readonly<{ fiber: Fiber; state: number }>>()
  for (const runtime of tree.scope.root.registry.values())
    for (const fiber of runtime.fibers)
      if (runtime.name !== undefined && rows.has(runtime.name) && fiber.parent.fiber.uid === 0)
        held.set(runtime.name, { fiber, state: fiber.state as number })
  return held
}
