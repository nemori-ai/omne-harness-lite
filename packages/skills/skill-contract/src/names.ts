// The guards of the text values. Each brand has exactly one guard, and the guard is the only
// place that grants it. A value that is only checked has a public guard `isX`; `toPackagePath`
// stays a function that gives an outcome, because it also normalizes its input.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AssetVersion, PackagePath, SafeReason, SkillName } from './values.ts'

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SHORT_TEXT_MAX = 256

/** A C0 control character, DEL or a C1 control character. */
function hasControl(text: string): boolean {
  // `index <= text.length` would be equivalent: `charCodeAt(text.length)` is NaN, and every
  // comparison with NaN is false.
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true
  }
  return false
}

/** One to 64 of a-z, 0-9 and single inner hyphens. */
export function isSkillName(value: unknown): value is SkillName {
  return (
    typeof value === 'string' && value.length >= 1 && value.length <= 64 && SKILL_NAME.test(value)
  )
}

/** Normalized: relative, no empty, `.` or `..` segment, no backslash or control character. */
export function isPackagePath(value: unknown): value is PackagePath {
  if (typeof value !== 'string' || value === '' || value.startsWith('/')) return false
  if (value.includes('\\') || hasControl(value) || !value.isWellFormed()) return false
  return value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
}

/**
 * Checks a path inside a package and normalizes it. It rejects an absolute path, a `..` segment,
 * a backslash, an empty segment, a control character and a lone surrogate. It removes `.` segments.
 */
export function toPackagePath(raw: string): Outcome<PackagePath, 'bad-path'> {
  const segments = raw.split('/')
  if (raw.startsWith('/') || segments.includes('')) return fail('bad-path')
  const normalized = segments.filter(segment => segment !== '.').join('/')
  return isPackagePath(normalized) ? succeed(normalized) : fail('bad-path')
}

function isShortText(value: unknown): value is string {
  if (typeof value !== 'string' || !value.isWellFormed() || hasControl(value)) return false
  const length = [...value].length
  return length >= 1 && length <= SHORT_TEXT_MAX
}

/** One to 256 characters, no control character. It checks the form only, not what it discloses. */
export function isSafeReason(value: unknown): value is SafeReason {
  return isShortText(value)
}

/** One to 256 characters, no control character. Skill does not interpret the version. */
export function isAssetVersion(value: unknown): value is AssetVersion {
  return isShortText(value)
}

export const MANIFEST_PATH = 'SKILL.md'
export const DECLARATION_PATH = '.omne/skill.json'

/** The control files are not resources. */
export function isControlFile(path: PackagePath): boolean {
  return path === MANIFEST_PATH || path === DECLARATION_PATH
}
