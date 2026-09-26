import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import type { JsonValue } from '@omne-harness-lite/content-blocks'
import { copyJson, object } from './json.ts'
import { judgeSkillPackage, isSkillPackage, knownSkillRejection, pathEscapes } from './judge.ts'
import { readSkillMd } from './md.ts'
import type {
  ResourceEntry,
  SkillJudgeContext,
  SkillPackageEntry,
  SkillPackageReadResult,
} from './types.ts'

function malformed(code: 'M2' | 'M8' | 'M16' | 'M17'): {
  readonly rejected: 'malformed'
  readonly malformed: 'M2' | 'M8' | 'M16' | 'M17'
} {
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
  const parsed =
    manifest?.kind === 'file' && typeof manifest.text === 'string'
      ? readSkillMd(manifest.text)
      : malformed('M16')
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
  const facts = copyJson({
    ...('ok' in parsed ? { manifest: parsed.ok.manifest } : {}),
    ...(definition === undefined ? {} : { definition }),
    resources,
  })
  if (!object(facts)) throw new Error('inconsistent Skill observations')
  const known = knownSkillRejection(facts, context, escaped)
  if (known !== undefined) return known
  if (!('ok' in parsed)) return parsed
  const pkg = copyJson({ ...facts, body: parsed.ok.body })
  const judgment = judgeSkillPackage(pkg, context)
  if ('rejected' in judgment) return judgment
  if (unreadableDefinition) return Object.freeze({ rejected: 'malformed' } as const)
  if (duplicate) return malformed('M8')
  if (malformedEntry) return malformed('M17')
  if (!isSkillPackage(pkg)) throw new Error('inconsistent Skill package judgment')
  return Object.freeze({ ok: Object.freeze({ package: pkg, unknownKeys: parsed.ok.unknownKeys }) })
}
