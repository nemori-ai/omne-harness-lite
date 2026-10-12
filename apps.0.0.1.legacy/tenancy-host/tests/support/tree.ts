import type { Context } from '@deepseek-ai/cordis'
import type { PreparationOptions } from '@omne-harness-lite/cordis-plugin-tree'

/** Frozen original distribution ids; these expectations do not come from the implementation. */
export const DISTRIBUTION_IDS = [
  'storage-sql',
  'clock-lease',
  'credential-verification',
  'account-identity',
  'organization-governance',
  'account-registration',
  'governance-center-ops',
  'governance-center-entry',
] as const

export const resolveProvider: PreparationOptions['resolveModule'] = reference =>
  import(`${reference.package}/cordis`)

/** Replace behavior but retain the same public schema and role declaration. */
export function replaceApply(
  packageName: string,
  apply: (ctx: Context, config: unknown) => void,
  exportName: string,
): PreparationOptions['resolveModule'] {
  return async reference => {
    const module: unknown = await resolveProvider(reference)
    if (reference.package !== packageName || reference.export !== exportName) return module
    if (typeof module !== 'object' || module === null) throw new Error('Missing fixture module')
    const plugin: unknown = Reflect.get(module, reference.export)
    if (typeof plugin !== 'object' || plugin === null) throw new Error('Missing fixture plugin')
    return { ...module, [reference.export]: { ...plugin, apply } }
  }
}
