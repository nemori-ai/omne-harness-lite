import type { Context } from '@deepseek-ai/cordis'
import { canonicalText } from '@omne-harness/authorization'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { SettingsTarget } from '@omne-harness/settings'
import type { ToolReleaseEntry } from './tool-release-manifest.ts'
import { releaseOf, type ToolRelease } from './tool-release.ts'

export type CapabilityIdentity = Readonly<{ category: string; name: string }>

export type PermissionDeclaration = Readonly<{
  asset: CapabilityIdentity
  /** The one definition the declaration stands for; null when the capability's definition varies. */
  definition: ToolReleaseEntry['asset']['adoption'] | null
  governance: ToolReleaseEntry['governance']
  holdingRef: string
  tenantRef: string | null
}>

export const TOOL_CATEGORY = 'tool'

export function toolCapability(name: string): CapabilityIdentity {
  return { category: TOOL_CATEGORY, name }
}

const registered = new WeakMap<Context, Set<PermissionDeclaration>>()

export function registerPermissionDeclaration(
  ctx: Context,
  declaration: PermissionDeclaration,
): () => void {
  const own = registered.get(ctx.root) ?? new Set<PermissionDeclaration>()
  registered.set(ctx.root, own)
  own.add(declaration)
  return () => {
    own.delete(declaration)
  }
}

export function releasedDeclaration(entry: ToolReleaseEntry): PermissionDeclaration {
  return {
    asset: toolCapability(entry.asset.name),
    definition: entry.asset.adoption,
    governance: entry.governance,
    holdingRef: `harness.preinstalled.tool.${entry.asset.name}`,
    tenantRef: null,
  }
}

export function registeredPermissionDeclarations(
  ctx: Context,
  tenantRef: string,
): readonly PermissionDeclaration[] {
  return [...(registered.get(ctx.root) ?? [])].filter(entry => entry.tenantRef === tenantRef)
}

export function governedDeclarations(
  release: ToolRelease | undefined,
  declared: readonly PermissionDeclaration[],
): readonly PermissionDeclaration[] {
  return [
    ...(release?.kind === 'trusted' ? release.manifest.entries.map(releasedDeclaration) : []),
    ...declared,
  ]
}

export function permissionDeclarationsOf(
  ctx: Context,
  tenantRef: string,
): readonly PermissionDeclaration[] {
  return governedDeclarations(releaseOf(ctx), registeredPermissionDeclarations(ctx, tenantRef))
}

export function tenantPermissionDeclarations(
  ctx: Context,
  tenant: TenantId,
): readonly PermissionDeclaration[] {
  const tenantRef = tenantCodec.encode(tenant)
  return tenantRef.ok ? permissionDeclarationsOf(ctx, tenantRef.value) : []
}

export function declarationTarget(
  declaration: PermissionDeclaration,
  tenantRef: string,
): SettingsTarget {
  return { kind: 'asset', holdingRef: declaration.holdingRef, scopeRef: tenantRef }
}

export function declarationOfTarget(
  declarations: readonly PermissionDeclaration[],
  target: SettingsTarget,
): PermissionDeclaration | undefined {
  const matches = declarations.filter(
    entry => canonicalText(declarationTarget(entry, target.scopeRef)) === canonicalText(target),
  )
  return matches.length === 1 ? matches[0] : undefined
}
