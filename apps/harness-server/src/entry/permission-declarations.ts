import type { Context } from '@deepseek-ai/cordis'
import type { SettingsTarget } from '@omne-harness/settings'
import type { ToolReleaseEntry } from './tool-release-manifest.ts'
import { releaseOf } from './tool-release.ts'

// One capability's identity, gates and settings target; each category owner registers its own.
export type PermissionDeclaration = Readonly<{
  asset: ToolReleaseEntry['asset']
  governance: ToolReleaseEntry['governance']
  holdingRef: string
}>

const registered = new WeakMap<Context, Set<PermissionDeclaration>>()

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
    holdingRef: `harness.preinstalled.tool.${entry.asset.name}`,
  }
}

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
  return { kind: 'asset', holdingRef: declaration.holdingRef, scopeRef: tenantRef }
}
