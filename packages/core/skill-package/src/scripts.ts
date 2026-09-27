import type { ResourceEntry, SkillPackage } from './types.ts'

/** Membership is an address predicate, never execution permission. */
export function skillScripts(pkg: SkillPackage): readonly ResourceEntry[] {
  return Object.freeze(
    pkg.resources
      .filter(resource => resource.path.startsWith('scripts/'))
      .map(resource =>
        Object.freeze({
          path: resource.path,
          ...(resource.mediaType === undefined ? {} : { mediaType: resource.mediaType }),
        }),
      ),
  )
}
