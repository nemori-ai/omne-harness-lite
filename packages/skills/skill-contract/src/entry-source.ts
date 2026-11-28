import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { ByteRange } from './services.ts'

export const SKILL_ENTRY_SOURCES_POINT = 'skill.entry-sources'

/** One Skill a source offers: its whole name carries the source's prefix; the label says where it comes from. */
export type SkillSourceEntry = Readonly<{ name: string; description: string; label: string }>

export type SkillSourceFailure =
  | 'not-found'
  | 'file-not-found'
  | 'not-text'
  | 'changed'
  | 'unavailable'

export type SkillSourceText = Readonly<{
  text: string
  start: number
  total: number
  label: string
}>

export type SkillSourceFile = Readonly<{ path: string; size: number; mediaType?: string }>

export type SkillSourceRead = Readonly<{ range: ByteRange; signal: AbortSignal }>

/** A source of Skills besides the assets: it lists, and reads what it listed, for the one who asks. */
export type SkillEntrySource<P> = Readonly<{
  prefix: string
  list(access: Access<P>): Promise<Outcome<readonly SkillSourceEntry[], 'unavailable'>>
  read(
    access: Access<P>,
    name: string,
    read: SkillSourceRead,
  ): Promise<Outcome<SkillSourceText, SkillSourceFailure>>
  readFile(
    access: Access<P>,
    name: string,
    path: string,
    read: SkillSourceRead,
  ): Promise<Outcome<SkillSourceText, SkillSourceFailure>>
  listFiles(
    access: Access<P>,
    name: string,
    signal: AbortSignal,
  ): Promise<
    Outcome<Readonly<{ files: readonly SkillSourceFile[]; label: string }>, SkillSourceFailure>
  >
}>

const PREFIX = /^[a-z][a-z0-9]*__$/u

/** A prefix is lower-case letters and digits ending in two underscores, as `mcp__`. */
export function isSkillSourcePrefix(value: string): boolean {
  return PREFIX.test(value)
}
