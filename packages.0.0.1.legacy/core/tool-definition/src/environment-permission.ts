import type { AttributeDeclaration } from '@omne-harness-lite/asset-model'
import type { ToolDefinition } from './types.ts'

export const ENVIRONMENT_PERMISSION_VALUES = Object.freeze([
  'always-allow',
  'auto_place',
  'never-allow',
] as const)
export type EnvironmentPermission = (typeof ENVIRONMENT_PERMISSION_VALUES)[number]
export type ToolEnvironmentPermissionDeclaration =
  | { readonly kind: 'declaration'; readonly declaration: AttributeDeclaration }
  | { readonly kind: 'notApplicable' }
  | { readonly kind: 'rejected'; readonly reason: 'invalidInput' }

/** The configuration owner supplies the factory value. No default permission is inferred. */
export function toolEnvironmentPermissionDeclaration(
  definition: ToolDefinition,
  factoryDefault: EnvironmentPermission,
): ToolEnvironmentPermissionDeclaration {
  if (!ENVIRONMENT_PERMISSION_VALUES.some(value => value === factoryDefault))
    return { kind: 'rejected', reason: 'invalidInput' }
  if (definition.settings?.targetEnvironment === undefined) return { kind: 'notApplicable' }
  return {
    kind: 'declaration',
    declaration: Object.freeze({
      item: 'executionEnvironment',
      kind: 'permission',
      domain: Object.freeze({ kind: 'enum', values: ENVIRONMENT_PERMISSION_VALUES }),
      default: factoryDefault,
    }),
  }
}
