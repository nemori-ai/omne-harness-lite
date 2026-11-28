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

export type Placed =
  | Readonly<{ kind: 'written'; files: number; bytes: number }>
  | Readonly<{ kind: 'same' }>
  | Readonly<{ kind: 'differs'; paths: readonly string[]; more: number }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'outside' }>
  | Readonly<{ kind: 'unavailable' }>

export type SettingPresence =
  | Readonly<{ kind: 'unset' }>
  | Readonly<{ kind: 'set'; value: unknown }>

export type HeldSetting = Readonly<{ item: string; title: string; revision: string }> &
  (
    | Readonly<{
        kind: 'ordinary'
        schema: unknown
        own: SettingPresence
        effective: SettingPresence
        source: 'default' | 'organization' | 'tenant' | null
        writable: 'yes' | 'locked' | 'not-a-source' | 'prohibited-above'
      }>
    | Readonly<{ kind: 'secret'; configured: 'yes' | 'no' | 'unknown' }>
    | Readonly<{ kind: 'permission' }>
  )

export type SettingWritten =
  | 'written'
  | 'no-change'
  | 'denied'
  | 'gone'
  | 'invalid'
  | 'conflict'
  | 'locked'
  | 'out-of-bound'
  | 'prohibited-above'
  | 'not-a-source'
  | 'unavailable'
  | 'unknown'

type HeldAsset = Readonly<{ category: string; name: string }>

export type HeldSettings = Readonly<{
  list(asset: HeldAsset): Promise<readonly HeldSetting[] | 'denied' | 'not-held' | 'unavailable'>
  write(
    input: Readonly<{
      asset: HeldAsset
      item: string
      operation: string
      revision: string
      change: Readonly<{ kind: 'set'; value: unknown }> | Readonly<{ kind: 'clear' }>
    }>,
  ): Promise<SettingWritten>
}>

/** What one call needs, given by the binding. The tenant and the principal come from the call; the model cannot give them. */
export type ExtensionsCallSource = Readonly<{
  tenant: string
  principal: unknown
  /** The three faces of the assets, read at each call; undefined when they cannot be had now. */
  faces(): ExtensionsFaces | undefined
  /** A directory as a package, by a path from the working directory of the call or an absolute one; absent when it is not a directory, outside when the files this call may read do not reach it. */
  directory(path: string): Promise<PackageReader | 'absent' | 'outside' | 'unavailable'>
  /** Writes a package into a directory only when it is missing or empty: same, or differs naming at most 10 paths; absent is no place for a directory, outside is where this call may not write. */
  place(dir: string, from: PackageReader): Promise<Placed>
  impact: ChangeImpact
  placement: Placement
  settings(): HeldSettings | undefined
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
