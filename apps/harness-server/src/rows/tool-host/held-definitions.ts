import type { Context } from '@deepseek-ai/cordis'
import { canonicalDigest } from '@omne-harness/tool'
import type { ToolDefinition } from '@omne-harness/tool-contract'
import type { ToolBindingKey } from '@omne-harness/tool-contract/provider'
import type { PermissionDeclaration } from '../../entry/permission-declarations.ts'
import { heldToolPermission, releasedGatesOf } from '../../entry/tool-permission-release.ts'

type Known = Readonly<{ definition: ToolDefinition; permission: PermissionDeclaration }>

const known = new WeakMap<Context, Map<string, Known>>()
const keyTextOf = (key: ToolBindingKey) => canonicalDigest({ layer: key.layer, asset: key.asset })

/** The gates of a held tool, declared from the very definition it was loaded with. */
function permissionOf(key: ToolBindingKey, definition: ToolDefinition): PermissionDeclaration {
  const { name } = key.asset
  return Object.freeze({
    asset: key.asset,
    governance: heldToolPermission({
      name,
      adoption: definition.adoption,
      definition: canonicalDigest(definition),
      gates: releasedGatesOf(definition, []),
    }),
    holdingRef: `harness.held.tool.${name}`,
    unpublished: true as const,
  })
}

/** The definition a held tool was loaded with, by its key; undefined before it was loaded here. */
export function heldDefinitionOf(ctx: Context, key: ToolBindingKey): ToolDefinition | undefined {
  return known.get(ctx.root)?.get(keyTextOf(key))?.definition
}

export function rememberHeldDefinition(
  ctx: Context,
  key: ToolBindingKey,
  definition: ToolDefinition,
): void {
  const entries = known.get(ctx.root) ?? new Map<string, Known>()
  known.set(ctx.root, entries)
  const kept = Object.freeze(structuredClone(definition))
  entries.set(keyTextOf(key), { definition: kept, permission: permissionOf(key, kept) })
}

/** The permission declarations of the held tools loaded here; the same version in two tenants declares once. */
export function heldPermissionDeclarations(ctx: Context): readonly PermissionDeclaration[] {
  const byAdoption = new Map<string, PermissionDeclaration>()
  for (const { permission } of known.get(ctx.root)?.values() ?? [])
    byAdoption.set(canonicalDigest(permission.asset.adoption), permission)
  return [...byAdoption.values()]
}
