// The validating functions of the text values. Each brand has exactly one type guard here, and
// the guard is the only place that grants it.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AssetVersion, PackagePath, SafeReason, SkillName } from './values.ts'

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SHORT_TEXT_MAX = 256

/** A C0 control character, DEL or a C1 control character. */
function hasControl(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true
  }
  return false
}

function isSkillName(raw: string): raw is SkillName {
  return raw.length >= 1 && raw.length <= 64 && SKILL_NAME.test(raw)
}

export function toSkillName(raw: string): Outcome<SkillName, 'invalid-name'> {
  return isSkillName(raw) ? succeed(raw) : fail('invalid-name')
}

/** Normalized: relative, no empty, `.` or `..` segment, no backslash or control character. */
function isPackagePath(raw: string): raw is PackagePath {
  if (raw === '' || raw.startsWith('/') || raw.includes('\\')) return false
  if (hasControl(raw) || !raw.isWellFormed()) return false
  return raw.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
}

/**
 * Checks a path inside a package. It rejects an absolute path, a `..` segment, a backslash, an
 * empty segment, a control character and a lone surrogate. It removes `.` segments.
 */
export function toPackagePath(raw: string): Outcome<PackagePath, 'bad-path'> {
  const segments = raw.split('/')
  if (raw.startsWith('/') || segments.includes('')) return fail('bad-path')
  const normalized = segments.filter(segment => segment !== '.').join('/')
  return isPackagePath(normalized) ? succeed(normalized) : fail('bad-path')
}

function isShortText(text: string): boolean {
  if (!text.isWellFormed() || hasControl(text)) return false
  const length = [...text].length
  return length >= 1 && length <= SHORT_TEXT_MAX
}

function isSafeReason(text: string): text is SafeReason {
  return isShortText(text)
}

function isAssetVersion(text: string): text is AssetVersion {
  return isShortText(text)
}

/** One to 256 characters, no control character. */
export function toSafeReason(text: string): Outcome<SafeReason, 'invalid-reason'> {
  return isSafeReason(text) ? succeed(text) : fail('invalid-reason')
}

/** One to 256 characters, no control character. Skill does not interpret the version. */
export function toAssetVersion(text: string): Outcome<AssetVersion, 'invalid-asset-version'> {
  return isAssetVersion(text) ? succeed(text) : fail('invalid-asset-version')
}

export const MANIFEST_PATH = 'SKILL.md'
export const DECLARATION_PATH = '.omne/skill.json'

/** The control files are not resources. */
export function isControlFile(path: PackagePath): boolean {
  return path === MANIFEST_PATH || path === DECLARATION_PATH
}
