export const VARIANTS = ['module', 'cordis-module', 'service-contract', 'service-provider'] as const
export type Variant = (typeof VARIANTS)[number]

export interface TemplateMarker {
  readonly id: string
  readonly version: string
  readonly variant: Variant
}
export interface FileTemplate {
  readonly source: string
  readonly target: string
}
export interface TemplateManifest {
  readonly format: 1
  readonly id: string
  readonly version: string
  readonly common: readonly FileTemplate[]
  readonly variants: Readonly<Record<Variant, readonly FileTemplate[]>>
  readonly requiredFiles: readonly string[]
  /** Exact historical versions only. These are structural rules, never old template bodies. */
  readonly previousVersions: Readonly<
    Record<string, { readonly requiredFiles: readonly string[]; readonly ruleSet: 1 }>
  >
}
export interface Finding {
  readonly code: string
  readonly path: string
  readonly reason: string
}
export interface PackageScan {
  readonly path: string
  readonly name: string
  readonly adoption: 'unmarked' | 'current' | 'older' | 'unknown' | 'invalid'
  readonly marker?: TemplateMarker
  readonly variant: Variant
  readonly structure: 'pass' | 'fail' | 'uncovered'
  readonly findings: readonly Finding[]
  readonly architectureUnknowns: number
  readonly bindingUnknowns: readonly { readonly path: string; readonly reason: string }[]
}
export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function variant(value: unknown): value is Variant {
  return typeof value === 'string' && (VARIANTS as readonly string[]).includes(value)
}
export function version(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(value)
}
export function older(left: string, right: string): boolean {
  const a = left.split('.').map(BigInt),
    b = right.split('.').map(BigInt)
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return (a[i] ?? 0n) < (b[i] ?? 0n)
  }
  return false
}
export function parseMarker(value: unknown): TemplateMarker | undefined {
  if (!object(value) || Object.keys(value).sort().join(',') !== 'id,variant,version')
    return undefined
  if (typeof value['id'] !== 'string' || !version(value['version']) || !variant(value['variant']))
    return undefined
  return { id: value['id'], version: value['version'], variant: value['variant'] }
}
