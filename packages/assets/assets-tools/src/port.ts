import type {
  CategoryView,
  ChangeImpact,
  PackageReader,
  Placement,
  TenantManagement,
  TenantPublishing,
} from '@omne-harness/assets'
import type { ToolExecutionContext, ToolExecutionScope } from '@omne-harness/tool-contract/provider'

export type ExtensionsFaces = Readonly<{
  categories: CategoryView
  management: TenantManagement<unknown>
  publishing: TenantPublishing<unknown>
}>

/** What one call needs, given by the binding. The tenant and the principal come from the call; the model cannot give them. */
export type ExtensionsCallSource = Readonly<{
  tenant: string
  principal: unknown
  /** The three faces of the assets, read at each call; undefined when they cannot be had now. */
  faces(): ExtensionsFaces | undefined
  /** A directory of this call's workspace, as a package; absent when the path is not a directory there. */
  directory(path: string): Promise<PackageReader | 'absent' | 'unavailable'>
  impact: ChangeImpact
  placement: Placement
  /** The revision of the extension tree now; null when it cannot be read. */
  revision(): string | null
}>

/** Keyed by the call's abort signal: a checkpoint segment gets a narrowed context that keeps it. */
const attachments = new WeakMap<AbortSignal, ExtensionsCallSource>()

export function extensionsSourceOf(
  context: Pick<ToolExecutionContext, 'signal'>,
): ExtensionsCallSource | undefined {
  return attachments.get(context.signal)
}

export function attachExtensionsSource(
  scope: ToolExecutionScope,
  source: ExtensionsCallSource,
): ToolExecutionScope {
  const context = scope.context
  attachments.set(context.signal, source)
  let finished: ReturnType<ToolExecutionScope['finish']> | undefined
  return {
    context,
    limits: scope.limits,
    finish(exit) {
      if (finished !== undefined) return finished
      if (attachments.get(context.signal) === source) attachments.delete(context.signal)
      finished = Promise.resolve().then(() => scope.finish(exit))
      return finished
    },
  }
}
