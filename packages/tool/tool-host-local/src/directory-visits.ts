import { isAbsolute, normalize, relative, sep } from 'node:path'
import { workspaceCodec } from '@omne-harness/legal-identity'
import type { ToolCallDirectory, ToolDirectoryVisit } from '@omne-harness/tool-contract'

/** The author receives the facilities. Only their host can attest an operation's directory. */
export function directoryObserver(pinned: ToolCallDirectory | undefined) {
  const visited = new Set<string>()
  return {
    observed(path: string) {
      if (pinned?.workspace == null || !isAbsolute(path)) return
      const physical = normalize(path)
      if (physical !== path) return
      const fromRoot = relative(pinned.path, physical)
      if (isAbsolute(fromRoot) || fromRoot === '..' || fromRoot.startsWith('..' + sep)) return
      visited.add(physical)
    },
    receipt(): ToolDirectoryVisit | undefined {
      if (pinned?.workspace == null || visited.size === 0) return undefined
      const workspace = workspaceCodec.encode(pinned.workspace.id)
      if (!workspace.ok) return undefined
      return {
        workspace: workspace.value,
        instance: pinned.workspace.instance,
        generation: pinned.generation ?? '0',
        directories: [...visited].sort(),
      }
    },
  }
}

const observers = new WeakMap<object, ReturnType<typeof directoryObserver>>()
export function rememberDirectoryObserver(
  environment: object,
  observer: ReturnType<typeof directoryObserver>,
) {
  observers.set(environment, observer)
}
export function directoryVisitOf(environment: unknown): ToolDirectoryVisit | undefined {
  return typeof environment === 'object' && environment !== null
    ? observers.get(environment)?.receipt()
    : undefined
}
