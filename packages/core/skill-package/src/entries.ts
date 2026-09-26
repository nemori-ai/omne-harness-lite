import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import type { JsonValue } from '@omne-harness-lite/content-blocks'
import { copyJson } from './json.ts'
import { judgeSkillPackage, isSkillPackage, pathEscapes } from './judge.ts'
import { readSkillMd } from './md.ts'
import type {
  ResourceEntry,
  SkillJudgeContext,
  SkillPackageEntry,
  SkillPackageReadResult,
} from './types.ts'

function malformed(code: 'M2' | 'M8' | 'M16' | 'M17'): SkillPackageReadResult {
  return Object.freeze({ rejected: 'malformed', malformed: code } as const)
}
/** S-21 pure half: filesystem observation and UTF-8 decoding belong to the caller. */
export function readSkillPackage(
  entries: readonly SkillPackageEntry[],
  context?: SkillJudgeContext,
): SkillPackageReadResult {
  const manifests = entries.filter(entry => entry.path === 'SKILL.md' && entry.kind === 'file')
  if (manifests.length === 0) return Object.freeze({ rejected: 'manifest_missing' } as const)
  const manifest = manifests[0]
  if (manifest === undefined || manifest.kind !== 'file' || typeof manifest.text !== 'string')
    return malformed('M16')
  const parsed = readSkillMd(manifest.text)
  if (!('ok' in parsed)) return parsed
  const resources: ResourceEntry[] = []
  let definition: JsonValue | undefined
  let malformedEntry = false
  let escaped = false
  let unreadableDefinition = false
  const paths: string[] = []
  let duplicate = false
  for (const entry of entries) {
    if (paths.includes(entry.path)) duplicate = true
    paths.push(entry.path)
    if (pathEscapes(entry.path) || (entry.kind === 'link' && entry.resolution === 'outside'))
      escaped = true
    if (entry.kind === 'special' || (entry.kind === 'link' && entry.resolution !== 'outside'))
      malformedEntry = true
    if (entry.kind !== 'file' || entry.path === 'SKILL.md') continue
    if (entry.path === '.omne/skill.json') {
      if (entry.text === undefined) {
        unreadableDefinition = true
        continue
      }
      const result = readJsonStrict(entry.text)
      if ('failed' in result) unreadableDefinition = true
      else definition = result.ok
    } else
      resources.push(
        Object.freeze({
          path: entry.path,
          ...(entry.mediaType === undefined ? {} : { mediaType: entry.mediaType }),
        }),
      )
  }
  const pkg = copyJson({
    manifest: parsed.ok.manifest,
    body: parsed.ok.body,
    ...(definition === undefined ? {} : { definition }),
    resources,
  })
  const judgment = judgeSkillPackage(pkg, context)
  if (
    'rejected' in judgment &&
    ['name_mismatch', 'definition_format_unsupported'].includes(judgment.rejected)
  )
    return judgment
  if (escaped) return Object.freeze({ rejected: 'resource_escapes' } as const)
  if ('rejected' in judgment) return judgment
  if (unreadableDefinition) return Object.freeze({ rejected: 'malformed' } as const)
  if (duplicate) return malformed('M8')
  if (malformedEntry) return malformed('M17')
  if (!isSkillPackage(pkg)) throw new Error('inconsistent Skill package judgment')
  return Object.freeze({ ok: Object.freeze({ package: pkg, unknownKeys: parsed.ok.unknownKeys }) })
}
