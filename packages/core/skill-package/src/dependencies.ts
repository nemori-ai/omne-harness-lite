import type { SkillDependency, SkillPackage } from './types.ts'

export function skillDependencies(pkg: SkillPackage): readonly SkillDependency[] {
  const result: SkillDependency[] = []
  for (const capability of pkg.definition?.tools ?? [])
    result.push(
      Object.freeze({
        kind: 'tool',
        capability: Object.freeze({ category: capability.category, name: capability.name }),
      }),
    )
  for (const name of pkg.definition?.dependencies ?? [])
    result.push(Object.freeze({ kind: 'external_service', name }))
  if (pkg.definition?.environmentRequirement !== undefined)
    result.push(
      Object.freeze({
        kind: 'execution_environment',
        value: Object.freeze({
          bindingLayer: pkg.definition.environmentRequirement.bindingLayer,
          facilities: Object.freeze([...pkg.definition.environmentRequirement.facilities]),
        }),
      }),
    )
  return Object.freeze(result)
}
