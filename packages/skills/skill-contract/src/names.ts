import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AssetVersion, PackagePath, SafeReason, SkillName } from './values.ts'

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SHORT_TEXT_MAX = 256

function hasControl(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true
  }
  return false
}

export function isSkillName(value: unknown): value is SkillName {
  return (
    typeof value === 'string' && value.length >= 1 && value.length <= 64 && SKILL_NAME.test(value)
  )
}

export function isPackagePath(value: unknown): value is PackagePath {
  if (typeof value !== 'string' || value === '' || value.startsWith('/')) return false
  if (value.includes('\\') || hasControl(value) || !value.isWellFormed()) return false
  return value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
}

export function toPackagePath(raw: string): Outcome<PackagePath, 'bad-path'> {
  const segments = raw.split('/')
  if (raw.startsWith('/') || segments.includes('')) return fail('bad-path')
  const normalized = segments.filter(segment => segment !== '.').join('/')
  return isPackagePath(normalized) ? succeed(normalized) : fail('bad-path')
}

export function isBoundedText(value: unknown, max: number): value is string {
  if (typeof value !== 'string') return false
  const length = [...value].length
  return length >= 1 && length <= max
}

function isShortText(value: unknown): value is string {
  return isBoundedText(value, SHORT_TEXT_MAX) && value.isWellFormed() && !hasControl(value)
}

export function isSafeReason(value: unknown): value is SafeReason {
  return isShortText(value)
}

export function isAssetVersion(value: unknown): value is AssetVersion {
  return isShortText(value)
}

export const MANIFEST_PATH = 'SKILL.md'
export const DECLARATION_PATH = '.omne/skill.json'

export function isControlFile(path: PackagePath): boolean {
  return path === MANIFEST_PATH || path === DECLARATION_PATH
}
