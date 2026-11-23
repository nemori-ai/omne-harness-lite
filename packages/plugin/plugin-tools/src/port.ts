import type { Registry, Scope } from '@omne-harness/dynamis'
import type { ToolExecutionContext, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import type { Revisions } from './revisions.ts'

export type Depth = 'tokens' | 'style' | 'render'

/** What one connected client reports. The fields follow the report of plugin/v1; this member does not know that protocol. */
/** The rules of a point as its owner declared them, in the one shape both trees are shown in. */
export type PointRules = Readonly<{
  arity: 'one' | 'list' | 'keyed-one' | 'keyed-list'
  keyFrom: string | null
  key: string
  gives: string
  item: Readonly<{
    kind: 'data' | 'pure' | 'effect'
    fields: readonly Readonly<{ name: string; kind: string }>[]
  }>
  resolve: 'conflict' | 'most-specific'
  binding: 'build' | 'run'
  onError: string
  version: number
  revision: number
  example: string | null
}>

export type ClientPoint = Readonly<{
  name: string
  summary: string
  contract?: PointRules
  dataKeys?: readonly Readonly<{ name: string; now: string | null }>[]
}>

export type ClientTree = Readonly<{
  client: string
  points: readonly ClientPoint[]
  parts: readonly Readonly<{
    name: string
    label: string
    summary: string
    depths: readonly Depth[]
    within: string | null
  }>[]
  plugins: readonly Readonly<{
    name: string
    version: string
    state: 'loaded' | 'failed' | 'held'
    reason: string | null
  }>[]
}>

/** The extension trees one call can see. The scope of the asker comes from the binding, for the acting tenant; the model cannot give it. */
export type ExtensionSight = Readonly<{
  scope: Scope
  /** The registry of the server tree now, or unavailable when it cannot be read. */
  server(): Registry | 'unavailable'
  /** The clients of this tenant connected now: empty when none is; unavailable when they cannot be read. */
  clients(): readonly ClientTree[] | 'unavailable'
  revisions: Revisions
}>

/** Keyed by the call's abort signal: a checkpoint segment gets a narrowed context that keeps it. */
const attachments = new WeakMap<AbortSignal, ExtensionSight>()

export function extensionSightOf(
  context: Pick<ToolExecutionContext, 'signal'>,
): ExtensionSight | undefined {
  return attachments.get(context.signal)
}

export function attachExtensionSight(
  scope: ToolExecutionScope,
  sight: ExtensionSight,
): ToolExecutionScope {
  const context = scope.context
  attachments.set(context.signal, sight)
  let finished: ReturnType<ToolExecutionScope['finish']> | undefined
  return {
    context,
    limits: scope.limits,
    finish(exit) {
      if (finished !== undefined) return finished
      if (attachments.get(context.signal) === sight) attachments.delete(context.signal)
      finished = Promise.resolve().then(() => scope.finish(exit))
      return finished
    },
  }
}
