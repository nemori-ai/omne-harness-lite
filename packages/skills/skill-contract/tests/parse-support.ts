// Shared helpers of the package parsing tests.
import {
  isSkillName,
  parseSkillPackage,
  type InspectRejectionCode,
  type SkillName,
} from '@omne-harness/skill-contract'
import { buildPackage, manifestText, type PackageFiles } from './package-builder.ts'

export function name(raw: string): SkillName {
  if (!isSkillName(raw)) throw new Error(raw)
  return raw
}

export function parse(rootName: string, files: PackageFiles, expectedName?: SkillName) {
  const built = buildPackage(rootName, files)
  return parseSkillPackage({
    snapshot: built.snapshot,
    control: built.control,
    ...(expectedName === undefined ? {} : { expectedName }),
  })
}

export function codeOf(
  result: ReturnType<typeof parse>,
): InspectRejectionCode | 'version-changed' | 'accepted' {
  return 'ok' in result
    ? 'accepted'
    : result.failure.kind === 'rejected'
      ? result.failure.code
      : result.failure.kind
}

/** A legal SKILL.md for the root `demo`, with optional extra frontmatter lines. */
export function demo(extra: readonly string[] = []): string {
  return manifestText(['name: demo', 'description: A demo skill.', ...extra])
}

export function declaration(value: unknown): string {
  return JSON.stringify(value)
}
