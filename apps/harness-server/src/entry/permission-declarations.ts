import type { Context } from '@deepseek-ai/cordis'
import type { SettingsTarget } from '@omne-harness/settings'
import type { ToolReleaseEntry } from './tool-release-manifest.ts'
import { releaseOf } from './tool-release.ts'

/**
 * The permission declaration of one capability: who it is, what its gates are and how each is
 * interpreted, and where its settings live for a tenant. A category owner registers its own; the
 * released tools are one such owner.
 */
export type PermissionDeclaration = Readonly<{
  asset: ToolReleaseEntry['asset']
  governance: ToolReleaseEntry['governance']
  targetRef: string
}>

const registered = new WeakMap<Context, Set<PermissionDeclaration>>()

/** Registers a declaration for the lifetime of the registering scope; disposal withdraws it. */
export function registerPermissionDeclaration(
  ctx: Context,
  declaration: PermissionDeclaration,
): void {
  const own = registered.get(ctx.root) ?? new Set<PermissionDeclaration>()
  registered.set(ctx.root, own)
  ctx.effect(() => {
    own.add(declaration)
    return () => {
      own.delete(declaration)
    }
  })
}

export function releasedDeclaration(entry: ToolReleaseEntry): PermissionDeclaration {
  return {
    asset: entry.asset,
    governance: entry.governance,
    targetRef: `harness.preinstalled.tool.${entry.asset.name}`,
  }
}

/** Every declaration now: the released tools' and the registered ones, read on each call. */
export function permissionDeclarationsOf(ctx: Context): readonly PermissionDeclaration[] {
  const release = releaseOf(ctx)
  const released =
    release.kind === 'trusted' ? release.manifest.entries.map(releasedDeclaration) : []
  return [...released, ...(registered.get(ctx.root) ?? [])]
}

export function declarationTarget(
  declaration: PermissionDeclaration,
  tenantRef: string,
): SettingsTarget {
  return { policyId: 'asset', scopeRef: tenantRef, targetRef: declaration.targetRef }
}
